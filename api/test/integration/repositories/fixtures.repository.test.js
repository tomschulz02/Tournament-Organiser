import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/config/db.js", async () => {
    const { dbMock } = await import("../../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

const { fixturesRepository } = await import("../../../src/repositories/fixtures.repository.js");
const { dbMock, resetDbMock, clientSql, squash } = await import("../../helpers/dbMock.js");

const db = dbMock.instance;
const client = dbMock.client;

beforeEach(() => {
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

describe("getFixtures", () => {
    it("returns every fixture in the division", async () => {
        db.query.mockResolvedValueOnce([{ id: "f1" }]);

        expect(await fixturesRepository.getFixtures("div-1")).toEqual([{ id: "f1" }]);
        expect(db.query).toHaveBeenCalledWith("SELECT * FROM fixtures WHERE division_id = $1", ["div-1"]);
    });

    it("throws rather than returning an error string, keeping the cause", async () => {
        const underlying = new Error("connection lost");
        db.query.mockRejectedValueOnce(underlying);

        const failure = await failureFrom(fixturesRepository.getFixtures("div-1"));

        expect(failure.message).toBe("Failed to fetch fixtures");
        expect(failure.cause).toBe(underlying);
    });
});

describe("getResults", () => {
    it("returns only completed fixtures", async () => {
        db.query.mockResolvedValueOnce([{ id: "f1", status: "COMPLETED" }]);

        expect(await fixturesRepository.getResults("div-1")).toEqual([{ id: "f1", status: "COMPLETED" }]);
        expect(squash(db.query.mock.calls[0][0])).toContain("AND status = 'COMPLETED'");
    });

    it("throws rather than returning an error string, keeping the cause", async () => {
        const underlying = new Error("connection lost");
        db.query.mockRejectedValueOnce(underlying);

        const failure = await failureFrom(fixturesRepository.getResults("div-1"));

        expect(failure.message).toBe("Failed to fetch results");
        expect(failure.cause).toBe(underlying);
    });
});

describe("getFixturesByDivisionIds", () => {
    it("returns fixtures for several divisions, ordered by division then match", async () => {
        db.query.mockResolvedValueOnce([{ id: "f1", division_id: "div-1" }]);

        expect(await fixturesRepository.getFixturesByDivisionIds(["div-1"]))
            .toEqual([{ id: "f1", division_id: "div-1" }]);
        expect(squash(db.query.mock.calls[0][0])).toContain("ORDER BY division_id, match_no ASC");
    });

    it("does not query at all for an empty or missing list", async () => {
        expect(await fixturesRepository.getFixturesByDivisionIds([])).toEqual([]);
        expect(await fixturesRepository.getFixturesByDivisionIds(null)).toEqual([]);
        expect(db.query).not.toHaveBeenCalled();
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("connection lost");
        db.query.mockRejectedValueOnce(underlying);

        const failure = await failureFrom(fixturesRepository.getFixturesByDivisionIds(["div-1"]));

        expect(failure.message).toBe("Failed to fetch fixtures by division");
        expect(failure.cause).toBe(underlying);
    });
});

describe("getFixtureWithOwner", () => {
    it("joins the fixture to its division and that division's tournament owner", async () => {
        db.query.mockResolvedValueOnce([{ id: "f1", division_id: "div-1", tournament_id: "tour-1", created_by: "user-1" }]);

        expect(await fixturesRepository.getFixtureWithOwner("f1"))
            .toEqual({ id: "f1", division_id: "div-1", tournament_id: "tour-1", created_by: "user-1" });

        const [sql, params] = db.query.mock.calls[0];
        expect(squash(sql)).toBe(
            "SELECT f.*, d.tournament_id, t.created_by FROM fixtures f " +
            "JOIN divisions d ON d.id = f.division_id " +
            "JOIN tournaments t ON t.id = d.tournament_id " +
            "WHERE f.id = $1::uuid"
        );
        expect(params).toEqual(["f1"]);
    });

    it("returns null for a fixture that does not exist, rather than undefined", async () => {
        db.query.mockResolvedValueOnce([]);

        expect(await fixturesRepository.getFixtureWithOwner("missing")).toBeNull();
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("connection lost");
        db.query.mockRejectedValueOnce(underlying);

        const failure = await failureFrom(fixturesRepository.getFixtureWithOwner("f1"));

        expect(failure.message).toBe("Failed to fetch fixture");
        expect(failure.cause).toBe(underlying);
    });
});

// One statement on the caller's client. The transaction belongs to the service,
// which commits this together with the division's completedGames count.
describe("updateResult", () => {
    it("writes the scores and the status on the client it is given", async () => {
        expect(await fixturesRepository.updateResult("f1", [[21, 15], [18, 21]], "COMPLETED", client))
            .toEqual({ message: "Fixture updated" });

        const [sql, params] = client.query.mock.calls[0];
        expect(squash(sql)).toBe(
            "UPDATE fixtures SET team_1_result = $1, team_2_result = $2, status = $3 WHERE id = $4::uuid"
        );
        expect(params).toEqual([[21, 15], [18, 21], "COMPLETED", "f1"]);
        // No transaction of its own, and no BEGIN/COMMIT to conflict with the
        // caller's.
        expect(clientSql().map(squash)).not.toContain("BEGIN");
        expect(db.query).not.toHaveBeenCalled();
    });

    it("throws, keeping the underlying error as cause, and leaves the rollback to the caller", async () => {
        const underlying = new Error("invalid input syntax");
        client.query.mockRejectedValueOnce(underlying);

        const failure = await failureFrom(fixturesRepository.updateResult("f1", [[], []], "COMPLETED", client));

        expect(failure.message).toBe("Failed to update fixture");
        expect(failure.cause).toBe(underlying);
        expect(clientSql()).not.toContain("ROLLBACK");
    });
});

describe("countCompletedInRounds", () => {
    it("counts only the finished fixtures of the named rounds", async () => {
        client.query.mockResolvedValueOnce({ rows: [{ completed: 3 }], rowCount: 1 });

        expect(await fixturesRepository.countCompletedInRounds("div-1", ["Finals", "3rd Place Playoff"], client))
            .toBe(3);

        const [sql, params] = client.query.mock.calls[0];
        expect(squash(sql)).toBe(
            "SELECT count(*)::int AS completed FROM fixtures " +
            "WHERE division_id = $1::uuid AND round = ANY($2::text[]) AND status = 'COMPLETED'"
        );
        expect(params).toEqual(["div-1", ["Finals", "3rd Place Playoff"]]);
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("connection lost");
        client.query.mockRejectedValueOnce(underlying);

        const failure = await failureFrom(
            fixturesRepository.countCompletedInRounds("div-1", ["Pool Play"], client)
        );

        expect(failure.message).toBe("Failed to count completed fixtures");
        expect(failure.cause).toBe(underlying);
    });
});

describe("createFixture", () => {
    const args = ["f1", "div-1", 3, "t1", "t2", null, null, "Pool Play"];

    it("inserts the fixture on the pool by default", async () => {
        expect(await fixturesRepository.createFixture(...args)).toBeUndefined();

        const [sql, params] = db.query.mock.calls[0];
        expect(squash(sql)).toBe(
            "INSERT INTO fixtures (id, division_id, match_no, team_1, team_2, team_1_placeholder, team_2_placeholder, round) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"
        );
        expect(params).toEqual(args);
    });

    it("joins the caller's transaction when given a client", async () => {
        await fixturesRepository.createFixture(...args, client);

        expect(client.query).toHaveBeenCalledOnce();
        expect(db.query).not.toHaveBeenCalled();
    });

    it("throws on a failed insert rather than failing silently", async () => {
        // It used to return the message, which the service ignored, so a failed
        // insert left the division short of fixtures with nothing reported.
        const underlying = new Error("duplicate key");
        db.query.mockRejectedValueOnce(underlying);

        const failure = await failureFrom(fixturesRepository.createFixture(...args));

        expect(failure.message).toBe("Failed to create fixture");
        expect(failure.cause).toBe(underlying);
    });
});

describe("updateFixtures", () => {
    it("updates every fixture inside one transaction", async () => {
        const fixtures = [
            { id: "f1", team_1: "t1", team_2: "t2" },
            { id: "f2", team_1: "t3", team_2: "t4" }
        ];

        expect(await fixturesRepository.updateFixtures("div-1", fixtures))
            .toEqual({ message: "Fixtures updated" });

        expect(clientSql().map(squash)).toEqual([
            "BEGIN",
            "UPDATE fixtures SET team_1 = $1, team_2 = $2 WHERE id = $3",
            "UPDATE fixtures SET team_1 = $1, team_2 = $2 WHERE id = $3",
            "COMMIT"
        ]);
        expect(client.query.mock.calls[2][1]).toEqual(["t3", "t4", "f2"]);
    });

    it("commits an empty batch without updating anything", async () => {
        await fixturesRepository.updateFixtures("div-1", []);

        expect(clientSql()).toEqual(["BEGIN", "COMMIT"]);
    });

    it("rolls back and throws on failure, keeping the underlying error as cause", async () => {
        const underlying = new Error("invalid uuid");
        client.query.mockImplementation(async (sql) => {
            if (sql.startsWith("UPDATE")) throw underlying;
            return { rows: [] };
        });

        const failure = await failureFrom(fixturesRepository.updateFixtures("div-1", [{ id: "f1" }]));

        expect(failure.message).toBe("Failed to update fixtures");
        expect(failure.cause).toBe(underlying);
        expect(clientSql()).toContain("ROLLBACK");
        expect(client.release).toHaveBeenCalledOnce();
    });
});
