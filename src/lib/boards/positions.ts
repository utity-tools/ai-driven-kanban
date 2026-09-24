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
