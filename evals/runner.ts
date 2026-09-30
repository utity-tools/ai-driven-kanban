import type { LanguageModel } from "ai";

import type { ScoreResult } from "./scorers/types";
import type { EvalCase, Feature } from "./types";

export type CaseResult = {
  id: string;
  description: string;
  input: unknown;
  expected: unknown;
  output: unknown;
  scores: Record<string, ScoreResult>;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  /** USD, when the provider reports it. */
  cost?: number;
  /** The model call itself crashed (not a schema failure, which the scorers report). */
  error?: string;
};

export type EvalReport = {
  feature: string;
  promptVersion: string;
  model: string;
  mock: boolean;
  startedAt: string;
  cases: CaseResult[];
};

/** Runs one case: the model call, then every scorer. Never throws: failures are recorded. */
async function runCase<I, O, E>(
  feature: Feature<I, O, E>,
  evalCase: EvalCase<I, E>,
  model: LanguageModel,
): Promise<CaseResult> {
  const base = { id: evalCase.id, description: evalCase.description };
  const start = performance.now();
  let run: Awaited<ReturnType<Feature<I, O, E>["run"]>>;
  try {
    run = await feature.run(evalCase.input, model);
  } catch (error) {
    return {
      ...base,
      input: evalCase.input,
      expected: evalCase.expected,
      output: null,
      scores: {},
      latencyMs: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const latencyMs = Math.round(performance.now() - start);

  const scores: Record<string, ScoreResult> = {};
  for (const scorer of feature.scorers) {
    try {
      scores[scorer.name] = await scorer.score({
        input: evalCase.input,
        output: run.output,
        expected: evalCase.expected,
      });
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      scores[scorer.name] = { pass: false, score: 0, details: `scorer crashed: ${details}` };
    }
  }
  return {
    ...base,
    input: evalCase.input,
    expected: evalCase.expected,
    output: run.output,
    scores,
    latencyMs,
    inputTokens: run.usage.inputTokens,
    outputTokens: run.usage.outputTokens,
    cost: run.cost,
  };
}

/** Runs a feature's cases one after another (keeps latency numbers honest and rate limits calm). */
export async function runFeature<I, O, E>(
  feature: Feature<I, O, E>,
  options: {
    /** The model for a case; `--mock` passes the feature's fixture model. */
    model: (evalCase: EvalCase<I, E>) => LanguageModel;
    modelName: string;
    mock: boolean;
    caseId?: string;
  },
): Promise<EvalReport> {
  const selected = feature.cases.filter((c) => !options.caseId || c.id === options.caseId);
  const cases: CaseResult[] = [];
  for (const evalCase of selected) {
    cases.push(await runCase(feature, evalCase, options.model(evalCase)));
  }
  return {
    feature: feature.name,
    promptVersion: feature.promptVersion,
    model: options.modelName,
    mock: options.mock,
    startedAt: new Date().toISOString(),
    cases,
  };
}
