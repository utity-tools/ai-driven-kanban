import { after } from "next/server";

import type { AiFeature } from "@/lib/observability/ai-log";

import { createCompletionSlot, recordAiCall, type UsageRecorder } from "./record-usage";
import type { AiCallResult } from "./track-call";

/** How long the after() task waits for the call to report its end once the response is done. */
const COMPLETION_WAIT_MS = 5_000;

/**
 * Call from a Route Handler after reserving quota and before starting the
 * stream. It registers an `after()` task (Next runs it once the response has
 * finished, and keeps the invocation alive for it, up to the route's max
 * duration) that logs the call and completes the usage row, and returns the
 * `onComplete` to hand to streamDecomposition / streamDependencySuggestions.
 * `after()` is registered here, in request scope, and not from inside the SDK
 * callback, which fires later while the stream is consumed.
 */
export function scheduleAiUsageRecord({
  supabase,
  usageId,
  requestId,
  feature,
}: {
  supabase: UsageRecorder;
  usageId: string;
  requestId: string;
  feature: AiFeature;
}): (result: AiCallResult) => void {
  const slot = createCompletionSlot();
  after(async () => {
    const result = await slot.wait(COMPLETION_WAIT_MS);
    if (!result) {
      console.error("ai.call.incomplete", { requestId, feature });
      return;
    }
    await recordAiCall({ supabase, usageId, requestId, feature, result });
  });
  return slot.onComplete;
}
