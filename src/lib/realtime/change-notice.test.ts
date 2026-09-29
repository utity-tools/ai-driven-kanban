import { describe, expect, it } from "vitest";

import { mayAffectAccess, parseChangeNotice } from "./change-notice";

const ME = "00000000-0000-4000-a000-000000000001";

describe("parseChangeNotice", () => {
  it("reads table, op and actor, ignoring other keys", () => {
    expect(parseChangeNotice({ table: "cards", op: "UPDATE", actor: ME, id: "x" })).toEqual({
      table: "cards",
      op: "UPDATE",
      actor: ME,
    });
  });

  it("treats missing or null fields as unknown", () => {
    expect(parseChangeNotice({ table: "cards", actor: null })).toEqual({
      table: "cards",
      op: null,
      actor: null,
    });
  });

  it("survives malformed payloads", () => {
    for (const payload of [null, undefined, "cards", 42, [], { table: 1, op: 2, actor: {} }]) {
      expect(parseChangeNotice(payload)).toEqual({ table: null, op: null, actor: null });
    }
  });
});

describe("mayAffectAccess", () => {
  it("flags membership changes and board deletion only", () => {
    expect(mayAffectAccess({ table: "board_members", op: "DELETE", actor: null })).toBe(true);
    expect(mayAffectAccess({ table: "boards", op: "DELETE", actor: null })).toBe(true);
    expect(mayAffectAccess({ table: "boards", op: "UPDATE", actor: null })).toBe(false);
    expect(mayAffectAccess({ table: "cards", op: "DELETE", actor: null })).toBe(false);
  });
});
