import { beforeEach, describe, expect, it } from "vitest";

import { clearJustAdded, markJustAdded, wasJustAdded } from "./just-added";

beforeEach(clearJustAdded);

describe("just-added rows", () => {
  it("knows ids that were just marked, however often it is asked", () => {
    markJustAdded(["a", "b"], 1000);
    expect(wasJustAdded("a", 1500)).toBe(true);
    expect(wasJustAdded("a", 1500)).toBe(true);
    expect(wasJustAdded("c", 1500)).toBe(false);
  });

  it("forgets an id after two seconds, so a card opened later doesn't animate", () => {
    markJustAdded(["a"], 1000);
    expect(wasJustAdded("a", 3000)).toBe(true);
    expect(wasJustAdded("a", 3001)).toBe(false);
  });

  it("drops expired ids when new ones are marked", () => {
    markJustAdded(["old"], 0);
    markJustAdded(["new"], 10_000);
    expect(wasJustAdded("old", 10_000)).toBe(false);
    expect(wasJustAdded("new", 10_000)).toBe(true);
  });
});
