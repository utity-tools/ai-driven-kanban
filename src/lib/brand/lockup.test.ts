import { describe, expect, it } from "vitest";

import { WORDMARK_FONT_METRICS, capCenterOffset, lockupMetrics } from "./lockup";
import { MARK_BOUNDS, MARK_COLUMN, MARK_VIEW_BOX } from "./mark";

describe("lockupMetrics", () => {
  const { markWidth, gap } = lockupMetrics();
  // em per grid unit of the rendered mark.
  const unit = markWidth / MARK_VIEW_BOX.width;

  it("makes the mark's outline 1.7x the cap height", () => {
    expect(MARK_BOUNDS.height * unit).toBeCloseTo(1.7 * WORDMARK_FONT_METRICS.capHeight);
  });

  it("keeps one column (the middle one) between the mark's outline and the wordmark", () => {
    const rightPadding =
      MARK_VIEW_BOX.x + MARK_VIEW_BOX.width - (MARK_BOUNDS.x + MARK_BOUNDS.width);
    expect(rightPadding * unit + gap).toBeCloseTo(MARK_COLUMN * unit);
  });

  it("pins the rendered sizes (about the handoff's 34px mark and 10px gap at 28px)", () => {
    expect(markWidth).toBeCloseTo(1.213, 3);
    expect(gap).toBeCloseTo(0.382, 3);
  });

  // Vertically only: horizontally the padding is 3.5 units left and 2.1 right, which the gap
  // above already accounts for.
  it("keeps the mark vertically centered in its viewBox, so centering the svg centers the outline", () => {
    const top = MARK_BOUNDS.y - MARK_VIEW_BOX.y;
    const bottom = MARK_VIEW_BOX.y + MARK_VIEW_BOX.height - (MARK_BOUNDS.y + MARK_BOUNDS.height);
    expect(top).toBeCloseTo(bottom);
  });
});

describe("capCenterOffset", () => {
  it("puts the capitals' center within 1% of an em of the line box's center", () => {
    expect(Math.abs(capCenterOffset())).toBeLessThan(0.01);
  });
});
