import { afterEach, describe, expect, it, vi } from "vitest";

import { type AiCallEvent, logAiCall } from "./ai-log";

const event: AiCallEvent = {
  requestId: "req-1",
  feature: "decompose",
  promptVersion: "decompose-v2",
  model: "anthropic/claude",
  outcome: "ok",
  latencyMs: 1200,
  inputTokens: 100,
  outputTokens: 50,
  costUsd: 0.002,
};

afterEach(() => vi.restoreAllMocks());

describe("logAiCall", () => {
  it("logs one ai.call info event with the metadata as given", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logAiCall(event);
    expect(info).toHaveBeenCalledExactlyOnceWith("ai.call", event);
    expect(error).not.toHaveBeenCalled();
  });

  it.each(["empty", "invalid", "aborted"] as const)("keeps %s at info level", (outcome) => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logAiCall({ ...event, outcome });
    expect(info).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
  });

  it("logs provider errors with console.error, once", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logAiCall({ ...event, outcome: "error", errorMessage: "boom" });
    expect(error).toHaveBeenCalledOnce();
    expect(info).not.toHaveBeenCalled();
  });

  it("only carries metadata fields, never text", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logAiCall(event);
    const logged = info.mock.calls[0]![1] as Record<string, unknown>;
    expect(Object.keys(logged).sort()).toEqual(
      [
        "costUsd",
        "feature",
        "inputTokens",
        "latencyMs",
        "model",
        "outcome",
        "outputTokens",
        "promptVersion",
        "requestId",
      ].sort(),
    );
  });
});
