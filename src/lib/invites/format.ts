/** "Oct 6, 2026": a date-only rendering of an ISO timestamp, in the viewer's time zone by default. */
export function formatInviteDate(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "an unknown date";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone }).format(date);
}
