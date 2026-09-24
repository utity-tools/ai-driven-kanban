import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_ERROR,
  GENERIC_ERROR,
  NOT_FOUND_ERROR,
  SIGNED_OUT_ERROR,
  friendlyDbError,
} from "./action-result";

describe("friendlyDbError", () => {
  it("maps known codes", () => {
    expect(friendlyDbError({ code: "42501" })).toBe(FORBIDDEN_ERROR);
    expect(friendlyDbError({ code: "23503" })).toBe(NOT_FOUND_ERROR);
    expect(friendlyDbError({ code: "23514" })).toMatch(/length/);
    expect(friendlyDbError({ code: "PGRST301" })).toBe(SIGNED_OUT_ERROR);
  });

  it("falls back to a generic message without leaking anything", () => {
    const error = { code: "XX000", message: 'relation "secret_table" does not exist' };

    expect(friendlyDbError(error)).toBe(GENERIC_ERROR);
    expect(friendlyDbError(null)).toBe(GENERIC_ERROR);
  });

  it("lets the caller override a code", () => {
    expect(friendlyDbError({ code: "23514" }, { "23514": "Too long." })).toBe("Too long.");
    expect(friendlyDbError({ code: "42501" }, { "23514": "Too long." })).toBe(FORBIDDEN_ERROR);
  });
});
