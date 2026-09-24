import { describe, expect, it } from "vitest";

import {
  applyBoardUpdate,
  columnCardCounts,
  labelCardCount,
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
    dueOn: null,
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

// ---------------------------------------------------------------------------
// Card details: due date, labels, assignees
// ---------------------------------------------------------------------------

const bug = { id: "l-bug", name: "bug", color: "red" };
const api = { id: "l-api", name: "api", color: "blue" };
const green = { id: "l-green", name: "", color: "green" };
const alice = { id: "u-alice", displayName: "Alice", avatarUrl: null, role: "owner" as const };
const bob = { id: "u-bob", displayName: "Bob", avatarUrl: null, role: "editor" as const };

/** A board with labels and members; t1 has "bug", archived x1 has "bug" too. */
function detailedView(): BoardView {
  const base = view();
  const withBug = (c: CardSummary) => (c.id === "t1" ? { ...c, labels: [bug] } : c);
  return {
    ...base,
    columns: base.columns.map((col) => ({ ...col, cards: col.cards.map(withBug) })),
    archivedCards: base.archivedCards.map((c) => ({ ...c, labels: [bug] })),
    labels: [api, bug, green],
    members: [alice, bob],
  };
}

function findCard(v: BoardView, id: string): CardSummary | undefined {
  return [...v.columns.flatMap((c) => c.cards), ...v.archivedCards].find((c) => c.id === id);
}

describe("applyBoardUpdate: due dates", () => {
  it("sets and changes a due date, keeping the done mark", () => {
    let next = applyBoardUpdate(view(), { type: "setDueDate", cardId: "t1", dueOn: "2026-10-02" });
    next = applyBoardUpdate(next, {
      type: "setCompleted",
      cardId: "t1",
      completedAt: "2026-10-01T10:00:00Z",
    });
    next = applyBoardUpdate(next, { type: "setDueDate", cardId: "t1", dueOn: "2026-10-05" });

    expect(findCard(next, "t1")).toMatchObject({
      dueOn: "2026-10-05",
      completedAt: "2026-10-01T10:00:00Z",
    });
  });

  it("removing the date also clears the done mark", () => {
    let next = applyBoardUpdate(view(), { type: "setDueDate", cardId: "t1", dueOn: "2026-10-02" });
    next = applyBoardUpdate(next, { type: "setCompleted", cardId: "t1", completedAt: "x" });
    next = applyBoardUpdate(next, { type: "setDueDate", cardId: "t1", dueOn: null });

    expect(findCard(next, "t1")).toMatchObject({ dueOn: null, completedAt: null });
  });

  it("marks done and not done; ignores cards without a due date", () => {
    const dated = applyBoardUpdate(view(), {
      type: "setDueDate",
      cardId: "t1",
      dueOn: "2026-10-02",
    });
    const done = applyBoardUpdate(dated, { type: "setCompleted", cardId: "t1", completedAt: "x" });
    expect(findCard(done, "t1")?.completedAt).toBe("x");
    const undone = applyBoardUpdate(done, {
      type: "setCompleted",
      cardId: "t1",
      completedAt: null,
    });
    expect(findCard(undone, "t1")?.completedAt).toBeNull();

    const noDate = applyBoardUpdate(view(), {
      type: "setCompleted",
      cardId: "t2",
      completedAt: "x",
    });
    expect(findCard(noDate, "t2")?.completedAt).toBeNull();
  });

  it("updates archived cards too", () => {
    const next = applyBoardUpdate(view(), {
      type: "setDueDate",
      cardId: "x1",
      dueOn: "2026-10-02",
    });
    expect(next.archivedCards[0]).toMatchObject({
      dueOn: "2026-10-02",
      archivedAt: expect.any(String),
    });
  });
});

describe("applyBoardUpdate: labels", () => {
  it("attaches a board label in label order, once", () => {
    const attach = { type: "attachLabel" as const, cardId: "t1", labelId: "l-api" };
    const next = applyBoardUpdate(applyBoardUpdate(detailedView(), attach), attach);

    expect(findCard(next, "t1")?.labels.map((l) => l.id)).toEqual(["l-api", "l-bug"]);
  });

  it("ignores attaching a label that isn't on the board", () => {
    const before = detailedView();
    const next = applyBoardUpdate(before, { type: "attachLabel", cardId: "t2", labelId: "nope" });
    expect(findCard(next, "t2")?.labels).toEqual([]);
  });

  it("detaches a label", () => {
    const next = applyBoardUpdate(detailedView(), {
      type: "detachLabel",
      cardId: "t1",
      labelId: "l-bug",
    });
    expect(findCard(next, "t1")?.labels).toEqual([]);
    expect(findCard(next, "x1")?.labels).toEqual([bug]); // other cards keep it
  });

  it("creates a label in order, once, optionally attached to a card", () => {
    const label = { id: "l-docs", name: "docs", color: "sky" };
    const update = { type: "addLabel" as const, label, cardId: "t2" };
    const next = applyBoardUpdate(applyBoardUpdate(detailedView(), update), update);

    expect(next.labels.map((l) => l.id)).toEqual(["l-api", "l-bug", "l-docs", "l-green"]);
    expect(findCard(next, "t2")?.labels).toEqual([label]);

    const unattached = applyBoardUpdate(detailedView(), { type: "addLabel", label });
    expect(unattached.labels).toHaveLength(4);
    expect(findCard(unattached, "t2")?.labels).toEqual([]);
  });

  it("edits a label everywhere: board list and every card, archived included, re-sorted", () => {
    const renamed = { ...bug, name: "zz-bug", color: "orange" };
    let next = applyBoardUpdate(detailedView(), {
      type: "attachLabel",
      cardId: "t1",
      labelId: "l-api",
    });
    next = applyBoardUpdate(next, { type: "updateLabel", label: renamed });

    expect(next.labels.map((l) => l.name)).toEqual(["api", "zz-bug", ""]);
    expect(findCard(next, "t1")?.labels).toEqual([api, renamed]);
    expect(findCard(next, "x1")?.labels).toEqual([renamed]);
    expect(next.archivedCards[0]?.archivedAt).toBe("2026-09-20T00:00:00Z");
  });

  it("ignores editing an unknown label", () => {
    const before = detailedView();
    const next = applyBoardUpdate(before, {
      type: "updateLabel",
      label: { id: "nope", name: "x", color: "red" },
    });
    expect(next).toBe(before);
  });

  it("deletes a label from the board and every card", () => {
    const next = applyBoardUpdate(detailedView(), { type: "deleteLabel", labelId: "l-bug" });

    expect(next.labels.map((l) => l.id)).toEqual(["l-api", "l-green"]);
    expect(findCard(next, "t1")?.labels).toEqual([]);
    expect(findCard(next, "x1")?.labels).toEqual([]);
  });
});

describe("applyBoardUpdate: assignees", () => {
  it("assigns a member (without their role) in name order, once", () => {
    const assign = (userId: string) => ({ type: "assignMember" as const, cardId: "t1", userId });
    let next = applyBoardUpdate(detailedView(), assign("u-bob"));
    next = applyBoardUpdate(next, assign("u-alice"));
    next = applyBoardUpdate(next, assign("u-bob"));

    expect(findCard(next, "t1")?.assignees).toEqual([
      { id: "u-alice", displayName: "Alice", avatarUrl: null },
      { id: "u-bob", displayName: "Bob", avatarUrl: null },
    ]);
  });

  it("ignores assigning someone who isn't a member", () => {
    const next = applyBoardUpdate(detailedView(), {
      type: "assignMember",
      cardId: "t1",
      userId: "u-stranger",
    });
    expect(findCard(next, "t1")?.assignees).toEqual([]);
  });

  it("unassigns a member", () => {
    let next = applyBoardUpdate(detailedView(), {
      type: "assignMember",
      cardId: "t1",
      userId: "u-bob",
    });
    next = applyBoardUpdate(next, { type: "unassignMember", cardId: "t1", userId: "u-bob" });
    expect(findCard(next, "t1")?.assignees).toEqual([]);
  });
});

describe("labelCardCount", () => {
  it("counts active and archived cards carrying the label", () => {
    expect(labelCardCount(detailedView(), "l-bug")).toBe(2);
    expect(labelCardCount(detailedView(), "l-api")).toBe(0);
  });
});
