/*
 * Rows the user has just accepted from an AI proposal, so they can play a
 * one-off "snap" when they appear. A short-lived, module-level set: a row asks
 * once when it mounts, so rows that already existed (opening the card, a
 * reload) never animate, and ids that never mount expire.
 */

const TTL_MS = 2000;
const added = new Map<string, number>();

/** Records ids accepted at `now` (ms). */
export function markJustAdded(ids: readonly string[], now: number = Date.now()): void {
  for (const [id, at] of added) if (now - at > TTL_MS) added.delete(id);
  for (const id of ids) added.set(id, now);
}

/** Whether `id` was accepted within the last two seconds. Safe to call twice (Strict Mode). */
export function wasJustAdded(id: string, now: number = Date.now()): boolean {
  const at = added.get(id);
  return at !== undefined && now - at <= TTL_MS;
}

/** Empties the set (tests). */
export function clearJustAdded(): void {
  added.clear();
}
