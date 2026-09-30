import { ImageResponse } from "next/og";

import { MARK_PATHS } from "@/lib/brand/mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0E0F0D",
      }}
    >
      <svg
        width={101}
        height={91}
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
    </div>,
    size,
  );
}
