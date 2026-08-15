import { describe, it, expect } from "vitest";
import { AppError, ERRORS } from "../../src/errors.js";

describe("AppError", () => {
    it("takes its status and message from the catalogue entry for the code", () => {
        const err = new AppError("NOT_TOURNAMENT_OWNER");

        expect(err.code).toBe("NOT_TOURNAMENT_OWNER");
        expect(err.status).toBe(403);
        expect(err.message).toBe("You do not own this tournament");
    });

    it("is a real Error, so it survives instanceof and carries a stack", () => {
        const err = new AppError("DIVISION_NOT_FOUND");

        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(AppError);
        expect(err.name).toBe("AppError");
        expect(err.stack).toBeTruthy();
    });

    it("falls back to a generic 500 for a code that is not in the catalogue", () => {
        const err = new AppError("SOMETHING_NOBODY_DECLARED");

        expect(err.code).toBe("SOMETHING_NOBODY_DECLARED");
        expect(err.status).toBe(500);
        expect(err.message).toBe("Internal server error");
    });

    it("preserves the underlying error as cause, so the Postgres code survives", () => {
        const pgError = Object.assign(new Error("duplicate key value"), {
            code: "23505",
            constraint: "users_email_key"
        });

        const err = new AppError("EMAIL_ALREADY_REGISTERED", { cause: pgError });

        expect(err.cause).toBe(pgError);
        expect(err.cause.code).toBe("23505");
    });

    it("passes details through, since catalogue messages are static", () => {
        const err = new AppError("WRONG_QUALIFIER_COUNT", { details: { expected: 4, received: 3 } });

        expect(err.details).toEqual({ expected: 4, received: 3 });
    });

    it("leaves cause and details undefined when no options are given", () => {
        const err = new AppError("ROUND_NOT_COMPLETE");

        expect(err.cause).toBeUndefined();
        expect(err.details).toBeUndefined();
    });
});

describe("ERRORS catalogue", () => {
    it("declares every entry as a [status, message] pair with a display-ready message", () => {
        for (const [code, entry] of Object.entries(ERRORS)) {
            expect(entry, code).toHaveLength(2);

            const [status, message] = entry;
            expect(status, code).toBeGreaterThanOrEqual(400);
            expect(status, code).toBeLessThan(600);
            expect(typeof message, code).toBe("string");
            // Display-ready means no code leaks into the copy the user reads.
            expect(message, code).not.toMatch(/_/);
        }
    });

    it("holds no entry for an unexpected fault, which must stay unnamed", () => {
        expect(ERRORS.USER_CREATION_ERROR).toBeUndefined();
        expect(ERRORS.FETCH_TOURNAMENT_ERROR).toBeUndefined();
        expect(ERRORS.DATABASE_ERROR).toBeUndefined();
    });
});
