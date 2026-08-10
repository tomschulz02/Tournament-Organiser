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
    // The id is supplied, not generated here: the service needs every team id
    // before it can build state.teams, but the rows themselves cannot be written
    // until the division exists.
    it("inserts a team into its division and returns the id it was given", async () => {
        expect(await divisionsRepository.createTeam("team-1", "Aces", "div-1")).toBe("team-1");

        expect(db.query).toHaveBeenCalledWith(
            "INSERT INTO teams (id, name, division_id) VALUES ($1, $2, $3);",
            ["team-1", "Aces", "div-1"]
        );
    });

    it("joins the caller's transaction when given a client", async () => {
        await divisionsRepository.createTeam("team-1", "Aces", "div-1", client);

        expect(client.query).toHaveBeenCalledOnce();
        expect(db.query).not.toHaveBeenCalled();
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("relation does not exist");
        db.query.mockRejectedValueOnce(underlying);

        await expectWrapped(
            divisionsRepository.createTeam("team-1", "Aces", "div-1"),
            "Failed to create team",
            underlying
        );
    });
});

// updateTeams and updateGroups were removed on 2026-08-10 along with their
// tests. Both wrote part of state directly and neither was called: seed order
// and group composition now move only through divisionService.updateDivision,
// which regenerates the division and writes state in full.

describe("updateTeam", () => {
    // One statement, so no transaction of its own — several renames arrive
    // together from PUT /divisions/:divisionId and the caller owns the boundary.
    it("writes the new name on the pool", async () => {
        expect(await divisionsRepository.updateTeam("t1", "Aces")).toEqual({ message: "Team updated" });

        expect(db.query).toHaveBeenCalledWith("UPDATE teams SET name = $1 WHERE id = $2", ["Aces", "t1"]);
        expect(clientSql()).toEqual([]);
        expect(db.pool.connect).not.toHaveBeenCalled();
    });

    it("joins the caller's transaction when given a client", async () => {
        await divisionsRepository.updateTeam("t1", "Aces", client);

        expect(client.query).toHaveBeenCalledOnce();
        expect(db.query).not.toHaveBeenCalled();
    });

    it("throws rather than returning an error string", async () => {
        const underlying = new Error("no such team");
        db.query.mockRejectedValueOnce(underlying);

        await expectWrapped(divisionsRepository.updateTeam("t1", "Aces"), "Failed to update team", underlying);
    });
});

describe("deleteTeamsByIds", () => {
    // Requires the client: the rows the fixtures referenced have to go in the
    // same transaction that deleted those fixtures.
    it("removes the teams by id array", async () => {
        expect(await divisionsRepository.deleteTeamsByIds(["t1", "t2"], client))
            .toEqual({ message: "Teams removed" });

        expect(client.query).toHaveBeenCalledWith(
            "DELETE FROM teams WHERE id = ANY($1::uuid[]);",
            [["t1", "t2"]]
        );
    });

    it("does not query at all for an empty or missing list", async () => {
        expect(await divisionsRepository.deleteTeamsByIds([], client)).toEqual({ message: "No teams removed" });
        expect(await divisionsRepository.deleteTeamsByIds(null, client)).toEqual({ message: "No teams removed" });
        expect(client.query).not.toHaveBeenCalled();
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("foreign key violation");
        client.query.mockRejectedValueOnce(underlying);

        await expectWrapped(
            divisionsRepository.deleteTeamsByIds(["t1"], client),
            "Failed to remove teams",
            underlying
        );
    });
});

describe("replaceState", () => {
    // Wider than updateStateRounds, which patches part of state. A rebuild
    // regenerates every round from a different set of teams, so there is nothing
    // in the old object worth merging into — and num_teams moves with it.
    it("writes the whole state object and the new team count", async () => {
        const state = { teams: ["t1"], rounds: [], currentRound: 0 };

        expect(await divisionsRepository.replaceState("div-1", state, 1, client))
            .toEqual({ message: "Division rebuilt" });

        const [sql, params] = client.query.mock.calls[0];
        expect(squash(sql)).toBe(
            "UPDATE divisions SET state = $1::jsonb, num_teams = $2, last_update = now() WHERE id = $3::uuid"
        );
        expect(params).toEqual([JSON.stringify(state), 1, "div-1"]);
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("invalid jsonb");
        client.query.mockRejectedValueOnce(underlying);

        await expectWrapped(
            divisionsRepository.replaceState("div-1", {}, 0, client),
            "Failed to replace division state",
            underlying
        );
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

    // The rebuild gate reads the tournament's status, and the format the
    // division is regenerated in comes from its type. Aliased, because a bare
    // `status` here would read as though a division had one.
    it("carries the tournament's status and the division's type", async () => {
        db.query.mockResolvedValueOnce([{ id: "div-1" }]);

        await divisionsRepository.getDivisionWithOwner("div-1");

        expect(squash(db.query.mock.calls[0][0]))
            .toContain("d.type, d.state, t.created_by, t.status AS tournament_status");
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

// Both take the client rather than defaulting to the pool: they are the two
// halves of a read-modify-write that only means anything inside one transaction.
describe("getStateForUpdate", () => {
    it("reads the state and locks the row", async () => {
        client.query.mockResolvedValueOnce({ rows: [{ state: { rounds: [] } }], rowCount: 1 });

        expect(await divisionsRepository.getStateForUpdate("div-1", client)).toEqual({ rounds: [] });

        const [sql, params] = client.query.mock.calls[0];
        // FOR UPDATE, so two results recorded at once cannot each overwrite the
        // other's completedGames.
        expect(squash(sql)).toBe("SELECT state FROM divisions WHERE id = $1::uuid FOR UPDATE");
        expect(params).toEqual(["div-1"]);
    });

    it("returns null when the division does not exist", async () => {
        client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        expect(await divisionsRepository.getStateForUpdate("missing", client)).toBeNull();
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("connection lost");
        client.query.mockRejectedValueOnce(underlying);

        await expectWrapped(
            divisionsRepository.getStateForUpdate("div-1", client),
            "Failed to fetch division state",
            underlying
        );
    });
});

describe("updateStateRounds", () => {
    it("replaces state.rounds and stamps last_update, without touching currentRound", async () => {
        const rounds = [{ name: "Pool Play", completedGames: 2 }];

        expect(await divisionsRepository.updateStateRounds("div-1", rounds, client))
            .toEqual({ message: "Rounds updated" });

        const [sql, params] = client.query.mock.calls[0];
        expect(squash(sql)).toBe(
            "UPDATE divisions SET state = jsonb_set(state, '{rounds}', $1::jsonb), last_update = now() WHERE id = $2::uuid"
        );
        expect(params).toEqual([JSON.stringify(rounds), "div-1"]);
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("connection lost");
        client.query.mockRejectedValueOnce(underlying);

        await expectWrapped(
            divisionsRepository.updateStateRounds("div-1", [], client),
            "Failed to update rounds",
            underlying
        );
    });
});

describe("getTeamsByIds", () => {
    // By id rather than by division_id, even though the column now exists:
    // state.teams is authoritative for seed order and a query by division would
    // come back in none. See docs/division-state.md.
    it("looks the teams up by id array", async () => {
        db.query.mockResolvedValueOnce([{ id: "t1", name: "Aces", division_id: "div-1" }]);

        expect(await divisionsRepository.getTeamsByIds(["t1"]))
            .toEqual([{ id: "t1", name: "Aces", division_id: "div-1" }]);
        expect(db.query).toHaveBeenCalledWith(
            "SELECT id, name, division_id FROM teams WHERE id = ANY($1::uuid[]);",
            [["t1"]]
        );
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

// updateSchedule moved to tournament.repository.js on 2026-08-08: a schedule
// spans the tournament, not a division. Its tests moved with it.

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
