import { describe, expect, it } from "vitest";

import {
  type Dependency,
  blockedCardIds,
  bottlenecks,
  findCycle,
  wouldCreateCycle,
} from "./dependencies";

/** `edges("a>b", "b>c")`: a blocks b, b blocks c. */
function edges(...pairs: string[]): Dependency[] {
  return pairs.map((pair) => {
    const [blockerId = "", blockedId = ""] = pair.split(">");
    return { blockerId, blockedId };
  });
}

const resolvedAmong =
  (...ids: string[]) =>
  (cardId: string) =>
    ids.includes(cardId);
const noneResolved = resolvedAmong();

describe("wouldCreateCycle", () => {
  it("rejects a self-dependency", () => {
    expect(wouldCreateCycle([], "a", "a")).toBe(true);
  });

  it("accepts an edge in an empty graph", () => {
    expect(wouldCreateCycle([], "a", "b")).toBe(false);
  });

  it("rejects the reverse of an existing edge", () => {
    expect(wouldCreateCycle(edges("a>b"), "b", "a")).toBe(true);
  });

  it("rejects closing a longer chain", () => {
    expect(wouldCreateCycle(edges("a>b", "b>c", "c>d"), "d", "a")).toBe(true);
  });

  it("accepts shortcuts and parallel branches", () => {
    const graph = edges("a>b", "b>c", "a>d");
    expect(wouldCreateCycle(graph, "a", "c")).toBe(false);
    expect(wouldCreateCycle(graph, "d", "c")).toBe(false);
  });

  it("accepts a duplicate edge (the database rejects it as a duplicate, not a cycle)", () => {
    expect(wouldCreateCycle(edges("a>b"), "a", "b")).toBe(false);
  });
});

describe("findCycle", () => {
  it("returns null for an acyclic graph", () => {
    expect(findCycle(edges("a>b", "b>c", "a>c", "d>c"))).toBeNull();
  });

  it("returns null for an empty graph", () => {
    expect(findCycle([])).toBeNull();
  });

  it("finds a two-node cycle as a closed path", () => {
    expect(findCycle(edges("a>b", "b>a"))).toEqual(["a", "b", "a"]);
  });

  it("finds a cycle reached from an acyclic prefix", () => {
    expect(findCycle(edges("x>a", "a>b", "b>c", "c>a"))).toEqual(["a", "b", "c", "a"]);
  });

  it("finds a self-loop", () => {
    expect(findCycle(edges("a>a"))).toEqual(["a", "a"]);
  });

  it("handles a long chain without recursion limits", () => {
    const chain = Array.from({ length: 20_000 }, (_, i) => `${i}>${i + 1}`);
    expect(findCycle(edges(...chain))).toBeNull();
    expect(findCycle(edges(...chain, "20000>0"))).toHaveLength(20_002);
  });
});

describe("blockedCardIds", () => {
  it("marks cards with an unresolved blocker", () => {
    expect(blockedCardIds(edges("a>b", "b>c"), noneResolved)).toEqual(new Set(["b", "c"]));
  });

  it("ignores resolved blockers", () => {
    expect(blockedCardIds(edges("a>b", "b>c"), resolvedAmong("a"))).toEqual(new Set(["c"]));
  });

  it("does not mark a resolved card as blocked", () => {
    expect(blockedCardIds(edges("a>b"), resolvedAmong("b"))).toEqual(new Set());
  });

  it("keeps a card blocked while any blocker is unresolved", () => {
    expect(blockedCardIds(edges("a>c", "b>c"), resolvedAmong("a"))).toEqual(new Set(["c"]));
  });
});

describe("bottlenecks", () => {
  it("ranks cards by how many cards they hold up transitively", () => {
    const graph = edges("a>b", "b>c", "b>d", "e>d");
    expect(bottlenecks(graph, noneResolved)).toEqual([
      { cardId: "a", blockedCount: 3 },
      { cardId: "b", blockedCount: 2 },
      { cardId: "e", blockedCount: 1 },
    ]);
  });

  it("counts a card reached through two paths once", () => {
    expect(bottlenecks(edges("a>b", "a>c", "b>d", "c>d"), noneResolved)[0]).toEqual({
      cardId: "a",
      blockedCount: 3,
    });
  });

  it("treats a resolved card as breaking the chain", () => {
    expect(bottlenecks(edges("a>b", "b>c"), resolvedAmong("b"))).toEqual([]);
  });

  it("does not count resolved cards downstream", () => {
    expect(bottlenecks(edges("a>b", "a>c"), resolvedAmong("c"))).toEqual([
      { cardId: "a", blockedCount: 1 },
    ]);
  });

  it("orders ties by card id and applies the limit", () => {
    const graph = edges("c>x", "a>y", "b>z");
    expect(bottlenecks(graph, noneResolved, 2).map((b) => b.cardId)).toEqual(["a", "b"]);
  });

  it("terminates on cyclic data", () => {
    expect(bottlenecks(edges("a>b", "b>a"), noneResolved)).toEqual([
      { cardId: "a", blockedCount: 1 },
      { cardId: "b", blockedCount: 1 },
    ]);
  });
});
