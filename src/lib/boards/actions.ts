"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

import {
  type ActionResult,
  GENERIC_ERROR,
  NOT_FOUND_ERROR,
  SIGNED_OUT_ERROR,
  failure,
  friendlyDbError,
} from "./action-result";
import { positionAfterLast } from "./positions";
import {
  cardAssigneeSchema,
  cardLabelSchema,
  cardRefSchema,
  createBoardSchema,
  createLabelSchema,
  createCardSchema,
  createColumnSchema,
  deleteBoardSchema,
  deleteColumnSchema,
  deleteLabelSchema,
  firstIssueMessage,
  renameBoardSchema,
  renameCardSchema,
  renameColumnSchema,
  setCardCompletedSchema,
  setCardDueDateSchema,
  updateCardDescriptionSchema,
  updateLabelSchema,
} from "./schemas";

/*
 * Board mutations. Every action:
 * - validates its input with Zod (the input is untrusted: any client can POST);
 * - runs as the signed-in user, so Row Level Security decides what is allowed
 *   (the client's idea of its role is never trusted);
 * - returns a typed result with a message that is safe to show;
 * - revalidates the board, success or failure, so the response carries the
 *   current board (a failure usually means the UI was stale).
 *
 * Updates and deletes ask for the affected ids back: RLS turns a forbidden or
 * missing row into "0 rows", not an error, and we report that to the user.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function run<S extends z.ZodType, T extends object = object>(
  schema: S,
  input: unknown,
  mutate: (data: z.output<S>, supabase: Supabase) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return failure(firstIssueMessage(parsed.error));

  if (!(await getCurrentUser())) return failure(SIGNED_OUT_ERROR);

  let result: ActionResult<T>;
  try {
    result = await mutate(parsed.data, await createClient());
  } catch (error) {
    console.error("Board action failed", error);
    result = failure(GENERIC_ERROR);
  }

  const { boardId } = parsed.data as { boardId?: unknown };
  if (typeof boardId === "string") revalidatePath(boardPath(boardId));
  return result;
}

function boardPath(boardId: string): string {
  return `/boards/${boardId}`;
}

/** `ok` if at least one row was affected, the not-found message otherwise. */
function affected(rows: unknown[] | null, notFound = NOT_FOUND_ERROR): ActionResult {
  return rows?.length ? { ok: true } : failure(notFound);
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

/** Creates a board (with To do / In progress / Done columns) owned by the user. */
export async function createBoard(input: unknown): Promise<ActionResult<{ boardId: string }>> {
  return run(createBoardSchema, input, async ({ title }, supabase) => {
    const { data, error } = await supabase.rpc("create_board", { p_title: title });
    if (error || !data) {
      return failure(
        friendlyDbError(error, {
          "23514": "Board titles must be between 1 and 100 characters.",
          "42501": SIGNED_OUT_ERROR,
        }),
      );
    }
    revalidatePath("/boards");
    return { ok: true, boardId: data };
  });
}

export async function renameBoard(input: unknown): Promise<ActionResult> {
  return run(renameBoardSchema, input, async ({ boardId, title }, supabase) => {
    const { data, error } = await supabase
      .from("boards")
      .update({ title })
      .eq("id", boardId)
      .select("id");
    if (error) return failure(friendlyDbError(error));
    revalidatePath("/boards");
    return affected(data);
  });
}

/**
 * Deletes the board with all its columns and cards (owners only). The caller navigates to
 * /boards on success: redirecting from here would surface as a thrown error on the client.
 */
export async function deleteBoard(input: unknown): Promise<ActionResult> {
  const result = await run(deleteBoardSchema, input, async ({ boardId }, supabase) => {
    const { data, error } = await supabase.from("boards").delete().eq("id", boardId).select("id");
    if (error) return failure(friendlyDbError(error));
    if (!data.length) return failure("Only the board's owner can delete it.");
    return { ok: true };
  });
  if (result.ok) revalidatePath("/boards");
  return result;
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

/** Adds a column after the last one. */
export async function createColumn(input: unknown): Promise<ActionResult> {
  return run(createColumnSchema, input, async ({ boardId, columnId, title }, supabase) => {
    const last = await supabase
      .from("board_columns")
      .select("position")
      .eq("board_id", boardId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last.error) return failure(friendlyDbError(last.error));

    const { error } = await supabase.from("board_columns").insert({
      id: columnId,
      board_id: boardId,
      title,
      position: positionAfterLast(last.data ? [last.data.position] : []),
    });
    if (error) return failure(friendlyDbError(error));
    return { ok: true };
  });
}

export async function renameColumn(input: unknown): Promise<ActionResult> {
  return run(renameColumnSchema, input, async ({ boardId, columnId, title }, supabase) => {
    const { data, error } = await supabase
      .from("board_columns")
      .update({ title })
      .eq("id", columnId)
      .eq("board_id", boardId)
      .select("id");
    if (error) return failure(friendlyDbError(error));
    return affected(data);
  });
}

/** Deletes a column and all of its cards, archived ones included (FK cascade). */
export async function deleteColumn(input: unknown): Promise<ActionResult> {
  return run(deleteColumnSchema, input, async ({ boardId, columnId }, supabase) => {
    const { data, error } = await supabase
      .from("board_columns")
      .delete()
      .eq("id", columnId)
      .eq("board_id", boardId)
      .select("id");
    if (error) return failure(friendlyDbError(error));
    return affected(data);
  });
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** Adds a card at the bottom of a column. */
export async function createCard(input: unknown): Promise<ActionResult> {
  return run(createCardSchema, input, async ({ boardId, columnId, cardId, title }, supabase) => {
    // After every card of the column, archived ones included, so a restored
    // card never collides with a new one.
    const last = await supabase
      .from("cards")
      .select("position")
      .eq("board_id", boardId)
      .eq("column_id", columnId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last.error) return failure(friendlyDbError(last.error));

    const { error } = await supabase.from("cards").insert({
      id: cardId,
      board_id: boardId,
      column_id: columnId,
      title,
      position: positionAfterLast(last.data ? [last.data.position] : []),
    });
    if (error) {
      return failure(friendlyDbError(error, { "23503": "This column no longer exists." }));
    }
    return { ok: true };
  });
}

export async function renameCard(input: unknown): Promise<ActionResult> {
  return run(renameCardSchema, input, async ({ boardId, cardId, title }, supabase) => {
    const { data, error } = await supabase
      .from("cards")
      .update({ title })
      .eq("id", cardId)
      .eq("board_id", boardId)
      .select("id");
    if (error) return failure(friendlyDbError(error));
    return affected(data);
  });
}

export async function updateCardDescription(input: unknown): Promise<ActionResult> {
  return run(
    updateCardDescriptionSchema,
    input,
    async ({ boardId, cardId, description }, supabase) => {
      const { data, error } = await supabase
        .from("cards")
        .update({ description })
        .eq("id", cardId)
        .eq("board_id", boardId)
        .select("id");
      if (error) return failure(friendlyDbError(error));
      return affected(data);
    },
  );
}

export async function archiveCard(input: unknown): Promise<ActionResult> {
  return run(cardRefSchema, input, async ({ boardId, cardId }, supabase) => {
    const { data, error } = await supabase
      .from("cards")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", cardId)
      .eq("board_id", boardId)
      .select("id");
    if (error) return failure(friendlyDbError(error));
    return affected(data);
  });
}

/** Puts an archived card back in its column, at its old position. */
export async function restoreCard(input: unknown): Promise<ActionResult> {
  return run(cardRefSchema, input, async ({ boardId, cardId }, supabase) => {
    const { data, error } = await supabase
      .from("cards")
      .update({ archived_at: null })
      .eq("id", cardId)
      .eq("board_id", boardId)
      .select("id");
    if (error) return failure(friendlyDbError(error));
    return affected(data);
  });
}

/**
 * Deletes an archived card for good. The database only lets archived cards be
 * deleted (a DELETE on an active card affects 0 rows); the filter here says
 * the same thing explicitly.
 */
export async function deleteCard(input: unknown): Promise<ActionResult> {
  return run(cardRefSchema, input, async ({ boardId, cardId }, supabase) => {
    const { data, error } = await supabase
      .from("cards")
      .delete()
      .eq("id", cardId)
      .eq("board_id", boardId)
      .not("archived_at", "is", null)
      .select("id");
    if (error) return failure(friendlyDbError(error));
    return affected(
      data,
      "Only archived cards can be deleted, and only by the board's owners and editors.",
    );
  });
}

// ---------------------------------------------------------------------------
// Card details: due date
// ---------------------------------------------------------------------------

/**
 * Sets (or with `null` removes) a card's date-only due date. Removing the date
 * also clears the "done" mark: done belongs to the date (it is the checkbox
 * next to it), and a stale mark would make a date set later show up as done.
 * Changing the date keeps the mark.
 */
export async function setCardDueDate(input: unknown): Promise<ActionResult> {
  return run(setCardDueDateSchema, input, async ({ boardId, cardId, dueOn }, supabase) => {
    const { data, error } = await supabase
      .from("cards")
      .update(dueOn === null ? { due_on: null, completed_at: null } : { due_on: dueOn })
      .eq("id", cardId)
      .eq("board_id", boardId)
      .select("id");
    if (error) {
      return failure(
        friendlyDbError(error, { "23514": "Due dates must be between the years 2000 and 9999." }),
      );
    }
    return affected(data);
  });
}

/** Marks a card's due date as done (completed_at = now) or not done. Needs a due date. */
export async function setCardCompleted(input: unknown): Promise<ActionResult> {
  return run(setCardCompletedSchema, input, async ({ boardId, cardId, completed }, supabase) => {
    const { data, error } = await supabase
      .from("cards")
      .update({ completed_at: completed ? new Date().toISOString() : null })
      .eq("id", cardId)
      .eq("board_id", boardId)
      .not("due_on", "is", null)
      .select("id");
    if (error) return failure(friendlyDbError(error));
    return affected(data, "Set a due date before marking it as done.");
  });
}

// ---------------------------------------------------------------------------
// Card details: labels
// ---------------------------------------------------------------------------

/** Creates a board label; with `cardId`, also attaches it to that card. */
export async function createLabel(input: unknown): Promise<ActionResult> {
  return run(
    createLabelSchema,
    input,
    async ({ boardId, labelId, name, color, cardId }, supabase) => {
      const { error } = await supabase
        .from("board_labels")
        .insert({ id: labelId, board_id: boardId, name, color });
      if (error) return failure(friendlyDbError(error));
      if (!cardId) return { ok: true };

      const attached = await supabase
        .from("card_labels")
        .insert({ card_id: cardId, label_id: labelId, board_id: boardId });
      if (attached.error) {
        return failure("The label was created, but it couldn't be added to this card.");
      }
      return { ok: true };
    },
  );
}

export async function updateLabel(input: unknown): Promise<ActionResult> {
  return run(updateLabelSchema, input, async ({ boardId, labelId, name, color }, supabase) => {
    const { data, error } = await supabase
      .from("board_labels")
      .update({ name, color })
      .eq("id", labelId)
      .eq("board_id", boardId)
      .select("id");
    if (error) return failure(friendlyDbError(error));
    return affected(data);
  });
}

/** Deletes a board label; it disappears from every card (FK cascade). */
export async function deleteLabel(input: unknown): Promise<ActionResult> {
  return run(deleteLabelSchema, input, async ({ boardId, labelId }, supabase) => {
    const { data, error } = await supabase
      .from("board_labels")
      .delete()
      .eq("id", labelId)
      .eq("board_id", boardId)
      .select("id");
    if (error) return failure(friendlyDbError(error));
    return affected(data);
  });
}

/**
 * Attaches a label to a card. Idempotent: attaching a label the card already
 * has is a success. The composite foreign keys reject a label or card from
 * another board.
 */
export async function attachLabel(input: unknown): Promise<ActionResult> {
  return run(cardLabelSchema, input, async ({ boardId, cardId, labelId }, supabase) => {
    const { error } = await supabase
      .from("card_labels")
      .insert({ card_id: cardId, label_id: labelId, board_id: boardId });
    if (error && error.code !== "23505") return failure(friendlyDbError(error));
    return { ok: true };
  });
}

export async function detachLabel(input: unknown): Promise<ActionResult> {
  return run(cardLabelSchema, input, async ({ boardId, cardId, labelId }, supabase) => {
    const { data, error } = await supabase
      .from("card_labels")
      .delete()
      .eq("card_id", cardId)
      .eq("label_id", labelId)
      .eq("board_id", boardId)
      .select("card_id");
    if (error) return failure(friendlyDbError(error));
    return affected(data);
  });
}

// ---------------------------------------------------------------------------
// Card details: assignees
// ---------------------------------------------------------------------------

/**
 * Assigns a board member to a card. Idempotent like attachLabel; only board
 * members can be assigned (enforced by a foreign key to board_members).
 */
export async function assignMember(input: unknown): Promise<ActionResult> {
  return run(cardAssigneeSchema, input, async ({ boardId, cardId, userId }, supabase) => {
    const { error } = await supabase
      .from("card_assignees")
      .insert({ card_id: cardId, user_id: userId, board_id: boardId });
    if (error && error.code !== "23505") {
      return failure(
        friendlyDbError(error, { "23503": "Only members of this board can be assigned." }),
      );
    }
    return { ok: true };
  });
}

export async function unassignMember(input: unknown): Promise<ActionResult> {
  return run(cardAssigneeSchema, input, async ({ boardId, cardId, userId }, supabase) => {
    const { data, error } = await supabase
      .from("card_assignees")
      .delete()
      .eq("card_id", cardId)
      .eq("user_id", userId)
      .eq("board_id", boardId)
      .select("card_id");
    if (error) return failure(friendlyDbError(error));
    return affected(data);
  });
}
