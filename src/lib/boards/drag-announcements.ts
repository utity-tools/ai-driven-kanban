import { type BoardLayout, placeOf } from "./drag";
import type { BoardView } from "./view-model";

/**
 * Screen-reader messages for drag and drop (read by dnd-kit's live region).
 * They name the item and say where it is, e.g.
 * "Picked up card Fix login. Card is in column To do, position 2 of 3."
 *
 * `view` supplies the titles; `layout` is the order to describe (the
 * projected order while dragging, the initial one after a cancel).
 */

export const DRAG_INSTRUCTIONS =
  "To move a card, press Space on it. To move a column, press Space or Enter on its move button. " +
  "Use the arrow keys to move it: up and down within a column, left and right between columns. " +
  "Press Space or Enter again to drop it, or Escape to cancel.";

function titleOf(view: BoardView, id: string): string {
  for (const column of view.columns) {
    if (column.id === id) return column.title;
    const card = column.cards.find((c) => c.id === id);
    if (card) return card.title;
  }
  return "";
}

/** "column To do, position 2 of 3" for a card, "position 2 of 4" for a column. */
function whereIs(view: BoardView, layout: BoardLayout, id: string): string | null {
  const place = placeOf(layout, id);
  if (!place) return null;
  const position = `position ${place.index + 1} of ${place.total}`;
  return place.type === "card" ? `column ${titleOf(view, place.columnId)}, ${position}` : position;
}

function kindOf(layout: BoardLayout, id: string): "card" | "column" | null {
  return placeOf(layout, id)?.type ?? null;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function pickedUpMessage(view: BoardView, layout: BoardLayout, id: string): string {
  const kind = kindOf(layout, id);
  const where = whereIs(view, layout, id);
  if (!kind || !where) return "Picked up an item.";
  return `Picked up ${kind} ${titleOf(view, id)}. ${capitalize(kind)} is in ${where}.`;
}

export function movedMessage(view: BoardView, layout: BoardLayout, id: string): string {
  const kind = kindOf(layout, id);
  const where = whereIs(view, layout, id);
  if (!kind || !where) return "";
  return `${capitalize(kind)} ${titleOf(view, id)} is now in ${where}.`;
}

export function droppedMessage(view: BoardView, layout: BoardLayout, id: string): string {
  const kind = kindOf(layout, id);
  const where = whereIs(view, layout, id);
  if (!kind || !where) return "Dropped the item.";
  return `Dropped ${kind} ${titleOf(view, id)}. ${capitalize(kind)} is in ${where}.`;
}

export function cancelledMessage(view: BoardView, layout: BoardLayout, id: string): string {
  const kind = kindOf(layout, id);
  const where = whereIs(view, layout, id);
  if (!kind || !where) return "Movement cancelled.";
  return `Movement cancelled. ${capitalize(kind)} ${titleOf(view, id)} is back in ${where}.`;
}
