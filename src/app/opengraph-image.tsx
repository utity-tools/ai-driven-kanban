import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { WORDMARK_TRACKING, lockupMetrics } from "@/lib/brand/lockup";
import { MARK_PATHS, MARK_VIEW_BOX, markStrokeWidth } from "@/lib/brand/mark";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/brand/site";

export const alt = `${SITE_NAME}: ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// The font is read from disk at build time: fail the build rather than render per request.
export const dynamic = "force-static";

const WORDMARK_SIZE = 128;
const TAGLINE_SIZE = 56;

// Satori reads woff, not woff2.
const bricolage = readFile(
  join(
    process.cwd(),
    "node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff",
  ),
);

export default async function OpenGraphImage() {
  const { markWidth, gap } = lockupMetrics();
  const markPx = markWidth * WORDMARK_SIZE;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 48,
        padding: 96,
        background: "#0E0F0D",
        color: "#EDEEEA",
        fontFamily: "Bricolage Grotesque",
        fontWeight: 700,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: gap * WORDMARK_SIZE,
          fontSize: WORDMARK_SIZE,
          lineHeight: 1,
          letterSpacing: `${WORDMARK_TRACKING}em`,
        }}
      >
        <svg
          width={markPx}
          height={(markPx * MARK_VIEW_BOX.height) / MARK_VIEW_BOX.width}
          viewBox={`${MARK_VIEW_BOX.x} ${MARK_VIEW_BOX.y} ${MARK_VIEW_BOX.width} ${MARK_VIEW_BOX.height}`}
          fill="none"
          stroke="#EDEEEA"
          strokeWidth={markStrokeWidth(markPx)}
          strokeLinejoin="round"
        >
          {MARK_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
        {SITE_NAME}
      </div>
      <div style={{ fontSize: TAGLINE_SIZE, letterSpacing: "-0.025em", color: "#A0A39A" }}>
        {SITE_TAGLINE}
      </div>
    </div>,
    {
      ...size,
      fonts: [{ name: "Bricolage Grotesque", data: await bricolage, weight: 700, style: "normal" }],
    },
  );
}
