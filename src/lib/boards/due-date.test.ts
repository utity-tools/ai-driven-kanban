import { afterEach, describe, expect, it } from "vitest";

import {
  addDays,
  describeDue,
  formatDueDate,
  formatTimestampDate,
  fromDateOnly,
  getDueStatus,
  isDateOnly,
  toDateOnly,
  toUtcDateOnly,
} from "./due-date";

const TODAY = "2026-10-01";

// Node applies process.env.TZ changes at once; tests that set it restore it.
const ORIGINAL_TZ = process.env.TZ;
function restoreTimeZone() {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
}
const open = (dueOn: string | null) => ({ dueOn, completedAt: null });
const done = (dueOn: string | null) => ({ dueOn, completedAt: "2026-09-30T08:00:00Z" });

describe("isDateOnly", () => {
  it("accepts real calendar dates", () => {
    expect(isDateOnly("2026-10-02")).toBe(true);
    expect(isDateOnly("2028-02-29")).toBe(true); // leap year
    expect(isDateOnly("2000-02-29")).toBe(true); // divisible by 400
    expect(isDateOnly("9999-12-31")).toBe(true);
  });

  it("rejects impossible dates and other formats", () => {
    expect(isDateOnly("2026-02-29")).toBe(false);
    expect(isDateOnly("2100-02-29")).toBe(false); // divisible by 100, not 400
    expect(isDateOnly("2026-04-31")).toBe(false);
    expect(isDateOnly("2026-13-01")).toBe(false);
    expect(isDateOnly("2026-00-10")).toBe(false);
    expect(isDateOnly("2026-10-00")).toBe(false);
    expect(isDateOnly("2026-1-2")).toBe(false);
    expect(isDateOnly("20261-01-02")).toBe(false);
    expect(isDateOnly("2026-10-02T00:00:00Z")).toBe(false);
    expect(isDateOnly(" 2026-10-02")).toBe(false);
    expect(isDateOnly("")).toBe(false);
  });
});

describe("addDays", () => {
  it("moves within a month", () => {
    expect(addDays("2026-10-01", 1)).toBe("2026-10-02");
    expect(addDays("2026-10-02", -1)).toBe("2026-10-01");
    expect(addDays("2026-10-02", 0)).toBe("2026-10-02");
  });

  it("crosses month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("is not affected by daylight saving changes", () => {
    // Europe and the US change clocks around these dates.
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
  });

  it("throws on an invalid date", () => {
    expect(() => addDays("2026-02-30", 1)).toThrow(RangeError);
  });
});

describe("toDateOnly / fromDateOnly (local time)", () => {
  it("reads the local calendar date, not the UTC one", () => {
    // 23:30 local on Oct 2 is still Oct 2 for the viewer, whatever UTC says.
    expect(toDateOnly(new Date(2026, 9, 2, 23, 30))).toBe("2026-10-02");
    expect(toDateOnly(new Date(2026, 9, 2, 0, 0))).toBe("2026-10-02");
  });

  it("round-trips through a local Date (what the calendar picker uses)", () => {
    for (const value of ["2026-10-02", "2026-12-31", "2027-01-01", "2028-02-29"]) {
      const date = fromDateOnly(value);
      expect([date.getFullYear(), date.getMonth() + 1, date.getDate()]).toEqual(
        value.split("-").map(Number),
      );
      expect(toDateOnly(date)).toBe(value);
    }
  });

  describe("in a given time zone", () => {
    afterEach(restoreTimeZone);

    it("gives each viewer their own today for the same instant", () => {
      const instant = new Date("2026-10-02T03:00:00Z");
      process.env.TZ = "America/New_York";
      expect(toDateOnly(instant)).toBe("2026-10-01");
      process.env.TZ = "Europe/Madrid";
      expect(toDateOnly(instant)).toBe("2026-10-02");
    });
  });

  it("gives an invalid Date for invalid input", () => {
    expect(Number.isNaN(fromDateOnly("2026-02-30").getTime())).toBe(true);
  });
});

describe("toUtcDateOnly", () => {
  it("reads the UTC calendar date", () => {
    expect(toUtcDateOnly(new Date("2026-10-02T23:30:00Z"))).toBe("2026-10-02");
    expect(toUtcDateOnly(new Date("2026-10-02T23:30:00-05:00"))).toBe("2026-10-03");
  });
});

describe("getDueStatus", () => {
  it("is none without a (valid) due date, even if completed", () => {
    expect(getDueStatus(open(null), TODAY)).toBe("none");
    expect(getDueStatus(done(null), TODAY)).toBe("none");
    expect(getDueStatus(open("not a date"), TODAY)).toBe("none");
    expect(getDueStatus(open("2026-10-02T00:00:00Z"), TODAY)).toBe("none");
  });

  it("is done when completed, whatever the date", () => {
    expect(getDueStatus(done("2026-09-01"), TODAY)).toBe("done");
    expect(getDueStatus(done(TODAY), TODAY)).toBe("done");
    expect(getDueStatus(done("2027-01-01"), TODAY)).toBe("done");
  });

  it("is overdue once the due day has ended", () => {
    expect(getDueStatus(open("2026-09-30"), TODAY)).toBe("overdue");
    expect(getDueStatus(open("2025-12-31"), TODAY)).toBe("overdue");
  });

  it("is due-soon on the due day itself (due until its end) and the day before", () => {
    expect(getDueStatus(open(TODAY), TODAY)).toBe("due-soon");
    expect(getDueStatus(open("2026-10-02"), TODAY)).toBe("due-soon");
  });

  it("is upcoming from the day after tomorrow", () => {
    expect(getDueStatus(open("2026-10-03"), TODAY)).toBe("upcoming");
    expect(getDueStatus(open("2027-10-01"), TODAY)).toBe("upcoming");
  });

  it("handles month and year boundaries", () => {
    expect(getDueStatus(open("2026-11-01"), "2026-10-31")).toBe("due-soon");
    expect(getDueStatus(open("2026-10-31"), "2026-11-01")).toBe("overdue");
    expect(getDueStatus(open("2027-01-01"), "2026-12-31")).toBe("due-soon");
    expect(getDueStatus(open("2027-01-02"), "2026-12-31")).toBe("upcoming");
    expect(getDueStatus(open("2026-12-31"), "2027-01-01")).toBe("overdue");
    expect(getDueStatus(open("2028-02-29"), "2028-02-28")).toBe("due-soon");
    expect(getDueStatus(open("2028-03-01"), "2028-02-28")).toBe("upcoming");
  });

  it("depends only on the viewer's date: the same card differs across time zones", () => {
    // At 2026-10-02T03:00Z it is still Oct 1 in New York but already Oct 2 in Madrid.
    const card = open("2026-10-01");
    expect(getDueStatus(card, "2026-10-01")).toBe("due-soon"); // New York
    expect(getDueStatus(card, "2026-10-02")).toBe("overdue"); // Madrid
  });
});

describe("formatDueDate", () => {
  it("formats as short month and day in the same year", () => {
    expect(formatDueDate("2026-10-02", TODAY)).toBe("Oct 2");
    expect(formatDueDate("2026-01-01", TODAY)).toBe("Jan 1");
    expect(formatDueDate("2026-12-31", TODAY)).toBe("Dec 31");
  });

  it("adds the year when it differs from today's", () => {
    expect(formatDueDate("2027-01-05", TODAY)).toBe("Jan 5, 2027");
    expect(formatDueDate("2025-12-31", TODAY)).toBe("Dec 31, 2025");
    expect(formatDueDate("2026-12-31", "2027-01-01")).toBe("Dec 31, 2026");
  });

  it("returns the input for an invalid date", () => {
    expect(formatDueDate("2026-02-30", TODAY)).toBe("2026-02-30");
  });

  describe("in any time zone", () => {
    afterEach(restoreTimeZone);

    it("shows the stored day, never the day before (no midnight-UTC parsing)", () => {
      for (const tz of ["America/Los_Angeles", "Pacific/Kiritimati", "UTC"]) {
        process.env.TZ = tz;
        expect(formatDueDate("2026-10-02", TODAY)).toBe("Oct 2");
        expect(formatDueDate("2027-01-01", TODAY)).toBe("Jan 1, 2027");
      }
    });
  });
});

describe("describeDue", () => {
  it("is null without a due date", () => {
    expect(describeDue(open(null), TODAY, TODAY)).toBeNull();
    expect(describeDue(done(null), TODAY, TODAY)).toBeNull();
  });

  it("returns status, short text and the date", () => {
    expect(describeDue(open("2026-09-29"), TODAY, "2026-10-02")).toEqual({
      status: "overdue",
      text: "Sep 29",
      dueOn: "2026-09-29",
    });
    expect(describeDue(done("2026-09-29"), TODAY, TODAY)?.status).toBe("done");
  });

  it("is unknown while the viewer's date isn't known, using the fallback for the year", () => {
    expect(describeDue(open("2026-09-29"), null, TODAY)).toEqual({
      status: "unknown",
      text: "Sep 29",
      dueOn: "2026-09-29",
    });
    expect(describeDue(open("2026-09-29"), null, "2027-01-01")?.text).toBe("Sep 29, 2026");
  });
});

describe("formatTimestampDate", () => {
  const now = new Date("2026-10-01T12:00:00Z");

  it("formats a timestamp in UTC by default, adding the year when it differs", () => {
    expect(formatTimestampDate("2026-10-02T23:30:00Z", now)).toBe("Oct 2");
    expect(formatTimestampDate("2025-12-31T09:00:00Z", now)).toBe("Dec 31, 2025");
  });

  it("honours an explicit time zone", () => {
    expect(formatTimestampDate("2026-10-02T23:30:00Z", now, "Europe/Madrid")).toBe("Oct 3");
  });
});
