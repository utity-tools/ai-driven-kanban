import { describe, expect, it } from "vitest";

import {
  CREATOR_CANNOT_LEAVE_NOTE,
  CREATOR_NOTE,
  leaveAvailability,
  memberControls,
} from "./management";
import { changeMemberRoleSchema, memberRoleSchema } from "./schemas";

const creator = "creator";
const owner = { id: "owner", role: "owner" as const, creatorId: creator };
const editor = { id: "editor", role: "editor" as const, creatorId: creator };

describe("memberControls", () => {
  it("lets owners manage other members", () => {
    expect(memberControls(owner, { id: "someone" })).toEqual({
      showControls: true,
      canManage: true,
      note: null,
    });
  });

  it("protects the creator with an explanation", () => {
    expect(memberControls(owner, { id: creator })).toEqual({
      showControls: true,
      canManage: false,
      note: CREATOR_NOTE,
    });
    const self = memberControls({ ...owner, id: creator }, { id: creator });
    expect(self.canManage).toBe(false);
    expect(self.showControls).toBe(false);
  });

  it("gives your own row no controls", () => {
    expect(memberControls(owner, { id: "owner" })).toEqual({
      showControls: false,
      canManage: false,
      note: null,
    });
  });

  it("makes the list read-only for non-owners", () => {
    expect(memberControls(editor, { id: "someone" })).toMatchObject({
      showControls: false,
      canManage: false,
    });
    expect(memberControls({ ...editor, role: null }, { id: "someone" }).canManage).toBe(false);
  });
});

describe("leaveAvailability", () => {
  it("lets members leave, but not the creator", () => {
    expect(leaveAvailability("owner", creator)).toEqual({ canLeave: true, note: null });
    expect(leaveAvailability(creator, creator)).toEqual({
      canLeave: false,
      note: CREATOR_CANNOT_LEAVE_NOTE,
    });
  });
});

describe("member schemas", () => {
  it("validates roles and ids", () => {
    const id = "3f2b7c1e-8a4d-4c55-9a51-0e2f6d1b7a10";
    expect(memberRoleSchema.safeParse("owner").success).toBe(true);
    expect(memberRoleSchema.safeParse("admin").success).toBe(false);
    expect(
      changeMemberRoleSchema.safeParse({ boardId: id, userId: id, role: "viewer" }).success,
    ).toBe(true);
    expect(
      changeMemberRoleSchema.safeParse({ boardId: id, userId: "x", role: "viewer" }).success,
    ).toBe(false);
  });
});
