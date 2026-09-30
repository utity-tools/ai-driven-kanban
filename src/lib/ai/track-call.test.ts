import { describe, expect, it, vi } from "vitest";

import { failingModel, hangingModel, textModel } from "../../../tests/helpers/mock-models";
import { streamDecomposition } from "./decompose";
import { streamDependencySuggestions } from "./suggest-dependencies";
import type { AiCallResult } from "./track-call";

type Run = (
  model: ReturnType<typeof textModel>,
  extra?: { abortSignal?: AbortSignal; onComplete: (r: AiCallResult) => void },
) => { consumeStream: (o?: { onError?: (e: unknown) => void }) => PromiseLike<void> };

const features: { name: string; valid: string; empty: string; run: Run }[] = [
  {
    name: "streamDecomposition",
    valid: JSON.stringify({ subtasks: [{ title: "Write the migration", estimate: 3 }] }),
    empty: JSON.stringify({ subtasks: [] }),
    run: (model, extra) =>
      streamDecomposition({
        model,
        card: { title: "SECRET TITLE", description: "SECRET DESC", existingSubtasks: [] },
        ...extra,
      }),
  },
  {
    name: "streamDependencySuggestions",
    valid: JSON.stringify({ dependencies: [{ blocker: "c1", rationale: "Needs the API." }] }),
    empty: JSON.stringify({ dependencies: [] }),
    run: (model, extra) =>
      streamDependencySuggestions({
        model,
        target: { title: "SECRET TITLE", description: "SECRET DESC", columnTitle: "Doing" },
        candidates: [{ title: "Search API", columnTitle: "To do", done: false }],
        ...extra,
      }),
  },
];

describe.each(features)("$name onComplete", ({ valid, empty, run }) => {
  async function drain(
    model: ReturnType<typeof textModel>,
    abortSignal?: AbortSignal,
  ): Promise<AiCallResult[]> {
    const calls: AiCallResult[] = [];
    await run(model, { abortSignal, onComplete: (r) => calls.push(r) }).consumeStream({
      onError: () => {},
    });
    return calls;
  }

  it("reports ok once, with model, tokens, cost and prompt version", async () => {
    const calls = await drain(textModel(valid, "0.0012"));
    expect(calls).toHaveLength(1);
    expect(calls[0]!).toMatchObject({
      outcome: "ok",
      model: "mock/model",
      inputTokens: 10,
      outputTokens: 20,
      costUsd: 0.0012,
    });
    expect(calls[0]!.promptVersion).toMatch(/\S/);
    expect(calls[0]!.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("reports empty for a valid empty list", async () => {
    const calls = await drain(textModel(empty));
    expect(calls.map((c) => c.outcome)).toEqual(["empty"]);
  });

  it("reports invalid for text that is not JSON", async () => {
    const calls = await drain(textModel("not json at all"));
    expect(calls.map((c) => c.outcome)).toEqual(["invalid"]);
  });

  it("reports invalid for JSON that fails the schema", async () => {
    const calls = await drain(textModel('{"wrong": true}'));
    expect(calls.map((c) => c.outcome)).toEqual(["invalid"]);
  });

  it("reports error once for a provider error, with the message only", async () => {
    const calls = await drain(failingModel("gateway exploded"));
    expect(calls).toHaveLength(1);
    expect(calls[0]!).toMatchObject({ outcome: "error", errorMessage: "gateway exploded" });
    expect(JSON.stringify(calls[0]!)).not.toContain("SECRET");
  });

  it("reports aborted once when the request is aborted mid-stream", async () => {
    const controller = new AbortController();
    const done = drain(hangingModel(), controller.signal);
    setTimeout(() => controller.abort(), 10);
    const calls = await done;
    expect(calls.map((c) => c.outcome)).toEqual(["aborted"]);
  });

  it("does not report twice when the signal aborts after the call finished", async () => {
    const controller = new AbortController();
    const calls = await drain(textModel(valid), controller.signal);
    controller.abort();
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toHaveLength(1);
  });

  it("never lets a throwing onComplete break the stream", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = run(textModel(valid), {
      onComplete: () => {
        throw new Error("record failed");
      },
    });
    await expect(result.consumeStream({ onError: () => {} })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("ai.call.on_complete_failed", expect.anything());
    error.mockRestore();
  });
});
