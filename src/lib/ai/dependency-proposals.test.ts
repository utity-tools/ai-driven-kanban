import { describe, expect, it } from "vitest";

import { MAX_BLOCKERS } from "@/lib/boards/dependencies";
import type { BoardView, CardSummary } from "@/lib/boards/view-model";
import { findCycle } from "@/lib/graph/dependencies";

import {
  type DependencyCandidate,
  type DependencyContext,
  decodeCandidateIds,
  dependencyCandidates,
  encodeCandidateIds,
  promptCandidates,
  proposeDependencies,
  resolveCandidates,
} from "./dependency-proposals";
import { MAX_CANDIDATES_IN_PROMPT } from "./prompts/dependencies-v1";

const cand = (id: string, overrides: Partial<DependencyCandidate> = {}): DependencyCandidate => ({
  id,
  title: id.toUpperCase(),
  columnTitle: "To do",
  done: false,
  archived: false,
  ...overrides,
});

function ctx(overrides: Partial<DependencyContext> = {}): DependencyContext {
  return {
    targetId: "t",
    candidates: [cand("a"), cand("b"), cand("c")],
    dependencies: [],
    ...overrides,
  };
}

const dep = (blocker: string, rationale = "Needed first.") => ({ blocker, rationale });
const ids = (result: { blockerId: string }[]) => result.map((r) => r.blockerId);

describe("proposeDependencies", () => {
  it("maps references back to cards, keeping order, titles and rationales", () => {
    const result = proposeDependencies({ dependencies: [dep("c3", " why "), dep("c1")] }, ctx(), {
      complete: true,
    });
    expect(result).toEqual([
      { blockerId: "c", title: "C", columnTitle: "To do", rationale: "why" },
      { blockerId: "a", title: "A", columnTitle: "To do", rationale: "Needed first." },
    ]);
  });

  it("drops unknown references and ones past the candidates sent", () => {
    const result = proposeDependencies(
      { dependencies: [dep("c9"), dep("a"), dep("C1"), dep("c2")] },
      ctx(),
      { complete: true },
    );
    expect(ids(result)).toEqual(["b"]);
  });

  it("only maps the candidates that fit in the prompt", () => {
    const many = Array.from({ length: MAX_CANDIDATES_IN_PROMPT + 1 }, (_, i) => cand(`x${i}`));
    const result = proposeDependencies(
      {
        dependencies: [
          dep(`c${MAX_CANDIDATES_IN_PROMPT}`),
          dep(`c${MAX_CANDIDATES_IN_PROMPT + 1}`),
        ],
      },
      ctx({ candidates: many }),
      { complete: true },
    );
    expect(ids(result)).toEqual([`x${MAX_CANDIDATES_IN_PROMPT - 1}`]);
  });

  it("drops the target itself, archived cards and duplicates", () => {
    const result = proposeDependencies(
      { dependencies: [dep("c1"), dep("c2"), dep("c3"), dep("c1"), dep("c4")] },
      ctx({
        candidates: [cand("t"), cand("z", { archived: true }), cand("a"), cand("a")],
      }),
      { complete: true },
    );
    expect(ids(result)).toEqual(["a"]);
  });

  it("drops cards that already block the target", () => {
    const result = proposeDependencies(
      { dependencies: [dep("c1"), dep("c2")] },
      ctx({ dependencies: [{ blockerId: "a", blockedId: "t" }] }),
      { complete: true },
    );
    expect(ids(result)).toEqual(["b"]);
  });

  it("drops cards downstream of the target (direct and transitive cycles)", () => {
    // t -> a (a waits on t), a -> b: proposing a or b as blockers of t closes a cycle.
    const result = proposeDependencies(
      { dependencies: [dep("c1"), dep("c2"), dep("c3")] },
      ctx({
        dependencies: [
          { blockerId: "t", blockedId: "a" },
          { blockerId: "a", blockedId: "b" },
        ],
      }),
      { complete: true },
    );
    expect(ids(result)).toEqual(["c"]);
  });

  it("never yields a cyclic graph when all valid proposals are added together", () => {
    const dependencies = [
      { blockerId: "t", blockedId: "d" },
      { blockerId: "a", blockedId: "b" },
      { blockerId: "b", blockedId: "c" },
      { blockerId: "d", blockedId: "e" },
    ];
    const candidates = ["a", "b", "c", "d", "e", "f"].map((id) => cand(id));
    const result = proposeDependencies(
      { dependencies: candidates.map((_, i) => dep(`c${i + 1}`)) },
      ctx({ candidates, dependencies }),
      { complete: true },
    );
    expect(ids(result)).toEqual(["a", "b", "c", "f"]);
    const merged = [
      ...dependencies,
      ...ids(result).map((blockerId) => ({ blockerId, blockedId: "t" })),
    ];
    expect(findCycle(merged)).toBeNull();
  });

  it("caps at 10 proposals", () => {
    const candidates = Array.from({ length: 15 }, (_, i) => cand(`x${i}`));
    const result = proposeDependencies(
      { dependencies: candidates.map((_, i) => dep(`c${i + 1}`)) },
      ctx({ candidates }),
      { complete: true },
    );
    expect(result).toHaveLength(10);
  });

  it("caps at the room left under the blocker limit", () => {
    const existing = Array.from({ length: MAX_BLOCKERS - 2 }, (_, i) => ({
      blockerId: `old${i}`,
      blockedId: "t",
    }));
    const result = proposeDependencies(
      { dependencies: [dep("c1"), dep("c2"), dep("c3")] },
      ctx({ dependencies: existing }),
      { complete: true },
    );
    expect(ids(result)).toEqual(["a", "b"]);
    expect(
      proposeDependencies(
        { dependencies: [dep("c1")] },
        ctx({
          dependencies: [
            ...existing,
            { blockerId: "o1", blockedId: "t" },
            { blockerId: "o2", blockedId: "t" },
          ],
        }),
        { complete: true },
      ),
    ).toEqual([]);
  });

  describe("partial streamed output", () => {
    it("handles undefined, missing and malformed fields without throwing", () => {
      const partial = (value: unknown) =>
        proposeDependencies(value as never, ctx(), { complete: false });
      expect(partial(undefined)).toEqual([]);
      expect(partial({})).toEqual([]);
      expect(partial({ dependencies: "c1" })).toEqual([]);
      expect(
        partial({
          dependencies: [undefined, null, {}, { blocker: 3 }, { blocker: "c1", rationale: 5 }],
        }),
      ).toEqual([]);
    });

    it("waits for the last item's rationale before trusting its reference", () => {
      expect(
        proposeDependencies({ dependencies: [dep("c1"), { blocker: "c2" }] }, ctx(), {
          complete: false,
        }),
      ).toHaveLength(1);
      expect(
        proposeDependencies({ dependencies: [{ blocker: "c2", rationale: "Wh" }] }, ctx(), {
          complete: false,
        }),
      ).toHaveLength(1);
    });

    it("accepts a last item without rationale once the stream is complete", () => {
      expect(
        proposeDependencies({ dependencies: [{ blocker: "c2" }] }, ctx(), { complete: true }),
      ).toHaveLength(1);
    });
  });
});

function card(id: string, columnId: string): CardSummary {
  return {
    id,
    columnId,
    title: id,
    description: null,
    position: "a0",
    dueOn: null,
    completedAt: null,
    labels: [],
    assignees: [],
    subtasks: [],
  };
}

describe("dependencyCandidates", () => {
  const view: BoardView = {
    board: { id: "b", title: "B" },
    columns: [
      {
        id: "todo",
        title: "To do",
        position: "a0",
        isDone: false,
        cards: [card("t", "todo"), card("a", "todo"), card("b", "todo")],
      },
      {
        id: "done",
        title: "Done",
        position: "a1",
        isDone: true,
        cards: [card("d", "done"), card("e", "done")],
      },
    ],
    archivedCards: [{ ...card("z", "todo"), archivedAt: "2026-09-20T00:00:00Z" }],
    labels: [],
    members: [],
    dependencies: [
      { blockerId: "a", blockedId: "t" },
      { blockerId: "t", blockedId: "e" },
    ],
  };

  it("lists active cards in board order, minus the target, its blockers and its downstream", () => {
    expect(dependencyCandidates(view, "t")).toEqual([
      { id: "b", title: "b", columnTitle: "To do", done: false, archived: false },
      { id: "d", title: "d", columnTitle: "Done", done: true, archived: false },
    ]);
  });
});

describe("candidate id header", () => {
  const list = Array.from({ length: MAX_CANDIDATES_IN_PROMPT + 5 }, (_, i) => cand(`x${i}`));

  it("encodes only the candidates the prompt shows, in order", () => {
    const ids = decodeCandidateIds(encodeCandidateIds(list));
    expect(ids).toHaveLength(MAX_CANDIDATES_IN_PROMPT);
    expect(ids.slice(0, 3)).toEqual(["x0", "x1", "x2"]);
    expect(promptCandidates(list)).toHaveLength(MAX_CANDIDATES_IN_PROMPT);
  });

  it("decodes a missing, empty or sloppy header", () => {
    expect(decodeCandidateIds(null)).toEqual([]);
    expect(decodeCandidateIds("")).toEqual([]);
    expect(decodeCandidateIds(" a, ,b ,")).toEqual(["a", "b"]);
  });
});

describe("resolveCandidates", () => {
  const view: BoardView = {
    board: { id: "b", title: "B" },
    columns: [
      { id: "todo", title: "To do", position: "a0", isDone: false, cards: [card("a", "todo")] },
      { id: "done", title: "Done", position: "a1", isDone: true, cards: [card("d", "done")] },
    ],
    archivedCards: [],
    labels: [],
    members: [],
    dependencies: [],
  };

  it("keeps the order of the ids and reads titles from the board", () => {
    expect(resolveCandidates(view, ["d", "a"])).toEqual([
      { id: "d", title: "d", columnTitle: "Done", done: true, archived: false },
      { id: "a", title: "a", columnTitle: "To do", done: false, archived: false },
    ]);
  });

  it("keeps the slot of a card that is gone, so later refs line up, and it is dropped", () => {
    const candidates = resolveCandidates(view, ["gone", "a"]);
    expect(candidates[0]?.archived).toBe(true);
    const result = proposeDependencies(
      { dependencies: [dep("c1"), dep("c2")] },
      ctx({ candidates }),
      { complete: true },
    );
    expect(ids(result)).toEqual(["a"]);
  });
});
