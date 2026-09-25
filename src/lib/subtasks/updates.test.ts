import { describe, expect, it } from "vitest";

import type { Subtask } from "./subtask";
import { applySubtaskUpdate } from "./updates";

function subtask(id: string, position: string, overrides: Partial<Subtask> = {}): Subtask {
  return {
    id,
    title: `Subtask ${id}`,
    estimate: null,
    position,
    completedAt: null,
    source: "manual",
    ...overrides,
  };
}

const list = () => [subtask("s1", "a0"), subtask("s2", "a1"), subtask("s3", "a2")];
const ids = (subtasks: Subtask[]) => subtasks.map((s) => s.id);
const base = { cardId: "c1" };

describe("applySubtaskUpdate", () => {
  it("adds a subtask in position order and ignores a duplicate id", () => {
    const added = applySubtaskUpdate(list(), {
      ...base,
      type: "addSubtask",
      subtask: subtask("new", "a0V"),
    });
    expect(ids(added)).toEqual(["s1", "new", "s2", "s3"]);
    const again = applySubtaskUpdate(added, {
      ...base,
      type: "addSubtask",
      subtask: subtask("new", "a9"),
    });
    expect(ids(again)).toEqual(["s1", "new", "s2", "s3"]);
  });

  it("renames, estimates and completes one subtask only", () => {
    let next = applySubtaskUpdate(list(), {
      ...base,
      type: "renameSubtask",
      subtaskId: "s2",
      title: "Renamed",
    });
    next = applySubtaskUpdate(next, {
      ...base,
      type: "setSubtaskEstimate",
      subtaskId: "s2",
      estimate: 8,
    });
    next = applySubtaskUpdate(next, {
      ...base,
      type: "setSubtaskCompleted",
      subtaskId: "s2",
      completedAt: "2026-09-25T10:00:00Z",
    });
    expect(next[1]).toMatchObject({
      title: "Renamed",
      estimate: 8,
      completedAt: "2026-09-25T10:00:00Z",
    });
    expect(next[0]).toEqual(list()[0]);
    expect(next[2]).toEqual(list()[2]);
  });

  it("moves a subtask between its new neighbours, repositioning only that one", () => {
    const moved = applySubtaskUpdate(list(), {
      ...base,
      type: "moveSubtask",
      subtaskId: "s3",
      previousId: null,
      nextId: "s1",
    });
    expect(ids(moved)).toEqual(["s3", "s1", "s2"]);
    expect(moved.find((s) => s.id === "s1")?.position).toBe("a0");
    expect(moved.find((s) => s.id === "s2")?.position).toBe("a1");
  });

  it("ignores a move of an unknown subtask", () => {
    const next = applySubtaskUpdate(list(), {
      ...base,
      type: "moveSubtask",
      subtaskId: "zz",
      previousId: "s1",
      nextId: "s2",
    });
    expect(next).toEqual(list());
  });

  it("deletes a subtask", () => {
    expect(
      ids(applySubtaskUpdate(list(), { ...base, type: "deleteSubtask", subtaskId: "s2" })),
    ).toEqual(["s1", "s3"]);
  });

  it("never mutates its input", () => {
    const original = list();
    const frozen = Object.freeze(original.map((s) => Object.freeze(s)));
    applySubtaskUpdate(frozen, { ...base, type: "deleteSubtask", subtaskId: "s1" });
    applySubtaskUpdate(frozen, { ...base, type: "renameSubtask", subtaskId: "s1", title: "x" });
    expect(frozen).toEqual(list());
  });
});
