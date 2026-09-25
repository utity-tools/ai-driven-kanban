import { describe, expect, it } from "vitest";

import type { Estimate } from "./estimates";
import { progressDescription, progressSummary, subtaskProgress } from "./progress";

const DONE = "2026-09-25T10:00:00Z";
const item = (estimate: Estimate | null, done: boolean) => ({
  estimate,
  completedAt: done ? DONE : null,
});

describe("subtaskProgress", () => {
  it("is all zeros for an empty checklist", () => {
    expect(subtaskProgress([])).toEqual({
      done: 0,
      total: 0,
      totalPoints: 0,
      donePoints: 0,
      remainingPoints: 0,
      percent: 0,
    });
  });

  it("counts subtasks and story points, unestimated ones as 0", () => {
    const progress = subtaskProgress([
      item(3, true),
      item(2, true),
      item(5, false),
      item(null, false),
    ]);
    expect(progress).toEqual({
      done: 2,
      total: 4,
      totalPoints: 10,
      donePoints: 5,
      remainingPoints: 5,
      percent: 50,
    });
  });

  it("rounds the percentage down, so 100 means everything is done", () => {
    const items = [...Array.from({ length: 99 }, () => item(null, true)), item(null, false)];
    expect(subtaskProgress(items).percent).toBe(99);
    expect(subtaskProgress([item(1, true)]).percent).toBe(100);
    expect(subtaskProgress([item(1, true), item(1, false), item(1, false)]).percent).toBe(33);
  });
});

describe("progressSummary", () => {
  it("shows counts and points", () => {
    const progress = subtaskProgress([
      item(3, true),
      item(2, true),
      item(5, false),
      item(null, false),
    ]);
    expect(progressSummary(progress)).toBe("2/4 · 5 of 10 pts");
  });

  it("shows only counts when nothing is estimated", () => {
    expect(progressSummary(subtaskProgress([item(null, true), item(null, false)]))).toBe("1/2");
  });

  it("uses the singular for one point", () => {
    expect(progressSummary(subtaskProgress([item(1, false)]))).toBe("0/1 · 0 of 1 pt");
  });
});

describe("progressDescription", () => {
  it("spells everything out", () => {
    const progress = subtaskProgress([
      item(3, true),
      item(2, true),
      item(5, false),
      item(null, false),
    ]);
    expect(progressDescription(progress)).toBe(
      "2 of 4 subtasks done. 5 of 10 story points done, 5 remaining.",
    );
  });

  it("leaves points out when nothing is estimated, singular noun for one", () => {
    expect(progressDescription(subtaskProgress([item(null, false)]))).toBe("0 of 1 subtask done.");
  });
});
