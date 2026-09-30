import type { LanguageModelUsage, ProviderMetadata } from "ai";

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
  // AI Gateway reports the cost of the call as a string in its provider metadata.
  const cost = Number(
    (metadata.status === "fulfilled" ? metadata.value?.gateway?.cost : undefined) ?? NaN,
  );
  return {
    output: output.status === "fulfilled" ? output.value : null,
    raw: text.status === "fulfilled" ? text.value : "",
    error: output.status === "rejected" ? errorMessage(output.reason) : undefined,
    usage: usage.status === "fulfilled" ? usage.value : NO_USAGE,
    cost: Number.isFinite(cost) ? cost : undefined,
  };
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
