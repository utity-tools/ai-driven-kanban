import { describe, expect, it } from "vitest";

import {
  BOARD_TITLE_MAX,
  CARD_TITLE_MAX,
  COLUMN_TITLE_MAX,
  DESCRIPTION_MAX,
  cardRefSchema,
  createBoardSchema,
  createCardSchema,
  createColumnSchema,
  deleteBoardSchema,
  deleteColumnSchema,
  firstIssueMessage,
  normalizeTitle,
  renameBoardSchema,
  renameCardSchema,
  renameColumnSchema,
  updateCardDescriptionSchema,
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
