import { describe, expect, it } from "vitest";

import { LABEL_COLORS, isLabelColor, labelAccessibleName, labelColorClasses } from "./label-colors";

describe("labelColorClasses", () => {
  it.each(LABEL_COLORS)("has light and dark classes for %s", (color) => {
    const { chip, swatch } = labelColorClasses(color);

    expect(chip).toMatch(/(^| )bg-/);
    expect(chip).toMatch(/(^| )text-/);
    expect(chip).toMatch(/dark:bg-/);
    expect(chip).toMatch(/dark:text-/);
    expect(swatch).toMatch(/(^| )bg-/);
    expect(swatch).toMatch(/dark:bg-/);
  });

  it("uses the colour's own palette", () => {
    expect(labelColorClasses("sky").chip).toContain("bg-sky-100");
    expect(labelColorClasses("black").chip).toContain("bg-neutral-800");
  });

  it("falls back to neutral classes for unknown colours", () => {
    expect(labelColorClasses("teal").chip).toBe("bg-muted text-foreground");
  });

  it("covers exactly the ten colours allowed by the database", () => {
    expect(LABEL_COLORS).toHaveLength(10);
    expect(isLabelColor("green")).toBe(true);
    expect(isLabelColor("Green")).toBe(false);
  });
});

describe("labelAccessibleName", () => {
  it("uses the label name when present", () => {
    expect(labelAccessibleName({ name: " bug ", color: "red" })).toBe("bug");
  });

  it("describes colour-only labels by colour", () => {
    expect(labelAccessibleName({ name: "", color: "green" })).toBe("Green label");
    expect(labelAccessibleName({ name: "  ", color: "sky" })).toBe("Sky label");
    expect(labelAccessibleName({ name: "", color: "teal" })).toBe("Unnamed label");
  });
});
