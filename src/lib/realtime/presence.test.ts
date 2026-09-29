import { describe, expect, it } from "vitest";

import type { BoardMember } from "@/lib/boards/view-model";

import { viewersFromPresence } from "./presence";

const member = (id: string, displayName: string | null): BoardMember => ({
  id,
  displayName,
  avatarUrl: null,
  role: "editor",
});
const members = [member("a", "Alice"), member("b", "Bob Chen"), member("c", "Carol Diaz")];

describe("viewersFromPresence", () => {
  it("returns other members, excluding the viewer", () => {
    const state = { a: [{}], b: [{}], c: [{}] };
    expect(viewersFromPresence(state, members, "a").map((p) => p.id)).toEqual(["b", "c"]);
  });

  it("counts a user with several tabs once", () => {
    expect(viewersFromPresence({ b: [{}, {}, {}] }, members, "a")).toHaveLength(1);
  });

  it("ignores ids that are not members", () => {
    expect(viewersFromPresence({ zzz: [{}] }, members, "a")).toEqual([]);
  });

  it("is empty when nobody else is there", () => {
    expect(viewersFromPresence({ a: [{}] }, members, "a")).toEqual([]);
    expect(viewersFromPresence({}, members, "a")).toEqual([]);
  });

  it("orders by name regardless of arrival order", () => {
    const state = { c: [{}], b: [{}] };
    expect(viewersFromPresence(state, members, "a").map((p) => p.id)).toEqual(["b", "c"]);
  });

  it("does not expose the role", () => {
    const [viewer] = viewersFromPresence({ b: [{}] }, members, "a");
    expect(viewer).not.toHaveProperty("role");
  });
});
