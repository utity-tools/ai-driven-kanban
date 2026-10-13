import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MARK_BOUNDS,
  MARK_COLUMN,
  MARK_PATHS,
  MARK_VIEW_BOX,
  THINKING_IMAGE_RATIO,
  thinkingImageSize,
} from "./mark";

const read = (path: string) => readFileSync(resolve(__dirname, path), "utf8");

describe("MARK_BOUNDS", () => {
  const points = MARK_PATHS.flatMap((d) =>
    [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(([, x, y]) => [Number(x), Number(y)] as const),
  );
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);

  it("matches the extremes of the mark's paths", () => {
    expect(Math.min(...xs)).toBe(MARK_BOUNDS.x);
    expect(Math.max(...xs)).toBeCloseTo(MARK_BOUNDS.x + MARK_BOUNDS.width);
    expect(Math.min(...ys)).toBe(MARK_BOUNDS.y);
    expect(Math.max(...ys)).toBeCloseTo(MARK_BOUNDS.y + MARK_BOUNDS.height);
  });

  it("sets the lockup's column to the middle column's width", () => {
    const middle = [...MARK_PATHS[1].matchAll(/(-?[\d.]+),/g)].map(([, x]) => Number(x));
    expect(Math.max(...middle) - Math.min(...middle)).toBeCloseTo(MARK_COLUMN);
  });

  it("fits inside the viewBox", () => {
    expect(MARK_BOUNDS.x).toBeGreaterThanOrEqual(MARK_VIEW_BOX.x);
    expect(MARK_BOUNDS.y).toBeGreaterThanOrEqual(MARK_VIEW_BOX.y);
    expect(MARK_BOUNDS.x + MARK_BOUNDS.width).toBeLessThanOrEqual(
      MARK_VIEW_BOX.x + MARK_VIEW_BOX.width,
    );
    expect(MARK_BOUNDS.y + MARK_BOUNDS.height).toBeLessThanOrEqual(
      MARK_VIEW_BOX.y + MARK_VIEW_BOX.height,
    );
  });
});

describe("icon.svg", () => {
  it("draws the same mark as MARK_PATHS", () => {
    const svg = read("../../app/icon.svg");
    for (const d of MARK_PATHS) expect(svg).toContain(`d="${d}"`);
  });
});

describe("thinking.svg", () => {
  const svg = read("../../../public/brand/thinking.svg");
  const animations = [...svg.matchAll(/<animate attributeName="d"[^>]*values="([^"]+)"/g)].map(
    ([, values]) => values!.split(";"),
  );

  it("starts and ends every column on the static mark, so the two swap without a jump", () => {
    // Left, right and middle columns, plus the middle column again in the gap's mask.
    const [maskMiddle, left, right, middle] = animations;
    const [l, m, r] = MARK_PATHS;
    for (const [frames, rest] of [
      [left, l],
      [middle, m],
      [right, r],
      [maskMiddle, m],
    ] as const) {
      expect(frames?.[0]).toBe(rest);
      expect(frames?.at(-1)).toBe(rest);
    }
  });

  it("is centered on the static mark's viewBox", () => {
    const [x, y, size] = svg
      .match(/viewBox="([^"]+)"/)![1]!
      .split(" ")
      .map(Number);
    expect(x! + size! / 2).toBe(MARK_VIEW_BOX.x + MARK_VIEW_BOX.width / 2);
    expect(y! + size! / 2).toBe(MARK_VIEW_BOX.y + MARK_VIEW_BOX.height / 2);
    expect(thinkingImageSize(MARK_VIEW_BOX.width)).toBe(size);
  });
});

describe("thinkingImageSize", () => {
  it("makes the animated mark as wide as the static one by scaling the image's wider viewBox", () => {
    // 16px static mark = 16/112 px per unit; the image spans 124 units.
    expect(thinkingImageSize(16)).toBe(18);
    expect(thinkingImageSize(112)).toBe(124);
  });
});

describe("THINKING_IMAGE_RATIO", () => {
  it("is the image's viewBox over the mark's, the same scale thinkingImageSize uses", () => {
    expect(THINKING_IMAGE_RATIO).toBeCloseTo(124 / 112);
    for (const size of [16, 20, 37, 112]) {
      expect(Math.round(size * THINKING_IMAGE_RATIO)).toBe(thinkingImageSize(size));
    }
  });
});
