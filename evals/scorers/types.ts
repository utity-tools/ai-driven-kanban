/** The outcome of one scorer on one case: `score` is 0..1, `pass` is the scorer's own verdict. */
export type ScoreResult = { pass: boolean; score: number; details?: string };

/**
 * A scorer judges one model output against what the case expects. It is async on
 * purpose: deterministic scorers resolve immediately, but an LLM-as-judge scorer
 * (see evals/README.md) has to call a model, and the runner awaits both the same way.
 */
export type Scorer<I, O, E> = {
  name: string;
  score(ctx: { input: I; output: O; expected: E }): Promise<ScoreResult>;
};

export const PASS: ScoreResult = { pass: true, score: 1 };

export function fail(details: string): ScoreResult {
  return { pass: false, score: 0, details };
}
