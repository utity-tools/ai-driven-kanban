import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";

import { MAX_DECOMPOSITION_OUTPUT_TOKENS, streamDecomposition } from "./decompose";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};

function jsonChunks(json: string) {
  return json.split("").map((char) => ({ type: "text-delta" as const, id: "text-1", delta: char }));
}

function mockModel(json: string) {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "text-1" },
          ...jsonChunks(json),
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

describe("streamDecomposition", () => {
  it("streams a proposal that validates against the schema", async () => {
    const proposal = {
      subtasks: [
        { title: "Add migration for card_subtasks", estimate: 3 },
        { title: "Expose the decompose route", estimate: null },
      ],
    };

    const result = streamDecomposition({
      model: mockModel(JSON.stringify(proposal)),
      card: {
        title: "Subtask checklist",
        description: "Let users check off subtasks.",
        existingSubtasks: [],
      },
    });

    await expect(result.output).resolves.toEqual(proposal);
  });

  it("rejects a proposal with more than 8 subtasks", async () => {
    const proposal = {
      subtasks: Array.from({ length: 9 }, (_, i) => ({ title: `Subtask ${i}`, estimate: null })),
    };

    const result = streamDecomposition({
      model: mockModel(JSON.stringify(proposal)),
      card: { title: "Too many subtasks", description: null, existingSubtasks: [] },
    });

    await expect(result.output).rejects.toThrow();
  });

  it("caps the output tokens of every call", async () => {
    const model = mockModel(JSON.stringify({ subtasks: [{ title: "Only one", estimate: 1 }] }));

    const result = streamDecomposition({
      model,
      card: { title: "Cap", description: null, existingSubtasks: [] },
    });
    await result.output;

    expect(model.doStreamCalls[0]?.maxOutputTokens).toBe(MAX_DECOMPOSITION_OUTPUT_TOKENS);
  });
});
