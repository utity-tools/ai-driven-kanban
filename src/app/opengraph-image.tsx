import { ImageResponse } from "next/og";

import { MARK_PATHS } from "@/lib/brand/mark";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/brand/site";

export const alt = SITE_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 96,
        background: "#0E0F0D",
        color: "#EDEEEA",
      }}
    >
      <svg
        width={168}
        height={151}
        viewBox="11 16 98 88"
        fill="none"
        stroke="#EDEEEA"
        strokeWidth={5}
        strokeLinejoin="round"
      >
        {MARK_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
      <div style={{ fontSize: 84, letterSpacing: -2, marginTop: 48 }}>{SITE_NAME}</div>
      <div style={{ fontSize: 34, color: "#A0A39A", marginTop: 24, maxWidth: 900 }}>
        {SITE_DESCRIPTION}
      </div>
    </div>,
    size,
  );
}
