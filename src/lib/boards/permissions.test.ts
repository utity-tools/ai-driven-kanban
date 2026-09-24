import { describe, expect, it } from "vitest";

import { permissionsFor, roleOf } from "./permissions";

describe("permissionsFor", () => {
  it("lets owners do everything", () => {
    expect(permissionsFor("owner")).toEqual({ canEdit: true, canDeleteBoard: true });
  });

  it("lets editors edit but not delete the board", () => {
    expect(permissionsFor("editor")).toEqual({ canEdit: true, canDeleteBoard: false });
  });

  it("makes viewers read-only", () => {
    expect(permissionsFor("viewer")).toEqual({ canEdit: false, canDeleteBoard: false });
  });

  it("makes non-members read-only", () => {
    expect(permissionsFor(null)).toEqual({ canEdit: false, canDeleteBoard: false });
  });
});

describe("roleOf", () => {
  const members = [
    { id: "u-alice", role: "owner" as const },
    { id: "u-bob", role: "editor" as const },
  ];

  it("finds the user's role", () => {
    expect(roleOf(members, "u-bob")).toBe("editor");
  });

  it("is null for users who are not members", () => {
    expect(roleOf(members, "u-eve")).toBeNull();
  });
});
