import type { LanguageModelUsage, ProviderMetadata } from "ai";
import type { z } from "zod";

import type { AiOutcome } from "@/lib/observability/ai-log";

import { classifyFinished, gatewayCostUsd } from "./outcome";

/** What is known about one AI call once it is over, whatever way it ended. */
export type AiCallResult = {
  outcome: AiOutcome;
  latencyMs: number;
  promptVersion: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  /** Message of the provider/SDK error (outcome "error"), truncated. */
  errorMessage?: string;
};

const MAX_ERROR_MESSAGE_LENGTH = 200;

type FinishEvent = {
  text: string;
  finishReason: string;
  totalUsage: LanguageModelUsage;
  response: { modelId: string };
  providerMetadata: ProviderMetadata | undefined;
};

/**
 * Builds the streamText callbacks that report the end of a call to
 * `onComplete` EXACTLY ONCE. A call can end through several paths that overlap
 * (onError then onFinish for a failed step, onAbort plus the abort signal), so
 * the first one wins and later ones are ignored. `abortSignal` is listened to
 * directly as well because the SDK only invokes onAbort while the consumer is
 * still reading the stream; a disconnected client stops reading.
 * `onComplete` is never allowed to throw into the SDK.
 */
export function trackCall({
  promptVersion,
  schema,
  itemsKey,
  abortSignal,
  onComplete,
}: {
  promptVersion: string;
  schema: z.ZodType;
  itemsKey: string;
  abortSignal?: AbortSignal;
  onComplete?: (result: AiCallResult) => void;
}) {
  const start = performance.now();
  let done = false;

  function complete(result: Omit<AiCallResult, "latencyMs" | "promptVersion">) {
    if (done) return;
    done = true;
    abortSignal?.removeEventListener("abort", onSignalAbort);
    try {
      onComplete?.({
        ...result,
        promptVersion,
        latencyMs: Math.round(performance.now() - start),
      });
    } catch (error) {
      console.error("ai.call.on_complete_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function onSignalAbort() {
    complete({ outcome: "aborted" });
  }
  if (abortSignal?.aborted) queueMicrotask(onSignalAbort);
  else abortSignal?.addEventListener("abort", onSignalAbort, { once: true });

  return {
    onFinish(event: FinishEvent) {
      complete({
        outcome: classifyFinished({
          text: event.text,
          finishReason: event.finishReason,
          schema,
          itemsKey,
        }),
        model: event.response.modelId,
        inputTokens: event.totalUsage.inputTokens,
        outputTokens: event.totalUsage.outputTokens,
        costUsd: gatewayCostUsd(event.providerMetadata),
      });
    },
    onError({ error }: { error: unknown }) {
      const message = error instanceof Error ? error.message : String(error);
      complete({ outcome: "error", errorMessage: message.slice(0, MAX_ERROR_MESSAGE_LENGTH) });
    },
    onAbort() {
      complete({ outcome: "aborted" });
    },
  };
}
