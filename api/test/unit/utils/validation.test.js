import { describe, it, expect } from "vitest";
import { assertText } from "../../../src/utils/validation.js";

// assertText exists so that an over-length field is a 400 naming the field,
// rather than the 500 Postgres produced when the value reached the column.
// The field name travels in AppError's `details`, because catalogue messages
// are static — see src/errors.js.

describe("assertText", () => {
    it("accepts a string within the limit", () => {
        expect(() => assertText("Aces", "name", { max: 100 })).not.toThrow();
    });

    it("accepts a string exactly at the limit", () => {
        expect(() => assertText("a".repeat(50), "location", { max: 50 })).not.toThrow();
    });

    it("rejects one character over the limit, naming the field", () => {
        expect(() => assertText("a".repeat(51), "location", { max: 50 }))
            .toThrow(expect.objectContaining({
                code: "FIELD_TOO_LONG",
                status: 400,
                details: { field: "location", max: 50, length: 51 }
            }));
    });

    it.each([
        ["a number", 42],
        ["an object", { name: "Aces" }],
        ["an array", ["Aces"]],
        ["a boolean", true]
    ])("rejects %s as the wrong type", (_label, value) => {
        expect(() => assertText(value, "name", { max: 100 }))
            .toThrow(expect.objectContaining({
                code: "FIELD_INVALID",
                status: 400,
                details: { field: "name" }
            }));
    });

    it.each([
        ["undefined", undefined],
        ["null", null],
        ["an empty string", ""]
    ])("rejects %s when the field is required", (_label, value) => {
        expect(() => assertText(value, "location", { max: 50 }))
            .toThrow(expect.objectContaining({
                code: "MISSING_FIELDS",
                status: 400,
                details: { field: "location" }
            }));
    });

    it.each([
        ["undefined", undefined],
        ["null", null],
        ["an empty string", ""]
    ])("allows %s when the field is optional", (_label, value) => {
        expect(() => assertText(value, "description", { max: 2000, required: false })).not.toThrow();
    });

    // An optional field that is present is still checked. Skipping the length
    // check for anything nullable would leave description unbounded, which is
    // the case this was written for.
    it("still applies the limit to an optional field that was supplied", () => {
        expect(() => assertText("a".repeat(2001), "description", { max: 2000, required: false }))
            .toThrow(expect.objectContaining({ code: "FIELD_TOO_LONG" }));
    });
});
