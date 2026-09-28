import { describe, expect, it } from "vitest";

import { MAX_PROPOSED_SUBTASKS, decompositionProposalSchema } from "./schemas";

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
