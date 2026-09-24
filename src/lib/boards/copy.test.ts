import { describe, expect, it } from "vitest";

import { boardDeletionSummary, columnDeletionSummary, pluralize } from "./copy";

describe("pluralize", () => {
  it("uses the singular only for exactly one", () => {
    expect(pluralize(0, "card")).toBe("0 cards");
    expect(pluralize(1, "card")).toBe("1 card");
    expect(pluralize(2, "card")).toBe("2 cards");
  });
});

describe("columnDeletionSummary", () => {
  it("states how many cards will be deleted, archived ones included", () => {
    expect(columnDeletionSummary({ total: 4, archived: 1 })).toBe(
      "This permanently deletes the column and its 4 cards (1 of them archived). This can't be undone.",
    );
    expect(columnDeletionSummary({ total: 1, archived: 0 })).toBe(
      "This permanently deletes the column and its 1 card. This can't be undone.",
    );
  });

  it("says when the column is empty", () => {
    expect(columnDeletionSummary({ total: 0, archived: 0 })).toBe(
      "The column has no cards. This can't be undone.",
    );
  });
});

describe("boardDeletionSummary", () => {
  it("mentions columns and cards", () => {
    expect(boardDeletionSummary({ columns: 1, cards: 11 })).toBe(
      "This permanently deletes the board with its 1 column and 11 cards, archived cards included. This can't be undone.",
    );
  });
});
