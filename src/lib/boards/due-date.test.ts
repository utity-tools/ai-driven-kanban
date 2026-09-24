import { describe, expect, it } from "vitest";

import { formatDueDate, getDueStatus } from "./due-date";

const NOW = new Date("2026-10-01T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

describe("getDueStatus", () => {
  it("is none without a due date, even if completed", () => {
    expect(getDueStatus({ dueAt: null, completedAt: null }, NOW)).toBe("none");
    expect(getDueStatus({ dueAt: null, completedAt: at(-HOUR) }, NOW)).toBe("none");
  });

  it("is none for an unparseable date", () => {
    expect(getDueStatus({ dueAt: "not a date", completedAt: null }, NOW)).toBe("none");
  });

  it("is done when completed, even if the date has passed", () => {
    expect(getDueStatus({ dueAt: at(-72 * HOUR), completedAt: at(-80 * HOUR) }, NOW)).toBe("done");
    expect(getDueStatus({ dueAt: at(72 * HOUR), completedAt: at(-HOUR) }, NOW)).toBe("done");
  });

  it("is overdue once the due date has passed", () => {
    expect(getDueStatus({ dueAt: at(-1), completedAt: null }, NOW)).toBe("overdue");
    expect(getDueStatus({ dueAt: at(-30 * 24 * HOUR), completedAt: null }, NOW)).toBe("overdue");
  });

  it("is due-soon from now until just under 48 hours", () => {
    expect(getDueStatus({ dueAt: at(0), completedAt: null }, NOW)).toBe("due-soon");
    expect(getDueStatus({ dueAt: at(47 * HOUR), completedAt: null }, NOW)).toBe("due-soon");
    expect(getDueStatus({ dueAt: at(48 * HOUR - 1), completedAt: null }, NOW)).toBe("due-soon");
  });

  it("is upcoming from 48 hours on", () => {
    expect(getDueStatus({ dueAt: at(48 * HOUR), completedAt: null }, NOW)).toBe("upcoming");
    expect(getDueStatus({ dueAt: at(10 * 24 * HOUR), completedAt: null }, NOW)).toBe("upcoming");
  });
});

describe("formatDueDate", () => {
  it("formats as short month and day in the same year", () => {
    expect(formatDueDate("2026-10-02T09:00:00Z", NOW)).toBe("Oct 2");
  });

  it("adds the year when it differs from now", () => {
    expect(formatDueDate("2027-01-05T09:00:00Z", NOW)).toBe("Jan 5, 2027");
    expect(formatDueDate("2025-12-31T09:00:00Z", NOW)).toBe("Dec 31, 2025");
  });

  it("uses UTC by default and honours an explicit time zone", () => {
    const lateUtc = "2026-10-02T23:30:00Z";
    expect(formatDueDate(lateUtc, NOW)).toBe("Oct 2");
    expect(formatDueDate(lateUtc, NOW, "Europe/Madrid")).toBe("Oct 3");
  });
});
