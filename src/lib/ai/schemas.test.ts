import { describe, expect, it } from "vitest";

import {
  MAX_PROPOSED_DEPENDENCIES,
  MAX_PROPOSED_SUBTASKS,
  acceptDependenciesSchema,
  acceptProposalSchema,
  decompositionProposalSchema,
  dependencyProposalSchema,
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

describe("dependencyProposalSchema", () => {
  it("accepts a proposal, and an empty one", () => {
    expect(
      dependencyProposalSchema.safeParse({
        dependencies: [{ blocker: "c1", rationale: "The API must exist first." }],
      }).success,
    ).toBe(true);
    expect(dependencyProposalSchema.safeParse({ dependencies: [] }).success).toBe(true);
  });

  it("trims and rejects empty references and rationales", () => {
    expect(
      dependencyProposalSchema.parse({ dependencies: [{ blocker: " c2 ", rationale: " why " }] })
        .dependencies[0],
    ).toEqual({ blocker: "c2", rationale: "why" });
    expect(
      dependencyProposalSchema.safeParse({ dependencies: [{ blocker: "  ", rationale: "x" }] })
        .success,
    ).toBe(false);
    expect(
      dependencyProposalSchema.safeParse({ dependencies: [{ blocker: "c1", rationale: "" }] })
        .success,
    ).toBe(false);
  });

  it("rejects a rationale over 200 characters", () => {
    expect(
      dependencyProposalSchema.safeParse({
        dependencies: [{ blocker: "c1", rationale: "a".repeat(201) }],
      }).success,
    ).toBe(false);
  });

  it(`rejects more than ${MAX_PROPOSED_DEPENDENCIES} blockers`, () => {
    const dependencies = Array.from({ length: MAX_PROPOSED_DEPENDENCIES + 1 }, (_, i) => ({
      blocker: `c${i + 1}`,
      rationale: "why",
    }));
    expect(dependencyProposalSchema.safeParse({ dependencies }).success).toBe(false);
  });
});

describe("acceptDependenciesSchema", () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const base = { boardId: id(1), cardId: id(2) };

  it("accepts 1 to 10 card ids", () => {
    expect(acceptDependenciesSchema.safeParse({ ...base, blockerIds: [id(3)] }).success).toBe(true);
    const ten = Array.from({ length: 10 }, (_, i) => id(i + 3));
    expect(acceptDependenciesSchema.safeParse({ ...base, blockerIds: ten }).success).toBe(true);
  });

  it("rejects none, more than 10 and non-uuids", () => {
    expect(acceptDependenciesSchema.safeParse({ ...base, blockerIds: [] }).success).toBe(false);
    const eleven = Array.from({ length: 11 }, (_, i) => id(i + 3));
    expect(acceptDependenciesSchema.safeParse({ ...base, blockerIds: eleven }).success).toBe(false);
    expect(acceptDependenciesSchema.safeParse({ ...base, blockerIds: ["c1"] }).success).toBe(false);
  });
});
