/*
 * Date-only due dates ("YYYY-MM-DD", cards.due_on).
 *
 * "Due Oct 2" means due until the END of Oct 2 in the viewer's time zone. So
 * the status depends on the viewer's own calendar date (`today`), which only
 * the browser knows: every helper here takes `today` as a "YYYY-MM-DD" string
 * and never builds a Date from a date-only string with `Date.parse` /
 * `new Date("YYYY-MM-DD")` (that is midnight UTC, the previous day in the
 * Americas). Date-only strings compare correctly as strings (fixed width,
 * most significant part first); calendar arithmetic goes through UTC.
 */

/** How close a card is to its due date. */
export type DueStatus = "overdue" | "due-soon" | "done" | "upcoming" | "none";

/** Status shown before the viewer's date is known (server render and hydration). */
export type DueBadgeStatus = Exclude<DueStatus, "none"> | "unknown";

type DueFields = { dueOn: string | null; completedAt: string | null };

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Range accepted by the `cards_due_on_range` constraint. */
export const MIN_DUE_YEAR = 2000;
export const MAX_DUE_YEAR = 9999;

function parts(value: string): { year: number; month: number; day: number } | null {
  const match = DATE_ONLY.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1) return null;
  // Day 0 of the next month is the last day of this one (leap years included).
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  return { year, month, day };
}

/** True for a real calendar date written as "YYYY-MM-DD" (e.g. not "2026-02-30"). */
export function isDateOnly(value: string): boolean {
  return parts(value) !== null;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/**
 * The calendar date of `date` in the runtime's local time zone, as "YYYY-MM-DD".
 * In the browser that is the viewer's "today" (`toDateOnly(new Date())`), and
 * it turns a day picked in a calendar (local midnight) into a due date.
 */
export function toDateOnly(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The UTC calendar date of `date`, as "YYYY-MM-DD" (same result in every time zone). */
export function toUtcDateOnly(date: Date): string {
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * The same calendar day as a local Date (midnight in the runtime's time zone),
 * for date pickers that work in local time. Invalid input gives an invalid Date.
 */
export function fromDateOnly(value: string): Date {
  const p = parts(value);
  if (!p) return new Date(Number.NaN);
  const date = new Date(p.year, p.month - 1, p.day);
  // Years 0-99 would otherwise map to 1900-1999.
  date.setFullYear(p.year);
  return date;
}

/** `value` shifted by `days` calendar days (negative goes back). Month/year boundaries included. */
export function addDays(value: string, days: number): string {
  const p = parts(value);
  if (!p) throw new RangeError(`Invalid date: ${value}`);
  return toUtcDateOnly(new Date(Date.UTC(p.year, p.month - 1, p.day + days)));
}

/**
 * Status of a card's due date for a viewer whose local date is `today`.
 *
 * - `none`: no (valid) due date, even if completed: there is no date to show.
 * - `done`: marked as done (`completedAt` set), whatever the date.
 * - `overdue`: the due day has ended (before `today`).
 * - `due-soon`: due today or tomorrow.
 * - `upcoming`: due later than that.
 */
export function getDueStatus({ dueOn, completedAt }: DueFields, today: string): DueStatus {
  if (dueOn === null || !isDateOnly(dueOn)) return "none";
  if (completedAt !== null) return "done";
  if (dueOn < today) return "overdue";
  if (dueOn <= addDays(today, 1)) return "due-soon";
  return "upcoming";
}

/**
 * Short due date like "Oct 2"; the year is added when it differs from
 * `today`'s ("Jan 5, 2027"). The date is formatted as a UTC calendar day, so
 * the text is the same in every time zone.
 */
export function formatDueDate(dueOn: string, today: string): string {
  const p = parts(dueOn);
  if (!p) return dueOn;
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day));
  date.setUTCFullYear(p.year);
  const sameYear = dueOn.slice(0, 4) === today.slice(0, 4);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(date);
}

/** Text for screen readers and tooltips, e.g. "Overdue", "Due soon". */
export const DUE_STATUS_LABEL: Record<DueStatus | DueBadgeStatus, string> = {
  overdue: "Overdue",
  "due-soon": "Due soon",
  done: "Done",
  upcoming: "Due",
  unknown: "Due",
  none: "No due date",
};

export type DueInfo = {
  status: DueBadgeStatus;
  /** e.g. "Oct 2" */
  text: string;
  /** "YYYY-MM-DD", for <time dateTime>. */
  dueOn: string;
};

/**
 * What a due badge shows. `today` is the viewer's local date, or `null` while
 * it is unknown (server render, hydration): the status is then `unknown` and
 * `fallbackToday` (e.g. the server's date) only decides whether to print the year.
 */
export function describeDue(
  card: DueFields,
  today: string | null,
  fallbackToday: string,
): DueInfo | null {
  const { dueOn } = card;
  if (dueOn === null || !isDateOnly(dueOn)) return null;
  const status = today === null ? "unknown" : getDueStatus(card, today);
  if (status === "none") return null;
  return { status, text: formatDueDate(dueOn, today ?? fallbackToday), dueOn };
}

/**
 * Short date of a timestamp (e.g. when a card was archived), in `timeZone`
 * (UTC by default, so the server and the browser render the same text).
 */
export function formatTimestampDate(iso: string, now: Date, timeZone = "UTC"): string {
  const date = new Date(iso);
  const year = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone }).format(d);
  const sameYear = year(date) === year(now);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone,
  }).format(date);
}
