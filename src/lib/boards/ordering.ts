/**
 * Ordering of fractional-indexing keys (columns and cards).
 *
 * Positions are stored with COLLATE "C" (byte order), which is what fractional
 * indexing assumes. Keys are base62 ASCII (`[0-9A-Za-z]`), so JavaScript's
 * `<` / `>` on strings (UTF-16 code units) gives the same order as bytes.
 * Never use `localeCompare`: it sorts `"a"` before `"B"`, which breaks the keys.
 */
export function comparePositions(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

type Positioned = { id: string; position: string };

/** Compares by position, then by id to break ties (same as the SQL ORDER BY). */
export function compareByPosition(a: Positioned, b: Positioned): number {
  return comparePositions(a.position, b.position) || comparePositions(a.id, b.id);
}

/** Returns a new array sorted by position then id. Does not mutate the input. */
export function sortByPosition<T extends Positioned>(items: readonly T[]): T[] {
  return [...items].sort(compareByPosition);
}
