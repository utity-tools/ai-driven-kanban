import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDecompositionModel, streamDecomposition } from "@/lib/ai/decompose";
import { createClient } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";

const cardIdSchema = z.uuid();

/**
 * Streams an AI subtask decomposition proposal for a card. Nothing is
 * persisted here: the client reviews the streamed proposal and a later,
 * separate confirmation step (delivery 4) saves what the user keeps.
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
  // Demo (anonymous) users get a decomposition quota in delivery 5; for now they
  // are denied outright so the AI Gateway is never called on their behalf.
  if (user.isAnonymous) {
    return Response.json(
      { error: "AI decomposition isn't available for demo users." },
      { status: 403 },
    );
  }

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

  const result = streamDecomposition({
    model: getDecompositionModel(),
    card: { title: card.title, description: card.description },
    // Closing the review stops generation, so an abandoned request stops costing tokens.
    abortSignal: request.signal,
  });
  return result.toTextStreamResponse();
}
