/** How close a card is to its due date. */
export type DueStatus = "overdue" | "due-soon" | "done" | "upcoming" | "none";

/** A card counts as "due soon" when its due date is less than this far away. */
export const DUE_SOON_MS = 48 * 60 * 60 * 1000;

type DueFields = { dueAt: string | null; completedAt: string | null };

/**
 * Status of a card's due date at `now`.
 *
 * - `none`: no due date (even if completed: there is no date to show).
 * - `done`: the due date was marked as done (`completedAt` set), whatever the date.
 * - `overdue`: the due date is in the past.
 * - `due-soon`: due within the next 48 hours.
 * - `upcoming`: due later than that.
 */
export function getDueStatus({ dueAt, completedAt }: DueFields, now: Date): DueStatus {
  if (dueAt === null) return "none";
  const due = Date.parse(dueAt);
  if (Number.isNaN(due)) return "none";
  if (completedAt !== null) return "done";

  const remaining = due - now.getTime();
  if (remaining < 0) return "overdue";
  if (remaining < DUE_SOON_MS) return "due-soon";
  return "upcoming";
}

/**
 * Short due date like "Oct 2"; the year is added when it differs from `now`'s
 * ("Jan 5, 2027"). Formatted in `timeZone` (UTC by default) so the server and
 * the browser always render the same text.
 */
export function formatDueDate(dueAt: string, now: Date, timeZone = "UTC"): string {
  const date = new Date(dueAt);
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

/** Text for screen readers and tooltips, e.g. "Overdue", "Due soon". */
export const DUE_STATUS_LABEL: Record<DueStatus, string> = {
  overdue: "Overdue",
  "due-soon": "Due soon",
  done: "Done",
  upcoming: "Due",
  none: "No due date",
};
