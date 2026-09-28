import { z } from "zod";

import { estimateSchema } from "@/lib/subtasks/schemas";

/** Hard cap on how many subtasks a single decomposition proposes. */
export const MAX_PROPOSED_SUBTASKS = 8;

const proposedSubtaskTitleSchema = z
  .string({ error: "Invalid subtask title." })
  .trim()
  .min(1, { error: "Subtask titles can't be empty." })
  .max(200, { error: "Subtask titles can be at most 200 characters." });

/** One AI-proposed subtask: a title and a Fibonacci estimate, or no estimate. */
export const proposedSubtaskSchema = z.object({
  title: proposedSubtaskTitleSchema,
  estimate: estimateSchema,
});

export type ProposedSubtask = z.infer<typeof proposedSubtaskSchema>;

/**
 * The shape the model must return: a proposal, never persisted directly (the
 * user reviews and confirms each subtask before it is saved).
 */
export const decompositionProposalSchema = z.object({
  subtasks: z
    .array(proposedSubtaskSchema)
    .min(1, { error: "Propose at least one subtask." })
    .max(MAX_PROPOSED_SUBTASKS, {
      error: `Propose at most ${MAX_PROPOSED_SUBTASKS} subtasks.`,
    }),
});

export type DecompositionProposal = z.infer<typeof decompositionProposalSchema>;

/**
 * What the review screen sends to save the subtasks the user kept (and may
 * have edited): the same limits as a proposal. `boardId` only tells the action
 * which board to revalidate; the database derives the board from the card.
 */
export const acceptProposalSchema = z.object({
  boardId: z.uuid({ error: "Invalid board." }),
  cardId: z.uuid({ error: "Invalid card." }),
  subtasks: decompositionProposalSchema.shape.subtasks,
});

export type AcceptProposalInput = z.input<typeof acceptProposalSchema>;
