import { describe, expect, it } from "vitest";

import {
  applyBoardUpdate,
  columnCardCounts,
  neighborCardId,
  neighborColumnId,
  nextCardPosition,
  nextColumnPosition,
} from "./board-updates";
import { comparePositions } from "./ordering";
import type { ArchivedCard, BoardView, CardSummary } from "./view-model";

function card(id: string, columnId: string, position: string): CardSummary {
  return {
    id,
    columnId,
    title: `Card ${id}`,
    description: null,
    position,
    dueAt: null,
    completedAt: null,
    labels: [],
    assignees: [],
  };
}

function archived(id: string, columnId: string, position: string, at: string): ArchivedCard {
  return { ...card(id, columnId, position), archivedAt: at };
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
      { id: "done", title: "Done", position: "a1", cards: [] },
    ],
    archivedCards: [archived("x1", "todo", "a0V", "2026-09-20T00:00:00Z")],
    labels: [],
    members: [],
  };
}

const ids = (v: BoardView) => v.columns.map((c) => [c.id, c.cards.map((x) => x.id)]);

describe("applyBoardUpdate", () => {
  it("renames the board", () => {
    expect(applyBoardUpdate(view(), { type: "renameBoard", title: "New" }).board.title).toBe("New");
  });

  it("appends a column and ignores a duplicate id", () => {
    const column = { id: "later", title: "Later", position: "a2" };
    const next = applyBoardUpdate(view(), { type: "addColumn", column });

    expect(next.columns.map((c) => c.id)).toEqual(["todo", "done", "later"]);
    expect(applyBoardUpdate(next, { type: "addColumn", column }).columns).toHaveLength(3);
  });

  it("renames a column", () => {
    const next = applyBoardUpdate(view(), {
      type: "renameColumn",
      columnId: "done",
      title: "Shipped",
    });

    expect(next.columns.map((c) => c.title)).toEqual(["To do", "Shipped"]);
  });

  it("adds a card at its position, once", () => {
    const update = {
      type: "addCard" as const,
      card: { id: "d1", columnId: "done", title: "New", position: "a0" },
    };
    const next = applyBoardUpdate(applyBoardUpdate(view(), update), update);

    expect(ids(next)).toEqual([
      ["todo", ["t1", "t2", "t3"]],
      ["done", ["d1"]],
    ]);
    expect(next.columns[1]?.cards[0]).toMatchObject({ title: "New", labels: [], assignees: [] });
  });

  it("renames a card and edits its description, active or archived", () => {
    let next = applyBoardUpdate(view(), { type: "renameCard", cardId: "t2", title: "Renamed" });
    next = applyBoardUpdate(next, { type: "setDescription", cardId: "x1", description: "Hi" });

    expect(next.columns[0]?.cards[1]?.title).toBe("Renamed");
    expect(next.archivedCards[0]).toMatchObject({
      description: "Hi",
      archivedAt: "2026-09-20T00:00:00Z",
    });
  });

  it("archives a card: it leaves its column and heads the archive", () => {
    const next = applyBoardUpdate(view(), {
      type: "archiveCard",
      cardId: "t2",
      archivedAt: "2026-09-24T00:00:00Z",
    });

    expect(ids(next)[0]).toEqual(["todo", ["t1", "t3"]]);
    expect(next.archivedCards.map((c) => c.id)).toEqual(["t2", "x1"]);
  });

  it("restores a card to its old place in its column", () => {
    const next = applyBoardUpdate(view(), { type: "restoreCard", cardId: "x1" });

    expect(ids(next)[0]).toEqual(["todo", ["t1", "x1", "t2", "t3"]]);
    expect(next.archivedCards).toEqual([]);
    expect(next.columns[0]?.cards[1]).not.toHaveProperty("archivedAt");
  });

  it("ignores unknown cards", () => {
    const base = view();

    expect(applyBoardUpdate(base, { type: "archiveCard", cardId: "nope", archivedAt: "x" })).toBe(
      base,
    );
    expect(applyBoardUpdate(base, { type: "restoreCard", cardId: "t1" })).toBe(base);
  });

  it("does not mutate the input", () => {
    const base = view();
    const snapshot = structuredClone(base);
    applyBoardUpdate(base, {
      type: "archiveCard",
      cardId: "t1",
      archivedAt: "2026-09-24T00:00:00Z",
    });
    applyBoardUpdate(base, { type: "restoreCard", cardId: "x1" });

    expect(base).toEqual(snapshot);
  });
});

describe("positions for new items", () => {
  it("appends a card after every card of the column, archived ones included", () => {
    const position = nextCardPosition(view(), "todo");

    expect(comparePositions(position, "a2")).toBeGreaterThan(0);
  });

  it("starts an empty column at a0", () => {
    expect(nextCardPosition(view(), "done")).toBe("a0");
  });

  it("appends a column after the last one", () => {
    expect(nextColumnPosition(view())).toBe("a2");
  });
});

describe("columnCardCounts", () => {
  it("counts active and archived cards", () => {
    expect(columnCardCounts(view(), "todo")).toEqual({ active: 3, archived: 1, total: 4 });
    expect(columnCardCounts(view(), "done")).toEqual({ active: 0, archived: 0, total: 0 });
  });
});

describe("neighbors", () => {
  it("prefers the next card, then the previous one", () => {
    expect(neighborCardId(view(), "t1")).toBe("t2");
    expect(neighborCardId(view(), "t3")).toBe("t2");
    expect(neighborCardId(view(), "missing")).toBeNull();
  });

  it("is null for the only card of a column", () => {
    const v = applyBoardUpdate(view(), {
      type: "addCard",
      card: { id: "d1", columnId: "done", title: "Only", position: "a0" },
    });

    expect(neighborCardId(v, "d1")).toBeNull();
  });

  it("prefers the previous column, then the next one", () => {
    expect(neighborColumnId(view(), "done")).toBe("todo");
    expect(neighborColumnId(view(), "todo")).toBe("done");
    expect(neighborColumnId(view(), "missing")).toBeNull();
  });
});
