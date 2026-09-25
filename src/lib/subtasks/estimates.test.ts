import { describe, expect, it } from "vitest";

import { ESTIMATES, formatPoints, isEstimate, spellPoints, toEstimate } from "./estimates";

describe("estimates", () => {
  it("is the Fibonacci scale the database accepts", () => {
    expect(ESTIMATES).toEqual([1, 2, 3, 5, 8, 13]);
  });

  it("recognises only values on the scale", () => {
    for (const value of ESTIMATES) expect(isEstimate(value)).toBe(true);
    for (const value of [0, 4, 21, -1, 1.5, "3", null, undefined]) {
      expect(isEstimate(value)).toBe(false);
    }
  });

  it("narrows stored values, reading anything else as no estimate", () => {
    expect(toEstimate(8)).toBe(8);
    expect(toEstimate(null)).toBeNull();
    expect(toEstimate(4)).toBeNull();
  });

  it("formats points, singular and plural", () => {
    expect(formatPoints(1)).toBe("1 pt");
    expect(formatPoints(5)).toBe("5 pts");
    expect(spellPoints(1)).toBe("1 point");
    expect(spellPoints(13)).toBe("13 points");
  });
});
