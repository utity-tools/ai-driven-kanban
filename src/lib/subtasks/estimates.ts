/**
 * Story-point estimates of a subtask: the Fibonacci values the database
 * accepts (`card_subtasks_estimate_fibonacci`), or `null` for "no estimate".
 */
export const ESTIMATES = [1, 2, 3, 5, 8, 13] as const;

export type Estimate = (typeof ESTIMATES)[number];

export function isEstimate(value: unknown): value is Estimate {
  return ESTIMATES.some((estimate) => estimate === value);
}

/** Narrows a stored value; anything outside the scale (never expected) reads as no estimate. */
export function toEstimate(value: number | null): Estimate | null {
  return isEstimate(value) ? value : null;
}

/** "1 pt", "5 pts". */
export function formatPoints(points: number): string {
  return `${points} ${points === 1 ? "pt" : "pts"}`;
}

/** "1 point", "5 points": for accessible names, where abbreviations read badly. */
export function spellPoints(points: number): string {
  return `${points} ${points === 1 ? "point" : "points"}`;
}
