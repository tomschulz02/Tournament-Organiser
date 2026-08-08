import { describe, it, expect, beforeEach, vi } from "vitest";

const uuidState = vi.hoisted(() => ({ next: 0 }));

vi.mock("uuid", () => ({ v4: () => `uuid-${++uuidState.next}` }));

vi.mock("../../../src/config/db.js", async () => {
    const { dbMock } = await import("../../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

const { divisionsRepository } = await import("../../../src/repositories/divisions.repository.js");
const { dbMock, resetDbMock, clientSql, squash } = await import("../../helpers/dbMock.js");

const db = dbMock.instance;
const client = dbMock.client;

beforeEach(() => {
    uuidState.next = 0;
    resetDbMock();
});

// Every function here throws on failure and keeps the underlying error as cause,
// so the Postgres code survives as far as the error middleware's log.
async function failureFrom(promise) {
    return promise.then(
        (value) => {
            throw new Error(`expected a rejection, got ${JSON.stringify(value)}`);
        },
        (err) => err
    );
}

async function expectWrapped(promise, message, underlying) {
    const failure = await failureFrom(promise);

    expect(failure.message).toBe(message);
    expect(failure.cause).toBe(underlying);
    return failure;
}

describe("createDivision", () => {
    const details = { name: "Division A", num_teams: 8, type: "Classic", state: { teams: [] } };

    it("inserts the division on the pool and returns its id", async () => {
        expect(await divisionsRepository.createDivision("div-1", "tour-1", details, "user-1")).toBe("div-1");

        const [sql, params] = db.query.mock.calls[0];
        expect(squash(sql)).toBe(
            "INSERT INTO divisions (id, tournament_id, name, num_teams, type, state) VALUES ($1, $2, $3, $4, $5, $6)"
        );
        expect(params).toEqual(["div-1", "tour-1", "Division A", 8, "Classic", { teams: [] }]);
    });

    it("joins the caller's transaction when given a client", async () => {
        await divisionsRepository.createDivision("div-1", "tour-1", details, "user-1", client);

        expect(client.query).toHaveBeenCalledOnce();
        expect(db.query).not.toHaveBeenCalled();
    });

    it("stores an empty state object when the division has none", async () => {
        await divisionsRepository.createDivision("div-1", "tour-1", { ...details, state: null }, "user-1");

        expect(db.query.mock.calls[0][1][5]).toBe("{}");
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("duplicate key");
        db.query.mockRejectedValueOnce(underlying);

        await expectWrapped(
            divisionsRepository.createDivision("div-1", "tour-1", details, "user-1"),
            "Failed to create division",
            underlying
        );
    });
});

describe("createTeam", () => {
    it("inserts a team and returns the generated id", async () => {
        expect(await divisionsRepository.createTeam("Aces", "div-1")).toBe("uuid-1");

        expect(db.query).toHaveBeenCalledWith(
            "INSERT INTO teams (id, name, division_id) VALUES ($1, $2, $3);",
            ["uuid-1", "Aces", "div-1"]
        );
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("relation does not exist");
        db.query.mockRejectedValueOnce(underlying);

        await expectWrapped(divisionsRepository.createTeam("Aces", "div-1"), "Failed to create team", underlying);
    });
});

describe("getTeamNames", () => {
    it("returns the id and name of every team in the division", async () => {
        db.query.mockResolvedValueOnce([{ id: "t1", name: "Aces" }]);

        expect(await divisionsRepository.getTeamNames("div-1")).toEqual([{ id: "t1", name: "Aces" }]);
        expect(db.query).toHaveBeenCalledWith("SELECT id, name FROM teams WHERE division_id=$1;", ["div-1"]);
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("column does not exist");
        db.query.mockRejectedValueOnce(underlying);

        await expectWrapped(divisionsRepository.getTeamNames("div-1"), "Failed to fetch team names", underlying);
    });
});

describe("updateTeams", () => {
    it("commits the new team order", async () => {
        client.query.mockResolvedValue({ rows: [], rowCount: 1 });

        const result = await divisionsRepository.updateTeams("div-1", "user-1", ["t2", "t1"]);

        expect(clientSql().map(squash)).toEqual([
            "BEGIN",
            "UPDATE divisions SET state = jsonb_set(state, '{teams}', $1::jsonb) WHERE id = $2 RETURNING num_groups",
            "COMMIT"
        ]);
        expect(client.query.mock.calls[1][1]).toEqual(['["t2","t1"]', "div-1"]);
        expect(result).toEqual({ rows: [], rowCount: 1 });
        expect(client.release).toHaveBeenCalledOnce();
    });

    it("rolls back and throws rather than returning an error string", async () => {
        const underlying = new Error("column num_groups does not exist");
        client.query.mockImplementation(async (sql) => {
            if (sql.startsWith("UPDATE")) throw underlying;
            return { rows: [] };
        });

        await expectWrapped(
            divisionsRepository.updateTeams("div-1", "user-1", []),
            "Failed to update teams",
            underlying
        );
        expect(clientSql()).toContain("ROLLBACK");
        expect(client.release).toHaveBeenCalledOnce();
    });
});

describe("updateTeam", () => {
    it("commits the new team name", async () => {
        expect(await divisionsRepository.updateTeam("t1", "Aces")).toEqual({ message: "Team updated" });

        expect(clientSql()).toEqual(["BEGIN", "UPDATE teams SET name = $1 WHERE id = $2", "COMMIT"]);
        expect(client.query.mock.calls[1][1]).toEqual(["Aces", "t1"]);
    });

    it("rolls back and throws rather than returning an error string", async () => {
        const underlying = new Error("no such team");
        client.query.mockImplementation(async (sql) => {
            if (sql.startsWith("UPDATE")) throw underlying;
            return { rows: [] };
        });

        await expectWrapped(divisionsRepository.updateTeam("t1", "Aces"), "Failed to update team", underlying);
        expect(clientSql()).toContain("ROLLBACK");
    });
});

describe("updateGroups", () => {
    it("commits the new pool composition", async () => {
        expect(await divisionsRepository.updateGroups("div-1", "user-1", [["t1"]], null))
            .toEqual({ message: "Updated groups" });

        expect(clientSql().map(squash)).toEqual([
            "BEGIN",
            "UPDATE divisions SET state = jsonb_set(state, '{rounds,0,groups}', $1::jsonb) WHERE id=$2;",
            "COMMIT"
        ]);
        expect(client.query.mock.calls[1][1]).toEqual(['[["t1"]]', "div-1"]);
    });

    it("rolls back and throws on failure, keeping the underlying error as cause", async () => {
        const underlying = new Error("invalid jsonb");
        client.query.mockImplementation(async (sql) => {
            if (sql.startsWith("UPDATE")) throw underlying;
            return { rows: [] };
        });

        await expectWrapped(
            divisionsRepository.updateGroups("div-1", "user-1", [], null),
            "Failed to update groups",
            underlying
        );
        expect(clientSql()).toContain("ROLLBACK");
        expect(client.release).toHaveBeenCalledOnce();
    });
});

describe("updateRounds", () => {
    it("writes the rounds and the new current round in one statement", async () => {
        const rounds = [{ name: "Pool Play" }];

        expect(await divisionsRepository.updateRounds("div-1", "user-1", rounds, null, 1))
            .toEqual({ message: "Round progressed" });

        expect(clientSql().map(squash)).toEqual([
            "BEGIN",
            "UPDATE divisions SET state = jsonb_set(jsonb_set(state, '{rounds}', $1::jsonb), '{currentRound}', $2::jsonb), last_update = now() WHERE id = $3::uuid",
            "COMMIT"
        ]);
        expect(client.query.mock.calls[1][1]).toEqual([JSON.stringify(rounds), "1", "div-1"]);
    });

    it("rolls back and throws on failure, keeping the underlying error as cause", async () => {
        const underlying = new Error("invalid uuid");
        client.query.mockImplementation(async (sql) => {
            if (squash(sql).startsWith("UPDATE")) throw underlying;
            return { rows: [] };
        });

        await expectWrapped(
            divisionsRepository.updateRounds("div-1", "user-1", [], null, 1),
            "Failed to update rounds",
            underlying
        );
        expect(clientSql()).toContain("ROLLBACK");
    });
});

describe("getDivisionWithOwner", () => {
    it("returns the division joined to the tournament owner", async () => {
        db.query.mockResolvedValueOnce([{ id: "div-1", created_by: "user-1" }]);

        expect(await divisionsRepository.getDivisionWithOwner("div-1")).toEqual({ id: "div-1", created_by: "user-1" });
        expect(squash(db.query.mock.calls[0][0])).toContain("JOIN tournaments t ON t.id = d.tournament_id");
    });

    it("returns null when there is no such division", async () => {
        db.query.mockResolvedValueOnce([]);

        expect(await divisionsRepository.getDivisionWithOwner("div-1")).toBeNull();
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("connection lost");
        db.query.mockRejectedValueOnce(underlying);

        await expectWrapped(divisionsRepository.getDivisionWithOwner("div-1"), "Failed to fetch division", underlying);
    });
});

describe("getTeamsByIds", () => {
    it("looks the teams up by id array", async () => {
        db.query.mockResolvedValueOnce([{ id: "t1", name: "Aces" }]);

        expect(await divisionsRepository.getTeamsByIds(["t1"])).toEqual([{ id: "t1", name: "Aces" }]);
        expect(db.query).toHaveBeenCalledWith("SELECT id, name FROM teams WHERE id = ANY($1::uuid[]);", [["t1"]]);
    });

    it("does not query at all for an empty or missing list", async () => {
        expect(await divisionsRepository.getTeamsByIds([])).toEqual([]);
        expect(await divisionsRepository.getTeamsByIds(null)).toEqual([]);
        expect(db.query).not.toHaveBeenCalled();
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("connection lost");
        db.query.mockRejectedValueOnce(underlying);

        await expectWrapped(divisionsRepository.getTeamsByIds(["t1"]), "Failed to fetch teams", underlying);
    });
});

describe("getFixturesByDivisionId", () => {
    it("returns the division's fixtures in match order", async () => {
        db.query.mockResolvedValueOnce([{ id: "f1" }]);

        expect(await divisionsRepository.getFixturesByDivisionId("div-1")).toEqual([{ id: "f1" }]);
        expect(db.query).toHaveBeenCalledWith(
            "SELECT * FROM fixtures WHERE division_id = $1::uuid ORDER BY match_no ASC;",
            ["div-1"]
        );
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("connection lost");
        db.query.mockRejectedValueOnce(underlying);

        await expectWrapped(
            divisionsRepository.getFixturesByDivisionId("div-1"),
            "Failed to fetch fixtures",
            underlying
        );
    });
});

describe("updateSchedule", () => {
    it("writes the schedule to its own column and stamps last_update", async () => {
        expect(await divisionsRepository.updateSchedule("div-1", { slots: [] }))
            .toEqual({ message: "Schedule updated" });

        const [sql, params] = db.query.mock.calls[0];
        expect(squash(sql)).toBe(
            "UPDATE divisions SET schedule = $1::jsonb, last_update = now() WHERE id = $2::uuid"
        );
        expect(params).toEqual(['{"slots":[]}', "div-1"]);
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("connection lost");
        db.query.mockRejectedValueOnce(underlying);

        await expectWrapped(divisionsRepository.updateSchedule("div-1", {}), "Failed to update schedule", underlying);
    });
});

describe("getDivisionDetails", () => {
    it("returns each division with its fixtures attached", async () => {
        client.query
            .mockResolvedValueOnce({ rows: [{ id: "div-1" }, { id: "div-2" }] })
            .mockResolvedValueOnce({ rows: [{ id: "f1" }] })
            .mockResolvedValueOnce({ rows: [] });

        const details = await divisionsRepository.getDivisionDetails("tour-1");

        expect(details.divisions).toEqual([
            { id: "div-1", fixtures: [{ id: "f1" }] },
            { id: "div-2", fixtures: [] }
        ]);
        expect(client.release).toHaveBeenCalledOnce();
    });

    it("returns an empty collection when the tournament has no divisions", async () => {
        // Not a missing resource: the repository assigns no meaning to it, the
        // same as getDivisionsByTournamentId returning [].
        client.query.mockResolvedValueOnce({ rows: [] });

        expect(await divisionsRepository.getDivisionDetails("tour-1")).toEqual({ divisions: [] });
        expect(client.release).toHaveBeenCalledOnce();
    });

    it("throws rather than returning an error string", async () => {
        const underlying = new Error("connection lost");
        client.query.mockRejectedValueOnce(underlying);

        await expectWrapped(
            divisionsRepository.getDivisionDetails("tour-1"),
            "Failed to fetch division details",
            underlying
        );
        expect(client.release).toHaveBeenCalledOnce();
    });
});

describe("getDivisionsByTournamentId", () => {
    it("returns the tournament's divisions by name", async () => {
        db.query.mockResolvedValueOnce([{ id: "div-1" }]);

        expect(await divisionsRepository.getDivisionsByTournamentId("tour-1")).toEqual([{ id: "div-1" }]);
        expect(db.query).toHaveBeenCalledWith(
            "SELECT * FROM divisions WHERE tournament_id = $1 ORDER BY name ASC;",
            ["tour-1"]
        );
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("connection lost");
        db.query.mockRejectedValueOnce(underlying);

        await expectWrapped(
            divisionsRepository.getDivisionsByTournamentId("tour-1"),
            "Failed to fetch divisions",
            underlying
        );
    });
});

describe("getTeamsByDivisionIds", () => {
    it("returns the teams of several divisions at once", async () => {
        db.query.mockResolvedValueOnce([{ id: "t1", division_id: "div-1" }]);

        expect(await divisionsRepository.getTeamsByDivisionIds(["div-1"])).toEqual([{ id: "t1", division_id: "div-1" }]);
        expect(squash(db.query.mock.calls[0][0])).toContain("WHERE division_id = ANY($1::uuid[])");
    });

    it("does not query at all for an empty or missing list", async () => {
        expect(await divisionsRepository.getTeamsByDivisionIds([])).toEqual([]);
        expect(await divisionsRepository.getTeamsByDivisionIds(undefined)).toEqual([]);
        expect(db.query).not.toHaveBeenCalled();
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("column division_id does not exist");
        db.query.mockRejectedValueOnce(underlying);

        await expectWrapped(
            divisionsRepository.getTeamsByDivisionIds(["div-1"]),
            "Failed to fetch teams by division",
            underlying
        );
    });
});
