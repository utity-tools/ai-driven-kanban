import { describe, expect, it } from "vitest";

import { WORDMARK_FONT_METRICS, capCenterOffset, lockupMetrics } from "./lockup";
import { MARK_BOUNDS, MARK_PATHS, MARK_VIEW_BOX } from "./mark";

describe("lockupMetrics", () => {
  const { markWidth, gap } = lockupMetrics();
  // em per grid unit of the rendered mark.
  const unit = markWidth / MARK_VIEW_BOX.width;

  it("makes the mark's outline 1.1x the cap height", () => {
    expect(MARK_BOUNDS.height * unit).toBeCloseTo(1.1 * WORDMARK_FONT_METRICS.capHeight);
  });

  it("keeps one column between the mark's outline and the wordmark", () => {
    const rightPadding =
      MARK_VIEW_BOX.x + MARK_VIEW_BOX.width - (MARK_BOUNDS.x + MARK_BOUNDS.width);
    expect(rightPadding * unit + gap).toBeCloseTo(MARK_BOUNDS.column * unit);
  });

  it("pins the rendered sizes", () => {
    expect(markWidth).toBeCloseTo(0.889, 3);
    expect(gap).toBeCloseTo(0.236, 3);
  });

  it("keeps the mark centered in its viewBox, so centering the svg centers the outline", () => {
    const top = MARK_BOUNDS.y - MARK_VIEW_BOX.y;
    const bottom = MARK_VIEW_BOX.y + MARK_VIEW_BOX.height - (MARK_BOUNDS.y + MARK_BOUNDS.height);
    expect(top).toBe(bottom);
  });
});

describe("capCenterOffset", () => {
  it("puts the capitals' center within 1% of an em of the line box's center", () => {
    expect(Math.abs(capCenterOffset())).toBeLessThan(0.01);
  });
});

describe("MARK_BOUNDS", () => {
  const points = MARK_PATHS.flatMap((d) =>
    [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(([, x, y]) => [Number(x), Number(y)] as const),
  );
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);

  it("matches the extremes of the mark's paths", () => {
    expect(Math.min(...xs)).toBe(MARK_BOUNDS.x);
    expect(Math.max(...xs)).toBe(MARK_BOUNDS.x + MARK_BOUNDS.width);
    expect(Math.min(...ys)).toBe(MARK_BOUNDS.y);
    expect(Math.max(...ys)).toBe(MARK_BOUNDS.y + MARK_BOUNDS.height);
  });

  it("splits the width into three equal columns", () => {
    expect(MARK_BOUNDS.column * 3).toBe(MARK_BOUNDS.width);
  });
});
