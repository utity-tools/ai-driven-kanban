import { blockedDownstream, bottlenecks } from "@/lib/graph/dependencies";

import type { BoardView, DependencySource } from "./view-model";

/**
 * Most blockers a card can have. Mirrors the DEP02 check in
 * supabase/migrations/20260929085253_card_dependencies.sql: keep them in sync.
 */
export const MAX_BLOCKERS = 20;

/** Most cards the "Bottlenecks" popover lists. */
export const BOTTLENECK_LIMIT = 3;

type Located = { id: string; title: string; columnTitle: string; archived: boolean; done: boolean };

/** Every card of the board (active and archived) with the column facts dependencies need. */
function locate(view: BoardView): Map<string, Located> {
  const columns = new Map(view.columns.map((column) => [column.id, column]));
  const cards = new Map<string, Located>();
  for (const column of view.columns) {
    for (const card of column.cards) {
      cards.set(card.id, {
        id: card.id,
        title: card.title,
        columnTitle: column.title,
        archived: false,
        done: column.isDone,
      });
    }
  }
  for (const card of view.archivedCards) {
    const column = columns.get(card.columnId);
    cards.set(card.id, {
      id: card.id,
      title: card.title,
      columnTitle: column?.title ?? "",
      archived: true,
      done: column?.isDone ?? false,
    });
  }
  return cards;
}

/**
 * Builds `isResolved(cardId)`: a card is resolved when it sits in a done column
 * or is archived (ADR 0017). Unknown cards count as resolved: they no longer
 * hold anyone up.
 */
export function resolver(view: BoardView): (cardId: string) => boolean {
  const cards = locate(view);
  return (cardId) => {
    const card = cards.get(cardId);
    return card === undefined || card.archived || card.done;
  };
}

/** For each blocked card, how many unresolved cards block it. */
export function unresolvedBlockerCounts(view: BoardView): Map<string, number> {
  const isResolved = resolver(view);
  const counts = new Map<string, number>();
  for (const { blockerId, blockedId } of view.dependencies) {
    if (isResolved(blockerId) || isResolved(blockedId)) continue;
    counts.set(blockedId, (counts.get(blockedId) ?? 0) + 1);
  }
  return counts;
}

/** `done`: in a done column; `archived`: archived; both count as resolved. */
export type DependencyState = "pending" | "done" | "archived";

export type DependencyLink = {
  cardId: string;
  title: string;
  columnTitle: string;
  state: DependencyState;
  resolved: boolean;
  /** Who created the edge: `ai` for an accepted AI proposal. */
  source: DependencySource;
};

export type CardDependencies = { blockedBy: DependencyLink[]; blocks: DependencyLink[] };

/**
 * The cards that block `cardId` and the cards it blocks, in board order, with
 * what the modal shows for each. Edges to cards that are not on the board
 * are skipped.
 */
export function cardDependencies(view: BoardView, cardId: string): CardDependencies {
  const cards = locate(view);
  const link = (id: string, source: DependencySource): DependencyLink | null => {
    const card = cards.get(id);
    if (!card) return null;
    const state: DependencyState = card.archived ? "archived" : card.done ? "done" : "pending";
    return {
      cardId: id,
      title: card.title,
      columnTitle: card.columnTitle,
      state,
      resolved: state !== "pending",
      source,
    };
  };
  // Map order is board order (columns left to right, then archived), so the lists are stable.
  const order = new Map([...cards.keys()].map((id, index) => [id, index]));
  const links = (edges: { id: string; source: DependencySource }[]) =>
    edges
      .filter((edge) => order.has(edge.id))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .map((edge) => link(edge.id, edge.source))
      .filter((item): item is DependencyLink => item !== null);

  return {
    blockedBy: links(
      view.dependencies
        .filter((edge) => edge.blockedId === cardId)
        .map((edge) => ({ id: edge.blockerId, source: edge.source })),
    ),
    blocks: links(
      view.dependencies
        .filter((edge) => edge.blockerId === cardId)
        .map((edge) => ({ id: edge.blockedId, source: edge.source })),
    ),
  };
}

/**
 * Cards `cardId` could get as a new blocker: active cards of the board other
 * than itself, not already blockers, and not closing a cycle. In board order.
 */
export function blockerCandidates(
  view: BoardView,
  cardId: string,
): { id: string; title: string; columnTitle: string }[] {
  const existing = new Set(
    view.dependencies.filter((edge) => edge.blockedId === cardId).map((edge) => edge.blockerId),
  );
  // X -> cardId closes a cycle iff X is downstream of cardId.
  const downstream = blockedDownstream(view.dependencies, cardId);
  return view.columns.flatMap((column) =>
    column.cards
      .filter((card) => card.id !== cardId && !existing.has(card.id) && !downstream.has(card.id))
      .map((card) => ({ id: card.id, title: card.title, columnTitle: column.title })),
  );
}

export type BottleneckView = { cardId: string; title: string; blockedCount: number };

/** The cards that hold up the most unresolved cards, with their titles. */
export function topBottlenecks(view: BoardView, limit = BOTTLENECK_LIMIT): BottleneckView[] {
  const cards = locate(view);
  return bottlenecks(view.dependencies, resolver(view), limit).flatMap(
    ({ cardId, blockedCount }) => {
      const card = cards.get(cardId);
      return card ? [{ cardId, title: card.title, blockedCount }] : [];
    },
  );
}

/** Candidates whose title contains `query` (case-insensitive, ignoring surrounding space). */
export function filterCandidates<T extends { title: string }>(
  candidates: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [...candidates];
  return candidates.filter((candidate) => candidate.title.toLowerCase().includes(needle));
}
