import type { ChangeNotice } from "./change-notice";

/** How long after a local mutation settles its broadcast is still considered ours. */
export const OWN_CHANGE_WINDOW_MS = 2000;

/** What this tab has been mutating: in-flight count and when the last one settled. */
export type LocalActivity = { inFlight: number; lastSettledAt: number | null };

export const idleActivity: LocalActivity = { inFlight: 0, lastSettledAt: null };

export function mutationStarted(activity: LocalActivity): LocalActivity {
  return { ...activity, inFlight: activity.inFlight + 1 };
}

export function mutationSettled(activity: LocalActivity, now: number): LocalActivity {
  return { inFlight: Math.max(0, activity.inFlight - 1), lastSettledAt: now };
}

/**
 * Whether a notice is the echo of a change made by THIS tab. The actor is a
 * user id, so it alone cannot tell tabs apart: it must also match a local
 * mutation in flight or settled within the window. Unknown actor: not ours.
 */
export function isOwnChange(
  notice: ChangeNotice,
  userId: string,
  activity: LocalActivity,
  now: number,
  windowMs: number = OWN_CHANGE_WINDOW_MS,
): boolean {
  if (notice.actor === null || notice.actor !== userId) return false;
  if (activity.inFlight > 0) return true;
  return activity.lastSettledAt !== null && now - activity.lastSettledAt <= windowMs;
}

/**
 * Runs a local mutation and records it as in flight until it settles (also when
 * it throws), so its own broadcast echo is recognised. `now` is injectable.
 */
export async function trackMutation<T>(
  read: () => LocalActivity,
  write: (activity: LocalActivity) => void,
  fn: () => Promise<T>,
  now: () => number = Date.now,
): Promise<T> {
  write(mutationStarted(read()));
  try {
    return await fn();
  } finally {
    write(mutationSettled(read(), now()));
  }
}
