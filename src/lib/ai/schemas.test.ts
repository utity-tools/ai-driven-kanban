import { describe, expect, it } from "vitest";

import {
  MAX_PROPOSED_SUBTASKS,
  acceptProposalSchema,
  decompositionProposalSchema,
} from "./schemas";

describe("decompositionProposalSchema", () => {
  it("accepts a valid proposal", () => {
    const result = decompositionProposalSchema.safeParse({
      subtasks: [
        { title: "Add migration", estimate: 3 },
        { title: "Wire up the API route", estimate: null },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("trims subtask titles", () => {
    const result = decompositionProposalSchema.parse({
      subtasks: [{ title: "  Add index  ", estimate: 1 }],
    });
    expect(result.subtasks[0]?.title).toBe("Add index");
  });

  it("rejects an empty title", () => {
    const result = decompositionProposalSchema.safeParse({
      subtasks: [{ title: "   ", estimate: null }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a title over 200 characters", () => {
    const result = decompositionProposalSchema.safeParse({
      subtasks: [{ title: "a".repeat(201), estimate: null }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an estimate outside the Fibonacci scale", () => {
    const result = decompositionProposalSchema.safeParse({
      subtasks: [{ title: "Add index", estimate: 4 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty subtask list", () => {
    const result = decompositionProposalSchema.safeParse({ subtasks: [] });
    expect(result.success).toBe(false);
  });

  it(`rejects more than ${MAX_PROPOSED_SUBTASKS} subtasks`, () => {
    const subtasks = Array.from({ length: MAX_PROPOSED_SUBTASKS + 1 }, (_, i) => ({
      title: `Subtask ${i}`,
      estimate: null,
    }));
    const result = decompositionProposalSchema.safeParse({ subtasks });
    expect(result.success).toBe(false);
  });

  it(`accepts exactly ${MAX_PROPOSED_SUBTASKS} subtasks`, () => {
    const subtasks = Array.from({ length: MAX_PROPOSED_SUBTASKS }, (_, i) => ({
      title: `Subtask ${i}`,
      estimate: null,
    }));
    const result = decompositionProposalSchema.safeParse({ subtasks });
    expect(result.success).toBe(true);
  });
});

describe("acceptProposalSchema", () => {
  const ids = {
    boardId: "00000000-0000-4000-8000-000000000001",
    cardId: "00000000-0000-4000-8000-000000000002",
  };

  it("accepts the subtasks the user kept", () => {
    const result = acceptProposalSchema.parse({
      ...ids,
      subtasks: [{ title: "  Add index  ", estimate: 2 }],
    });
    expect(result.subtasks).toEqual([{ title: "Add index", estimate: 2 }]);
  });

  it("rejects an invalid card id", () => {
    const result = acceptProposalSchema.safeParse({
      ...ids,
      cardId: "not-a-uuid",
      subtasks: [{ title: "Add index", estimate: null }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects saving nothing", () => {
    const result = acceptProposalSchema.safeParse({ ...ids, subtasks: [] });
    expect(result.success).toBe(false);
  });

  it(`rejects more than ${MAX_PROPOSED_SUBTASKS} subtasks`, () => {
    const subtasks = Array.from({ length: MAX_PROPOSED_SUBTASKS + 1 }, (_, i) => ({
      title: `Subtask ${i}`,
      estimate: null,
    }));
    expect(acceptProposalSchema.safeParse({ ...ids, subtasks }).success).toBe(false);
  });

  it("strips unknown keys, so only title and estimate reach the database", () => {
    const result = acceptProposalSchema.parse({
      ...ids,
      subtasks: [{ title: "Add index", estimate: null, source: "manual" }],
    });
    expect(result.subtasks[0]).toEqual({ title: "Add index", estimate: null });
  });
});
