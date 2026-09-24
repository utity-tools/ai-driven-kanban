import { describe, expect, it } from "vitest";

import { comparePositions } from "./ordering";
import { POSITION_PATTERN, lastPosition, positionAfterLast } from "./positions";

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
