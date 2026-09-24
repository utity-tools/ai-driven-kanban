import { compareByPosition } from "./ordering";
import { positionAfterLast } from "./positions";
import { type BoardView, type CardSummary, type ColumnView, compareArchived } from "./view-model";

/**
 * Changes the board UI applies optimistically (`useOptimistic`) while the
 * matching Server Action runs. The server stays the source of truth: when the
 * action finishes, the re-rendered board replaces this state.
 */
export type BoardUpdate =
  | { type: "renameBoard"; title: string }
  | { type: "addColumn"; column: { id: string; title: string; position: string } }
  | { type: "renameColumn"; columnId: string; title: string }
  | { type: "addCard"; card: { id: string; columnId: string; title: string; position: string } }
  | { type: "renameCard"; cardId: string; title: string }
  | { type: "setDescription"; cardId: string; description: string | null }
  | { type: "archiveCard"; cardId: string; archivedAt: string }
  | { type: "restoreCard"; cardId: string };

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

    case "addCard": {
      const { card } = update;
      return mapColumns(view, (column) => {
        if (column.id !== card.columnId || column.cards.some((c) => c.id === card.id)) {
          return column;
        }
        const added: CardSummary = {
          ...card,
          description: null,
          dueAt: null,
          completedAt: null,
          labels: [],
          assignees: [],
        };
        return { ...column, cards: [...column.cards, added].sort(compareByPosition) };
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
  }
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
