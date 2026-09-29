/**
 * A `change` broadcast on `board:<id>` (ADR 0019): which table changed and who
 * changed it. Never row data. Parsed leniently: Realtime adds its own keys and
 * a malformed notice still means "something changed".
 */
export type ChangeNotice = { table: string | null; actor: string | null };

export function parseChangeNotice(payload: unknown): ChangeNotice {
  const record = typeof payload === "object" && payload !== null ? payload : {};
  const table = "table" in record && typeof record.table === "string" ? record.table : null;
  const actor = "actor" in record && typeof record.actor === "string" ? record.actor : null;
  return { table, actor };
}

/** Whether the notice is about a change the current user made (unknown actor: not ours). */
export function isOwnChange(notice: ChangeNotice, userId: string): boolean {
  return notice.actor !== null && notice.actor === userId;
}
