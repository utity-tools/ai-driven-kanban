import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDecompositionModel, streamDecomposition } from "@/lib/ai/decompose";
import { PROMPT_VERSION } from "@/lib/ai/prompts/decompose-v2";
import {
  QUOTA_EXCEEDED_MESSAGES,
  QUOTA_REMAINING_HEADER,
  parseReservation,
  quotaExceededKind,
  secondsUntilQuotaReset,
} from "@/lib/ai/quota";
import { scheduleAiUsageRecord } from "@/lib/ai/schedule-usage";
import { createClient } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";

const cardIdSchema = z.uuid();

/**
 * Streams an AI subtask decomposition proposal for a card. Nothing is
 * persisted here: the client reviews the streamed proposal and a separate
 * confirmation step (acceptAiSubtasks) saves what the user keeps. Every call
 * first reserves one unit of the caller's daily quota (ADR 0016).
 */
export async function POST(
  request: Request,
  context: RouteContext<"/api/cards/[cardId]/decompose">,
) {
  // Disabled environments behave as if the route didn't exist, before any other work.
  if (!getServerEnv().AI_DECOMPOSITION_ENABLED) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const { cardId } = await context.params;
  const parsedCardId = cardIdSchema.safeParse(cardId);
  if (!parsedCardId.success) {
    return Response.json({ error: "Invalid card." }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createClient();
  const { data: card, error } = await supabase
    .from("cards")
    .select("board_id, title, description")
    .eq("id", parsedCardId.data)
    .maybeSingle();
  if (error) {
    console.error("ai.decompose.card_fetch_failed", { error });
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
  // RLS makes "doesn't exist" and "not visible to this user" indistinguishable, on purpose.
  if (!card) return Response.json({ error: "Card not found." }, { status: 404 });

  // Seeing a card isn't enough: only those who can save the proposal (owners and
  // editors) may spend model tokens on it. Viewers already know the card exists.
  const { data: canEdit, error: roleError } = await supabase.rpc("has_board_role", {
    p_board_id: card.board_id,
    p_roles: ["owner", "editor"],
  });
  if (roleError) {
    console.error("ai.decompose.role_check_failed", { error: roleError });
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
  if (!canEdit) {
    return Response.json(
      { error: "Only owners and editors can use AI decomposition." },
      { status: 403 },
    );
  }

  // Charged before the model is called, so failed or stopped calls count too: the
  // database enforces the per-user daily limit (smaller for demo users) and the
  // global daily cost cap, atomically.
  const { data: reserved, error: quotaError } = await supabase
    .rpc("reserve_ai_decomposition", { p_feature: "decompose" })
    .single();
  if (quotaError) {
    const exceeded = quotaExceededKind(quotaError.code);
    if (exceeded) {
      return Response.json(
        { error: QUOTA_EXCEEDED_MESSAGES[exceeded] },
        { status: 429, headers: { "Retry-After": String(secondsUntilQuotaReset(new Date())) } },
      );
    }
    console.error("ai.decompose.quota_failed", { error: quotaError });
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
  const quota = parseReservation(reserved);
  if (!quota) {
    console.error("ai.decompose.quota_failed", { error: "Unexpected reservation shape." });
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }

  // One id per call correlates its logs; the usage id stays server-side. Scheduled right
  // after the reservation so every reserved row is completed, even on the error path below.
  const requestId = crypto.randomUUID();
  const onComplete = scheduleAiUsageRecord({
    supabase,
    usageId: quota.usageId,
    requestId,
    feature: "decompose",
  });

  // Existing subtasks go in the prompt so a second run proposes the remaining work. All of
  // them (at most 100 per card): the prompt caps how many it shows and counts the rest.
  const { data: subtasks, error: subtasksError } = await supabase
    .from("card_subtasks")
    .select("title")
    .eq("card_id", parsedCardId.data)
    .order("position");
  if (subtasksError) {
    console.error("ai.decompose.subtasks_fetch_failed", { requestId, error: subtasksError });
    // The model was never called: completed as an error with no tokens or cost.
    onComplete({ outcome: "error", latencyMs: 0, promptVersion: PROMPT_VERSION, costUsd: 0 });
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }

  const result = streamDecomposition({
    model: getDecompositionModel(),
    card: {
      title: card.title,
      description: card.description,
      existingSubtasks: subtasks.map((subtask) => subtask.title),
    },
    // Closing the review stops generation, so an abandoned request stops costing tokens.
    abortSignal: request.signal,
    onComplete,
  });
  return result.toTextStreamResponse({
    headers: { [QUOTA_REMAINING_HEADER]: String(quota.remaining) },
  });
}
