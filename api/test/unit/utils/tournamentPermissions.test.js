import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/repositories/editors.repository.js", () => ({
    editorsRepository: { getRole: vi.fn() }
}));

const { editorsRepository } = await import("../../../src/repositories/editors.repository.js");
const { ORGANISER, CO_ORGANISER, MATCH_MANAGER, SCORER, ASSIGNABLE_ROLES, ROLE_LABELS, capabilitiesFor, resolveRole, assertCan } = await import(
    "../../../src/utils/tournamentPermissions.js"
);

beforeEach(() => {
    editorsRepository.getRole.mockReset().mockResolvedValue(null);
});

// The decision itself, written out rather than derived, so that widening a role
// has to be done here on purpose as well as in the table it tests.
const NOTHING = {
    enterCurrentRoundResults: false,
    enterAnyRoundResults: false,
    progressRounds: false,
    editSchedule: false,
    printScoresheets: false,
    manageSetup: false,
    manageCollaborators: false,
    deleteTournament: false
};

describe("capabilitiesFor", () => {
    it.each([
        [null, NOTHING],
        [SCORER, { ...NOTHING, enterCurrentRoundResults: true }],
        [
            MATCH_MANAGER,
            {
                ...NOTHING,
                enterCurrentRoundResults: true,
                enterAnyRoundResults: true,
                progressRounds: true,
                editSchedule: true,
                printScoresheets: true
            }
        ],
        [
            CO_ORGANISER,
            {
                ...NOTHING,
                enterCurrentRoundResults: true,
                enterAnyRoundResults: true,
                progressRounds: true,
                editSchedule: true,
                printScoresheets: true,
                manageSetup: true
            }
        ],
        [
            ORGANISER,
            {
                enterCurrentRoundResults: true,
                enterAnyRoundResults: true,
                progressRounds: true,
                editSchedule: true,
                printScoresheets: true,
                manageSetup: true,
                manageCollaborators: true,
                deleteTournament: true
            }
        ]
    ])("gives %s exactly its column", (role, expected) => {
        expect(capabilitiesFor(role)).toEqual(expected);
    });

    it("grants nothing for a role it does not know", () => {
        expect(capabilitiesFor("ADMIN")).toEqual(NOTHING);
    });
});

describe("ASSIGNABLE_ROLES", () => {
    it("is every role but the organiser, which only created_by can make someone", () => {
        expect(ASSIGNABLE_ROLES).toEqual(["SCORER", "MATCH_MANAGER", "CO_ORGANISER"]);
    });
});

describe("ROLE_LABELS", () => {
    it("names every role the way it reads beside someone's name", () => {
        expect(ROLE_LABELS).toEqual({
            SCORER: "scorer",
            MATCH_MANAGER: "match manager",
            CO_ORGANISER: "co-organiser",
            ORGANISER: "organiser"
        });
    });
});

describe("resolveRole", () => {
    it("is the organiser for created_by, without a query", async () => {
        expect(await resolveRole("t-1", "owner", "owner")).toBe(ORGANISER);
        expect(editorsRepository.getRole).not.toHaveBeenCalled();
    });

    it.each([[null], [undefined]])("is null for a signed-out viewer (%s), without a query", async (viewer) => {
        expect(await resolveRole("t-1", "owner", viewer)).toBeNull();
        expect(editorsRepository.getRole).not.toHaveBeenCalled();
    });

    it("is the stored role for a collaborator", async () => {
        editorsRepository.getRole.mockResolvedValue(MATCH_MANAGER);

        expect(await resolveRole("t-1", "owner", "user-2")).toBe(MATCH_MANAGER);
        expect(editorsRepository.getRole).toHaveBeenCalledWith("t-1", "user-2");
    });

    it("is null for someone holding no role", async () => {
        expect(await resolveRole("t-1", "owner", "stranger")).toBeNull();
    });
});

describe("assertCan", () => {
    it("lets a role through for what it holds", () => {
        expect(() => assertCan(SCORER, "enterCurrentRoundResults")).not.toThrow();
        expect(() => assertCan(ORGANISER, "deleteTournament")).not.toThrow();
    });

    it("refuses a stranger as not the owner", () => {
        expect(() => assertCan(null, "enterCurrentRoundResults")).toThrow(expect.objectContaining({ code: "NOT_TOURNAMENT_OWNER", status: 403 }));
    });

    it("refuses a collaborator by their role", () => {
        expect(() => assertCan(CO_ORGANISER, "deleteTournament")).toThrow(expect.objectContaining({ code: "ROLE_NOT_PERMITTED", status: 403 }));
    });
});
