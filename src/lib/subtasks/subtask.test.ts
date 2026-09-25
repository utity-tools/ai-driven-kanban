import { describe, expect, it } from "vitest";

import { type SubtaskRow, isDone, toSubtask, toSubtasks } from "./subtask";

function row(overrides: Partial<SubtaskRow> & { id: string; position: string }): SubtaskRow {
  return {
    title: overrides.id,
    estimate: null,
    completed_at: null,
    source: "manual",
    ...overrides,
  };
}

describe("toSubtask", () => {
  it("maps a row to the UI shape", () => {
    expect(
      toSubtask(
        row({
          id: "s1",
          position: "a0",
          title: "Write tests",
          estimate: 3,
          completed_at: "2026-09-25T10:00:00Z",
          source: "ai",
        }),
      ),
    ).toEqual({
      id: "s1",
      title: "Write tests",
      estimate: 3,
      position: "a0",
      completedAt: "2026-09-25T10:00:00Z",
      source: "ai",
    });
  });

  it("treats an unknown source as manual and an off-scale estimate as none", () => {
    const subtask = toSubtask(row({ id: "s1", position: "a0", source: "robot", estimate: 4 }));
    expect(subtask.source).toBe("manual");
    expect(subtask.estimate).toBeNull();
  });
});

describe("toSubtasks", () => {
  it("orders by position in byte order, then by id", () => {
    const subtasks = toSubtasks([
      row({ id: "c", position: "a1" }),
      row({ id: "b", position: "Zz" }), // "Zz" < "a1" in byte order
      row({ id: "a", position: "a1" }),
    ]);
    expect(subtasks.map((s) => s.id)).toEqual(["b", "a", "c"]);
  });
});

describe("isDone", () => {
  it("is true when completed", () => {
    expect(isDone({ completedAt: "2026-09-25T10:00:00Z" })).toBe(true);
    expect(isDone({ completedAt: null })).toBe(false);
  });
});
