export type RefreshScheduler = {
  /** A change happened: refresh soon (coalesced with other requests). */
  request: () => void;
  /** The refresh started by `run` finished; runs one more if changes arrived meanwhile. */
  settled: () => void;
  /** Drops any pending work (unmount / board change). */
  cancel: () => void;
};

type Options = {
  /** Starts a refresh. The caller must call `settled` when it finishes. */
  run: () => void;
  /** Trailing debounce: the refresh runs this long after the last request. */
  delayMs?: number;
  /** Safety net: a refresh that never reports back is considered done after this long. */
  maxInFlightMs?: number;
};

export const REFRESH_DELAY_MS = 300;
export const MAX_IN_FLIGHT_MS = 10_000;

/**
 * Coalesces bursts of change events into few refreshes: trailing debounce,
 * at most one refresh in flight, and exactly one follow-up when events land
 * while a refresh is running.
 */
export function createRefreshScheduler({
  run,
  delayMs = REFRESH_DELAY_MS,
  maxInFlightMs = MAX_IN_FLIGHT_MS,
}: Options): RefreshScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let guard: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let dirty = false;
  let cancelled = false;

  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }
  function clearGuard() {
    if (guard !== null) clearTimeout(guard);
    guard = null;
  }

  function schedule() {
    clearTimer();
    timer = setTimeout(fire, delayMs);
  }

  function fire() {
    timer = null;
    if (cancelled || inFlight || !dirty) return;
    dirty = false;
    inFlight = true;
    guard = setTimeout(settled, maxInFlightMs);
    run();
  }

  function settled() {
    if (!inFlight) return;
    inFlight = false;
    clearGuard();
    if (!cancelled && dirty) schedule();
  }

  return {
    request() {
      if (cancelled) return;
      dirty = true;
      // While a refresh runs, `settled` schedules the follow-up.
      if (!inFlight) schedule();
    },
    settled,
    cancel() {
      cancelled = true;
      dirty = false;
      inFlight = false;
      clearTimer();
      clearGuard();
    },
  };
}
