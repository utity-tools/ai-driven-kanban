import { positionAfterLast } from "@/lib/boards/positions";

import type { Subtask } from "./subtask";

export type Neighbors = { previousId: string | null; nextId: string | null };

/**
 * The neighbours `id` ends up between when it is moved to `toIndex` of `ids`
 * (the checklist order, the moved item included): the hints moveSubtask
 * expects. `null` when nothing changes (same index, unknown id, index out of
 * range), so no request is sent.
 */
export function neighborsForMove(
  ids: readonly string[],
  id: string,
  toIndex: number,
): Neighbors | null {
  const from = ids.indexOf(id);
  if (from === -1 || from === toIndex || toIndex < 0 || toIndex >= ids.length) return null;
  const others = ids.filter((other) => other !== id);
  return { previousId: others[toIndex - 1] ?? null, nextId: others[toIndex] ?? null };
}

/** Position for a new subtask at the end of a checklist. */
export function nextSubtaskPosition(subtasks: readonly Pick<Subtask, "position">[]): string {
  return positionAfterLast(subtasks.map((subtask) => subtask.position));
}

/**
 * Where focus goes after deleting a subtask: the next one, else the previous
 * one, else `null` (the "Add a subtask" button).
 */
export function neighborSubtaskId(ids: readonly string[], id: string): string | null {
  const index = ids.indexOf(id);
  if (index === -1) return null;
  return ids[index + 1] ?? ids[index - 1] ?? null;
}

// ---------------------------------------------------------------------------
// Keyboard reordering (the grip button: arrows, Home, End)
// ---------------------------------------------------------------------------

export const SUBTASK_MOVE_INSTRUCTIONS =
  "Use the up and down arrow keys to move this subtask, Home and End to move it to the top or bottom.";

/**
 * The index a key moves an item at `index` of `total` to: ArrowUp/ArrowDown
 * one place, Home/End to either end. `null` for other keys and for moves past
 * either end (nothing to do).
 */
export function keyboardMoveIndex(key: string, index: number, total: number): number | null {
  if (index < 0 || index >= total) return null;
  const target =
    key === "ArrowUp"
      ? index - 1
      : key === "ArrowDown"
        ? index + 1
        : key === "Home"
          ? 0
          : key === "End"
            ? total - 1
            : null;
  if (target === null || target < 0 || target >= total || target === index) return null;
  return target;
}

/** "Subtask Ship it is now in position 1 of 2." for the order `ids` (after the move). */
export function subtaskMovedMessage(
  subtasks: readonly { id: string; title: string }[],
  ids: readonly string[],
  id: string,
): string {
  const index = ids.indexOf(id);
  const title = subtasks.find((subtask) => subtask.id === id)?.title;
  if (index === -1 || title === undefined) return "";
  return `Subtask ${title} is now in position ${index + 1} of ${ids.length}.`;
}
