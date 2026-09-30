import type { LanguageModelUsage, ProviderMetadata } from "ai";

import { gatewayCostUsd } from "@/lib/ai/outcome";

/** The parts of a `streamText` result the evals read. */
type StreamResult<T> = {
  output: PromiseLike<T>;
  text: PromiseLike<string>;
  usage: PromiseLike<LanguageModelUsage>;
  providerMetadata: PromiseLike<ProviderMetadata | undefined>;
};

const NO_USAGE = {
  inputTokens: undefined,
  outputTokens: undefined,
  totalTokens: undefined,
} as LanguageModelUsage;

/**
 * Drains a streamed result without throwing: a schema mismatch or provider error
 * becomes `output: null` plus `error`, so the scorers can report it as a failure.
 */
export async function collect<T>(result: StreamResult<T>) {
  const [output, text, usage, metadata] = await Promise.allSettled([
    result.output,
    result.text,
    result.usage,
    result.providerMetadata,
  ]);
  const cost = gatewayCostUsd(metadata.status === "fulfilled" ? metadata.value : undefined);
  return {
    output: output.status === "fulfilled" ? output.value : null,
    raw: text.status === "fulfilled" ? text.value : "",
    error: output.status === "rejected" ? errorMessage(output.reason) : undefined,
    usage: usage.status === "fulfilled" ? usage.value : NO_USAGE,
    cost,
  };
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
