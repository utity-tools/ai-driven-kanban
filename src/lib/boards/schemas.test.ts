import { describe, expect, it } from "vitest";

import {
  BOARD_TITLE_MAX,
  CARD_TITLE_MAX,
  COLUMN_TITLE_MAX,
  DESCRIPTION_MAX,
  LABEL_NAME_MAX,
  cardAssigneeSchema,
  cardLabelSchema,
  cardRefSchema,
  createBoardSchema,
  createCardSchema,
  createColumnSchema,
  createLabelSchema,
  deleteBoardSchema,
  deleteColumnSchema,
  deleteLabelSchema,
  dueOnSchema,
  firstIssueMessage,
  moveCardSchema,
  moveColumnSchema,
  normalizeTitle,
  renameBoardSchema,
  renameCardSchema,
  renameColumnSchema,
  setCardCompletedSchema,
  setCardDueDateSchema,
  updateCardDescriptionSchema,
  updateLabelSchema,
} from "./schemas";

const BOARD = "b0a4d000-0000-4000-8000-000000000001";
const COLUMN = "c0100000-0000-4000-8000-000000000001";
const CARD = "ca4d0000-0000-4000-8000-000000000001";

function messageOf(result: { success: boolean; error?: Parameters<typeof firstIssueMessage>[0] }) {
  return result.error ? firstIssueMessage(result.error) : null;
}

describe("normalizeTitle", () => {
  it("trims and collapses whitespace, including line breaks", () => {
    expect(normalizeTitle("  Fix\n the \t bug  ")).toBe("Fix the bug");
  });
});

describe.each([
  { name: "board", schema: createBoardSchema, max: BOARD_TITLE_MAX, extra: {} },
  {
    name: "board rename",
    schema: renameBoardSchema,
    max: BOARD_TITLE_MAX,
    extra: { boardId: BOARD },
  },
  {
    name: "column",
    schema: createColumnSchema,
    max: COLUMN_TITLE_MAX,
    extra: { boardId: BOARD, columnId: COLUMN },
  },
  {
    name: "column rename",
    schema: renameColumnSchema,
    max: COLUMN_TITLE_MAX,
    extra: { boardId: BOARD, columnId: COLUMN },
  },
  {
    name: "card",
    schema: createCardSchema,
    max: CARD_TITLE_MAX,
    extra: { boardId: BOARD, columnId: COLUMN, cardId: CARD },
  },
  {
    name: "card rename",
    schema: renameCardSchema,
    max: CARD_TITLE_MAX,
    extra: { boardId: BOARD, cardId: CARD },
  },
])("$name title", ({ schema, max, extra }) => {
  it("trims the title", () => {
    const result = schema.safeParse({ ...extra, title: "  Hello  " });

    expect(result.success && result.data.title).toBe("Hello");
  });

  it("rejects an empty or blank title", () => {
    for (const title of ["", "   ", "\n"]) {
      const result = schema.safeParse({ ...extra, title });
      expect(result.success).toBe(false);
      expect(messageOf(result)).toMatch(/^Enter a \w+ title\.$/);
    }
  });

  it(`accepts ${max} characters and rejects ${max + 1}`, () => {
    expect(schema.safeParse({ ...extra, title: "x".repeat(max) }).success).toBe(true);

    const tooLong = schema.safeParse({ ...extra, title: "x".repeat(max + 1) });
    expect(tooLong.success).toBe(false);
    expect(messageOf(tooLong)).toContain(`at most ${max} characters`);
  });

  it("measures the length after trimming", () => {
    expect(schema.safeParse({ ...extra, title: `  ${"x".repeat(max)}  ` }).success).toBe(true);
  });

  it("rejects a non-string title", () => {
    expect(schema.safeParse({ ...extra, title: 42 }).success).toBe(false);
  });
});

describe("ids", () => {
  it("must be UUIDs", () => {
    expect(deleteBoardSchema.safeParse({ boardId: BOARD }).success).toBe(true);
    expect(deleteBoardSchema.safeParse({ boardId: "not-a-uuid" }).success).toBe(false);
    expect(deleteColumnSchema.safeParse({ boardId: BOARD, columnId: "1" }).success).toBe(false);
    expect(cardRefSchema.safeParse({ boardId: BOARD, cardId: CARD }).success).toBe(true);
    expect(cardRefSchema.safeParse({ boardId: BOARD }).success).toBe(false);
  });

  it("are required for every create", () => {
    expect(createColumnSchema.safeParse({ boardId: BOARD, title: "Doing" }).success).toBe(false);
    expect(
      createCardSchema.safeParse({ boardId: BOARD, columnId: COLUMN, title: "Task" }).success,
    ).toBe(false);
  });

  it("strip unknown keys, so the client cannot smuggle extra columns", () => {
    const result = renameBoardSchema.safeParse({ boardId: BOARD, title: "T", owner_id: "x" });

    expect(result.success && result.data).toEqual({ boardId: BOARD, title: "T" });
  });
});

describe("updateCardDescriptionSchema", () => {
  const base = { boardId: BOARD, cardId: CARD };

  it("keeps Markdown, trimming the ends", () => {
    const result = updateCardDescriptionSchema.safeParse({
      ...base,
      description: "\n- a\n- b\n\n",
    });

    expect(result.success && result.data.description).toBe("- a\n- b");
  });

  it("turns an empty description into null", () => {
    const result = updateCardDescriptionSchema.safeParse({ ...base, description: "   " });

    expect(result.success && result.data.description).toBeNull();
  });

  it(`accepts ${DESCRIPTION_MAX} characters and rejects more`, () => {
    expect(
      updateCardDescriptionSchema.safeParse({ ...base, description: "x".repeat(DESCRIPTION_MAX) })
        .success,
    ).toBe(true);

    const tooLong = updateCardDescriptionSchema.safeParse({
      ...base,
      description: "x".repeat(DESCRIPTION_MAX + 1),
    });
    expect(tooLong.success).toBe(false);
    expect(messageOf(tooLong)).toBe("Descriptions can be at most 10,000 characters.");
  });

  it("rejects a missing description", () => {
    expect(updateCardDescriptionSchema.safeParse(base).success).toBe(false);
  });
});

const LABEL = "1abe1000-0000-4000-8000-000000000001";
const USER = "a11ce000-0000-4000-8000-000000000001";

describe("dueOnSchema", () => {
  it("accepts real dates between the years 2000 and 9999", () => {
    for (const value of ["2026-10-02", "2000-01-01", "9999-12-31", "2028-02-29"]) {
      expect(dueOnSchema.parse(value)).toBe(value);
    }
  });

  it("rejects other formats and impossible dates", () => {
    for (const value of ["2026-10-02T00:00:00Z", "2026-2-3", "02/10/2026", "2026-02-30", ""]) {
      expect(messageOf(dueOnSchema.safeParse(value))).toBe("Invalid due date.");
    }
    expect(messageOf(dueOnSchema.safeParse(20261002))).toBe("Invalid due date.");
  });

  it("rejects years outside the database range", () => {
    expect(messageOf(dueOnSchema.safeParse("1999-12-31"))).toBe(
      "Due dates must be between the years 2000 and 9999.",
    );
    expect(dueOnSchema.safeParse("0999-01-01").success).toBe(false);
  });
});

describe("setCardDueDateSchema / setCardCompletedSchema", () => {
  it("accepts a date or null (remove)", () => {
    expect(
      setCardDueDateSchema.parse({ boardId: BOARD, cardId: CARD, dueOn: "2026-10-02" }).dueOn,
    ).toBe("2026-10-02");
    expect(setCardDueDateSchema.parse({ boardId: BOARD, cardId: CARD, dueOn: null }).dueOn).toBe(
      null,
    );
    expect(setCardDueDateSchema.safeParse({ boardId: BOARD, cardId: CARD }).success).toBe(false);
  });

  it("needs a boolean", () => {
    expect(
      setCardCompletedSchema.parse({ boardId: BOARD, cardId: CARD, completed: true }).completed,
    ).toBe(true);
    expect(
      setCardCompletedSchema.safeParse({ boardId: BOARD, cardId: CARD, completed: "yes" }).success,
    ).toBe(false);
  });
});

describe("label schemas", () => {
  const base = { boardId: BOARD, labelId: LABEL };

  it("normalises the name and allows it to be empty (colour-only)", () => {
    expect(createLabelSchema.parse({ ...base, name: "  front\n end ", color: "sky" })).toEqual({
      ...base,
      name: "front end",
      color: "sky",
    });
    expect(updateLabelSchema.parse({ ...base, name: "   ", color: "black" }).name).toBe("");
  });

  it(`limits names to ${LABEL_NAME_MAX} characters`, () => {
    const ok = "x".repeat(LABEL_NAME_MAX);
    expect(updateLabelSchema.safeParse({ ...base, name: ok, color: "red" }).success).toBe(true);
    expect(messageOf(updateLabelSchema.safeParse({ ...base, name: `${ok}x`, color: "red" }))).toBe(
      `Label names can be at most ${LABEL_NAME_MAX} characters.`,
    );
  });

  it("only accepts the ten label colours", () => {
    expect(messageOf(createLabelSchema.safeParse({ ...base, name: "", color: "teal" }))).toBe(
      "Pick a label colour.",
    );
    expect(createLabelSchema.safeParse({ ...base, name: "" }).success).toBe(false);
  });

  it("optionally attaches the new label to a card", () => {
    expect(createLabelSchema.parse({ ...base, name: "", color: "red", cardId: CARD }).cardId).toBe(
      CARD,
    );
    expect(
      createLabelSchema.safeParse({ ...base, name: "", color: "red", cardId: "x" }).success,
    ).toBe(false);
  });

  it("validates ids for delete, attach and detach", () => {
    expect(deleteLabelSchema.safeParse(base).success).toBe(true);
    expect(messageOf(deleteLabelSchema.safeParse({ boardId: BOARD, labelId: "x" }))).toBe(
      "Invalid label.",
    );
    expect(cardLabelSchema.safeParse({ ...base, cardId: CARD }).success).toBe(true);
    expect(cardLabelSchema.safeParse({ ...base, cardId: "x" }).success).toBe(false);
  });
});

describe("cardAssigneeSchema", () => {
  it("needs board, card and member ids", () => {
    expect(
      cardAssigneeSchema.safeParse({ boardId: BOARD, cardId: CARD, userId: USER }).success,
    ).toBe(true);
    expect(
      messageOf(cardAssigneeSchema.safeParse({ boardId: BOARD, cardId: CARD, userId: "bob" })),
    ).toBe("Invalid member.");
  });
});

describe("move schemas", () => {
  const OTHER = "6f1c2c1e-2a4b-4c7d-9e3f-0a1b2c3d4e5f";

  it("accepts neighbour ids or null at either end", () => {
    const move = { boardId: BOARD, cardId: CARD, columnId: COLUMN };
    expect(moveCardSchema.safeParse({ ...move, previousId: null, nextId: OTHER }).success).toBe(
      true,
    );
    expect(moveCardSchema.safeParse({ ...move, previousId: null, nextId: null }).success).toBe(
      true,
    );
    expect(moveCardSchema.safeParse({ ...move, previousId: "x", nextId: null }).success).toBe(
      false,
    );
  });

  it("rejects moving an item next to itself", () => {
    expect(
      messageOf(
        moveCardSchema.safeParse({
          boardId: BOARD,
          cardId: CARD,
          columnId: COLUMN,
          previousId: CARD,
          nextId: null,
        }),
      ),
    ).toBe("A card can't be moved next to itself.");
    expect(
      messageOf(
        moveColumnSchema.safeParse({
          boardId: BOARD,
          columnId: COLUMN,
          previousId: null,
          nextId: COLUMN,
        }),
      ),
    ).toBe("A column can't be moved next to itself.");
  });
});
