import { type SubtaskUpdate, applySubtaskUpdate } from "@/lib/subtasks/updates";

import { compareByPosition } from "./ordering";
import { positionAfterLast, positionForMove } from "./positions";
import {
  type BoardView,
  type CardSummary,
  type ColumnView,
  type Label,
  compareArchived,
  compareLabels,
  comparePeople,
} from "./view-model";

/**
 * Changes the board UI applies optimistically (`useOptimistic`) while the
 * matching Server Action runs. The server stays the source of truth: when the
 * action finishes, the re-rendered board replaces this state.
 */
export type BoardUpdate =
  | { type: "renameBoard"; title: string }
  | { type: "addColumn"; column: { id: string; title: string; position: string } }
  | { type: "renameColumn"; columnId: string; title: string }
  /** Drag and drop: same neighbour hints as the moveColumn action. */
  | { type: "moveColumn"; columnId: string; previousId: string | null; nextId: string | null }
  | { type: "addCard"; card: { id: string; columnId: string; title: string; position: string } }
  | { type: "renameCard"; cardId: string; title: string }
  /** Drag and drop: same neighbour hints as the moveCard action. */
  | {
      type: "moveCard";
      cardId: string;
      columnId: string;
      previousId: string | null;
      nextId: string | null;
    }
  | { type: "setDescription"; cardId: string; description: string | null }
  | { type: "archiveCard"; cardId: string; archivedAt: string }
  | { type: "restoreCard"; cardId: string }
  /** `null` removes the date and the "done" mark (see setCardDueDate). */
  | { type: "setDueDate"; cardId: string; dueOn: string | null }
  | { type: "setCompleted"; cardId: string; completedAt: string | null }
  /** A new board label; with `cardId`, also attached to that card. */
  | { type: "addLabel"; label: Label; cardId?: string }
  | { type: "updateLabel"; label: Label }
  | { type: "deleteLabel"; labelId: string }
  | { type: "attachLabel"; cardId: string; labelId: string }
  | { type: "detachLabel"; cardId: string; labelId: string }
  | { type: "assignMember"; cardId: string; userId: string }
  | { type: "unassignMember"; cardId: string; userId: string }
  /** A card's checklist (see subtasks/updates.ts). */
  | SubtaskUpdate;

/** Applies `fn` to every card, active and archived. */
function mapAllCards(view: BoardView, fn: (card: CardSummary) => CardSummary): BoardView {
  return {
    ...view,
    columns: view.columns.map((column) => ({ ...column, cards: column.cards.map(fn) })),
    archivedCards: view.archivedCards.map((card) => ({ ...fn(card), archivedAt: card.archivedAt })),
  };
}

function withLabel(card: CardSummary, label: Label): CardSummary {
  if (card.labels.some((l) => l.id === label.id)) return card;
  return { ...card, labels: [...card.labels, label].sort(compareLabels) };
}

function mapColumns(view: BoardView, fn: (column: ColumnView) => ColumnView): BoardView {
  return { ...view, columns: view.columns.map(fn) };
}

/** Applies `fn` to the card wherever it is (column or archive). */
function mapCard(view: BoardView, cardId: string, fn: (card: CardSummary) => CardSummary) {
  return {
    ...view,
    columns: view.columns.map((column) =>
      column.cards.some((card) => card.id === cardId)
        ? { ...column, cards: column.cards.map((card) => (card.id === cardId ? fn(card) : card)) }
        : column,
    ),
    archivedCards: view.archivedCards.map((card) =>
      card.id === cardId ? { ...fn(card), archivedAt: card.archivedAt } : card,
    ),
  };
}

export function applyBoardUpdate(view: BoardView, update: BoardUpdate): BoardView {
  switch (update.type) {
    case "renameBoard":
      return { ...view, board: { ...view.board, title: update.title } };

    case "addColumn":
      if (view.columns.some((column) => column.id === update.column.id)) return view;
      return {
        ...view,
        columns: [...view.columns, { ...update.column, cards: [] }].sort(compareByPosition),
      };

    case "renameColumn":
      return mapColumns(view, (column) =>
        column.id === update.columnId ? { ...column, title: update.title } : column,
      );

    case "moveColumn": {
      const column = view.columns.find((c) => c.id === update.columnId);
      if (!column) return view;
      const others = view.columns.filter((c) => c.id !== column.id);
      const position = positionForMove(others, update.previousId, update.nextId);
      return { ...view, columns: [...others, { ...column, position }].sort(compareByPosition) };
    }

    case "addCard": {
      const { card } = update;
      return mapColumns(view, (column) => {
        if (column.id !== card.columnId || column.cards.some((c) => c.id === card.id)) {
          return column;
        }
        const added: CardSummary = {
          ...card,
          description: null,
          dueOn: null,
          completedAt: null,
          labels: [],
          assignees: [],
          subtasks: [],
        };
        return { ...column, cards: [...column.cards, added].sort(compareByPosition) };
      });
    }

    case "moveCard": {
      const card = view.columns.flatMap((c) => c.cards).find((c) => c.id === update.cardId);
      const target = view.columns.find((c) => c.id === update.columnId);
      if (!card || !target) return view;
      // Only the visible cards are known here: the server's key may differ, and
      // the re-rendered board replaces this one when the action finishes.
      const siblings = target.cards.filter((c) => c.id !== card.id);
      const moved = {
        ...card,
        columnId: target.id,
        position: positionForMove(siblings, update.previousId, update.nextId),
      };
      return mapColumns(view, (column) => {
        const cards = column.cards.filter((c) => c.id !== card.id);
        return column.id === target.id
          ? { ...column, cards: [...cards, moved].sort(compareByPosition) }
          : column.id === card.columnId
            ? { ...column, cards }
            : column;
      });
    }

    case "renameCard":
      return mapCard(view, update.cardId, (card) => ({ ...card, title: update.title }));

    case "setDescription":
      return mapCard(view, update.cardId, (card) => ({ ...card, description: update.description }));

    case "archiveCard": {
      const card = view.columns.flatMap((c) => c.cards).find((c) => c.id === update.cardId);
      if (!card) return view;
      return {
        ...mapColumns(view, (column) =>
          column.id === card.columnId
            ? { ...column, cards: column.cards.filter((c) => c.id !== card.id) }
            : column,
        ),
        archivedCards: [...view.archivedCards, { ...card, archivedAt: update.archivedAt }].sort(
          compareArchived,
        ),
      };
    }

    case "restoreCard": {
      const archived = view.archivedCards.find((c) => c.id === update.cardId);
      if (!archived) return view;
      const { archivedAt, ...card } = archived;
      void archivedAt;
      return {
        ...mapColumns(view, (column) =>
          column.id === card.columnId
            ? { ...column, cards: [...column.cards, card].sort(compareByPosition) }
            : column,
        ),
        archivedCards: view.archivedCards.filter((c) => c.id !== card.id),
      };
    }

    case "setDueDate":
      return mapCard(view, update.cardId, (card) => ({
        ...card,
        dueOn: update.dueOn,
        completedAt: update.dueOn === null ? null : card.completedAt,
      }));

    case "setCompleted":
      return mapCard(view, update.cardId, (card) =>
        card.dueOn === null ? card : { ...card, completedAt: update.completedAt },
      );

    case "addLabel": {
      const { label, cardId } = update;
      if (view.labels.some((l) => l.id === label.id)) return view;
      const added = { ...view, labels: [...view.labels, label].sort(compareLabels) };
      return cardId ? mapCard(added, cardId, (card) => withLabel(card, label)) : added;
    }

    case "updateLabel": {
      const { label } = update;
      if (!view.labels.some((l) => l.id === label.id)) return view;
      const replace = (labels: Label[]) =>
        labels.map((l) => (l.id === label.id ? label : l)).sort(compareLabels);
      return {
        ...mapAllCards(view, (card) =>
          card.labels.some((l) => l.id === label.id)
            ? { ...card, labels: replace(card.labels) }
            : card,
        ),
        labels: replace(view.labels),
      };
    }

    case "deleteLabel": {
      const keep = (l: Label) => l.id !== update.labelId;
      return {
        ...mapAllCards(view, (card) =>
          card.labels.some((l) => !keep(l)) ? { ...card, labels: card.labels.filter(keep) } : card,
        ),
        labels: view.labels.filter(keep),
      };
    }

    case "attachLabel": {
      const label = view.labels.find((l) => l.id === update.labelId);
      if (!label) return view;
      return mapCard(view, update.cardId, (card) => withLabel(card, label));
    }

    case "detachLabel":
      return mapCard(view, update.cardId, (card) => ({
        ...card,
        labels: card.labels.filter((l) => l.id !== update.labelId),
      }));

    case "assignMember": {
      const member = view.members.find((m) => m.id === update.userId);
      if (!member) return view;
      const person = {
        id: member.id,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
      };
      return mapCard(view, update.cardId, (card) =>
        card.assignees.some((p) => p.id === person.id)
          ? card
          : { ...card, assignees: [...card.assignees, person].sort(comparePeople) },
      );
    }

    case "unassignMember":
      return mapCard(view, update.cardId, (card) => ({
        ...card,
        assignees: card.assignees.filter((p) => p.id !== update.userId),
      }));

    case "addSubtask":
    case "renameSubtask":
    case "setSubtaskEstimate":
    case "setSubtaskCompleted":
    case "moveSubtask":
    case "deleteSubtask":
      return mapCard(view, update.cardId, (card) => ({
        ...card,
        subtasks: applySubtaskUpdate(card.subtasks, update),
      }));
  }
}

/** How many cards (active and archived) carry a label: deleting it removes it from all of them. */
export function labelCardCount(view: BoardView, labelId: string): number {
  return [...view.columns.flatMap((c) => c.cards), ...view.archivedCards].filter((card) =>
    card.labels.some((l) => l.id === labelId),
  ).length;
}

/** Position for a new card at the bottom of a column (archived cards included). */
export function nextCardPosition(view: BoardView, columnId: string): string {
  const column = view.columns.find((c) => c.id === columnId);
  const archived = view.archivedCards.filter((c) => c.columnId === columnId);
  return positionAfterLast([...(column?.cards ?? []), ...archived].map((c) => c.position));
}

/** Position for a new column at the end of the board. */
export function nextColumnPosition(view: BoardView): string {
  return positionAfterLast(view.columns.map((c) => c.position));
}

/** How many cards deleting a column would delete. */
export function columnCardCounts(
  view: BoardView,
  columnId: string,
): { active: number; archived: number; total: number } {
  const active = view.columns.find((c) => c.id === columnId)?.cards.length ?? 0;
  const archived = view.archivedCards.filter((c) => c.columnId === columnId).length;
  return { active, archived, total: active + archived };
}

/**
 * Where focus should go when a card leaves its column (archived): the next
 * card, else the previous one, else `null` (the column itself).
 */
export function neighborCardId(view: BoardView, cardId: string): string | null {
  for (const column of view.columns) {
    const index = column.cards.findIndex((c) => c.id === cardId);
    if (index === -1) continue;
    return column.cards[index + 1]?.id ?? column.cards[index - 1]?.id ?? null;
  }
  return null;
}

/** Where focus should go after deleting a column: previous column, else next, else `null`. */
export function neighborColumnId(view: BoardView, columnId: string): string | null {
  const index = view.columns.findIndex((c) => c.id === columnId);
  if (index === -1) return null;
  return view.columns[index - 1]?.id ?? view.columns[index + 1]?.id ?? null;
}
