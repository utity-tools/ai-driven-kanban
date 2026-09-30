import { describe, expect, it } from "vitest";

import { MARK_VIEW_BOX, markStrokePx, markStrokeWidth } from "./mark";

describe("markStrokePx", () => {
  it.each([
    [16, 1.25],
    [20, 1.25],
    [32, 1.6],
    [48, 2],
    [120, 6],
    [200, 10],
  ])("is %ipx wide -> %f px stroke", (size, stroke) => {
    expect(markStrokePx(size)).toBeCloseTo(stroke);
  });

  it("interpolates between reference sizes", () => {
    expect(markStrokePx(40)).toBeCloseTo(1.8);
    expect(markStrokePx(84)).toBeCloseTo(4);
  });

  it("never gets thinner as the mark grows", () => {
    let previous = 0;
    for (let size = 8; size <= 240; size += 4) {
      const stroke = markStrokePx(size);
      expect(stroke).toBeGreaterThanOrEqual(previous);
      previous = stroke;
    }
  });
});

describe("markStrokeWidth", () => {
  it("converts the rendered stroke to viewBox units", () => {
    expect(markStrokeWidth(48)).toBeCloseTo((2 * MARK_VIEW_BOX.width) / 48);
  });

  it("keeps the stroke inside the viewBox margin", () => {
    // Mark spans 15-105 x 20-100; the viewBox leaves 4 units on every side.
    for (const size of [16, 22, 48, 120, 240]) {
      expect(markStrokeWidth(size) / 2).toBeLessThanOrEqual(4);
    }
  });
});
