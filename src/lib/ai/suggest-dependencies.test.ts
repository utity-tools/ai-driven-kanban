import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";

import { MAX_DEPENDENCY_OUTPUT_TOKENS, streamDependencySuggestions } from "./suggest-dependencies";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};

function mockModel(json: string) {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "text-1" },
          ...json
            .split("")
            .map((char) => ({ type: "text-delta" as const, id: "text-1", delta: char })),
          { type: "text-end", id: "text-1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: undefined },
            logprobs: undefined,
            usage,
          },
        ],
      }),
    }),
  });
}

const target = { title: "Search UI", description: null, columnTitle: "Doing" };
const candidates = [{ title: "Search API", columnTitle: "To do", done: false }];

describe("streamDependencySuggestions", () => {
  it("streams a proposal that validates against the schema", async () => {
    const proposal = { dependencies: [{ blocker: "c1", rationale: "The UI calls the API." }] };
    const result = streamDependencySuggestions({
      model: mockModel(JSON.stringify(proposal)),
      target,
      candidates,
    });
    await expect(result.output).resolves.toEqual(proposal);
  });

  it("accepts an empty proposal", async () => {
    const result = streamDependencySuggestions({
      model: mockModel(JSON.stringify({ dependencies: [] })),
      target,
      candidates,
    });
    await expect(result.output).resolves.toEqual({ dependencies: [] });
  });

  it("rejects a proposal with more than 10 blockers", async () => {
    const dependencies = Array.from({ length: 11 }, (_, i) => ({
      blocker: `c${i + 1}`,
      rationale: "why",
    }));
    const result = streamDependencySuggestions({
      model: mockModel(JSON.stringify({ dependencies })),
      target,
      candidates,
    });
    await expect(result.output).rejects.toThrow();
  });

  it("caps the output tokens and sends the candidates in the prompt", async () => {
    const model = mockModel(JSON.stringify({ dependencies: [] }));
    const result = streamDependencySuggestions({ model, target, candidates });
    await result.output;
    const call = model.doStreamCalls[0];
    expect(call?.maxOutputTokens).toBe(MAX_DEPENDENCY_OUTPUT_TOKENS);
    expect(JSON.stringify(call?.prompt)).toContain("c1 | column: To do | open | Search API");
  });
});
