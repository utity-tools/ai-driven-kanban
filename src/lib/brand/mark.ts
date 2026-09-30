/** Brand mark geometry (120-unit grid, rest state). */
export const MARK_PATHS = [
  "M30,20L45,20L45,100L30,100Q15,100 15,85L15,35Q15,20 30,20Z",
  "M45,20L75,20L75,100L45,100Z",
  "M75,20L90,20Q105,20 105,35L105,85Q105,100 90,100L75,100Z",
] as const;

/** Tight viewBox around the mark (x 15-105, y 20-100) with room for the widest stroke (4 units per side). */
export const MARK_VIEW_BOX = { x: 11, y: 16, width: 98, height: 88 } as const;

/** Rendered stroke (px) at reference widths; the stroke thins as the mark shrinks. */
const STROKE_STOPS: readonly (readonly [width: number, stroke: number])[] = [
  [20, 1.25],
  [32, 1.6],
  [48, 2],
  [120, 6],
];

/** Rendered stroke width in px for a mark `size` px wide. */
export function markStrokePx(size: number): number {
  const first = STROKE_STOPS[0]!;
  const last = STROKE_STOPS[STROKE_STOPS.length - 1]!;
  if (size <= first[0]) return first[1];
  if (size >= last[0]) return size * 0.05;

  for (let i = 1; i < STROKE_STOPS.length; i++) {
    const [w1, s1] = STROKE_STOPS[i]!;
    const [w0, s0] = STROKE_STOPS[i - 1]!;
    if (size <= w1) return s0 + ((size - w0) / (w1 - w0)) * (s1 - s0);
  }
  return last[1];
}

/** Stroke width in viewBox units, so it renders as `markStrokePx(size)` on screen. */
export function markStrokeWidth(size: number): number {
  return (markStrokePx(size) * MARK_VIEW_BOX.width) / size;
}

/** Side of the square viewBox of `public/brand/thinking.svg` (-4 -4 128 128). */
const THINKING_VIEW_BOX_SIZE = 128;

/**
 * Side in px of the animated "Thinking" image whose mark matches a static `BrandMark` of
 * `markSize` px wide: the image's viewBox is wider than the mark, so it needs a larger box.
 */
export function thinkingImageSize(markSize: number): number {
  return Math.round((markSize * THINKING_VIEW_BOX_SIZE) / MARK_VIEW_BOX.width);
}
