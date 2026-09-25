import { describe, expect, it } from "vitest";

import { comparePositions } from "./ordering";
import { POSITION_PATTERN, lastPosition, positionAfterLast, positionForMove } from "./positions";

describe("lastPosition", () => {
  it("is null for an empty list", () => {
    expect(lastPosition([])).toBeNull();
  });

  it("returns the greatest key in byte order, whatever the input order", () => {
    // Byte order: "Zz" < "a0" < "a0V" < "a1" (localeCompare would disagree).
    expect(lastPosition(["a0V", "Zz", "a1", "a0"])).toBe("a1");
  });
});

describe("positionAfterLast", () => {
  it("starts an empty column at a0", () => {
    expect(positionAfterLast([])).toBe("a0");
  });

  it("appends after the last position", () => {
    const next = positionAfterLast(["a0", "a1"]);

    expect(comparePositions(next, "a1")).toBeGreaterThan(0);
  });

  it("appends after the greatest key even when the input is unsorted", () => {
    const positions = ["a1", "Zz", "a0V"];
    const next = positionAfterLast(positions);

    for (const position of positions) expect(comparePositions(next, position)).toBeGreaterThan(0);
  });

  it("produces keys that the database accepts", () => {
    let positions: string[] = [];
    for (let i = 0; i < 200; i++) positions = [...positions, positionAfterLast(positions)];

    for (const position of positions) expect(position).toMatch(POSITION_PATTERN);
  });

  it("keeps a sequence of appends in insertion order when sorted by bytes", () => {
    const positions: string[] = [];
    for (let i = 0; i < 500; i++) positions.push(positionAfterLast(positions));

    expect(new Set(positions).size).toBe(positions.length);
    expect([...positions].sort(comparePositions)).toEqual(positions);
    // Plain JS sort (UTF-16 code units) is byte order for ASCII keys, like COLLATE "C".
    expect([...positions].sort()).toEqual(positions);
  });

  it("rejects keys that are not fractional-indexing keys", () => {
    expect(() => positionAfterLast(["not a key"])).toThrow();
  });
});

describe("positionForMove", () => {
  const siblings = [
    { id: "c", position: "a2" },
    { id: "a", position: "a0" },
    { id: "b", position: "a1" },
  ];
  const between = (key: string, low: string | null, high: string | null) => {
    if (low !== null) expect(comparePositions(key, low)).toBeGreaterThan(0);
    if (high !== null) expect(comparePositions(key, high)).toBeLessThan(0);
    expect(key).toMatch(POSITION_PATTERN);
  };

  it("places the item right after the previous neighbour", () => {
    between(positionForMove(siblings, "a", "b"), "a0", "a1");
  });

  it("places the item first when only the next neighbour is given", () => {
    between(positionForMove(siblings, null, "a"), null, "a0");
  });

  it("places the item last when only the previous neighbour is given", () => {
    between(positionForMove(siblings, "c", null), "a2", null);
  });

  it("uses the real successor, not the next neighbour the client saw", () => {
    // The client saw a, c (b is hidden, e.g. archived): the key stays below b.
    between(positionForMove(siblings, "a", "c"), "a0", "a1");
  });

  it("falls back to the next neighbour when the previous one is gone", () => {
    between(positionForMove(siblings, "gone", "c"), "a1", "a2");
  });

  it("appends when no neighbour is found", () => {
    between(positionForMove(siblings, "gone", "missing"), "a2", null);
  });

  it("starts an empty destination at a0", () => {
    expect(positionForMove([], null, null)).toBe("a0");
  });

  it("does not throw when the previous neighbour ties with its successor", () => {
    const tied = [
      { id: "a", position: "a0" },
      { id: "b", position: "a0" },
      { id: "c", position: "a1" },
    ];

    between(positionForMove(tied, "a", "b"), "a0", "a1");
  });
});
