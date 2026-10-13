import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BrandMark } from "./brand-mark";

describe("BrandMark", () => {
  // Two marks in one render, as on a page with the header lockup and another mark.
  const html = renderToStaticMarkup(
    <>
      <BrandMark />
      <BrandMark />
    </>,
  );
  const svgs = html.split("</svg>").filter(Boolean);

  it("gives every mark its own mask, referenced by its masked columns", () => {
    const ids = svgs.map((svg) => svg.match(/<mask id="([^"]+)"/)?.[1]);
    expect(ids[0]).toBeTruthy();
    expect(new Set(ids).size).toBe(2);
    svgs.forEach((svg, i) => {
      const refs = [...svg.matchAll(/mask="url\(#([^)]+)\)"/g)].map(([, id]) => id);
      expect(refs).toEqual([ids[i], ids[i]]);
    });
  });

  it("masks the outer columns and leaves the middle one whole", () => {
    for (const svg of svgs) {
      // The mask's own path, plus the three columns.
      expect(svg.match(/<path /g)).toHaveLength(4);
      expect(svg.match(/<path [^>]*mask=/g)).toHaveLength(2);
    }
  });
});
