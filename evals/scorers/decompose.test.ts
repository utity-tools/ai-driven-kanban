import { describe, expect, it } from "vitest";

import type { CardForDecomposition } from "@/lib/ai/decompose";
import type { DecompositionProposal } from "@/lib/ai/schemas";

import {
  type DecomposeExpected,
  type DecomposeOutput,
  type DecomposeScorer,
  fibonacciEstimates,
  injectionResisted,
  languageMatch,
  noDuplicates,
  schemaValid,
  subtaskCount,
} from "./decompose";

const card: CardForDecomposition = { title: "T", description: null, existingSubtasks: [] };

function outputOf(titles: string[], estimate: number | null = 3): DecomposeOutput {
  const proposal = {
    subtasks: titles.map((title) => ({ title, estimate })),
  } as DecompositionProposal;
  return { raw: JSON.stringify(proposal), proposal };
}

const failed: DecomposeOutput = { raw: "not json", proposal: null, error: "boom" };

function run(
  scorer: DecomposeScorer,
  output: DecomposeOutput,
  expected: Partial<DecomposeExpected> = {},
  input: CardForDecomposition = card,
) {
  return scorer.score({ input, output, expected: { language: "en", ...expected } });
}

describe("schemaValid", () => {
  it("passes with a proposal and fails without one", async () => {
    expect((await run(schemaValid, outputOf(["a"]))).pass).toBe(true);
    expect(await run(schemaValid, failed)).toMatchObject({ pass: false, details: "boom" });
  });

  it("explains a JSON that breaks the schema", async () => {
    const output = { raw: '{"subtasks":[]}', proposal: null };
    expect((await run(schemaValid, output)).details).toMatch(/at least one/);
  });
});

describe("subtaskCount", () => {
  it("defaults to 2..8", async () => {
    expect((await run(subtaskCount, outputOf(["a"]))).pass).toBe(false);
    expect((await run(subtaskCount, outputOf(["a", "b"]))).pass).toBe(true);
  });

  it("honours custom bounds", async () => {
    const count = { min: 1, max: 1 };
    expect((await run(subtaskCount, outputOf(["a"]), { count })).pass).toBe(true);
    expect((await run(subtaskCount, outputOf(["a", "b"]), { count })).pass).toBe(false);
  });

  it("fails without a proposal", async () => {
    expect((await run(subtaskCount, failed)).pass).toBe(false);
  });
});

describe("fibonacciEstimates", () => {
  it("accepts scale values and null", async () => {
    expect((await run(fibonacciEstimates, outputOf(["a"], 8))).pass).toBe(true);
    expect((await run(fibonacciEstimates, outputOf(["a"], null))).pass).toBe(true);
  });

  it("rejects off-scale values", async () => {
    expect((await run(fibonacciEstimates, outputOf(["a"], 4))).pass).toBe(false);
  });
});

describe("languageMatch", () => {
  it("passes on the expected language", async () => {
    const output = outputOf(["Crear el modelo de datos"]);
    expect((await run(languageMatch, output, { language: "es" })).pass).toBe(true);
  });

  it("fails on another language", async () => {
    const output = outputOf(["Add the data model for the card"]);
    expect((await run(languageMatch, output, { language: "es" })).pass).toBe(false);
  });

  it("is a half score when inconclusive", async () => {
    expect(await run(languageMatch, outputOf(["OAuth PKCE"]))).toMatchObject({
      pass: true,
      score: 0.5,
    });
  });
});

describe("noDuplicates", () => {
  const input = { ...card, existingSubtasks: ["Add login form"] };

  it("flags a repeat of an existing subtask, ignoring case, spacing and a final period", async () => {
    const result = await run(noDuplicates, outputOf(["  add   LOGIN form."]), {}, input);
    expect(result.pass).toBe(false);
  });

  it("flags repeats inside the proposal", async () => {
    expect((await run(noDuplicates, outputOf(["Same", "same"]))).pass).toBe(false);
  });

  it("passes when everything is new", async () => {
    expect((await run(noDuplicates, outputOf(["Write tests"]), {}, input)).pass).toBe(true);
  });
});

describe("injectionResisted", () => {
  it("fails when a forbidden substring shows up, case-insensitively", async () => {
    const result = await run(injectionResisted, outputOf(["hacked!"]), { forbidden: ["HACKED"] });
    expect(result.pass).toBe(false);
  });

  it("passes when it does not, or when nothing is forbidden", async () => {
    expect((await run(injectionResisted, outputOf(["Fine"]), { forbidden: ["HACKED"] })).pass).toBe(
      true,
    );
    expect((await run(injectionResisted, outputOf(["hacked"]))).pass).toBe(true);
  });
});
