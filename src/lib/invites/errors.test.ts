import { describe, expect, it } from "vitest";

import { GENERIC_ERROR, SIGNED_OUT_ERROR } from "@/lib/boards/action-result";

import { inviteErrorMessage } from "./errors";

describe("inviteErrorMessage", () => {
  it("maps each invite SQLSTATE to its own message", () => {
    const messages = ["INV01", "INV02", "INV03", "INV04", "INV05"].map(inviteErrorMessage);
    expect(new Set(messages).size).toBe(5);
    expect(messages).not.toContain(GENERIC_ERROR);
    expect(inviteErrorMessage("INV02")).toMatch(/expired/);
    expect(inviteErrorMessage("INV03")).toMatch(/already been used/);
    expect(inviteErrorMessage("INV05")).toMatch(/20 pending invites/);
  });

  it("maps a missing session and falls back to the generic message", () => {
    expect(inviteErrorMessage("42501")).toBe(SIGNED_OUT_ERROR);
    expect(inviteErrorMessage("XX000")).toBe(GENERIC_ERROR);
    expect(inviteErrorMessage(undefined)).toBe(GENERIC_ERROR);
  });
});
