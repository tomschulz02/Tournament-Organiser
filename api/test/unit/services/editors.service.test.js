import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/repositories/editors.repository.js", () => ({
    editorsRepository: {
        getEditors: vi.fn(),
        isEditor: vi.fn(),
        addEditor: vi.fn(),
        removeEditor: vi.fn(),
        getWorkedWith: vi.fn(),
        searchByUsernamePrefix: vi.fn()
    }
}));

vi.mock("../../../src/repositories/tournament.repository.js", () => ({
    tournamentRepository: {
        getTournamentById: vi.fn(),
        touchTournament: vi.fn()
    }
}));

vi.mock("../../../src/repositories/users.repository.js", () => ({
    userRepository: {
        findUserByEmailOrUsername: vi.fn()
    }
}));

const { editorService } = await import("../../../src/services/editors.service.js");
const { editorsRepository } = await import("../../../src/repositories/editors.repository.js");
const { tournamentRepository } = await import("../../../src/repositories/tournament.repository.js");
const { userRepository } = await import("../../../src/repositories/users.repository.js");

const OWNER = "owner-1";
const tournament = { id: "t-1", created_by: OWNER };

beforeEach(() => {
    vi.mocked(tournamentRepository.getTournamentById).mockReset().mockResolvedValue(tournament);
    vi.mocked(tournamentRepository.touchTournament).mockReset();
    vi.mocked(editorsRepository.getEditors).mockReset().mockResolvedValue([]);
    vi.mocked(editorsRepository.isEditor).mockReset().mockResolvedValue(false);
    vi.mocked(editorsRepository.addEditor).mockReset();
    vi.mocked(editorsRepository.removeEditor).mockReset().mockResolvedValue(true);
    vi.mocked(userRepository.findUserByEmailOrUsername).mockReset();
});

describe("ownership", () => {
    it.each([
        ["listEditors", () => editorService.listEditors("t-1", "someone-else")],
        ["addEditor", () => editorService.addEditor("t-1", "someone-else", "priya")],
        ["removeEditor", () => editorService.removeEditor("t-1", "someone-else", "user-2")]
    ])("%s refuses anyone but the organiser", async (_, call) => {
        await expect(call()).rejects.toMatchObject({ code: "NOT_TOURNAMENT_OWNER" });
        expect(editorsRepository.addEditor).not.toHaveBeenCalled();
        expect(editorsRepository.removeEditor).not.toHaveBeenCalled();
    });

    it("answers TOURNAMENT_NOT_FOUND for a tournament that does not exist", async () => {
        tournamentRepository.getTournamentById.mockResolvedValue(null);

        await expect(editorService.listEditors("t-1", OWNER)).rejects.toMatchObject({ code: "TOURNAMENT_NOT_FOUND" });
    });
});

describe("listEditors", () => {
    it("returns id, username and when they were added", async () => {
        editorsRepository.getEditors.mockResolvedValue([
            { id: "user-2", username: "priya", created_at: "2026-09-24T10:00:00Z" },
            { id: "user-3", username: "sam" }
        ]);

        expect(await editorService.listEditors("t-1", OWNER)).toEqual([
            { id: "user-2", username: "priya", addedAt: "2026-09-24T10:00:00Z" },
            { id: "user-3", username: "sam", addedAt: null }
        ]);
    });
});

describe("addEditor", () => {
    it("resolves the user by email or username and grants access immediately", async () => {
        userRepository.findUserByEmailOrUsername.mockResolvedValue({ id: "user-2", username: "priya", email: "p@example.com" });

        expect(await editorService.addEditor("t-1", OWNER, "  p@example.com ")).toEqual({ id: "user-2", username: "priya" });

        expect(userRepository.findUserByEmailOrUsername).toHaveBeenCalledWith("p@example.com");
        expect(editorsRepository.addEditor).toHaveBeenCalledWith("t-1", "user-2");
        // The editor's view changes, so the tournament's ETag has to move.
        expect(tournamentRepository.touchTournament).toHaveBeenCalledWith("t-1");
    });

    it("refuses a user who does not exist", async () => {
        userRepository.findUserByEmailOrUsername.mockResolvedValue(null);

        await expect(editorService.addEditor("t-1", OWNER, "nobody")).rejects.toMatchObject({ code: "USER_NOT_FOUND" });
        expect(editorsRepository.addEditor).not.toHaveBeenCalled();
    });

    it("refuses the organiser themself", async () => {
        userRepository.findUserByEmailOrUsername.mockResolvedValue({ id: OWNER, username: "tom" });

        await expect(editorService.addEditor("t-1", OWNER, "tom")).rejects.toMatchObject({ code: "EDITOR_IS_ORGANISER" });
        expect(editorsRepository.addEditor).not.toHaveBeenCalled();
    });

    it("refuses someone who is already an editor", async () => {
        userRepository.findUserByEmailOrUsername.mockResolvedValue({ id: "user-2", username: "priya" });
        editorsRepository.isEditor.mockResolvedValue(true);

        await expect(editorService.addEditor("t-1", OWNER, "priya")).rejects.toMatchObject({ code: "EDITOR_ALREADY_ADDED" });
        expect(editorsRepository.addEditor).not.toHaveBeenCalled();
    });

    it("refuses a missing or non-text identifier before looking anyone up", async () => {
        await expect(editorService.addEditor("t-1", OWNER, undefined)).rejects.toMatchObject({ code: "MISSING_FIELDS" });
        await expect(editorService.addEditor("t-1", OWNER, 42)).rejects.toMatchObject({ code: "FIELD_INVALID" });
        expect(userRepository.findUserByEmailOrUsername).not.toHaveBeenCalled();
    });
});

describe("removeEditor", () => {
    it("deletes the membership and moves the tournament's stamp", async () => {
        expect(await editorService.removeEditor("t-1", OWNER, "user-2")).toEqual({ id: "user-2" });

        expect(editorsRepository.removeEditor).toHaveBeenCalledWith("t-1", "user-2");
        expect(tournamentRepository.touchTournament).toHaveBeenCalledWith("t-1");
    });

    it("refuses removing someone who was never an editor, rather than reporting success", async () => {
        editorsRepository.removeEditor.mockResolvedValue(false);

        await expect(editorService.removeEditor("t-1", OWNER, "user-9")).rejects.toMatchObject({ code: "EDITOR_NOT_FOUND" });
        expect(tournamentRepository.touchTournament).not.toHaveBeenCalled();
    });
});

describe("searchCandidates", () => {
    const user = (id, username) => ({ id, username });

    beforeEach(() => {
        editorsRepository.getWorkedWith.mockReset().mockResolvedValue([]);
        editorsRepository.searchByUsernamePrefix.mockReset().mockResolvedValue([]);
    });

    it("refuses anyone but the organiser", async () => {
        await expect(editorService.searchCandidates("t-1", "someone-else", "pri"))
            .rejects.toMatchObject({ code: "NOT_TOURNAMENT_OWNER" });
        expect(editorsRepository.getWorkedWith).not.toHaveBeenCalled();
    });

    it("offers previous collaborators before anything is typed, and searches nobody else", async () => {
        editorsRepository.getWorkedWith.mockResolvedValue([user("user-3", "priya")]);

        expect(await editorService.searchCandidates("t-1", OWNER, undefined)).toEqual([
            { username: "priya", workedWith: true }
        ]);
        expect(editorsRepository.getWorkedWith).toHaveBeenCalledWith(OWNER, "t-1", null, 5);
        expect(editorsRepository.searchByUsernamePrefix).not.toHaveBeenCalled();
    });

    it("filters collaborators from the first character, but searches everyone only from three", async () => {
        await editorService.searchCandidates("t-1", OWNER, " PR ");

        expect(editorsRepository.getWorkedWith).toHaveBeenCalledWith(OWNER, "t-1", "pr%", 5);
        expect(editorsRepository.searchByUsernamePrefix).not.toHaveBeenCalled();
    });

    it("lists collaborators first, then everyone else, without repeats, up to five", async () => {
        editorsRepository.getWorkedWith.mockResolvedValue([user("user-3", "priya"), user("user-5", "prim")]);
        editorsRepository.searchByUsernamePrefix.mockResolvedValue([
            user("user-3", "priya"),
            user("user-6", "pria"),
            user("user-7", "pric"),
            user("user-8", "prid"),
            user("user-9", "prie")
        ]);

        expect(await editorService.searchCandidates("t-1", OWNER, "Pri")).toEqual([
            { username: "priya", workedWith: true },
            { username: "prim", workedWith: true },
            { username: "pria", workedWith: false },
            { username: "pric", workedWith: false },
            { username: "prid", workedWith: false }
        ]);
        expect(editorsRepository.searchByUsernamePrefix).toHaveBeenCalledWith(OWNER, "t-1", "pri%", 7);
    });

    it("searches nobody else once collaborators fill the list", async () => {
        editorsRepository.getWorkedWith.mockResolvedValue(
            ["a", "b", "c", "d", "e"].map((name) => user(`user-${name}`, `pri${name}`))
        );

        expect(await editorService.searchCandidates("t-1", OWNER, "pri")).toHaveLength(5);
        expect(editorsRepository.searchByUsernamePrefix).not.toHaveBeenCalled();
    });

    it("treats % and _ as the characters they are, not wildcards", async () => {
        await editorService.searchCandidates("t-1", OWNER, "a%_\\b");

        expect(editorsRepository.getWorkedWith.mock.calls[0][2]).toBe("a\\%\\_\\\\b%");
    });

    it("answers nothing for text longer than any username, or a non-string", async () => {
        expect(await editorService.searchCandidates("t-1", OWNER, "x".repeat(101))).toEqual([]);
        expect(editorsRepository.getWorkedWith).not.toHaveBeenCalled();

        await editorService.searchCandidates("t-1", OWNER, ["pri"]);
        expect(editorsRepository.getWorkedWith).toHaveBeenCalledWith(OWNER, "t-1", null, 5);
    });
});
