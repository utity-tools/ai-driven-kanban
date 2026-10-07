import { describe, expect, it } from "vitest";

import { WORDMARK_FONT_METRICS, capCenterOffset, lockupMetrics } from "./lockup";
import { MARK_BOUNDS, MARK_VIEW_BOX } from "./mark";

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
