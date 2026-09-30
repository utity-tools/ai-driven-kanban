import type { LanguageModel, LanguageModelUsage } from "ai";

import type { Scorer } from "./scorers/types";

/** One dataset entry: what the app would send, and what a good answer looks like. */
export type EvalCase<I, E> = {
  id: string;
  /** What this case is meant to catch (shown in reports). */
  description: string;
  input: I;
  expected: E;
};

/**
 * One AI feature under evaluation. `run` must go through the same code the app
 * uses (prompt builder, schema, post-filtering); the runner only supplies the model.
 */
export type Feature<I, O, E> = {
  name: string;
  promptVersion: string;
  cases: EvalCase<I, E>[];
  scorers: Scorer<I, O, E>[];
  run(
    input: I,
    model: LanguageModel,
  ): Promise<{ output: O; usage: LanguageModelUsage; cost?: number }>;
  /** Deterministic fixture model for `--mock`: answers a case like a well-behaved model. */
  mockModel(evalCase: EvalCase<I, E>): LanguageModel;
};
