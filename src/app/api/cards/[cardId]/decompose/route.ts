import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDecompositionModel, streamDecomposition } from "@/lib/ai/decompose";
import { createClient } from "@/lib/db/server";

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
    .select("title, description")
    .eq("id", parsedCardId.data)
    .maybeSingle();
  if (error) {
    console.error("ai.decompose.card_fetch_failed", { error });
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
  // RLS makes "doesn't exist" and "not visible to this user" indistinguishable, on purpose.
  if (!card) return Response.json({ error: "Card not found." }, { status: 404 });

  const result = streamDecomposition({
    model: getDecompositionModel(),
    card,
    // Closing the review stops generation, so an abandoned request stops costing tokens.
    abortSignal: request.signal,
  });
  return result.toTextStreamResponse();
}
