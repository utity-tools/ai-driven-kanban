"use server";

import { type ActionResult, failure, friendlyDbError } from "@/lib/boards/action-result";
import { affected, runBoardAction as run } from "@/lib/boards/action-runner";
import { positionAfterLast, positionForMove } from "@/lib/boards/positions";

import {
  SUBTASK_LIMIT_ERROR,
  createSubtaskSchema,
  deleteSubtaskSchema,
  moveSubtaskSchema,
  renameSubtaskSchema,
  setSubtaskCompletedSchema,
  setSubtaskEstimateSchema,
} from "./schemas";

/*
 * Subtask (card checklist) mutations. Same rules as the board actions (see
 * boards/action-runner.ts): Zod first, then the database as the user, so RLS
 * decides; owners and editors write, viewers only read. Every query filters
 * by board and card too, so a subtask id from another card matches nothing.
 */

const CARD_GONE = "This card no longer exists.";

/**
 * Adds a subtask at the bottom of a card's checklist. Always `source:
 * 'manual'`: accepting AI proposals is a separate flow, and the client never
 * chooses the source. The database caps a card at 100 subtasks (23514).
 */
export async function createSubtask(input: unknown): Promise<ActionResult> {
  return run(
    createSubtaskSchema,
    input,
    async ({ boardId, cardId, subtaskId, title }, supabase) => {
      const last = await supabase
        .from("card_subtasks")
        .select("position")
        .eq("board_id", boardId)
        .eq("card_id", cardId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last.error) return failure(friendlyDbError(last.error));

      const { error } = await supabase.from("card_subtasks").insert({
        id: subtaskId,
        board_id: boardId,
        card_id: cardId,
        title,
        source: "manual",
        position: positionAfterLast(last.data ? [last.data.position] : []),
      });
      if (error) {
        return failure(
          // The title is validated above, so a check violation here is the per-card limit.
          friendlyDbError(error, { "23514": SUBTASK_LIMIT_ERROR, "23503": CARD_GONE }),
        );
      }
      return { ok: true };
    },
  );
}

export async function renameSubtask(input: unknown): Promise<ActionResult> {
  return run(
    renameSubtaskSchema,
    input,
    async ({ boardId, cardId, subtaskId, title }, supabase) => {
      const { data, error } = await supabase
        .from("card_subtasks")
        .update({ title })
        .eq("id", subtaskId)
        .eq("card_id", cardId)
        .eq("board_id", boardId)
        .select("id");
      if (error) return failure(friendlyDbError(error));
      return affected(data);
    },
  );
}

/** Sets a Fibonacci estimate in story points, or with `null` removes it. */
export async function setSubtaskEstimate(input: unknown): Promise<ActionResult> {
  return run(
    setSubtaskEstimateSchema,
    input,
    async ({ boardId, cardId, subtaskId, estimate }, supabase) => {
      const { data, error } = await supabase
        .from("card_subtasks")
        .update({ estimate })
        .eq("id", subtaskId)
        .eq("card_id", cardId)
        .eq("board_id", boardId)
        .select("id");
      if (error) return failure(friendlyDbError(error));
      return affected(data);
    },
  );
}

/** Checks (completed_at = now) or unchecks a subtask. */
export async function setSubtaskCompleted(input: unknown): Promise<ActionResult> {
  return run(
    setSubtaskCompletedSchema,
    input,
    async ({ boardId, cardId, subtaskId, completed }, supabase) => {
      const { data, error } = await supabase
        .from("card_subtasks")
        .update({ completed_at: completed ? new Date().toISOString() : null })
        .eq("id", subtaskId)
        .eq("card_id", cardId)
        .eq("board_id", boardId)
        .select("id");
      if (error) return failure(friendlyDbError(error));
      return affected(data);
    },
  );
}

/**
 * Reorders a subtask within its card, between two others. Only the moved row
 * gets a new fractional-indexing key (see positionForMove).
 */
export async function moveSubtask(input: unknown): Promise<ActionResult> {
  return run(
    moveSubtaskSchema,
    input,
    async ({ boardId, cardId, subtaskId, previousId, nextId }, supabase) => {
      const siblings = await supabase
        .from("card_subtasks")
        .select("id, position")
        .eq("board_id", boardId)
        .eq("card_id", cardId)
        .neq("id", subtaskId);
      if (siblings.error) return failure(friendlyDbError(siblings.error));

      const { data, error } = await supabase
        .from("card_subtasks")
        .update({ position: positionForMove(siblings.data, previousId, nextId) })
        .eq("id", subtaskId)
        .eq("card_id", cardId)
        .eq("board_id", boardId)
        .select("id");
      if (error) return failure(friendlyDbError(error));
      return affected(data);
    },
  );
}

export async function deleteSubtask(input: unknown): Promise<ActionResult> {
  return run(deleteSubtaskSchema, input, async ({ boardId, cardId, subtaskId }, supabase) => {
    const { data, error } = await supabase
      .from("card_subtasks")
      .delete()
      .eq("id", subtaskId)
      .eq("card_id", cardId)
      .eq("board_id", boardId)
      .select("id");
    if (error) return failure(friendlyDbError(error));
    return affected(data);
  });
}
