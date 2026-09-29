import type { DeepPartial } from "ai";

import { MAX_BLOCKERS } from "@/lib/boards/dependencies";
import type { BoardView } from "@/lib/boards/view-model";
import { blockedDownstream, type Dependency } from "@/lib/graph/dependencies";

import { candidateRef, MAX_CANDIDATES_IN_PROMPT } from "./prompts/dependencies-v1";
import { type DependencyProposal, MAX_PROPOSED_DEPENDENCIES } from "./schemas";

/*
 * Pure post-processing of an AI dependency proposal: turns the model's
 * "c1", "c2" references back into card ids and keeps only proposals the
 * database would accept. Runs in the client on the streamed (partial) output, so
 * it must never throw on incomplete data. On the server only
 * `dependencyCandidates` and `promptCandidates` run; the `accept_ai_dependencies`
 * RPC is the real final check when the user confirms.
 */

/** A card the model may be offered as a blocker. */
export type DependencyCandidate = {
  id: string;
  title: string;
  columnTitle: string;
  done: boolean;
  archived: boolean;
};

export type DependencyContext = {
  /** The open card, the one that would be blocked. */
  targetId: string;
  /**
   * The candidates exactly as sent to the model: reference `cN` is the Nth
   * one. Only the first MAX_CANDIDATES_IN_PROMPT were shown, so only those map.
   */
  candidates: readonly DependencyCandidate[];
  /** Every edge of the board (archived cards included). */
  dependencies: readonly Dependency[];
};

/**
 * The candidates for `targetId`, in board order: active cards other than the
 * target that aren't already its blockers and wouldn't close a cycle. Filtering
 * before the call saves tokens and removes the chance of proposing them at all;
 * the client's `proposeDependencies` and the accept RPC re-check everything.
 */
export function dependencyCandidates(view: BoardView, targetId: string): DependencyCandidate[] {
  const existing = new Set(
    view.dependencies.filter((edge) => edge.blockedId === targetId).map((edge) => edge.blockerId),
  );
  const downstream = blockedDownstream(view.dependencies, targetId);
  return view.columns.flatMap((column) =>
    column.cards
      .filter((card) => card.id !== targetId && !existing.has(card.id) && !downstream.has(card.id))
      .map((card) => ({
        id: card.id,
        title: card.title,
        columnTitle: column.title,
        done: column.isDone,
        archived: false,
      })),
  );
}

/** A proposal that survived every check, ready to become a review row. */
export type ValidDependency = {
  blockerId: string;
  title: string;
  columnTitle: string;
  rationale: string;
};

/**
 * The proposals of a partial (still streaming or stopped) or final output that
 * can be saved, in the model's order:
 * - `complete: false` (still streaming): the last item is never trusted, since
 *   its reference may still be growing ("c1" on its way to "c12" would flash the
 *   wrong card) whatever order the provider emits its fields in. An item counts
 *   once a later item exists or the stream is complete.
 * - unknown references, the target, archived cards, duplicates, cards that
 *   already block the target and cards that would close a cycle are dropped;
 * - at most MAX_PROPOSED_DEPENDENCIES, and no more than the room left under
 *   MAX_BLOCKERS.
 *
 * Cycles: every new edge is `X -> target`. A simple cycle can use only one of
 * them (each enters `target`, which a simple cycle visits once) and the rest of
 * it is an old path `target ~> X`. So the batch closes a cycle iff some X is
 * downstream of the target in the existing graph, and checking each edge
 * against the existing graph is enough, however many are accepted together.
 */
export function proposeDependencies(
  partial: DeepPartial<DependencyProposal> | undefined,
  context: DependencyContext,
  { complete }: { complete: boolean },
): ValidDependency[] {
  const items = Array.isArray(partial?.dependencies) ? partial.dependencies : [];
  const { targetId, dependencies } = context;

  const byRef = new Map<string, DependencyCandidate>();
  context.candidates.slice(0, MAX_CANDIDATES_IN_PROMPT).forEach((candidate, index) => {
    byRef.set(candidateRef(index), candidate);
  });

  const alreadyBlocking = new Set(
    dependencies.filter((edge) => edge.blockedId === targetId).map((edge) => edge.blockerId),
  );
  const downstream = blockedDownstream(dependencies, targetId);
  const room = Math.min(
    MAX_PROPOSED_DEPENDENCIES,
    Math.max(0, MAX_BLOCKERS - alreadyBlocking.size),
  );

  const result: ValidDependency[] = [];
  const taken = new Set<string>();
  items.forEach((item, index) => {
    if (result.length >= room) return;
    const rationale = typeof item?.rationale === "string" ? item.rationale.trim() : "";
    if (!complete && index === items.length - 1) return;
    const ref = typeof item?.blocker === "string" ? item.blocker.trim() : "";
    const candidate = byRef.get(ref);
    if (!candidate) return;
    const id = candidate.id;
    if (
      id === targetId ||
      candidate.archived ||
      taken.has(id) ||
      alreadyBlocking.has(id) ||
      downstream.has(id)
    ) {
      return;
    }
    taken.add(id);
    result.push({
      blockerId: id,
      title: candidate.title,
      columnTitle: candidate.columnTitle,
      rationale,
    });
  });
  return result;
}

/*
 * Keeping client and model in step. Refs ("c1"...) are positions in the
 * candidate list the server sent to the model. Realtime can change the board
 * while a response streams, so the client doesn't recompute the list: the route
 * sends the ids in prompt order in a response header and the client resolves
 * them against its own board (titles, columns), keeping the positions.
 */

/** Response header with the candidate card ids the model saw, comma-separated, in ref order. */
export const CANDIDATE_IDS_HEADER = "X-Candidate-Ids";

/** The candidates that are actually sent to the model (the prompt shows only the first ones). */
export function promptCandidates<T>(candidates: readonly T[]): T[] {
  return candidates.slice(0, MAX_CANDIDATES_IN_PROMPT);
}

/** Header value for the ids of the candidates the model saw. UUIDs contain no commas. */
export function encodeCandidateIds(candidates: readonly { id: string }[]): string {
  return promptCandidates(candidates)
    .map((candidate) => candidate.id)
    .join(",");
}

/** Ids from the header (`null` or empty gives none); blank entries are ignored. */
export function decodeCandidateIds(header: string | null): string[] {
  return (header ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
}

/**
 * Candidates for `ids`, in the same order (ref `cN` is the Nth id), read from
 * the client's current board. A card that has since been archived or deleted
 * keeps its slot as an archived placeholder, so later refs still line up and
 * `proposeDependencies` drops it.
 */
export function resolveCandidates(view: BoardView, ids: readonly string[]): DependencyCandidate[] {
  const active = new Map<string, DependencyCandidate>();
  for (const column of view.columns) {
    for (const card of column.cards) {
      active.set(card.id, {
        id: card.id,
        title: card.title,
        columnTitle: column.title,
        done: column.isDone,
        archived: false,
      });
    }
  }
  return ids.map(
    (id) => active.get(id) ?? { id, title: "", columnTitle: "", done: false, archived: true },
  );
}
