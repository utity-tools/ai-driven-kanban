import { describe, expect, it } from "vitest";

import { comparePositions, sortByPosition } from "./ordering";

describe("comparePositions", () => {
  it("uses byte order, not locale order", () => {
    // Byte order: digits < uppercase < lowercase. localeCompare would put "a0" first.
    expect(comparePositions("Zz", "a0")).toBeLessThan(0);
    expect(comparePositions("a0", "Zz")).toBeGreaterThan(0);
    expect(comparePositions("9", "A")).toBeLessThan(0);
    expect("Zz".localeCompare("a0")).toBeGreaterThan(0); // the trap this module avoids
  });

  it("orders a prefix before its extensions", () => {
    expect(comparePositions("a0", "a0V")).toBeLessThan(0);
    expect(comparePositions("a0V", "a1")).toBeLessThan(0);
  });

  it("returns 0 for equal keys", () => {
    expect(comparePositions("a1", "a1")).toBe(0);
  });
});

describe("sortByPosition", () => {
  it("sorts by position in byte order", () => {
    const items = [
      { id: "1", position: "a1" },
      { id: "2", position: "Zz" },
      { id: "3", position: "a0V" },
      { id: "4", position: "a0" },
      { id: "5", position: "b" },
    ];

    expect(sortByPosition(items).map((i) => i.position)).toEqual(["Zz", "a0", "a0V", "a1", "b"]);
  });

  it("breaks ties by id", () => {
    const items = [
      { id: "c", position: "a0" },
      { id: "a", position: "a0" },
      { id: "b", position: "a0" },
    ];

    expect(sortByPosition(items).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input", () => {
    const items = [
      { id: "1", position: "a1" },
      { id: "2", position: "a0" },
    ];
    sortByPosition(items);

    expect(items.map((i) => i.id)).toEqual(["1", "2"]);
  });
});
