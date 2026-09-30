import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDecompositionModel } from "@/lib/ai/decompose";
import { dependencySuggestAvailability } from "@/lib/ai/dependency-review";
import {
  CANDIDATE_IDS_HEADER,
  dependencyCandidates,
  encodeCandidateIds,
  promptCandidates,
} from "@/lib/ai/dependency-proposals";
import {
  QUOTA_EXCEEDED_MESSAGES,
  QUOTA_REMAINING_HEADER,
  parseReservation,
  quotaExceededKind,
  secondsUntilQuotaReset,
} from "@/lib/ai/quota";
import { streamDependencySuggestions } from "@/lib/ai/suggest-dependencies";
import { getBoardView } from "@/lib/boards/queries";
import { scheduleAiUsageRecord } from "@/lib/ai/schedule-usage";
import { createClient } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";

const cardIdSchema = z.uuid();

/**
 * Streams an AI proposal of the cards that block a card. Nothing is persisted
 * here: the client reviews the streamed proposal and a separate confirmation
 * step saves what the user keeps. Candidates are built server-side from the
 * database; their ids (in the order the model saw them) go back in the
 * X-Candidate-Ids header so the client can map the model's references. Every
 * call first reserves one unit of the caller's daily quota (ADR 0016).
 */
export async function POST(
  request: Request,
  context: RouteContext<"/api/cards/[cardId]/dependencies/suggest">,
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
    .select("board_id")
    .eq("id", parsedCardId.data)
    .maybeSingle();
  if (error) {
    console.error("ai.dependencies.card_fetch_failed", { error });
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
  // RLS makes "doesn't exist" and "not visible to this user" indistinguishable, on purpose.
  if (!card) return Response.json({ error: "Card not found." }, { status: 404 });

  const { data: canEdit, error: roleError } = await supabase.rpc("has_board_role", {
    p_board_id: card.board_id,
    p_roles: ["owner", "editor"],
  });
  if (roleError) {
    console.error("ai.dependencies.role_check_failed", { error: roleError });
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
  if (!canEdit) {
    return Response.json(
      { error: "Only owners and editors can use AI suggestions." },
      { status: 403 },
    );
  }

  // Everything below is checked before reserving quota: a request that can't
  // produce a proposal must not cost the caller a unit.
  let view;
  try {
    view = await getBoardView(card.board_id);
  } catch (viewError) {
    console.error("ai.dependencies.board_fetch_failed", { error: viewError });
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
  const column = view?.columns.find((c) => c.cards.some((item) => item.id === parsedCardId.data));
  const target = column?.cards.find((item) => item.id === parsedCardId.data);
  // Archived cards aren't in any column of the view.
  if (!view || !column || !target) {
    return Response.json({ error: "Archived cards can't get AI suggestions." }, { status: 409 });
  }

  const candidates = promptCandidates(dependencyCandidates(view, target.id));
  const blockerCount = view.dependencies.filter((edge) => edge.blockedId === target.id).length;
  const availability = dependencySuggestAvailability({
    featureEnabled: true,
    editable: true,
    archived: false,
    candidateCount: candidates.length,
    blockerCount,
  });
  if (availability === "hidden") {
    return Response.json(
      {
        error:
          candidates.length === 0
            ? "There are no other cards that could block this one."
            : "This card already has the maximum number of blockers.",
      },
      { status: 409 },
    );
  }

  // Charged before the model is called, so failed or stopped calls count too.
  const { data: reserved, error: quotaError } = await supabase
    .rpc("reserve_ai_decomposition", { p_feature: "dependencies" })
    .single();
  if (quotaError) {
    const exceeded = quotaExceededKind(quotaError.code);
    if (exceeded) {
      return Response.json(
        { error: QUOTA_EXCEEDED_MESSAGES[exceeded] },
        { status: 429, headers: { "Retry-After": String(secondsUntilQuotaReset(new Date())) } },
      );
    }
    console.error("ai.dependencies.quota_failed", { error: quotaError });
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
  const quota = parseReservation(reserved);
  if (!quota) {
    console.error("ai.dependencies.quota_failed", { error: "Unexpected reservation shape." });
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }

  // One id per call correlates its logs; the usage id stays server-side.
  const requestId = crypto.randomUUID();
  const onComplete = scheduleAiUsageRecord({
    supabase,
    usageId: quota.usageId,
    requestId,
    feature: "dependencies",
  });

  const result = streamDependencySuggestions({
    model: getDecompositionModel(),
    target: { title: target.title, description: target.description, columnTitle: column.title },
    candidates,
    // Closing the review stops generation, so an abandoned request stops costing tokens.
    abortSignal: request.signal,
    onComplete,
  });
  return result.toTextStreamResponse({
    headers: {
      [QUOTA_REMAINING_HEADER]: String(quota.remaining),
      [CANDIDATE_IDS_HEADER]: encodeCandidateIds(candidates),
    },
  });
}
