import type { BoardLayout } from "./drag";

/** A column's horizontal extent on screen, in the same coordinates as the pointer. */
export type ColumnSpan = { id: string; left: number; right: number };

/** How far (px) outside a column the pointer still counts as over it: bridges the gap between columns. */
export const COLUMN_GAP_TOLERANCE = 16;

/**
 * The column under the pointer, by x alone: a column is a vertical stack, so
 * the pointer below its last card (or above its first) is still over it, and
 * a column growing or shrinking never changes the answer. In the gap between
 * two columns the closer one wins. `null` when the pointer is farther than
 * `tolerance` from every column.
 */
export function columnAtPointer(
  spans: readonly ColumnSpan[],
  x: number,
  tolerance: number = COLUMN_GAP_TOLERANCE,
): string | null {
  let best: { id: string; distance: number } | null = null;
  for (const span of spans) {
    const distance = x < span.left ? span.left - x : x > span.right ? x - span.right : 0;
    if (distance > tolerance) continue;
    if (best === null || distance < best.distance) best = { id: span.id, distance };
  }
  return best?.id ?? null;
}

/**
 * The ids a card dragged by a pointer can be dropped over: the cards of the
 * column under the pointer, or the column itself when it has none. `null` when
 * the pointer is not over a column (the caller falls back to the dragged
 * card's own rect).
 */
export function pointerCandidateIds(
  layout: BoardLayout,
  spans: readonly ColumnSpan[],
  x: number,
): string[] | null {
  const columnId = columnAtPointer(spans, x);
  if (columnId === null) return null;
  const column = layout.find((item) => item.id === columnId);
  if (!column) return null;
  return column.cardIds.length > 0 ? [...column.cardIds] : [column.id];
}
