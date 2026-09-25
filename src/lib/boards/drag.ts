import type { BoardView, CardSummary, ColumnView } from "./view-model";

/**
 * Drag and drop works on the *order* of ids only: while an item is dragged the
 * board keeps a local layout (columns in order, each with its card ids in
 * order), and on drop the final layout is turned into the neighbour hints
 * (`previousId` / `nextId`) the move actions expect. Positions are never
 * computed here: the server (and the optimistic update) does that.
 */
export type BoardLayout = readonly ColumnLayout[];
export type ColumnLayout = { readonly id: string; readonly cardIds: readonly string[] };

export type Neighbors = { previousId: string | null; nextId: string | null };

export type DropResult =
  | ({ type: "moveCard"; cardId: string; columnId: string } & Neighbors)
  | ({ type: "moveColumn"; columnId: string } & Neighbors);

/** Where an item sits: `columnIndex` for columns, plus `index` in the column for cards. */
export type Place =
  | { type: "column"; columnId: string; index: number; total: number }
  | { type: "card"; columnId: string; index: number; total: number };

/** The order of the (active) cards and columns of a board. Archived cards are not in it. */
export function layoutOf(view: BoardView): BoardLayout {
  return view.columns.map((column) => ({
    id: column.id,
    cardIds: column.cards.map((card) => card.id),
  }));
}

export function isColumnId(layout: BoardLayout, id: string): boolean {
  return layout.some((column) => column.id === id);
}

/** The column an id belongs to: itself for a column, its column for a card, else `null`. */
export function columnIdOf(layout: BoardLayout, id: string): string | null {
  for (const column of layout) {
    if (column.id === id || column.cardIds.includes(id)) return column.id;
  }
  return null;
}

/** Where an id sits in the layout, or `null` if it isn't in it. */
export function placeOf(layout: BoardLayout, id: string): Place | null {
  const columnIndex = layout.findIndex((column) => column.id === id);
  if (columnIndex !== -1) {
    return { type: "column", columnId: id, index: columnIndex, total: layout.length };
  }
  for (const column of layout) {
    const index = column.cardIds.indexOf(id);
    if (index !== -1) {
      return { type: "card", columnId: column.id, index, total: column.cardIds.length };
    }
  }
  return null;
}

/** The ids right before and after `id` in `ids` (`null` at either end or if absent). */
export function neighborsOf(ids: readonly string[], id: string): Neighbors {
  const index = ids.indexOf(id);
  if (index === -1) return { previousId: null, nextId: null };
  return { previousId: ids[index - 1] ?? null, nextId: ids[index + 1] ?? null };
}

/** Moves `ids[from]` to index `to` (the item ends up exactly at `to`). */
function arrayMove<T>(items: readonly T[], from: number, to: number): T[] {
  const result = [...items];
  const [item] = result.splice(from, 1);
  if (item === undefined) return result;
  result.splice(to, 0, item);
  return result;
}

export type MoveOptions = {
  /**
   * Card entering another column over one of its cards: insert after that
   * card instead of before it (the dragged card is below it).
   */
  after?: boolean;
};

/**
 * The layout after dropping `activeId` over `overId` (a card or a column).
 * Returns the same layout object when nothing changes.
 *
 * - Column over a column (or over one of its cards): the column takes that
 *   column's place.
 * - Card over a card of the same column: the card takes that card's place.
 * - Card over a card of another column: inserted before it (after it with
 *   `options.after`).
 * - Card over a column: appended to that column (unchanged if it is already
 *   in it: its place is given by the cards it is over).
 */
export function moveInLayout(
  layout: BoardLayout,
  activeId: string,
  overId: string,
  options: MoveOptions = {},
): BoardLayout {
  if (activeId === overId) return layout;
  const active = placeOf(layout, activeId);
  const overColumnId = columnIdOf(layout, overId);
  if (!active || overColumnId === null) return layout;

  if (active.type === "column") {
    const to = layout.findIndex((column) => column.id === overColumnId);
    if (to === active.index) return layout;
    return arrayMove(layout, active.index, to);
  }

  const overIsColumn = overColumnId === overId;
  if (active.columnId === overColumnId) {
    if (overIsColumn) return layout;
    return layout.map((column) => {
      if (column.id !== overColumnId) return column;
      const to = column.cardIds.indexOf(overId);
      return { ...column, cardIds: arrayMove(column.cardIds, active.index, to) };
    });
  }

  return layout.map((column) => {
    if (column.id === active.columnId) {
      return { ...column, cardIds: column.cardIds.filter((id) => id !== activeId) };
    }
    if (column.id !== overColumnId) return column;
    const overIndex = column.cardIds.indexOf(overId);
    const at = overIsColumn || overIndex === -1 ? column.cardIds.length : overIndex;
    const cardIds = [...column.cardIds];
    cardIds.splice(options.after && !overIsColumn ? at + 1 : at, 0, activeId);
    return { ...column, cardIds };
  });
}

/**
 * What to send to the server for a drag that started at `initial` and ended
 * at `final`, or `null` when the item is back where it started (no-op drop).
 */
export function dropResult(
  initial: BoardLayout,
  final: BoardLayout,
  activeId: string,
): DropResult | null {
  const before = placeOf(initial, activeId);
  const after = placeOf(final, activeId);
  if (!before || !after || before.type !== after.type) return null;
  if (before.columnId === after.columnId && before.index === after.index) return null;

  if (after.type === "column") {
    return {
      type: "moveColumn",
      columnId: activeId,
      ...neighborsOf(
        final.map((column) => column.id),
        activeId,
      ),
    };
  }
  const column = final.find((c) => c.id === after.columnId);
  return {
    type: "moveCard",
    cardId: activeId,
    columnId: after.columnId,
    ...neighborsOf(column?.cardIds ?? [], activeId),
  };
}

/**
 * The board shown during a drag: `view` rearranged as `layout` says. The view
 * may have changed since the drag started (another mutation finished), so
 * ids the view no longer has are skipped and items missing from the layout
 * keep their place at the end of their list.
 */
export function applyLayout(view: BoardView, layout: BoardLayout): BoardView {
  const columns = new Map(view.columns.map((column) => [column.id, column]));
  const cards = new Map<string, CardSummary>(
    view.columns.flatMap((column) => column.cards.map((card) => [card.id, card] as const)),
  );
  const placed = new Set<string>();

  const arranged: ColumnView[] = [];
  for (const entry of layout) {
    const column = columns.get(entry.id);
    if (!column) continue;
    const columnCards: CardSummary[] = [];
    for (const id of entry.cardIds) {
      const card = cards.get(id);
      if (!card || placed.has(id)) continue;
      placed.add(id);
      columnCards.push(card.columnId === column.id ? card : { ...card, columnId: column.id });
    }
    arranged.push({ ...column, cards: columnCards });
  }
  // Cards added while dragging (not in the layout) stay in their own column.
  const result = arranged.map((column) => ({
    ...column,
    cards: [
      ...column.cards,
      ...(columns.get(column.id)?.cards ?? []).filter((card) => !placed.has(card.id)),
    ],
  }));
  const layoutIds = new Set(layout.map((column) => column.id));
  const added = view.columns
    .filter((column) => !layoutIds.has(column.id))
    .map((column) => ({ ...column, cards: column.cards.filter((card) => !placed.has(card.id)) }));
  return { ...view, columns: [...result, ...added] };
}
