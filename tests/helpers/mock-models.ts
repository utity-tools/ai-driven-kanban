import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};

/** A model that streams `text` char by char and finishes normally. */
export function textModel(text: string, gatewayCost?: string) {
  return new MockLanguageModelV3({
    modelId: "mock/model",
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "text-1" },
          ...text
            .split("")
            .map((char) => ({ type: "text-delta" as const, id: "text-1", delta: char })),
          { type: "text-end", id: "text-1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: undefined },
            logprobs: undefined,
            usage,
            ...(gatewayCost ? { providerMetadata: { gateway: { cost: gatewayCost } } } : {}),
          },
        ],
      }),
    }),
  });
}

/** A model whose stream fails with a provider error. */
export function failingModel(message: string) {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [{ type: "error", error: new Error(message) }],
      }),
    }),
  });
}

/** A model that never produces output until the request is aborted. */
export function hangingModel() {
  return new MockLanguageModelV3({
    doStream: async ({ abortSignal }) => ({
      stream: new ReadableStream({
        start(controller) {
          abortSignal?.addEventListener("abort", () =>
            controller.error(new DOMException("aborted", "AbortError")),
          );
        },
      }),
    }),
  });
}
