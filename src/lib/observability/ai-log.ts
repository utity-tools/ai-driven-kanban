/*
 * One structured log event per AI call (v0.4 observability). The event carries
 * only metadata: ids, model, tokens, cost, latency and the outcome. Never the
 * prompt, the model output or any card text (user text is untrusted and
 * private), so it is safe to ship to any log drain.
 */

export const AI_OUTCOMES = ["ok", "empty", "invalid", "error", "aborted"] as const;
export type AiOutcome = (typeof AI_OUTCOMES)[number];

export type AiFeature = "decompose" | "dependencies";

export type AiCallEvent = {
  /** Correlates every log line of one request. */
  requestId: string;
  feature: AiFeature;
  promptVersion: string;
  model?: string;
  outcome: AiOutcome;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Real cost in USD as reported by the gateway, when available. */
  costUsd?: number;
  /** Provider/SDK error message (outcome "error" only), truncated. Never user text. */
  errorMessage?: string;
};

export const AI_CALL_LOG_NAME = "ai.call";

/**
 * Emits the call event. Provider failures go to `console.error` so log-level
 * filters surface them; everything else, including invalid output, empty
 * results and user aborts, is normal operation and stays `info`. Exactly one
 * event per call: the caller guarantees it (see track-call.ts).
 */
export function logAiCall(event: AiCallEvent): void {
  if (event.outcome === "error") {
    console.error(AI_CALL_LOG_NAME, event);
  } else {
    console.info(AI_CALL_LOG_NAME, event);
  }
}
