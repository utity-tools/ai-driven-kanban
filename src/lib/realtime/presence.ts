import type { BoardMember, Person } from "@/lib/boards/view-model";

/** Shape of `channel.presenceState()`: one entry per presence key (user id), one meta per tab. */
export type PresenceState = Record<string, unknown[]>;

/** What each client tracks: only its own user id, nothing sensitive. */
export type PresencePayload = { user_id: string };

/**
 * The other members currently viewing the board. Keys are user ids, so several
 * tabs of one user collapse into one entry; unknown ids (not in `members`)
 * and the viewer themselves are dropped. Ordered by name, then id, so the
 * list does not reshuffle on every sync.
 */
export function viewersFromPresence(
  state: PresenceState,
  members: readonly BoardMember[],
  selfId: string,
): Person[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  const seen = new Set<string>();
  const viewers: Person[] = [];
  for (const key of Object.keys(state)) {
    if (key === selfId || seen.has(key)) continue;
    const member = byId.get(key);
    if (!member) continue;
    seen.add(key);
    viewers.push({ id: member.id, displayName: member.displayName, avatarUrl: member.avatarUrl });
  }
  return viewers.sort(
    (a, b) => (a.displayName ?? "").localeCompare(b.displayName ?? "") || a.id.localeCompare(b.id),
  );
}
