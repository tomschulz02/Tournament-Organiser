import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

// Review 4.1, through the real stack: route, controller, service and repository,
// with only the database stood in for. The route suites beside this one mock the
// services, so they can say how an error is answered but not which results
// produce it. This one drives both triggers — a cancelled knockout match and one
// ended with the sets level — from the request down to the SQL.
//
// The division: eight qualifiers q1..q8 from pool play, quarterfinal 1 (q1 v q8)
// feeding semifinal 1 against the winner of quarterfinal 2 (q4 v q5).

vi.mock("../../../src/config/db.js", async () => {
    const { dbMock } = await import("../../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

const app = (await import("../../../src/app.js")).default;
const { dbMock, resetDbMock, clientSql, squash } = await import("../../helpers/dbMock.js");
const { authCookie } = await import("../../helpers/auth.js");
const { makeFixture, makeRound, makeState } = await import("../../helpers/fixtures.js");

const QF1_ID = "45bb764e-c07d-474e-8d01-9d9711d39a3a";
const TEAMS = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"];
const PROGRESSION_URL = "/api/divisions/div-1/progression";

function divisionState() {
    return makeState({
        teams: TEAMS,
        currentRound: 1,
        rounds: [
            makeRound({ name: "Pool Play", groups: [TEAMS], results: TEAMS, computedResults: TEAMS }),
            makeRound({
                name: "Quarterfinals",
                type: "knockout",
                groups: [[0, 7], [3, 4], [1, 6], [2, 5]],
                fixtures: [QF1_ID, "f-qf2", "f-qf3", "f-qf4"]
            }),
            makeRound({ name: "Semifinals", type: "knockout", groups: [[0, 1], [2, 3]], fixtures: ["f-sf1", "f-sf2"] }),
            makeRound({ name: "Finals", type: "knockout", groups: [[2, 3], [0, 1]], fixtures: ["f-bronze", "f-final"] })
        ]
    });
}

// Quarterfinals 2-4 won by the better seed; quarterfinal 1 as the case needs.
function quarterfinals(firstMatch) {
    const won = (id, matchNo, one, two) => makeFixture({
        id, match_no: matchNo, round: "Quarterfinals", status: "COMPLETED",
        team_1: one, team_2: two, team_1_result: [25, 25], team_2_result: [20, 18]
    });

    return [
        makeFixture({ id: QF1_ID, match_no: 1, round: "Quarterfinals", team_1: "q1", team_2: "q8", ...firstMatch }),
        won("f-qf2", 2, "q4", "q5"),
        won("f-qf3", 3, "q2", "q7"),
        won("f-qf4", 4, "q3", "q6")
    ];
}

// Answers each query by what it asks for, in either access style the
// repositories use: db.query returns rows, a transaction client a pg result.
function database({ fixtures = [] } = {}) {
    const state = divisionState();

    dbMock.instance.query.mockImplementation(async (sql) => {
        if (sql.includes("JOIN divisions d ON d.id = f.division_id")) {
            return [{ ...fixtures[0], tournament_id: "tour-1", created_by: "user-1" }];
        }
        if (sql.includes("FROM divisions d")) {
            return [{ id: "div-1", name: "Division A", state, ranking_basis: null, created_by: "user-1" }];
        }
        if (sql.includes("FROM fixtures WHERE division_id")) return fixtures;
        if (sql.includes("FROM teams")) return TEAMS.map((id) => ({ id, name: id.toUpperCase() }));
        return [];
    });

    dbMock.client.query.mockImplementation(async (sql) => {
        if (sql.startsWith("SELECT state FROM divisions")) return { rows: [{ state }], rowCount: 1 };
        if (sql.includes("count(*)")) return { rows: [{ completed: 3 }], rowCount: 1 };
        return { rows: [], rowCount: 1 };
    });
}

function fixtureWrites() {
    return dbMock.client.query.mock.calls.filter(([sql]) => sql.startsWith("UPDATE fixtures"));
}

beforeEach(() => {
    resetDbMock();
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PUT /api/fixtures/:fixtureId/result on a knockout match", () => {
    it("refuses to end it with the sets level, writing nothing", async () => {
        database({ fixtures: quarterfinals({ status: "LIVE" }) });

        const response = await request(app)
            .put(`/api/fixtures/${QF1_ID}/result`)
            .set("Cookie", authCookie())
            .send({ sets: [[25, 20], [20, 25]], finished: true });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({ success: false, data: null });
        expect(response.body.message).toMatch(/^A knockout match needs a winner/);
        expect(fixtureWrites()).toEqual([]);
        expect(clientSql().at(-1)).toBe("ROLLBACK");
    });

    // Both teams forfeited. Still allowed: the next round's opponent gets a
    // walkover, which the proposal below shows.
    it("accepts it being cancelled", async () => {
        database({ fixtures: quarterfinals({ status: "LIVE" }) });

        const response = await request(app)
            .put(`/api/fixtures/${QF1_ID}/result`)
            .set("Cookie", authCookie())
            .send({ sets: [[0, 0]], finished: true });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ id: QF1_ID, status: "CANCELLED" });
        expect(fixtureWrites().map(([, params]) => params[2])).toEqual(["CANCELLED"]);
    });
});

describe("round progression past a knockout match with no winner", () => {
    // The live reproduction: q6 lost its quarterfinal and was proposed for the
    // semifinals, against q2, who had just beaten it. Now quarterfinal 1's places
    // stay empty and every other team keeps its own.
    it("proposes an empty place for a cancelled quarterfinal, not a beaten team", async () => {
        database({ fixtures: quarterfinals({ status: "CANCELLED", team_1_result: [0], team_2_result: [0] }) });

        const response = await request(app).get(PROGRESSION_URL).set("Cookie", authCookie());

        expect(response.status).toBe(200);
        expect(response.body.data.qualifiers.map((row) => row.id)).toEqual([null, "q4", "q2", "q3"]);
        expect(response.body.data.computedResults.map((row) => row.id))
            .toEqual([null, "q4", "q2", "q3", null, "q5", "q7", "q6", "q1", "q8"]);
        expect(response.body.data.eligibleTeams.map((row) => row.id)).not.toContain(null);
    });

    // A match recorded level before the score endpoint refused one.
    it("refuses to propose past a quarterfinal recorded level, naming it", async () => {
        database({ fixtures: quarterfinals({ status: "COMPLETED", team_1_result: [25, 20], team_2_result: [20, 25] }) });

        const response = await request(app).get(PROGRESSION_URL).set("Cookie", authCookie());

        expect(response.status).toBe(409);
        expect(response.body).toEqual({
            success: false,
            message: "A knockout match in this round ended without a winner. Open it and enter the winning score",
            data: { fixtureId: QF1_ID, matchNo: 1, round: "Quarterfinals" }
        });
    });

    // Semifinal 1 is a walkover for q4, settled as it is bound; semifinal 2 is
    // an ordinary match.
    it("binds the semifinal the cancelled quarterfinal fed as a walkover", async () => {
        database({ fixtures: quarterfinals({ status: "CANCELLED", team_1_result: [0], team_2_result: [0] }) });

        const response = await request(app)
            .post(PROGRESSION_URL)
            .set("Cookie", authCookie())
            .send({ teams: [null, "q4", "q2", "q3"] });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ results: [null, "q4", "q2", "q3"], fixturesBound: 2 });
        expect(fixtureWrites().map(([sql, params]) => [squash(sql), params])).toEqual([
            ["UPDATE fixtures SET team_1 = $1, team_2 = $2, status = $3 WHERE id = $4", [null, "q4", "CANCELLED", "f-sf1"]],
            ["UPDATE fixtures SET team_1 = $1, team_2 = $2, status = $3 WHERE id = $4", ["q2", "q3", "UPCOMING", "f-sf2"]]
        ]);
    });
});
