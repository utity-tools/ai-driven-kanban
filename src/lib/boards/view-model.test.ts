import { describe, expect, it } from "vitest";

import {
  type RawBoardData,
  assembleBoardView,
  buildCardDetails,
  cardCount,
  describeDue,
} from "./view-model";

const alice = { id: "u-alice", display_name: "Alice Martin", avatar_url: null };
const bob = {
  id: "u-bob",
  display_name: "bob Chen",
  avatar_url: "https://avatars.githubusercontent.com/u/1",
};
const anon = { id: "u-anon", display_name: null, avatar_url: null };

function card(
  overrides: Partial<RawBoardData["cards"][number]> & {
    id: string;
    column_id: string;
    position: string;
  },
): RawBoardData["cards"][number] {
  return {
    title: overrides.id,
    description: null,
    due_at: null,
    completed_at: null,
    card_assignees: [],
    card_labels: [],
    ...overrides,
  };
}

function raw(overrides: Partial<RawBoardData> = {}): RawBoardData {
  return {
    board: { id: "b1", title: "Demo" },
    columns: [
      { id: "col-done", title: "Done", position: "a1" },
      { id: "col-todo", title: "To do", position: "Zz" }, // byte order: "Zz" < "a1"
    ],
    cards: [],
    labels: [],
    members: [],
    ...overrides,
  };
}

describe("assembleBoardView", () => {
  it("orders columns by position in byte order", () => {
    const view = assembleBoardView(raw());

    expect(view.columns.map((c) => c.title)).toEqual(["To do", "Done"]);
  });

  it("groups cards into their columns, ordered by position then id", () => {
    const view = assembleBoardView(
      raw({
        cards: [
          card({ id: "c3", column_id: "col-todo", position: "a1" }),
          card({ id: "c2", column_id: "col-todo", position: "a0V" }),
          card({ id: "c1b", column_id: "col-todo", position: "a0" }),
          card({ id: "c1a", column_id: "col-todo", position: "a0" }),
          card({ id: "c4", column_id: "col-todo", position: "B" }),
          card({ id: "d1", column_id: "col-done", position: "a0" }),
        ],
      }),
    );

    expect(view.columns[0]?.cards.map((c) => c.id)).toEqual(["c4", "c1a", "c1b", "c2", "c3"]);
    expect(view.columns[1]?.cards.map((c) => c.id)).toEqual(["d1"]);
    expect(cardCount(view)).toBe(6);
  });

  it("keeps empty columns and drops cards of unknown columns", () => {
    const view = assembleBoardView(
      raw({ cards: [card({ id: "x", column_id: "col-elsewhere", position: "a0" })] }),
    );

    expect(view.columns.map((c) => c.cards)).toEqual([[], []]);
  });

  it("flattens labels and assignees, skipping embeds hidden by RLS", () => {
    const view = assembleBoardView(
      raw({
        cards: [
          card({
            id: "c1",
            column_id: "col-todo",
            position: "a0",
            card_labels: [
              { board_labels: { id: "l2", name: "", color: "green" } },
              { board_labels: null },
              { board_labels: { id: "l1", name: "bug", color: "red" } },
            ],
            card_assignees: [
              { profile: bob },
              { profile: null },
              { profile: anon },
              { profile: alice },
            ],
          }),
        ],
      }),
    );
    const c1 = view.columns[0]?.cards[0];

    expect(c1?.labels.map((l) => l.id)).toEqual(["l1", "l2"]); // named first, colour-only last
    expect(c1?.assignees.map((a) => a.id)).toEqual(["u-alice", "u-bob", "u-anon"]);
    expect(c1?.assignees[1]).toEqual({
      id: "u-bob",
      displayName: "bob Chen",
      avatarUrl: "https://avatars.githubusercontent.com/u/1",
    });
  });

  it("orders members by role, then name", () => {
    const view = assembleBoardView(
      raw({
        members: [
          { role: "viewer", profile: anon },
          { role: "editor", profile: bob },
          { role: "owner", profile: alice },
          { role: "editor", profile: null },
        ],
      }),
    );

    expect(view.members.map((m) => [m.role, m.id])).toEqual([
      ["owner", "u-alice"],
      ["editor", "u-bob"],
      ["viewer", "u-anon"],
    ]);
  });
});

describe("describeDue", () => {
  const now = new Date("2026-10-01T12:00:00Z");

  it("is null without a due date", () => {
    expect(describeDue({ dueAt: null, completedAt: null }, now)).toBeNull();
  });

  it("returns status, short text and ISO date", () => {
    expect(describeDue({ dueAt: "2026-09-29T12:00:00+00:00", completedAt: null }, now)).toEqual({
      status: "overdue",
      text: "Sep 29",
      iso: "2026-09-29T12:00:00.000Z",
    });
  });
});

describe("buildCardDetails", () => {
  it("adds the column title and due info to every card", () => {
    const view = assembleBoardView(
      raw({
        cards: [
          card({ id: "c1", column_id: "col-todo", position: "a0", due_at: "2026-10-02T00:00:00Z" }),
          card({ id: "d1", column_id: "col-done", position: "a0" }),
        ],
      }),
    );

    const details = buildCardDetails(view, new Date("2026-10-01T12:00:00Z"));

    expect(details.map((d) => [d.id, d.columnTitle, d.due?.status ?? null])).toEqual([
      ["c1", "To do", "due-soon"],
      ["d1", "Done", null],
    ]);
  });
});
