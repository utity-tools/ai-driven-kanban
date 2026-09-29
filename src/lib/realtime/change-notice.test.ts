import { describe, expect, it } from "vitest";

import { isOwnChange, parseChangeNotice } from "./change-notice";

const ME = "00000000-0000-4000-a000-000000000001";
const OTHER = "00000000-0000-4000-a000-000000000002";

describe("parseChangeNotice", () => {
  it("reads table and actor, ignoring other keys", () => {
    expect(parseChangeNotice({ table: "cards", op: "UPDATE", actor: ME, id: "x" })).toEqual({
      table: "cards",
      actor: ME,
    });
  });

  it("treats a missing or null actor as unknown", () => {
    expect(parseChangeNotice({ table: "cards", actor: null })).toEqual({
      table: "cards",
      actor: null,
    });
    expect(parseChangeNotice({ table: "cards" }).actor).toBeNull();
  });

  it("survives malformed payloads", () => {
    for (const payload of [null, undefined, "cards", 42, [], { table: 1, actor: {} }]) {
      expect(parseChangeNotice(payload)).toEqual({ table: null, actor: null });
    }
  });
});

describe("isOwnChange", () => {
  it("is true only when the actor is the current user", () => {
    expect(isOwnChange({ table: "cards", actor: ME }, ME)).toBe(true);
    expect(isOwnChange({ table: "cards", actor: OTHER }, ME)).toBe(false);
    expect(isOwnChange({ table: "cards", actor: null }, ME)).toBe(false);
  });
});
