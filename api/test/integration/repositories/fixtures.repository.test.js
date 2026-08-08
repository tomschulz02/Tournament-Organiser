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
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getFixtures", () => {
    it("returns every fixture in the division", async () => {
        db.query.mockResolvedValueOnce([{ id: "f1" }]);

        expect(await fixturesRepository.getFixtures("div-1")).toEqual([{ id: "f1" }]);
        expect(db.query).toHaveBeenCalledWith("SELECT * FROM fixtures WHERE division_id = $1", ["div-1"]);
    });

    it("returns the failure message rather than throwing", async () => {
        db.query.mockRejectedValueOnce(new Error("connection lost"));

        expect(await fixturesRepository.getFixtures("div-1")).toBe("connection lost");
    });

    it("falls back to a generic code when the failure has no message", async () => {
        db.query.mockRejectedValueOnce(new Error(""));

        expect(await fixturesRepository.getFixtures("div-1")).toBe("GET_FIXTURES_ERROR");
    });
});

describe("getResults", () => {
    it("returns only completed fixtures", async () => {
        db.query.mockResolvedValueOnce([{ id: "f1", status: "COMPLETED" }]);

        expect(await fixturesRepository.getResults("div-1")).toEqual([{ id: "f1", status: "COMPLETED" }]);
        expect(squash(db.query.mock.calls[0][0])).toContain("AND status = 'COMPLETED'");
    });

    it("returns the failure message rather than throwing", async () => {
        db.query.mockRejectedValueOnce(new Error("connection lost"));

        expect(await fixturesRepository.getResults("div-1")).toBe("connection lost");
    });

    it("falls back to a generic code when the failure has no message", async () => {
        db.query.mockRejectedValueOnce(new Error(""));

        expect(await fixturesRepository.getResults("div-1")).toBe("GET_RESULTS_ERROR");
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

    it("rethrows the database message, falling back to a generic code", async () => {
        db.query.mockRejectedValueOnce(new Error("connection lost"));
        await expect(fixturesRepository.getFixturesByDivisionIds(["div-1"])).rejects.toThrow("connection lost");

        db.query.mockRejectedValueOnce(new Error(""));
        await expect(fixturesRepository.getFixturesByDivisionIds(["div-1"]))
            .rejects.toThrow("GET_FIXTURES_BY_DIVISION_IDS_ERROR");
    });
});

describe("updateResult", () => {
    it("commits the scores and the new status", async () => {
        client.query.mockResolvedValue({ rows: [{ division_id: "div-1" }], rowCount: 1 });

        expect(await fixturesRepository.updateResult("f1", [[21, 18], [15, 21]], "COMPLETED", null))
            .toEqual({ message: "Fixture updated" });

        expect(clientSql().map(squash)).toEqual([
            "BEGIN",
            "UPDATE fixtures SET team_1_result = $1, team_2_result = $2, status = $3 WHERE id = $4 RETURNING division_id",
            "COMMIT"
        ]);
        expect(client.query.mock.calls[1][1]).toEqual([[21, 18], [15, 21], "COMPLETED", "f1"]);
    });

    it("returns a not-found code and leaves the transaction open when no row matched", async () => {
        client.query.mockResolvedValue({ rows: [], rowCount: 0 });

        expect(await fixturesRepository.updateResult("missing", [[], []], "COMPLETED", null))
            .toBe("FIXTURE_NOT_FOUND");

        // Neither COMMIT nor ROLLBACK is issued on this path; only release ends it.
        expect(clientSql()).not.toContain("COMMIT");
        expect(clientSql()).not.toContain("ROLLBACK");
        expect(client.release).toHaveBeenCalledOnce();
    });

    it("rolls back and returns the failure message", async () => {
        client.query.mockImplementation(async (sql) => {
            if (sql.startsWith("UPDATE")) throw new Error("invalid input syntax");
            return { rows: [] };
        });

        expect(await fixturesRepository.updateResult("f1", [[], []], "COMPLETED", null))
            .toBe("invalid input syntax");
        expect(clientSql()).toContain("ROLLBACK");
    });

    it("falls back to a generic code when the failure has no message", async () => {
        client.query.mockImplementation(async (sql) => {
            if (sql.startsWith("UPDATE")) throw new Error("");
            return { rows: [] };
        });

        expect(await fixturesRepository.updateResult("f1", [[], []], "COMPLETED", null))
            .toBe("UPDATE_FIXTURE_ERROR");
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

    it("swallows a failure and returns its message", async () => {
        db.query.mockRejectedValueOnce(new Error("duplicate key"));

        expect(await fixturesRepository.createFixture(...args)).toBe("duplicate key");
    });

    it("falls back to a generic code when the failure has no message", async () => {
        db.query.mockRejectedValueOnce(new Error(""));

        expect(await fixturesRepository.createFixture(...args)).toBe("CREATE_FIXTURE_ERROR");
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

    it("rolls back and throws on failure", async () => {
        client.query.mockImplementation(async (sql) => {
            if (sql.startsWith("UPDATE")) throw new Error("invalid uuid");
            return { rows: [] };
        });

        await expect(fixturesRepository.updateFixtures("div-1", [{ id: "f1" }]))
            .rejects.toThrow("UPDATE_FIXTURES_ERROR");
        expect(clientSql()).toContain("ROLLBACK");
        expect(client.release).toHaveBeenCalledOnce();
    });
});
