import { type CSSProperties, useId } from "react";

import { MARK_VIEW_BOX } from "@/lib/brand/mark";

import { markShapes } from "./mark-shapes";

type BrandMarkProps = {
  /** Rendered width in px. */
  size?: number;
  className?: string;
  /** Merged over the defaults; a CSS `width` overrides `size`. */
  style?: CSSProperties;
  /** Accessible name. Without it the mark is decorative and hidden from assistive technology. */
  title?: string;
};

/**
 * The brand mark: three tilted, filled columns. Inherits `currentColor`. The gap around the
 * middle column is a mask (unique per instance), so it shows whatever is behind the mark.
 */
export function BrandMark({ size = 24, className, style, title }: BrandMarkProps) {
  const { x, y, width, height } = MARK_VIEW_BOX;
  // useId() output has characters (":", "«") that are unsafe in url(#…): keep word characters.
  const maskId = `brand-mark-gap-${useId().replace(/\W/g, "")}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${x} ${y} ${width} ${height}`}
      width={size}
      height={(size * height) / width}
      fill="currentColor"
      // Auto height follows the viewBox ratio when a parent (shadcn buttons) sets only a width.
      style={{ height: "auto", ...style }}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {markShapes(maskId)}
    </svg>
  );
}
