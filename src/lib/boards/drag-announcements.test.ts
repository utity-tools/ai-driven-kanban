import { describe, expect, it } from "vitest";

import { layoutOf, moveInLayout } from "./drag";
import {
  cancelledMessage,
  droppedMessage,
  movedMessage,
  pickedUpMessage,
} from "./drag-announcements";
import type { BoardView, CardSummary } from "./view-model";

function card(id: string, columnId: string, title: string): CardSummary {
  return {
    id,
    columnId,
    title,
    description: null,
    position: "a0",
    dueOn: null,
    completedAt: null,
    labels: [],
    assignees: [],
  };
}

const VIEW: BoardView = {
  board: { id: "b1", title: "Board" },
  columns: [
    {
      id: "todo",
      title: "To do",
      position: "a0",
      cards: [card("c1", "todo", "Write docs"), card("c2", "todo", "Fix login")],
    },
    { id: "doing", title: "Doing", position: "a1", cards: [] },
  ],
  archivedCards: [],
  labels: [],
  members: [],
};
const LAYOUT = layoutOf(VIEW);

describe("drag announcements", () => {
  it("names the card, its column and its position when picked up", () => {
    expect(pickedUpMessage(VIEW, LAYOUT, "c2")).toBe(
      "Picked up card Fix login. Card is in column To do, position 2 of 2.",
    );
  });

  it("names the column and its position when picked up", () => {
    expect(pickedUpMessage(VIEW, LAYOUT, "doing")).toBe(
      "Picked up column Doing. Column is in position 2 of 2.",
    );
  });

  it("describes the projected place while moving and after dropping", () => {
    const moved = moveInLayout(LAYOUT, "c2", "doing");
    expect(movedMessage(VIEW, LAYOUT, moved, "c2")).toBe(
      "Card Fix login is now in column Doing, position 1 of 1.",
    );
    expect(droppedMessage(VIEW, moved, "c2")).toBe(
      "Dropped card Fix login. Card is in column Doing, position 1 of 1.",
    );
    expect(movedMessage(VIEW, LAYOUT, moveInLayout(LAYOUT, "doing", "todo"), "doing")).toBe(
      "Column Doing is now in position 1 of 2.",
    );
  });

  it("says nothing while the item is over its own place", () => {
    // Right after a drag starts dnd-kit reports the item over itself.
    expect(movedMessage(VIEW, LAYOUT, moveInLayout(LAYOUT, "c1", "c1"), "c1")).toBe("");
  });

  it("says where the item went back to after a cancel", () => {
    expect(cancelledMessage(VIEW, LAYOUT, "c1")).toBe(
      "Movement cancelled. Card Write docs is back in column To do, position 1 of 2.",
    );
  });

  it("falls back to generic messages for unknown ids", () => {
    expect(pickedUpMessage(VIEW, LAYOUT, "zz")).toBe("Picked up an item.");
    expect(movedMessage(VIEW, LAYOUT, LAYOUT, "zz")).toBe("");
    expect(droppedMessage(VIEW, LAYOUT, "zz")).toBe("Dropped the item.");
    expect(cancelledMessage(VIEW, LAYOUT, "zz")).toBe("Movement cancelled.");
  });
});
