import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

vi.mock("../../../src/config/db.js", async () => {
    const { dbMock } = await import("../../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

vi.mock("../../../src/services/editors.service.js", () => ({
    editorService: { listEditors: vi.fn(), addEditor: vi.fn(), removeEditor: vi.fn() }
}));

const app = (await import("../../../src/app.js")).default;
const { editorService } = await import("../../../src/services/editors.service.js");
const { AppError } = await import("../../../src/errors.js");
const { authCookie } = await import("../../helpers/auth.js");

const TOURNAMENT = "45bb764e-c07d-474e-8d01-9d9711d39a3a";
const EDITOR = "9b2f6a1e-3c4d-4e5f-8a7b-1c2d3e4f5a6b";
const BASE = `/api/tournaments/${TOURNAMENT}/editors`;

beforeEach(() => {
    vi.mocked(editorService.listEditors).mockReset();
    vi.mocked(editorService.addEditor).mockReset();
    vi.mocked(editorService.removeEditor).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/tournaments/:tournamentId/editors", () => {
    it("requires a session", async () => {
        const response = await request(app).get(BASE);

        expect(response.status).toBe(401);
        expect(editorService.listEditors).not.toHaveBeenCalled();
    });

    it("lists the editors for the organiser", async () => {
        const data = [{ id: EDITOR, username: "priya", addedAt: null }];
        editorService.listEditors.mockResolvedValue(data);

        const response = await request(app).get(BASE).set("Cookie", authCookie({ id: "user-1" }));

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, message: "Editors fetched", data });
        expect(editorService.listEditors).toHaveBeenCalledWith(TOURNAMENT, "user-1");
    });

    it("answers 403 for anyone else", async () => {
        editorService.listEditors.mockRejectedValue(new AppError("NOT_TOURNAMENT_OWNER"));

        const response = await request(app).get(BASE).set("Cookie", authCookie({ id: "user-2" }));

        expect(response.status).toBe(403);
    });

    it("answers 404 for a malformed tournament id without reaching the service", async () => {
        const response = await request(app).get("/api/tournaments/nope/editors").set("Cookie", authCookie());

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("Tournament not found");
        expect(editorService.listEditors).not.toHaveBeenCalled();
    });
});

describe("POST /api/tournaments/:tournamentId/editors", () => {
    it("adds an editor from an email or username", async () => {
        editorService.addEditor.mockResolvedValue({ id: EDITOR, username: "priya" });

        const response = await request(app)
            .post(BASE)
            .set("Cookie", authCookie({ id: "user-1" }))
            .send({ identifier: "priya@example.com" });

        expect(response.status).toBe(201);
        expect(response.body).toEqual({ success: true, message: "Editor added", data: { id: EDITOR, username: "priya" } });
        expect(editorService.addEditor).toHaveBeenCalledWith(TOURNAMENT, "user-1", "priya@example.com");
    });

    it("passes the refusal through with its catalogue message", async () => {
        editorService.addEditor.mockRejectedValue(new AppError("EDITOR_ALREADY_ADDED"));

        const response = await request(app).post(BASE).set("Cookie", authCookie()).send({ identifier: "priya" });

        expect(response.status).toBe(409);
        expect(response.body.message).toBe("That user is already an editor of this tournament");
    });

    it("answers 404 for a malformed tournament id without reaching the service", async () => {
        const response = await request(app).post("/api/tournaments/nope/editors").set("Cookie", authCookie()).send({});

        expect(response.status).toBe(404);
        expect(editorService.addEditor).not.toHaveBeenCalled();
    });

    it("hands the service an undefined identifier when there is no body", async () => {
        editorService.addEditor.mockRejectedValue(new AppError("MISSING_FIELDS"));

        const response = await request(app).post(BASE).set("Cookie", authCookie({ id: "user-1" }));

        expect(response.status).toBe(400);
        expect(editorService.addEditor).toHaveBeenCalledWith(TOURNAMENT, "user-1", undefined);
    });
});

describe("DELETE /api/tournaments/:tournamentId/editors/:userId", () => {
    it("removes the editor", async () => {
        editorService.removeEditor.mockResolvedValue({ id: EDITOR });

        const response = await request(app).delete(`${BASE}/${EDITOR}`).set("Cookie", authCookie({ id: "user-1" }));

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, message: "Editor removed", data: { id: EDITOR } });
        expect(editorService.removeEditor).toHaveBeenCalledWith(TOURNAMENT, "user-1", EDITOR);
    });

    it("answers 404 for someone who is not an editor", async () => {
        editorService.removeEditor.mockRejectedValue(new AppError("EDITOR_NOT_FOUND"));

        const response = await request(app).delete(`${BASE}/${EDITOR}`).set("Cookie", authCookie());

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("That user is not an editor of this tournament");
    });

    it("answers 404 for a malformed user id without reaching the service", async () => {
        const response = await request(app).delete(`${BASE}/nope`).set("Cookie", authCookie());

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("That user is not an editor of this tournament");
        expect(editorService.removeEditor).not.toHaveBeenCalled();
    });

    it("answers 404 for a malformed tournament id without reaching the service", async () => {
        const response = await request(app).delete(`/api/tournaments/nope/editors/${EDITOR}`).set("Cookie", authCookie());

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("Tournament not found");
    });
});
