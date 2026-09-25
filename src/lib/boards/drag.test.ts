import { describe, expect, it } from "vitest";

import { applyBoardUpdate } from "./board-updates";
import {
  type BoardLayout,
  applyLayout,
  columnIdOf,
  dropResult,
  isColumnId,
  layoutOf,
  moveInLayout,
  neighborsOf,
  placeOf,
} from "./drag";
import type { BoardView, CardSummary } from "./view-model";

function card(id: string, columnId: string, position: string): CardSummary {
  return {
    id,
    columnId,
    title: `Card ${id}`,
    description: null,
    position,
    dueOn: null,
    completedAt: null,
    labels: [],
    assignees: [],
  };
}

function view(): BoardView {
  return {
    board: { id: "b1", title: "Board" },
    columns: [
      {
        id: "todo",
        title: "To do",
        position: "a0",
        cards: [card("t1", "todo", "a0"), card("t2", "todo", "a1"), card("t3", "todo", "a2")],
      },
      { id: "doing", title: "Doing", position: "a1", cards: [card("d1", "doing", "a0")] },
      { id: "done", title: "Done", position: "a2", cards: [] },
    ],
    archivedCards: [{ ...card("x1", "todo", "a0V"), archivedAt: "2026-09-20T00:00:00Z" }],
    labels: [],
    members: [],
  };
}

const LAYOUT: BoardLayout = layoutOf(view());

const ids = (v: BoardView) => v.columns.map((c) => [c.id, c.cards.map((x) => x.id)]);
const order = (layout: BoardLayout) => layout.map((c) => [c.id, [...c.cardIds]]);

describe("layoutOf", () => {
  it("keeps the order of columns and active cards, without archived cards", () => {
    expect(order(LAYOUT)).toEqual([
      ["todo", ["t1", "t2", "t3"]],
      ["doing", ["d1"]],
      ["done", []],
    ]);
  });
});

describe("lookups", () => {
  it("tells columns from cards", () => {
    expect(isColumnId(LAYOUT, "doing")).toBe(true);
    expect(isColumnId(LAYOUT, "d1")).toBe(false);
  });

  it("finds the column of a card, a column, or nothing", () => {
    expect(columnIdOf(LAYOUT, "t2")).toBe("todo");
    expect(columnIdOf(LAYOUT, "done")).toBe("done");
    expect(columnIdOf(LAYOUT, "x1")).toBeNull();
  });

  it("describes where an item sits", () => {
    expect(placeOf(LAYOUT, "t2")).toEqual({ type: "card", columnId: "todo", index: 1, total: 3 });
    expect(placeOf(LAYOUT, "done")).toEqual({
      type: "column",
      columnId: "done",
      index: 2,
      total: 3,
    });
    expect(placeOf(LAYOUT, "nope")).toBeNull();
  });

  it("returns the neighbours of an id, null at the ends", () => {
    expect(neighborsOf(["a", "b", "c"], "b")).toEqual({ previousId: "a", nextId: "c" });
    expect(neighborsOf(["a", "b", "c"], "a")).toEqual({ previousId: null, nextId: "b" });
    expect(neighborsOf(["a", "b", "c"], "c")).toEqual({ previousId: "b", nextId: null });
    expect(neighborsOf(["a"], "a")).toEqual({ previousId: null, nextId: null });
    expect(neighborsOf(["a"], "z")).toEqual({ previousId: null, nextId: null });
  });
});

describe("moveInLayout", () => {
  it("returns the same layout for a no-op", () => {
    expect(moveInLayout(LAYOUT, "t1", "t1")).toBe(LAYOUT);
    expect(moveInLayout(LAYOUT, "t1", "todo")).toBe(LAYOUT);
    expect(moveInLayout(LAYOUT, "todo", "t2")).toBe(LAYOUT);
    expect(moveInLayout(LAYOUT, "t1", "unknown")).toBe(LAYOUT);
    expect(moveInLayout(LAYOUT, "unknown", "t1")).toBe(LAYOUT);
  });

  it("moves a card down and up within its column", () => {
    expect(order(moveInLayout(LAYOUT, "t1", "t3"))[0]).toEqual(["todo", ["t2", "t3", "t1"]]);
    expect(order(moveInLayout(LAYOUT, "t3", "t1"))[0]).toEqual(["todo", ["t3", "t1", "t2"]]);
    expect(order(moveInLayout(LAYOUT, "t1", "t2"))[0]).toEqual(["todo", ["t2", "t1", "t3"]]);
  });

  it("moves a card before a card of another column, or after it", () => {
    expect(order(moveInLayout(LAYOUT, "t2", "d1"))).toEqual([
      ["todo", ["t1", "t3"]],
      ["doing", ["t2", "d1"]],
      ["done", []],
    ]);
    expect(order(moveInLayout(LAYOUT, "t2", "d1", { after: true }))[1]).toEqual([
      "doing",
      ["d1", "t2"],
    ]);
  });

  it("appends a card to another column, including an empty one", () => {
    expect(order(moveInLayout(LAYOUT, "t1", "doing"))[1]).toEqual(["doing", ["d1", "t1"]]);
    const next = moveInLayout(LAYOUT, "d1", "done", { after: true });
    expect(order(next)).toEqual([
      ["todo", ["t1", "t2", "t3"]],
      ["doing", []],
      ["done", ["d1"]],
    ]);
  });

  it("moves columns, whether over a column or one of its cards", () => {
    expect(moveInLayout(LAYOUT, "todo", "done").map((c) => c.id)).toEqual([
      "doing",
      "done",
      "todo",
    ]);
    expect(moveInLayout(LAYOUT, "done", "t3").map((c) => c.id)).toEqual(["done", "todo", "doing"]);
  });

  it("does not mutate the input", () => {
    const before = order(LAYOUT);
    moveInLayout(LAYOUT, "t1", "d1");
    moveInLayout(LAYOUT, "todo", "done");
    expect(order(LAYOUT)).toEqual(before);
  });
});

describe("dropResult", () => {
  it("is null when the item is back where it started", () => {
    expect(dropResult(LAYOUT, LAYOUT, "t2")).toBeNull();
    expect(dropResult(LAYOUT, LAYOUT, "doing")).toBeNull();
    // Dragged away and back again.
    const away = moveInLayout(LAYOUT, "t2", "d1");
    expect(dropResult(LAYOUT, moveInLayout(away, "t2", "t3"), "t2")).toBeNull();
  });

  it("is null for ids outside the layout", () => {
    expect(dropResult(LAYOUT, LAYOUT, "x1")).toBeNull();
  });

  it("gives the neighbours of a card moved within its column", () => {
    expect(dropResult(LAYOUT, moveInLayout(LAYOUT, "t1", "t3"), "t1")).toEqual({
      type: "moveCard",
      cardId: "t1",
      columnId: "todo",
      previousId: "t3",
      nextId: null,
    });
    expect(dropResult(LAYOUT, moveInLayout(LAYOUT, "t3", "t2"), "t3")).toEqual({
      type: "moveCard",
      cardId: "t3",
      columnId: "todo",
      previousId: "t1",
      nextId: "t2",
    });
  });

  it("gives the column and neighbours of a card moved to another column", () => {
    expect(dropResult(LAYOUT, moveInLayout(LAYOUT, "t2", "d1"), "t2")).toEqual({
      type: "moveCard",
      cardId: "t2",
      columnId: "doing",
      previousId: null,
      nextId: "d1",
    });
    expect(dropResult(LAYOUT, moveInLayout(LAYOUT, "t2", "done"), "t2")).toEqual({
      type: "moveCard",
      cardId: "t2",
      columnId: "done",
      previousId: null,
      nextId: null,
    });
  });

  it("gives the neighbours of a moved column", () => {
    expect(dropResult(LAYOUT, moveInLayout(LAYOUT, "done", "todo"), "done")).toEqual({
      type: "moveColumn",
      columnId: "done",
      previousId: null,
      nextId: "todo",
    });
  });

  it("feeds the optimistic update, which lands the item where it was dropped", () => {
    const final = moveInLayout(moveInLayout(LAYOUT, "t1", "d1", { after: true }), "t1", "d1");
    const result = dropResult(LAYOUT, final, "t1");
    expect(result).not.toBeNull();
    if (!result) return;
    expect(ids(applyBoardUpdate(view(), result))).toEqual(ids(applyLayout(view(), final)));
  });
});

describe("applyLayout", () => {
  it("rearranges columns and cards and updates the moved card's column", () => {
    const next = applyLayout(
      view(),
      moveInLayout(moveInLayout(LAYOUT, "t1", "done"), "done", "todo"),
    );
    expect(ids(next)).toEqual([
      ["done", ["t1"]],
      ["todo", ["t2", "t3"]],
      ["doing", ["d1"]],
    ]);
    expect(next.columns[0]?.cards[0]?.columnId).toBe("done");
    expect(next.archivedCards).toEqual(view().archivedCards);
  });

  it("skips items the view no longer has and keeps new ones", () => {
    const current = view();
    current.columns = current.columns.filter((c) => c.id !== "doing");
    current.columns[0]?.cards.splice(0, 1); // t1 was archived meanwhile
    current.columns[0]?.cards.push(card("t4", "todo", "a3")); // t4 was added meanwhile
    current.columns.push({ id: "later", title: "Later", position: "a3", cards: [] });

    expect(ids(applyLayout(current, moveInLayout(LAYOUT, "t3", "t2")))).toEqual([
      ["todo", ["t3", "t2", "t4"]],
      ["done", []],
      ["later", []],
    ]);
  });
});
