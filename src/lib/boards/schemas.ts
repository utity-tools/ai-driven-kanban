import { z } from "zod";

import { MAX_DUE_YEAR, MIN_DUE_YEAR, isDateOnly } from "./due-date";
import { LABEL_COLORS } from "./label-colors";

/** Same limits as the database checks (supabase/migrations). */
export const BOARD_TITLE_MAX = 100;
export const COLUMN_TITLE_MAX = 50;
export const CARD_TITLE_MAX = 200;
export const DESCRIPTION_MAX = 10_000;
export const LABEL_NAME_MAX = 30;

/**
 * Titles are single-line: line breaks and runs of whitespace (e.g. from a
 * paste) collapse to one space, and the ends are trimmed. The UI and the
 * Server Actions both use this, so what the user sees is what gets stored.
 */
export function normalizeTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function title(noun: string, max: number) {
  return z
    .string({ error: `Enter a ${noun} title.` })
    .transform(normalizeTitle)
    .pipe(
      z
        .string()
        .min(1, { error: `Enter a ${noun} title.` })
        .max(max, { error: `${capitalize(noun)} titles can be at most ${max} characters.` }),
    );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const id = (noun: string) => z.uuid({ error: `Invalid ${noun}.` });

export const boardTitleSchema = title("board", BOARD_TITLE_MAX);
export const columnTitleSchema = title("column", COLUMN_TITLE_MAX);
export const cardTitleSchema = title("card", CARD_TITLE_MAX);

/** Markdown. Surrounding whitespace is trimmed; empty means "no description" (null). */
export const descriptionSchema = z
  .string({ error: "Invalid description." })
  .transform((value) => value.trim())
  .pipe(
    z.string().max(DESCRIPTION_MAX, {
      error: `Descriptions can be at most ${DESCRIPTION_MAX.toLocaleString("en-US")} characters.`,
    }),
  )
  .transform((value) => (value === "" ? null : value));

const boardId = id("board");
const columnId = id("column");
const cardId = id("card");

export const createBoardSchema = z.object({ title: boardTitleSchema });
export const renameBoardSchema = z.object({ boardId, title: boardTitleSchema });
export const deleteBoardSchema = z.object({ boardId });

/** The client picks the new column's id so its optimistic copy keeps the same key. */
export const createColumnSchema = z.object({ boardId, columnId, title: columnTitleSchema });
export const renameColumnSchema = z.object({ boardId, columnId, title: columnTitleSchema });
export const deleteColumnSchema = z.object({ boardId, columnId });

/** The client picks the new card's id so its optimistic copy keeps the same key. */
export const createCardSchema = z.object({ boardId, columnId, cardId, title: cardTitleSchema });
export const renameCardSchema = z.object({ boardId, cardId, title: cardTitleSchema });
export const updateCardDescriptionSchema = z.object({
  boardId,
  cardId,
  description: descriptionSchema,
});
/** Archive, restore and delete-permanently all identify a card the same way. */
export const cardRefSchema = z.object({ boardId, cardId });

// ---------------------------------------------------------------------------
// Card details: due date, labels, assignees
// ---------------------------------------------------------------------------

/**
 * A date-only due date, "YYYY-MM-DD", that exists on the calendar and is in
 * the range the database accepts (years 2000-9999).
 */
export const dueOnSchema = z
  .string({ error: "Invalid due date." })
  .refine(isDateOnly, { error: "Invalid due date." })
  .refine(
    (value) => {
      const year = Number(value.slice(0, 4));
      return year >= MIN_DUE_YEAR && year <= MAX_DUE_YEAR;
    },
    { error: `Due dates must be between the years ${MIN_DUE_YEAR} and ${MAX_DUE_YEAR}.` },
  );

/** `null` removes the due date (and the "done" mark with it). */
export const setCardDueDateSchema = z.object({ boardId, cardId, dueOn: dueOnSchema.nullable() });
export const setCardCompletedSchema = z.object({
  boardId,
  cardId,
  completed: z.boolean({ error: "Invalid value." }),
});

/** Optional (empty = colour-only label), single-line like titles. */
export const labelNameSchema = z
  .string({ error: "Invalid label name." })
  .transform(normalizeTitle)
  .pipe(
    z.string().max(LABEL_NAME_MAX, {
      error: `Label names can be at most ${LABEL_NAME_MAX} characters.`,
    }),
  );
export const labelColorSchema = z.enum(LABEL_COLORS, { error: "Pick a label colour." });

const labelId = id("label");
const userId = id("member");

/**
 * The client picks the new label's id so its optimistic copy keeps the same
 * key. With `cardId`, the new label is also attached to that card.
 */
export const createLabelSchema = z.object({
  boardId,
  labelId,
  name: labelNameSchema,
  color: labelColorSchema,
  cardId: cardId.optional(),
});
export const updateLabelSchema = z.object({
  boardId,
  labelId,
  name: labelNameSchema,
  color: labelColorSchema,
});
export const deleteLabelSchema = z.object({ boardId, labelId });
/** Attach and detach. */
export const cardLabelSchema = z.object({ boardId, cardId, labelId });
/** Assign and unassign. */
export const cardAssigneeSchema = z.object({ boardId, cardId, userId });

export type CreateBoardInput = z.input<typeof createBoardSchema>;
export type RenameBoardInput = z.input<typeof renameBoardSchema>;
export type DeleteBoardInput = z.input<typeof deleteBoardSchema>;
export type CreateColumnInput = z.input<typeof createColumnSchema>;
export type RenameColumnInput = z.input<typeof renameColumnSchema>;
export type DeleteColumnInput = z.input<typeof deleteColumnSchema>;
export type CreateCardInput = z.input<typeof createCardSchema>;
export type RenameCardInput = z.input<typeof renameCardSchema>;
export type UpdateCardDescriptionInput = z.input<typeof updateCardDescriptionSchema>;
export type CardRefInput = z.input<typeof cardRefSchema>;
export type SetCardDueDateInput = z.input<typeof setCardDueDateSchema>;
export type SetCardCompletedInput = z.input<typeof setCardCompletedSchema>;
export type CreateLabelInput = z.input<typeof createLabelSchema>;
export type UpdateLabelInput = z.input<typeof updateLabelSchema>;
export type DeleteLabelInput = z.input<typeof deleteLabelSchema>;
export type CardLabelInput = z.input<typeof cardLabelSchema>;
export type CardAssigneeInput = z.input<typeof cardAssigneeSchema>;

/** First validation message, for a toast or an inline error. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}
