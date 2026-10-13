/**
 * Brand mark geometry (120-unit grid): three tilted, filled columns, the open pose of the
 * "Thinking" animation (frame 15 of `public/brand/thinking.svg`). Left, middle, right.
 */
export const MARK_PATHS = [
  "M21.9,26.1L25.4,25.9Q35.4,25.2 36.1,35.2L40.2,92.9Q40.5,97 36.4,97.2L25.5,98Q13.5,98.8 12.7,86.9L9.4,40.5Q8.5,27.1 21.9,26.1Z",
  "M61.7,5.9L73.7,6.5Q79.7,6.8 79.4,12.9L75.1,93.8Q74.3,108.8 59.3,108L45.3,107.3Q42.3,107.1 42.5,104.1L47,19.2Q47.7,5.2 61.7,5.9Z",
  "M95,29.4L102.9,30.3Q114.9,31.5 113.6,43.4L108,96.2Q107.1,105.1 98.2,104.1L95.2,103.8Q83.2,102.6 84.5,90.6L90.6,33Q91,29 95,29.4Z",
] as const;

/**
 * Width of the knockout around the middle column, in grid units (3 per side): a mask, not a
 * stroke, so the columns read as three on any background.
 */
export const MARK_GAP = 6;

/** The mark's extremes on the grid (path points, control points included). */
export const MARK_BOUNDS = { x: 8.5, y: 5.2, width: 106.4, height: 103.6 } as const;

/** Width of the middle column on the grid (x 42.3-79.7): the lockup's gap. */
export const MARK_COLUMN = 37.4;

/** Square viewBox around the mark (x 5-117, y 1-113). */
export const MARK_VIEW_BOX = { x: 5, y: 1, width: 112, height: 112 } as const;

/**
 * Side of the square viewBox of `public/brand/thinking.svg` (-1 -5 124 124): centered on the
 * static mark's viewBox, with room for every frame of the animation.
 */
const THINKING_VIEW_BOX_SIZE = 124;

/** Image box over mark width (124/112): an em-sized mark scales its image by this. */
export const THINKING_IMAGE_RATIO = THINKING_VIEW_BOX_SIZE / MARK_VIEW_BOX.width;

/**
 * Side in px of the animated "Thinking" image whose mark matches a static `BrandMark` of
 * `markSize` px: the image's viewBox is wider than the mark's, so it needs a larger box.
 */
export function thinkingImageSize(markSize: number): number {
  return Math.round(markSize * THINKING_IMAGE_RATIO);
}
