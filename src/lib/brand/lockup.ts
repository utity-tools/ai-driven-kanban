import { MARK_BOUNDS, MARK_VIEW_BOX } from "./mark";

/** Bricolage Grotesque 700 vertical metrics, in em (measured in the browser). */
export const WORDMARK_FONT_METRICS = { ascent: 0.93, descent: 0.27, capHeight: 0.66 } as const;

/** The mark is 1.1x the wordmark's cap height (brand book, horizontal lockup). */
const MARK_TO_CAP = 1.1;

/** Letter-spacing of the wordmark, in em. */
export const WORDMARK_TRACKING = -0.045;

export type LockupMetrics = {
  /** Width of the mark's `<svg>` (viewBox included), in em of the wordmark. */
  markWidth: number;
  /** Space between the `<svg>` and the wordmark, in em; the mark's outline sits one column away. */
  gap: number;
};

/**
 * Horizontal lockup geometry, in em of the wordmark's font size: the mark's outline is 1.1x the
 * cap height and one column (c) away from the wordmark. Center both on a `line-height: 1` box:
 * see `capCenterOffset`.
 */
export function lockupMetrics(): LockupMetrics {
  const unit = (MARK_TO_CAP * WORDMARK_FONT_METRICS.capHeight) / MARK_BOUNDS.height;
  const rightPadding = MARK_VIEW_BOX.x + MARK_VIEW_BOX.width - (MARK_BOUNDS.x + MARK_BOUNDS.width);

  return {
    markWidth: MARK_VIEW_BOX.width * unit,
    gap: (MARK_BOUNDS.column - rightPadding) * unit,
  };
}

/**
 * Distance in em from the center of a `line-height: 1` text box to the center of the
 * wordmark's capitals (positive is down). Near zero, so `align-items: center` centers the mark
 * on the capitals. Not used at runtime: its test guards that assumption if the metrics change.
 */
export function capCenterOffset(): number {
  const { ascent, descent, capHeight } = WORDMARK_FONT_METRICS;
  const halfLeading = (1 - (ascent + descent)) / 2;
  const baseline = halfLeading + ascent;
  return baseline - capHeight / 2 - 0.5;
}
