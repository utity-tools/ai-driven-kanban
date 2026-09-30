import { describe, expect, it } from "vitest";

import {
  blockersF1,
  type DependenciesExpected,
  type DependenciesInput,
  type DependenciesOutput,
  type DependenciesScorer,
  mustNotBlockRespected,
  noCycles,
  precisionRecallF1,
  refsKnown,
  schemaValid,
} from "./dependencies";

const candidate = (id: string) => ({
  id,
  title: id,
  columnTitle: "To do",
  done: false,
  archived: false,
});

const input: DependenciesInput = {
  targetId: "t",
  target: { title: "T", description: null, columnTitle: "To do" },
  candidates: [candidate("x"), candidate("y")],
  edges: [{ blockerId: "t", blockedId: "x" }],
};

function outputOf(refs: string[] | null, valid: string[] = []): DependenciesOutput {
  return {
    raw: "",
    refs,
    valid: valid.map((blockerId) => ({ blockerId, title: "", columnTitle: "", rationale: "" })),
    error: refs ? undefined : "invalid",
  };
}

function run(
  scorer: DependenciesScorer,
  output: DependenciesOutput,
  expected: DependenciesExpected,
) {
  return scorer.score({ input, output, expected });
}

describe("schemaValid", () => {
  it("fails when the output could not be parsed", async () => {
    expect((await run(schemaValid, outputOf(null), { blockers: [] })).pass).toBe(false);
    expect((await run(schemaValid, outputOf([]), { blockers: [] })).pass).toBe(true);
  });
});

describe("refsKnown", () => {
  it("passes for c1..cN and fails for invented references", async () => {
    expect((await run(refsKnown, outputOf(["c1", "c2"]), { blockers: [] })).pass).toBe(true);
    expect(await run(refsKnown, outputOf(["c3", "x"]), { blockers: [] })).toMatchObject({
      pass: false,
      details: "unknown references: c3, x",
    });
  });
});

describe("noCycles", () => {
  it("fails when a proposed blocker is already downstream of the target", async () => {
    // Edge t -> x exists, so proposing x (c1) as a blocker of t closes t -> x -> t.
    const result = await run(noCycles, outputOf(["c1"]), { blockers: [] });
    expect(result.pass).toBe(false);
  });

  it("passes for a safe blocker and ignores unknown references", async () => {
    expect((await run(noCycles, outputOf(["c2", "c9"]), { blockers: [] })).pass).toBe(true);
  });
});

describe("mustNotBlockRespected", () => {
  it("fails when a forbidden card survives the filter", async () => {
    const output = outputOf(["c2"], ["y"]);
    expect(
      (await run(mustNotBlockRespected, output, { blockers: [], mustNotBlock: ["y"] })).pass,
    ).toBe(false);
  });

  it("passes otherwise", async () => {
    const output = outputOf(["c2"], ["y"]);
    expect(
      (await run(mustNotBlockRespected, output, { blockers: ["y"], mustNotBlock: ["x"] })).pass,
    ).toBe(true);
  });
});

describe("precisionRecallF1", () => {
  it("computes the usual metrics", () => {
    expect(precisionRecallF1(["a", "b"], ["a", "c"])).toEqual({
      precision: 0.5,
      recall: 0.5,
      f1: 0.5,
    });
  });

  it("treats an empty proposal as right only when nothing was expected", () => {
    expect(precisionRecallF1([], []).f1).toBe(1);
    expect(precisionRecallF1([], ["a"]).f1).toBe(0);
    expect(precisionRecallF1(["a"], []).f1).toBe(0);
  });
});

describe("blockersF1", () => {
  it("scores the filtered proposal against the expected blockers", async () => {
    const good = await run(blockersF1, outputOf(["c1"], ["x"]), { blockers: ["x"] });
    expect(good).toMatchObject({ pass: true, score: 1 });
    const bad = await run(blockersF1, outputOf(["c2"], ["y"]), { blockers: ["x"] });
    expect(bad).toMatchObject({ pass: false, score: 0 });
  });
});
