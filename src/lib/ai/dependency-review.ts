import { MAX_BLOCKERS } from "@/lib/boards/dependencies";

import type { ValidDependency } from "./dependency-proposals";
import type { AcceptDependenciesInput } from "./schemas";
import { MAX_PROPOSED_DEPENDENCIES } from "./schemas";

/*
 * Pure logic of the AI dependency review (card modal, Dependencies section):
 * who gets the "Suggest blockers" button, the review rows and the payload of
 * the accept Server Action. The UI only renders this. Unlike subtasks, rows
 * aren't editable: the user only keeps or drops each proposed blocker.
 */

export type SuggestAvailability = "hidden" | "enabled";

export function dependencySuggestAvailability(input: {
  /** AI_DECOMPOSITION_ENABLED, passed down from the server as a boolean. */
  featureEnabled: boolean;
  /** Owner or editor on the board. */
  editable: boolean;
  archived: boolean;
  /** How many cards could be offered to the model (see dependencyCandidates). */
  candidateCount: number;
  /** Blockers the card already has. */
  blockerCount: number;
}): SuggestAvailability {
  const { featureEnabled, editable, archived, candidateCount, blockerCount } = input;
  return !featureEnabled ||
    !editable ||
    archived ||
    candidateCount === 0 ||
    blockerCount >= MAX_BLOCKERS
    ? "hidden"
    : "enabled";
}

/** One row of the review: checked by default. */
export type DependencyReviewItem = ValidDependency & {
  /** Stable React key; not sent to the server. */
  key: string;
  checked: boolean;
};

/** Review rows for the valid proposals, all checked (the user unchecks what they don't want). */
export function toDependencyReviewItems(
  proposals: readonly ValidDependency[],
  makeKey: () => string,
): DependencyReviewItem[] {
  return proposals.map((proposal) => ({ ...proposal, key: makeKey(), checked: true }));
}

export type DependencyReviewSelection = {
  checkedCount: number;
  canSubmit: boolean;
  /** Why it can't be submitted, when not obvious from the rows (`null` otherwise). */
  problem: string | null;
};

/** At least one checked row, at most the proposal cap and the room left on the card. */
export function dependencyReviewSelection(
  items: readonly DependencyReviewItem[],
  existingCount: number,
): DependencyReviewSelection {
  const checkedCount = items.filter((item) => item.checked).length;
  if (checkedCount === 0) {
    return { checkedCount, canSubmit: false, problem: "Select at least one blocker to add." };
  }
  const room = Math.min(MAX_PROPOSED_DEPENDENCIES, Math.max(0, MAX_BLOCKERS - existingCount));
  if (checkedCount > room) {
    return {
      checkedCount,
      canSubmit: false,
      problem: `A card can have at most ${MAX_BLOCKERS} blockers: select at most ${room}.`,
    };
  }
  return { checkedCount, canSubmit: true, problem: null };
}

/** "Add 1 blocker", "Add 3 blockers". */
export function addBlockersLabel(count: number): string {
  return `Add ${count} ${count === 1 ? "blocker" : "blockers"}`;
}

/** The accept action input: the checked rows' card ids, in review order. */
export function toDependencyAcceptPayload(
  boardId: string,
  cardId: string,
  items: readonly DependencyReviewItem[],
): AcceptDependenciesInput {
  return {
    boardId,
    cardId,
    blockerIds: items.filter((item) => item.checked).map((item) => item.blockerId),
  };
}

export const NO_DEPENDENCIES_MESSAGE =
  "The AI didn't find any cards that block this one. You can still add blockers yourself.";

/** The stream ended without a usable proposal (empty body or invalid output), as opposed to "none". */
export const EMPTY_DEPENDENCY_PROPOSAL_ERROR =
  "The AI didn't return a usable answer. Please try again.";
