import type { ReactElement } from "react";

import { MARK_GAP, MARK_PATHS, MARK_VIEW_BOX } from "@/lib/brand/mark";

/**
 * The mark's three columns and the mask that cuts the gap around the middle one, for an
 * `<svg>` with `MARK_VIEW_BOX` that sets the fill. A function returning plain elements (not a
 * component): `ImageResponse` (icons, OG image) only accepts intrinsic elements inside an
 * `<svg>`. `maskId` must be unique in the document.
 */
export function markShapes(maskId: string): ReactElement[] {
  const { x, y, width, height } = MARK_VIEW_BOX;
  const [left, middle, right] = MARK_PATHS;

  return [
    <defs key="defs">
      <mask id={maskId} maskUnits="userSpaceOnUse" x={x} y={y} width={width} height={height}>
        <rect x={x} y={y} width={width} height={height} fill="#fff" />
        <path d={middle} fill="#000" stroke="#000" strokeWidth={MARK_GAP} strokeLinejoin="round" />
      </mask>
    </defs>,
    <path key="left" d={left} mask={`url(#${maskId})`} />,
    <path key="right" d={right} mask={`url(#${maskId})`} />,
    <path key="middle" d={middle} />,
  ];
}
