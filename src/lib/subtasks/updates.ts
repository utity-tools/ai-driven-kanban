import { compareByPosition } from "@/lib/boards/ordering";
import { positionForMove } from "@/lib/boards/positions";

import type { Estimate } from "./estimates";
import type { Subtask } from "./subtask";

/**
 * Changes to a card's checklist the UI applies optimistically while the
 * matching Server Action runs (wrapped in a BoardUpdate, see board-updates.ts).
 */
export type SubtaskUpdate =
  | { type: "addSubtask"; cardId: string; subtask: Subtask }
  | { type: "renameSubtask"; cardId: string; subtaskId: string; title: string }
  | { type: "setSubtaskEstimate"; cardId: string; subtaskId: string; estimate: Estimate | null }
  | { type: "setSubtaskCompleted"; cardId: string; subtaskId: string; completedAt: string | null }
  /** Same neighbour hints as the moveSubtask action. */
  | {
      type: "moveSubtask";
      cardId: string;
      subtaskId: string;
      previousId: string | null;
      nextId: string | null;
    }
  | { type: "deleteSubtask"; cardId: string; subtaskId: string };

function patch(subtasks: readonly Subtask[], id: string, change: Partial<Subtask>): Subtask[] {
  return subtasks.map((subtask) => (subtask.id === id ? { ...subtask, ...change } : subtask));
}

/** The checklist after `update`. Never mutates the input. */
export function applySubtaskUpdate(subtasks: readonly Subtask[], update: SubtaskUpdate): Subtask[] {
  switch (update.type) {
    case "addSubtask":
      if (subtasks.some((s) => s.id === update.subtask.id)) return [...subtasks];
      return [...subtasks, update.subtask].sort(compareByPosition);

    case "renameSubtask":
      return patch(subtasks, update.subtaskId, { title: update.title });

    case "setSubtaskEstimate":
      return patch(subtasks, update.subtaskId, { estimate: update.estimate });

    case "setSubtaskCompleted":
      return patch(subtasks, update.subtaskId, { completedAt: update.completedAt });

    case "moveSubtask": {
      const moved = subtasks.find((s) => s.id === update.subtaskId);
      if (!moved) return [...subtasks];
      const others = subtasks.filter((s) => s.id !== moved.id);
      const position = positionForMove(others, update.previousId, update.nextId);
      return [...others, { ...moved, position }].sort(compareByPosition);
    }

    case "deleteSubtask":
      return subtasks.filter((s) => s.id !== update.subtaskId);
  }
}
