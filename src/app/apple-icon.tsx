import { ImageResponse } from "next/og";

import { markShapes } from "@/components/brand/mark-shapes";
import { MARK_VIEW_BOX } from "@/lib/brand/mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The cream mark on a full-bleed orange tile: iOS rounds the corners itself. */
const MARK_SIZE = 112;

export default function AppleIcon() {
  const { x, y, width, height } = MARK_VIEW_BOX;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#FF6B1A",
      }}
    >
      <svg
        width={MARK_SIZE}
        height={MARK_SIZE}
        viewBox={`${x} ${y} ${width} ${height}`}
        fill="#EDEEEA"
      >
        {markShapes("ack-gap")}
      </svg>
    </div>,
    size,
  );
}
