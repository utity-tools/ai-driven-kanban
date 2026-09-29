import { describe, expect, it } from "vitest";

import {
  idleActivity,
  isOwnChange,
  mutationSettled,
  mutationStarted,
  OWN_CHANGE_WINDOW_MS,
  trackMutation,
  type LocalActivity,
} from "./local-activity";

const ME = "00000000-0000-4000-a000-000000000001";
const OTHER = "00000000-0000-4000-a000-000000000002";
const mine = { table: "cards", op: "UPDATE", actor: ME };

describe("isOwnChange", () => {
  it("is false for an idle tab even when the actor is the user (another tab's change)", () => {
    expect(isOwnChange(mine, ME, idleActivity, 10_000)).toBe(false);
  });

  it("is true while a local mutation is in flight", () => {
    expect(isOwnChange(mine, ME, mutationStarted(idleActivity), 10_000)).toBe(true);
  });

  it("stays true within the window after settling, then expires", () => {
    const settled = mutationSettled(mutationStarted(idleActivity), 10_000);
    expect(isOwnChange(mine, ME, settled, 10_000 + OWN_CHANGE_WINDOW_MS)).toBe(true);
    expect(isOwnChange(mine, ME, settled, 10_000 + OWN_CHANGE_WINDOW_MS + 1)).toBe(false);
  });

  it("counts overlapping mutations", () => {
    const two = mutationStarted(mutationStarted(idleActivity));
    const one = mutationSettled(two, 5_000);
    expect(one.inFlight).toBe(1);
    expect(isOwnChange(mine, ME, one, 99_999)).toBe(true);
  });

  it("is false for other actors or an unknown actor", () => {
    const busy = mutationStarted(idleActivity);
    expect(isOwnChange({ ...mine, actor: OTHER }, ME, busy, 0)).toBe(false);
    expect(isOwnChange({ ...mine, actor: null }, ME, busy, 0)).toBe(false);
  });

  it("never goes below zero in flight", () => {
    expect(mutationSettled(idleActivity, 1).inFlight).toBe(0);
  });
});

describe("trackMutation", () => {
  it("is in flight during the call and settled after, also on failure", async () => {
    let activity: LocalActivity = idleActivity;
    const read = () => activity;
    const write = (next: LocalActivity) => {
      activity = next;
    };
    let during = -1;
    await trackMutation(
      read,
      write,
      async () => {
        during = activity.inFlight;
      },
      () => 42,
    );
    expect(during).toBe(1);
    expect(activity).toEqual({ inFlight: 0, lastSettledAt: 42 });

    await expect(
      trackMutation(
        read,
        write,
        () => Promise.reject(new Error("boom")),
        () => 50,
      ),
    ).rejects.toThrow("boom");
    expect(activity).toEqual({ inFlight: 0, lastSettledAt: 50 });
  });
});
