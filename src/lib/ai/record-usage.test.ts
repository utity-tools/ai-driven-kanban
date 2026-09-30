import { afterEach, describe, expect, it, vi } from "vitest";

import { createCompletionSlot, recordAiCall } from "./record-usage";
import type { AiCallResult } from "./track-call";

const result: AiCallResult = {
  outcome: "ok",
  latencyMs: 900,
  promptVersion: "decompose-v2",
  model: "m",
  inputTokens: 1,
  outputTokens: 2,
  costUsd: 0.01,
};
const base = { usageId: "u-1", requestId: "r-1", feature: "decompose" as const, result };

afterEach(() => vi.restoreAllMocks());

describe("recordAiCall", () => {
  it("logs the event and completes the usage row", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await recordAiCall({ supabase: { rpc }, ...base });
    expect(info).toHaveBeenCalledWith(
      "ai.call",
      expect.objectContaining({ requestId: "r-1", outcome: "ok" }),
    );
    expect(rpc).toHaveBeenCalledWith("record_ai_usage", {
      p_usage_id: "u-1",
      p_outcome: "ok",
      p_latency_ms: 900,
      p_prompt_version: "decompose-v2",
      p_model: "m",
      p_input_tokens: 1,
      p_output_tokens: 2,
      p_actual_cost_usd: 0.01,
    });
  });

  it("logs and swallows a failed record (AIU01)", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn().mockResolvedValue({ error: { code: "AIU01", message: "x" } });
    await expect(recordAiCall({ supabase: { rpc }, ...base })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("ai.usage.record_failed", {
      requestId: "r-1",
      feature: "decompose",
      code: "AIU01",
    });
  });

  it("swallows a thrown rpc", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn().mockRejectedValue(new Error("network"));
    await expect(recordAiCall({ supabase: { rpc }, ...base })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      "ai.usage.record_failed",
      expect.objectContaining({ message: "network" }),
    );
  });
});

describe("createCompletionSlot", () => {
  it("resolves with the reported result", async () => {
    const slot = createCompletionSlot();
    slot.onComplete(result);
    await expect(slot.wait(50)).resolves.toBe(result);
  });

  it("resolves null when nothing is reported in time", async () => {
    await expect(createCompletionSlot().wait(10)).resolves.toBeNull();
  });
});
