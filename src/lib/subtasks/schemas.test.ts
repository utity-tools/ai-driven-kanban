import { describe, expect, it } from "vitest";

import {
  SUBTASKS_PER_CARD_MAX,
  canAddSubtask,
  createSubtaskSchema,
  moveSubtaskSchema,
  setSubtaskCompletedSchema,
  setSubtaskEstimateSchema,
} from "./schemas";

const boardId = "11111111-1111-4111-8111-111111111111";
const cardId = "22222222-2222-4222-8222-222222222222";
const subtaskId = "33333333-3333-4333-8333-333333333333";
const otherId = "44444444-4444-4444-8444-444444444444";

describe("createSubtaskSchema", () => {
  it("normalises the title", () => {
    const parsed = createSubtaskSchema.parse({
      boardId,
      cardId,
      subtaskId,
      title: "  Write\n  tests ",
    });
    expect(parsed.title).toBe("Write tests");
  });

  it("rejects empty and too long titles", () => {
    expect(
      createSubtaskSchema.safeParse({ boardId, cardId, subtaskId, title: "   " }).success,
    ).toBe(false);
    expect(
      createSubtaskSchema.safeParse({ boardId, cardId, subtaskId, title: "x".repeat(201) }).success,
    ).toBe(false);
    expect(
      createSubtaskSchema.safeParse({ boardId, cardId, subtaskId, title: "x".repeat(200) }).success,
    ).toBe(true);
  });

  it("drops a client-sent source: the action always writes 'manual'", () => {
    const parsed = createSubtaskSchema.parse({
      boardId,
      cardId,
      subtaskId,
      title: "A",
      source: "ai",
    });
    expect(parsed).not.toHaveProperty("source");
  });

  it("rejects ids that are not UUIDs", () => {
    expect(
      createSubtaskSchema.safeParse({ boardId, cardId, subtaskId: "1", title: "A" }).success,
    ).toBe(false);
  });
});

describe("setSubtaskEstimateSchema", () => {
  it("accepts Fibonacci values and null", () => {
    for (const estimate of [1, 2, 3, 5, 8, 13, null]) {
      expect(
        setSubtaskEstimateSchema.safeParse({ boardId, cardId, subtaskId, estimate }).success,
      ).toBe(true);
    }
  });

  it("rejects anything else", () => {
    for (const estimate of [0, 4, 21, "3", 2.5, undefined]) {
      const result = setSubtaskEstimateSchema.safeParse({ boardId, cardId, subtaskId, estimate });
      expect(result.success).toBe(false);
    }
  });
});

describe("setSubtaskCompletedSchema", () => {
  it("needs a boolean", () => {
    expect(
      setSubtaskCompletedSchema.safeParse({ boardId, cardId, subtaskId, completed: true }).success,
    ).toBe(true);
    expect(
      setSubtaskCompletedSchema.safeParse({ boardId, cardId, subtaskId, completed: "yes" }).success,
    ).toBe(false);
  });
});

describe("moveSubtaskSchema", () => {
  it("accepts neighbours, null at either end", () => {
    expect(
      moveSubtaskSchema.safeParse({ boardId, cardId, subtaskId, previousId: otherId, nextId: null })
        .success,
    ).toBe(true);
  });

  it("rejects a move next to itself", () => {
    const result = moveSubtaskSchema.safeParse({
      boardId,
      cardId,
      subtaskId,
      previousId: subtaskId,
      nextId: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("canAddSubtask", () => {
  it("allows up to the per-card limit", () => {
    expect(canAddSubtask(0)).toBe(true);
    expect(canAddSubtask(SUBTASKS_PER_CARD_MAX - 1)).toBe(true);
    expect(canAddSubtask(SUBTASKS_PER_CARD_MAX)).toBe(false);
  });
});
