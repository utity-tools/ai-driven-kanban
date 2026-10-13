import { describe, expect, it } from "vitest";

import type { BoardLayout } from "./drag";
import { type ColumnSpan, columnAtPointer, pointerCandidateIds } from "./drag-target";

// Three 272px columns with 12px gaps, like the mobile board.
const spans: ColumnSpan[] = [
  { id: "a", left: 16, right: 288 },
  { id: "b", left: 300, right: 572 },
  { id: "c", left: 584, right: 856 },
];

const layout: BoardLayout = [
  { id: "a", cardIds: ["a1", "a2"] },
  { id: "b", cardIds: [] },
  { id: "c", cardIds: ["c1"] },
];

describe("columnAtPointer", () => {
  it("returns the column containing x", () => {
    expect(columnAtPointer(spans, 100)).toBe("a");
    expect(columnAtPointer(spans, 340)).toBe("b");
    expect(columnAtPointer(spans, 300)).toBe("b");
  });

  it("picks the closer column in the gap between two", () => {
    expect(columnAtPointer(spans, 291)).toBe("a");
    expect(columnAtPointer(spans, 297)).toBe("b");
  });

  it("gives a tie in the middle of the gap to the first column", () => {
    expect(columnAtPointer(spans, 294)).toBe("a");
  });

  it("counts the pointer up to the tolerance outside a column", () => {
    expect(columnAtPointer([{ id: "a", left: 16, right: 288 }], 288 + 16)).toBe("a");
    expect(columnAtPointer([{ id: "a", left: 16, right: 288 }], 288 + 17)).toBeNull();
  });

  it("returns null when farther than the tolerance from every column", () => {
    expect(columnAtPointer(spans, -5)).toBeNull();
    expect(columnAtPointer(spans, 900)).toBeNull();
    expect(columnAtPointer([], 100)).toBeNull();
  });

  it("accepts a custom tolerance", () => {
    expect(columnAtPointer(spans, -5, 25)).toBe("a");
  });
});

describe("pointerCandidateIds", () => {
  it("returns the cards of the column under the pointer", () => {
    expect(pointerCandidateIds(layout, spans, 100)).toEqual(["a1", "a2"]);
    expect(pointerCandidateIds(layout, spans, 700)).toEqual(["c1"]);
  });

  it("returns the column itself when it is empty", () => {
    expect(pointerCandidateIds(layout, spans, 400)).toEqual(["b"]);
  });

  it("returns null when the pointer is not over a column or the column is unknown", () => {
    expect(pointerCandidateIds(layout, spans, 1000)).toBeNull();
    expect(pointerCandidateIds([], spans, 100)).toBeNull();
  });
});
