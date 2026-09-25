import { z } from "zod";

import { titleSchema } from "@/lib/boards/schemas";

import { ESTIMATES } from "./estimates";

/** Same limits as the database (card_subtasks title check and per-card trigger). */
export const SUBTASK_TITLE_MAX = 200;
export const SUBTASKS_PER_CARD_MAX = 100;

export const SUBTASK_LIMIT_ERROR = `A card can have at most ${SUBTASKS_PER_CARD_MAX} subtasks.`;

/** Whether a checklist with `count` items can take one more. */
export function canAddSubtask(count: number): boolean {
  return count < SUBTASKS_PER_CARD_MAX;
}

export const subtaskTitleSchema = titleSchema("subtask", SUBTASK_TITLE_MAX);

/** A Fibonacci estimate, or `null` for "no estimate". */
export const estimateSchema = z
  .literal([...ESTIMATES], { error: `Estimates must be one of ${ESTIMATES.join(", ")}.` })
  .nullable();

const boardId = z.uuid({ error: "Invalid board." });
const cardId = z.uuid({ error: "Invalid card." });
const subtaskId = z.uuid({ error: "Invalid subtask." });

/**
 * The client picks the new subtask's id so its optimistic copy keeps the same
 * key. There is no `source`: subtasks typed in the UI are always 'manual'.
 */
export const createSubtaskSchema = z.object({
  boardId,
  cardId,
  subtaskId,
  title: subtaskTitleSchema,
});
export const renameSubtaskSchema = z.object({
  boardId,
  cardId,
  subtaskId,
  title: subtaskTitleSchema,
});
export const setSubtaskEstimateSchema = z.object({
  boardId,
  cardId,
  subtaskId,
  estimate: estimateSchema,
});
export const setSubtaskCompletedSchema = z.object({
  boardId,
  cardId,
  subtaskId,
  completed: z.boolean({ error: "Invalid value." }),
});
export const deleteSubtaskSchema = z.object({ boardId, cardId, subtaskId });

/** Reorder within the card: the neighbours it was dropped between (see positionForMove). */
export const moveSubtaskSchema = z
  .object({
    boardId,
    cardId,
    subtaskId,
    previousId: subtaskId.nullable(),
    nextId: subtaskId.nullable(),
  })
  .refine((move) => move.previousId !== move.subtaskId && move.nextId !== move.subtaskId, {
    error: "A subtask can't be moved next to itself.",
  });

export type CreateSubtaskInput = z.input<typeof createSubtaskSchema>;
export type RenameSubtaskInput = z.input<typeof renameSubtaskSchema>;
export type SetSubtaskEstimateInput = z.input<typeof setSubtaskEstimateSchema>;
export type SetSubtaskCompletedInput = z.input<typeof setSubtaskCompletedSchema>;
export type DeleteSubtaskInput = z.input<typeof deleteSubtaskSchema>;
export type MoveSubtaskInput = z.input<typeof moveSubtaskSchema>;
