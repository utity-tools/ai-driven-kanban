import { Output, type LanguageModel, streamText } from "ai";

// No `import "server-only"`, for the same reason as decompose.ts: the model is a
// parameter and nothing here touches cookies or the session, so Vitest can drive
// it with a mock model. The real call happens only in a Route Handler.

import {
  buildDependenciesUserMessage,
  DEPENDENCIES_SYSTEM_PROMPT,
  type PromptCandidate,
  PROMPT_VERSION,
} from "./prompts/dependencies-v1";
import { dependencyProposalSchema } from "./schemas";
import { type AiCallResult, trackCall } from "./track-call";

/** Upper bound on generated tokens per call: ten short rationales fit in ~500. */
export const MAX_DEPENDENCY_OUTPUT_TOKENS = 1024;

export type CardForDependencies = {
  title: string;
  description: string | null;
  columnTitle: string;
};

/**
 * Streams a proposal of the cards that block `target`. `model` is injected
 * (use `getDecompositionModel()` from ./decompose in production, a mock in
 * tests). `candidates` must be in the order later passed to `proposeDependencies`
 * (see ./dependency-proposals.ts), which maps the model's "c1"... references back.
 * Nothing here writes to the database.
 */
export function streamDependencySuggestions({
  model,
  target,
  candidates,
  abortSignal,
  onComplete,
}: {
  model: LanguageModel;
  target: CardForDependencies;
  candidates: readonly PromptCandidate[];
  abortSignal?: AbortSignal;
  /** Called exactly once when the call ends, however it ends (see trackCall). */
  onComplete?: (result: AiCallResult) => void;
}) {
  const tracker = trackCall({
    promptVersion: PROMPT_VERSION,
    schema: dependencyProposalSchema,
    itemsKey: "dependencies",
    abortSignal,
    onComplete,
  });

  return streamText({
    model,
    system: DEPENDENCIES_SYSTEM_PROMPT,
    prompt: buildDependenciesUserMessage({ target, candidates }),
    output: Output.object({ schema: dependencyProposalSchema }),
    maxOutputTokens: MAX_DEPENDENCY_OUTPUT_TOKENS,
    abortSignal,
    ...tracker,
  });
}
