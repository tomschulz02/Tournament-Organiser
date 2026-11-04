import { describe, it, expect, beforeEach, vi } from "vitest";

// Who may call what, one row per mutating endpoint. The rows are written out
// rather than derived from the capability map, so that this table and the
// endpoint table in docs/decisions.md have to agree on purpose. Only the gate is
// tested here: what each endpoint then does is its own suite's business.

vi.mock("../../../src/config/db.js", async () => {
    const { dbMock } = await import("../../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

vi.mock("../../../src/repositories/tournament.repository.js");
vi.mock("../../../src/repositories/divisions.repository.js");
vi.mock("../../../src/repositories/fixtures.repository.js");
vi.mock("../../../src/repositories/editors.repository.js");
vi.mock("../../../src/repositories/users.repository.js");

const { tournamentService } = await import("../../../src/services/tournaments.service.js");
const { divisionService } = await import("../../../src/services/divisions.service.js");
const { progressionService } = await import("../../../src/services/progression.service.js");
const { fixtureService } = await import("../../../src/services/fixtures.service.js");
const { editorService } = await import("../../../src/services/editors.service.js");
const { tournamentRepository } = await import("../../../src/repositories/tournament.repository.js");
const { divisionsRepository } = await import("../../../src/repositories/divisions.repository.js");
const { fixturesRepository } = await import("../../../src/repositories/fixtures.repository.js");
const { editorsRepository } = await import("../../../src/repositories/editors.repository.js");
const { userRepository } = await import("../../../src/repositories/users.repository.js");
const { dbMock, resetDbMock } = await import("../../helpers/dbMock.js");

const OWNER = "owner-1";
const TOURNAMENT = "tour-1";

const ALL = ["SCORER", "MATCH_MANAGER", "CO_ORGANISER", "ORGANISER"];
const RUNS_THE_DAY = ["MATCH_MANAGER", "CO_ORGANISER", "ORGANISER"];
const SETS_UP = ["CO_ORGANISER", "ORGANISER"];
const ORGANISER_ONLY = ["ORGANISER"];

const ENDPOINTS = [
    ["PUT /fixtures/:id/result", ALL, (user) => fixtureService.updateResult("f-1", user, [[21, 15]], true)],
    ["GET /divisions/:id/progression", RUNS_THE_DAY, (user) => progressionService.getProposal("d-1", user)],
    ["POST /divisions/:id/progression", RUNS_THE_DAY, (user) => progressionService.commit("d-1", user, [])],
    ["PUT /tournaments/:id/schedule", RUNS_THE_DAY, (user) => tournamentService.updateSchedule(TOURNAMENT, user, { entries: [] })],
    ["POST /tournaments/:id/start", SETS_UP, (user) => tournamentService.startTournament(TOURNAMENT, user)],
    ["POST /tournaments/:id/end", SETS_UP, (user) => tournamentService.endTournament(TOURNAMENT, user)],
    ["POST /tournaments/:id/divisions", SETS_UP, (user) => tournamentService.addDivision(TOURNAMENT, user, {})],
    ["PUT /tournaments/:id/scoresheet-template", SETS_UP, (user) => tournamentService.updateScoresheetTemplate(TOURNAMENT, user, null)],
    ["PUT /divisions/:id", SETS_UP, (user) => divisionService.updateDivision("d-1", user, {})],
    ["PUT /divisions/:id/colour", SETS_UP, (user) => divisionService.updateDivisionColour("d-1", user, null)],
    ["PUT /divisions/:id/settings", SETS_UP, (user) => divisionService.updateDivisionSettings("d-1", user, {})],
    ["DELETE /divisions/:id", SETS_UP, (user) => divisionService.deleteDivision("d-1", user)],
    ["GET /tournaments/:id/editors", ORGANISER_ONLY, (user) => editorService.listEditors(TOURNAMENT, user)],
    ["GET /tournaments/:id/editors/search", ORGANISER_ONLY, (user) => editorService.searchCandidates(TOURNAMENT, user, "pri")],
    ["POST /tournaments/:id/editors", ORGANISER_ONLY, (user) => editorService.addEditor(TOURNAMENT, user, "priya")],
    ["PUT /tournaments/:id/editors/:userId", ORGANISER_ONLY, (user) => editorService.updateEditorRole(TOURNAMENT, user, "user-9", "SCORER")],
    ["DELETE /tournaments/:id/editors/:userId", ORGANISER_ONLY, (user) => editorService.removeEditor(TOURNAMENT, user, "user-9")],
    ["DELETE /tournaments/:id", ORGANISER_ONLY, (user) => tournamentService.deleteTournament(TOURNAMENT, user)]
];

const PERMISSION_REFUSALS = ["NOT_TOURNAMENT_OWNER", "ROLE_NOT_PERMITTED"];

// The only repository calls a refused request may have made.
const READS_BEFORE_THE_GATE = new Set(["getTournamentById", "getDivisionWithOwner", "getFixtureWithOwner", "getRole"]);

function repositoryCallsPastTheGate() {
    return [tournamentRepository, divisionsRepository, fixturesRepository, editorsRepository, userRepository].flatMap((repository) =>
        Object.entries(repository)
            .filter(([name, fn]) => vi.isMockFunction(fn) && fn.mock.calls.length > 0 && !READS_BEFORE_THE_GATE.has(name))
            .map(([name]) => name)
    );
}

// Whatever an allowed call goes on to do with mocked repositories is not this
// suite's question, so anything but a permission refusal counts as through.
async function refusal(call) {
    const error = await call().catch((err) => err);

    return PERMISSION_REFUSALS.includes(error?.code) ? error.code : null;
}

function asRole(role) {
    if (role === "ORGANISER") return OWNER;

    editorsRepository.getRole.mockResolvedValue(role);
    return "user-2";
}

beforeEach(() => {
    vi.clearAllMocks();
    resetDbMock();
    vi.spyOn(console, "error").mockImplementation(() => {});

    editorsRepository.getRole.mockResolvedValue(null);
    tournamentRepository.getTournamentById.mockResolvedValue({ id: TOURNAMENT, created_by: OWNER, status: "Not Started" });
    divisionsRepository.getDivisionWithOwner.mockResolvedValue({
        id: "d-1",
        tournament_id: TOURNAMENT,
        created_by: OWNER,
        state: { teams: [], rounds: [], currentRound: 0 },
        tournament_status: "Not Started"
    });
    fixturesRepository.getFixtureWithOwner.mockResolvedValue({
        id: "f-1",
        division_id: "d-1",
        tournament_id: TOURNAMENT,
        created_by: OWNER,
        round: "Pool Play",
        team_1: "t1",
        team_2: "t2"
    });
});

describe.each(ENDPOINTS)("%s", (_, allowed, call) => {
    it.each(ALL.filter((role) => allowed.includes(role)))("lets a %s through", async (role) => {
        expect(await refusal(() => call(asRole(role)))).toBeNull();
    });

    const refused = ALL.filter((role) => !allowed.includes(role));
    if (refused.length > 0) {
        it.each(refused)("refuses a %s by their role, before anything else happens", async (role) => {
            expect(await refusal(() => call(asRole(role)))).toBe("ROLE_NOT_PERMITTED");
            expect(repositoryCallsPastTheGate()).toEqual([]);
            expect(dbMock.instance.withTransaction).not.toHaveBeenCalled();
        });
    }

    it("refuses a stranger as not the owner, before anything else happens", async () => {
        expect(await refusal(() => call("stranger"))).toBe("NOT_TOURNAMENT_OWNER");
        expect(repositoryCallsPastTheGate()).toEqual([]);
        expect(dbMock.instance.withTransaction).not.toHaveBeenCalled();
    });
});
