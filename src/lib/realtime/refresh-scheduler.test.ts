import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRefreshScheduler } from "./refresh-scheduler";

describe("createRefreshScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("coalesces a burst into one trailing refresh", () => {
    const run = vi.fn();
    const s = createRefreshScheduler({ run });
    s.request();
    vi.advanceTimersByTime(200);
    s.request();
    vi.advanceTimersByTime(200);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs one follow-up when events arrive during a refresh", () => {
    const run = vi.fn();
    const s = createRefreshScheduler({ run });
    s.request();
    vi.advanceTimersByTime(300);
    expect(run).toHaveBeenCalledTimes(1);
    s.request();
    s.request();
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(1);
    s.settled();
    vi.advanceTimersByTime(300);
    expect(run).toHaveBeenCalledTimes(2);
    s.settled();
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does not run again after settling with nothing pending", () => {
    const run = vi.fn();
    const s = createRefreshScheduler({ run });
    s.request();
    vi.advanceTimersByTime(300);
    s.settled();
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("recovers when a refresh never reports back", () => {
    const run = vi.fn();
    const s = createRefreshScheduler({ run, maxInFlightMs: 5000 });
    s.request();
    vi.advanceTimersByTime(300);
    s.request();
    vi.advanceTimersByTime(5000);
    vi.advanceTimersByTime(300);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does nothing after cancel", () => {
    const run = vi.fn();
    const s = createRefreshScheduler({ run });
    s.request();
    s.cancel();
    s.request();
    vi.advanceTimersByTime(5000);
    expect(run).not.toHaveBeenCalled();
  });
});
