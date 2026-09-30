import { Output, type LanguageModel, streamText } from "ai";

import { getServerEnv } from "@/lib/env";

// No `import "server-only"` here (unlike src/lib/db/server.ts, src/lib/boards/queries.ts,
// etc.): this module takes its model as a parameter and touches no cookies/session, so it
// stays importable from Vitest with a mock model (see decompose.test.ts). The only actual
// model call happens in the route handler (src/app/api/cards/[cardId]/decompose/route.ts),
// which is a Route Handler and therefore always server-side.

import {
  buildDecomposeUserMessage,
  DECOMPOSE_SYSTEM_PROMPT,
  PROMPT_VERSION,
} from "./prompts/decompose-v3";
import { decompositionProposalSchema } from "./schemas";
import { type AiCallResult, trackCall } from "./track-call";

/**
 * Upper bound on generated tokens per call: eight short subtasks fit in a few
 * hundred, so this only bites if the model runs away, capping the cost of one call.
 */
export const MAX_DECOMPOSITION_OUTPUT_TOKENS = 1024;

export type CardForDecomposition = {
  title: string;
  description: string | null;
  /** Titles of the card's current subtasks, in checklist order. */
  existingSubtasks: readonly string[];
};

/** The AI Gateway model string used when the caller doesn't inject one (e.g. in tests). */
export function getDecompositionModel(): LanguageModel {
  return getServerEnv().AI_MODEL;
}

/**
 * Streams a subtask decomposition proposal for a card. `model` is injected so
 * callers (and tests) can pass a mock; production code should use
 * `getDecompositionModel()`. Nothing here writes to the database: the caller
 * turns the result into a review UI, and the user decides what to keep.
 */
export function streamDecomposition({
  model,
  card,
  abortSignal,
  onComplete,
}: {
  model: LanguageModel;
  card: CardForDecomposition;
  abortSignal?: AbortSignal;
  /** Called exactly once when the call ends, however it ends (see trackCall). */
  onComplete?: (result: AiCallResult) => void;
}) {
  const tracker = trackCall({
    promptVersion: PROMPT_VERSION,
    schema: decompositionProposalSchema,
    itemsKey: "subtasks",
    abortSignal,
    onComplete,
  });

  return streamText({
    model,
    system: DECOMPOSE_SYSTEM_PROMPT,
    prompt: buildDecomposeUserMessage(card),
    output: Output.object({ schema: decompositionProposalSchema }),
    maxOutputTokens: MAX_DECOMPOSITION_OUTPUT_TOKENS,
    abortSignal,
    ...tracker,
  });
}
