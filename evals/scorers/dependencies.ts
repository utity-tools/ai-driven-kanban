import type { CardForDependencies } from "@/lib/ai/suggest-dependencies";
import type { DependencyCandidate, ValidDependency } from "@/lib/ai/dependency-proposals";
import { type Dependency, findCycle } from "@/lib/graph/dependencies";

import { fail, PASS, type Scorer } from "./types";

/** What the runner sends: the same pieces the route builds before calling the model. */
export type DependenciesInput = {
  targetId: string;
  target: CardForDependencies;
  /** Candidates in prompt order: reference `cN` is the Nth. */
  candidates: DependencyCandidate[];
  /** Every existing edge of the board. */
  edges: Dependency[];
};

export type DependenciesOutput = {
  raw: string;
  /** Raw "cN" references the model returned, or null when the output was invalid. */
  refs: string[] | null;
  /** What survives the app's own filtering (proposeDependencies): what the user would review. */
  valid: ValidDependency[];
  error?: string;
};

export type DependenciesExpected = {
  /** Card ids that should be proposed. Empty means "nothing is a clear blocker". */
  blockers: string[];
  /** Card ids that must not be proposed (debatable, unrelated, or injected). */
  mustNotBlock?: string[];
};

export type DependenciesScorer = Scorer<
  DependenciesInput,
  DependenciesOutput,
  DependenciesExpected
>;

const NO_OUTPUT = "no output to score";

export const schemaValid: DependenciesScorer = {
  name: "schema-valid",
  async score({ output }) {
    return output.refs ? PASS : fail(output.error ?? NO_OUTPUT);
  },
};

export const refsKnown: DependenciesScorer = {
  name: "refs-known",
  async score({ input, output }) {
    if (!output.refs) return fail(output.error ?? NO_OUTPUT);
    const known = new Set(input.candidates.map((_, index) => `c${index + 1}`));
    const unknown = output.refs.filter((ref) => !known.has(ref));
    return unknown.length === 0 ? PASS : fail(`unknown references: ${unknown.join(", ")}`);
  },
};

export const noCycles: DependenciesScorer = {
  name: "no-cycles",
  async score({ input, output }) {
    if (!output.refs) return fail(output.error ?? NO_OUTPUT);
    // Judge the raw proposal, not the filtered one: the filter would hide a model that ignores the rules.
    const proposed = output.refs.flatMap((ref) => {
      const candidate = input.candidates[Number(ref.slice(1)) - 1];
      return candidate ? [{ blockerId: candidate.id, blockedId: input.targetId }] : [];
    });
    const cycle = findCycle([...input.edges, ...proposed]);
    return cycle === null ? PASS : fail(`cycle: ${cycle.join(" -> ")}`);
  },
};

export const mustNotBlockRespected: DependenciesScorer = {
  name: "must-not-block",
  async score({ output, expected }) {
    if (!output.refs) return fail(output.error ?? NO_OUTPUT);
    const proposed = new Set(output.valid.map((item) => item.blockerId));
    const wrong = (expected.mustNotBlock ?? []).filter((id) => proposed.has(id));
    return wrong.length === 0 ? PASS : fail(`proposed forbidden blockers: ${wrong.join(", ")}`);
  },
};

/** Precision, recall and F1 of the (filtered) proposal against the expected blockers. */
export function precisionRecallF1(proposed: readonly string[], expected: readonly string[]) {
  const truth = new Set(expected);
  const hits = proposed.filter((id) => truth.has(id)).length;
  // Nothing proposed / nothing expected counts as perfect, so "empty is correct" cases can pass.
  const precision =
    proposed.length === 0 ? (expected.length === 0 ? 1 : 0) : hits / proposed.length;
  const recall = expected.length === 0 ? (proposed.length === 0 ? 1 : 0) : hits / expected.length;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

export const F1_PASS_THRESHOLD = 0.5;

export const blockersF1: DependenciesScorer = {
  name: "blockers-f1",
  async score({ output, expected }) {
    if (!output.refs) return fail(output.error ?? NO_OUTPUT);
    const { precision, recall, f1 } = precisionRecallF1(
      output.valid.map((item) => item.blockerId),
      expected.blockers,
    );
    const details = `precision ${precision.toFixed(2)}, recall ${recall.toFixed(2)}`;
    return { pass: f1 >= F1_PASS_THRESHOLD, score: f1, details };
  },
};

export const dependenciesScorers: DependenciesScorer[] = [
  schemaValid,
  refsKnown,
  noCycles,
  mustNotBlockRespected,
  blockersF1,
];
