import { generateKeyBetween } from "fractional-indexing";

import { comparePositions } from "./ordering";

/** Same rule as the `*_position_format` checks in the database. */
export const POSITION_PATTERN = /^[0-9A-Za-z]+$/;

/** The greatest position in byte order, or `null` for an empty list. */
export function lastPosition(positions: Iterable<string>): string | null {
  let last: string | null = null;
  for (const position of positions) {
    if (last === null || comparePositions(position, last) > 0) last = position;
  }
  return last;
}

/**
 * Fractional-indexing key that sorts after every given position (append at
 * the end of a column or of the board). Only the new item gets a key: nothing
 * else is renumbered. The input does not need to be sorted.
 *
 * Throws if the greatest position is not a valid fractional-indexing key.
 */
export function positionAfterLast(positions: Iterable<string>): string {
  return generateKeyBetween(lastPosition(positions), null);
}

type Positioned = { id: string; position: string };

/**
 * Fractional-indexing key for an item moved next to `previousId` / `nextId`
 * (the neighbours the user dropped it between). Only the moved item gets a
 * new key.
 *
 * `siblings` are the items already at the destination, without the moved one,
 * in any order. They may include items the user can't see (archived cards):
 * the key is placed next to the neighbour's real successor or predecessor, so
 * it never collides with a hidden item either.
 *
 * The client's view may be stale, so the neighbours are hints:
 * - `previousId` wins when it is still there (the item goes right after it);
 * - otherwise `nextId` (right before it);
 * - otherwise, including an empty destination, the item goes last.
 * The result is always a valid key, whatever the hints.
 */
export function positionForMove(
  siblings: readonly Positioned[],
  previousId: string | null,
  nextId: string | null,
): string {
  const previous = siblings.find((item) => item.id === previousId);
  if (previous) {
    // The first key strictly greater, so a tie never makes the range empty.
    const after = siblings
      .filter((item) => comparePositions(item.position, previous.position) > 0)
      .reduce<string | null>(
        (min, item) =>
          min === null || comparePositions(item.position, min) < 0 ? item.position : min,
        null,
      );
    return generateKeyBetween(previous.position, after);
  }

  const next = siblings.find((item) => item.id === nextId);
  if (next) {
    const before = lastPosition(
      siblings
        .filter((item) => comparePositions(item.position, next.position) < 0)
        .map((item) => item.position),
    );
    return generateKeyBetween(before, next.position);
  }

  return positionAfterLast(siblings.map((item) => item.position));
}
