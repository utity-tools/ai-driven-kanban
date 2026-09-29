import { describe, expect, it } from "vitest";

import {
  blockedIds,
  blockerCandidates,
  cardDependencies,
  filterCandidates,
  resolver,
  topBottlenecks,
  unresolvedBlockerCounts,
} from "./dependencies";
import type { ArchivedCard, BoardView, CardSummary } from "./view-model";

function card(id: string, columnId: string): CardSummary {
  return {
    id,
    columnId,
    title: id.toUpperCase(),
    description: null,
    position: "a0",
    dueOn: null,
    completedAt: null,
    labels: [],
    assignees: [],
    subtasks: [],
  };
}

/** a, b, c in "To do"; d in "Done" (isDone); z archived from "To do". */
function view(edges: [string, string][]): BoardView {
  const archived: ArchivedCard = { ...card("z", "todo"), archivedAt: "2026-09-20T00:00:00Z" };
  return {
    board: { id: "b", title: "Board" },
    columns: [
      {
        id: "todo",
        title: "To do",
        position: "a0",
        isDone: false,
        cards: [card("a", "todo"), card("b", "todo"), card("c", "todo")],
      },
      { id: "done", title: "Done", position: "a1", isDone: true, cards: [card("d", "done")] },
    ],
    archivedCards: [archived],
    labels: [],
    members: [],
    dependencies: edges.map(([blockerId, blockedId]) => ({ blockerId, blockedId })),
  };
}

describe("resolver", () => {
  it("resolves cards in done columns, archived cards and unknown cards", () => {
    const isResolved = resolver(view([]));
    expect(isResolved("d")).toBe(true);
    expect(isResolved("z")).toBe(true);
    expect(isResolved("ghost")).toBe(true);
    expect(isResolved("a")).toBe(false);
  });
});

describe("blockedIds and unresolvedBlockerCounts", () => {
  const v = view([
    ["a", "b"],
    ["d", "b"], // resolved blocker: does not count
    ["z", "c"], // archived blocker: does not count
    ["b", "c"],
  ]);

  it("lists unresolved cards with an unresolved blocker", () => {
    expect([...blockedIds(v)].sort()).toEqual(["b", "c"]);
  });

  it("counts only unresolved blockers", () => {
    expect(Object.fromEntries(unresolvedBlockerCounts(v))).toEqual({ b: 1, c: 1 });
  });
});

describe("cardDependencies", () => {
  it("returns both directions with column and resolved state, in board order", () => {
    const v = view([
      ["c", "b"],
      ["d", "b"],
      ["b", "a"],
      ["ghost", "b"], // not on the board: skipped
    ]);

    expect(cardDependencies(v, "b")).toEqual({
      blockedBy: [
        { cardId: "c", title: "C", columnTitle: "To do", resolved: false },
        { cardId: "d", title: "D", columnTitle: "Done", resolved: true },
      ],
      blocks: [{ cardId: "a", title: "A", columnTitle: "To do", resolved: false }],
    });
  });

  it("includes archived cards as resolved", () => {
    const { blockedBy } = cardDependencies(view([["z", "a"]]), "a");
    expect(blockedBy).toEqual([{ cardId: "z", title: "Z", columnTitle: "To do", resolved: true }]);
  });
});

describe("blockerCandidates", () => {
  it("excludes itself, archived cards, existing blockers and cycle-closing cards", () => {
    // a blocks b; b blocks c. Candidates to block "a": not a, not z (archived);
    // b and c would close a cycle (a -> b -> c); d is free.
    const v = view([
      ["a", "b"],
      ["b", "c"],
    ]);
    expect(blockerCandidates(v, "a").map((c) => c.id)).toEqual(["d"]);
    // Candidates for "c": b is already a blocker; a would be fine (a -> c), d too.
    expect(blockerCandidates(v, "c").map((c) => c.id)).toEqual(["a", "d"]);
  });

  it("carries the column title", () => {
    expect(blockerCandidates(view([]), "a").at(-1)).toEqual({
      id: "d",
      title: "D",
      columnTitle: "Done",
    });
  });
});

describe("topBottlenecks", () => {
  it("ranks unresolved cards by how many they hold up, with titles, capped at 3", () => {
    const v = view([
      ["a", "b"],
      ["b", "c"],
      ["c", "d"], // d is resolved: c holds up nothing
    ]);
    expect(topBottlenecks(v)).toEqual([
      { cardId: "a", title: "A", blockedCount: 2 },
      { cardId: "b", title: "B", blockedCount: 1 },
    ]);
    expect(topBottlenecks(v, 1)).toHaveLength(1);
  });

  it("is empty when nothing is held up", () => {
    expect(topBottlenecks(view([["d", "a"]]))).toEqual([]);
  });
});

describe("filterCandidates", () => {
  const items = [{ title: "Write docs" }, { title: "Fix login" }];

  it("matches case-insensitively and returns everything for a blank query", () => {
    expect(filterCandidates(items, "  LOG ")).toEqual([{ title: "Fix login" }]);
    expect(filterCandidates(items, "  ")).toEqual(items);
    expect(filterCandidates(items, "zzz")).toEqual([]);
  });
});
