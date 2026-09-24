import { describe, expect, it } from "vitest";

import { getInitials } from "./initials";

describe("getInitials", () => {
  it("uses the first letters of the first and last words", () => {
    expect(getInitials("Alice Martin")).toBe("AM");
    expect(getInitials("Ana María López García")).toBe("AG");
  });

  it("uses one letter for a single word", () => {
    expect(getInitials("alice")).toBe("A");
  });

  it("ignores surrounding and repeated whitespace", () => {
    expect(getInitials("  bob \t  chen  ")).toBe("BC");
  });

  it("skips leading punctuation in a word", () => {
    expect(getInitials("@octocat (GitHub)")).toBe("OG");
  });

  it("handles non-Latin names", () => {
    expect(getInitials("Élodie Ødegaard")).toBe("ÉØ");
    expect(getInitials("张 伟")).toBe("张伟");
  });

  it("returns null when there is nothing usable", () => {
    expect(getInitials(null)).toBeNull();
    expect(getInitials(undefined)).toBeNull();
    expect(getInitials("")).toBeNull();
    expect(getInitials("   ")).toBeNull();
    expect(getInitials("-- !!")).toBeNull();
  });
});
