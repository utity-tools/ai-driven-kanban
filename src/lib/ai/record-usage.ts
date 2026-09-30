import { type AiCallEvent, type AiFeature, logAiCall } from "@/lib/observability/ai-log";

import type { AiCallResult } from "./track-call";

/** The slice of a Supabase client used here, so tests can pass a fake. */
export type UsageRecorder = {
  rpc(
    fn: "record_ai_usage",
    args: {
      p_usage_id: string;
      p_outcome: string;
      p_latency_ms?: number;
      p_prompt_version?: string;
      p_model?: string;
      p_input_tokens?: number;
      p_output_tokens?: number;
      p_actual_cost_usd?: number;
    },
  ): PromiseLike<{ error: { code?: string; message: string } | null }>;
};

/**
 * Emits the ai.call log event and completes the reserved usage row. A failed
 * record (including AIU01: already completed, too old or not the caller's row)
 * is logged and swallowed: observability must never break a response. The log
 * carries the error code and message only, never user text.
 */
export async function recordAiCall({
  supabase,
  usageId,
  requestId,
  feature,
  result,
}: {
  supabase: UsageRecorder;
  usageId: string;
  requestId: string;
  feature: AiFeature;
  result: AiCallResult;
}): Promise<void> {
  const { errorMessage, ...metrics } = result;
  const event: AiCallEvent = { requestId, feature, ...metrics };
  if (errorMessage !== undefined) event.errorMessage = errorMessage;
  logAiCall(event);

  try {
    const { error } = await supabase.rpc("record_ai_usage", {
      p_usage_id: usageId,
      p_outcome: result.outcome,
      p_latency_ms: result.latencyMs,
      p_prompt_version: result.promptVersion,
      p_model: result.model,
      p_input_tokens: result.inputTokens,
      p_output_tokens: result.outputTokens,
      p_actual_cost_usd: result.costUsd,
    });
    if (error) {
      console.error("ai.usage.record_failed", { requestId, feature, code: error.code });
    }
  } catch (error) {
    console.error("ai.usage.record_failed", {
      requestId,
      feature,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Bridges the SDK callback (fires while the stream is consumed) to work that
 * must be scheduled up front with `after()`: `onComplete` resolves the slot,
 * `wait` resolves with the result, or null if none arrives within `timeoutMs`.
 */
export function createCompletionSlot() {
  let resolve!: (result: AiCallResult) => void;
  const promise = new Promise<AiCallResult>((r) => {
    resolve = r;
  });
  return {
    onComplete: resolve,
    async wait(timeoutMs: number): Promise<AiCallResult | null> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<null>((r) => {
        timer = setTimeout(() => r(null), timeoutMs);
      });
      try {
        return await Promise.race([promise, timeout]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
