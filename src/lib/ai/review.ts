import type { DeepPartial } from "ai";
import { z } from "zod";

import { GENERIC_ERROR } from "@/lib/boards/action-result";
import { positionAfterLast } from "@/lib/boards/positions";
import { normalizeTitle } from "@/lib/boards/schemas";
import { type Estimate, toEstimate } from "@/lib/subtasks/estimates";
import { SUBTASKS_PER_CARD_MAX } from "@/lib/subtasks/schemas";
import type { Subtask } from "@/lib/subtasks/subtask";

import {
  type AcceptProposalInput,
  type DecompositionProposal,
  MAX_PROPOSED_SUBTASKS,
  proposedSubtaskSchema,
} from "./schemas";

/*
 * Pure logic of the AI subtask review (card modal, Subtasks section): who
 * gets the "Suggest with AI" button, turning the streamed (partial) proposal
 * into editable review rows, validating the selection and building the
 * payload of the acceptAiSubtasks Server Action. The UI only renders this.
 */

/**
 * - `hidden`: no button (feature off, not an owner/editor, archived card, full checklist).
 * - `demo`: shown disabled with an explanation (demo users can't use AI yet).
 * - `enabled`: the button works.
 */
export type SuggestAvailability = "hidden" | "demo" | "enabled";

export const DEMO_UNAVAILABLE_MESSAGE =
  "AI suggestions aren't available in the demo. Create a free account to use them.";

export function suggestAvailability(input: {
  /** AI_DECOMPOSITION_ENABLED, passed down from the server as a boolean. */
  featureEnabled: boolean;
  /** Owner or editor on an active (not archived) card. */
  editable: boolean;
  isDemoUser: boolean;
  /** Subtasks the card already has. */
  subtaskCount: number;
}): SuggestAvailability {
  const { featureEnabled, editable, isDemoUser, subtaskCount } = input;
  if (!featureEnabled || !editable || subtaskCount >= SUBTASKS_PER_CARD_MAX) return "hidden";
  return isDemoUser ? "demo" : "enabled";
}

/** A proposed subtask as far as it has streamed: the title may be cut short. */
export type StreamedSubtask = { title: string; estimate: Estimate | null };

/**
 * The subtasks of a partial (still streaming or stopped) proposal, guarding
 * every field: items without a title yet are skipped, an estimate that isn't
 * on the scale (or hasn't arrived) reads as none. Never more than the cap.
 */
export function streamedSubtasks(
  partial: DeepPartial<DecompositionProposal> | undefined,
): StreamedSubtask[] {
  const items = Array.isArray(partial?.subtasks) ? partial.subtasks : [];
  const result: StreamedSubtask[] = [];
  for (const item of items) {
    if (result.length === MAX_PROPOSED_SUBTASKS) break;
    const title = typeof item?.title === "string" ? item.title : "";
    if (!normalizeTitle(title)) continue;
    const estimate = typeof item?.estimate === "number" ? toEstimate(item.estimate) : null;
    result.push({ title, estimate });
  }
  return result;
}

/** One row of the review: checked by default, title and estimate editable. */
export type ReviewItem = {
  /** Stable React key; not sent to the server. */
  key: string;
  checked: boolean;
  title: string;
  estimate: Estimate | null;
};

/** Review rows for the streamed subtasks, all checked (the user unchecks what they don't want). */
export function toReviewItems(
  subtasks: readonly StreamedSubtask[],
  makeKey: () => string,
): ReviewItem[] {
  return subtasks.map((subtask) => ({
    key: makeKey(),
    checked: true,
    title: normalizeTitle(subtask.title),
    estimate: subtask.estimate,
  }));
}

/** Why a title can't be saved, or `null` if it can (same limits as the proposal). */
export function reviewTitleError(title: string): string | null {
  const result = proposedSubtaskSchema.shape.title.safeParse(normalizeTitle(title));
  return result.success ? null : (result.error.issues[0]?.message ?? GENERIC_ERROR);
}

export type ReviewSelection = {
  checkedCount: number;
  /** Whether "Add N subtasks" can be pressed. */
  canSubmit: boolean;
  /** Why it can't, when the reason isn't obvious from the rows (`null` otherwise). */
  problem: string | null;
};

/**
 * Whether the checked rows can be saved: at least one, every checked title
 * valid (unchecked rows don't matter), and room left on the card.
 */
export function reviewSelection(
  items: readonly ReviewItem[],
  existingCount: number,
): ReviewSelection {
  const checked = items.filter((item) => item.checked);
  const checkedCount = checked.length;
  if (checkedCount === 0) {
    return { checkedCount, canSubmit: false, problem: "Select at least one subtask to add." };
  }
  if (checked.some((item) => reviewTitleError(item.title) !== null)) {
    return { checkedCount, canSubmit: false, problem: "Fix the highlighted titles first." };
  }
  const room = Math.max(0, SUBTASKS_PER_CARD_MAX - existingCount);
  if (checkedCount > room) {
    return {
      checkedCount,
      canSubmit: false,
      problem: `A card can have at most ${SUBTASKS_PER_CARD_MAX} subtasks: select at most ${room}.`,
    };
  }
  return { checkedCount, canSubmit: true, problem: null };
}

/** "Add 1 subtask", "Add 3 subtasks". */
export function addSubtasksLabel(count: number): string {
  return `Add ${count} ${count === 1 ? "subtask" : "subtasks"}`;
}

/** The acceptAiSubtasks input: only the checked rows, titles normalised, in review order. */
export function toAcceptPayload(
  boardId: string,
  cardId: string,
  items: readonly ReviewItem[],
): AcceptProposalInput {
  return {
    boardId,
    cardId,
    subtasks: items
      .filter((item) => item.checked)
      .map((item) => ({ title: normalizeTitle(item.title), estimate: item.estimate })),
  };
}

/**
 * Optimistic copies of the accepted subtasks, appended after the existing
 * ones like the accept_ai_subtasks RPC does: each gets one new fractional key
 * after the previous last (nothing is renumbered). The ids are temporary; the
 * fresh board from the Server Action replaces these rows.
 */
export function optimisticAiSubtasks(
  existing: readonly Pick<Subtask, "position">[],
  accepted: AcceptProposalInput["subtasks"],
  makeId: () => string,
): Subtask[] {
  const positions = existing.map((subtask) => subtask.position);
  return accepted.map((subtask) => {
    const position = positionAfterLast(positions);
    positions.push(position);
    return {
      id: makeId(),
      title: subtask.title,
      estimate: subtask.estimate ?? null,
      position,
      completedAt: null,
      source: "ai",
    };
  });
}

export const EMPTY_PROPOSAL_ERROR = "The AI didn't return any usable subtasks. Please try again.";
export const DECOMPOSITION_REQUEST_ERROR =
  "AI suggestions couldn't be generated right now. Please try again.";

const routeErrorSchema = z.object({ error: z.string().trim().min(1).max(200) });

/**
 * A message that is safe to show for a failed decomposition request. The
 * decompose route answers errors with `{ "error": "<safe message>" }` and
 * useObject reports the raw response body as the error message; anything
 * else (a proxy's HTML page, a network error, an overlong body) gets a
 * generic message, so a raw body is never rendered.
 */
export function decompositionErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return DECOMPOSITION_REQUEST_ERROR;
  let body: unknown;
  try {
    body = JSON.parse(error.message);
  } catch {
    return DECOMPOSITION_REQUEST_ERROR;
  }
  const parsed = routeErrorSchema.safeParse(body);
  return parsed.success ? parsed.data.error : DECOMPOSITION_REQUEST_ERROR;
}
