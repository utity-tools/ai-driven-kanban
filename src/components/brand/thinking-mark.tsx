import { preload } from "react-dom";

import { BrandMark } from "@/components/brand/brand-mark";
import { THINKING_IMAGE_RATIO, thinkingImageSize } from "@/lib/brand/mark";
import { cn } from "@/lib/utils";

const THINKING_MARK_SRC = "/brand/thinking.svg";

/**
 * Fetches the animated mark ahead of time, on the way to a "Suggest with AI" click: the
 * first answer can start streaming before a cold image loads.
 */
export function preloadThinkingMark() {
  preload(THINKING_MARK_SRC, { as: "image" });
}

type ThinkingMarkProps = {
  /** Width in px of the mark itself, as a static `BrandMark` of that size would be. */
  size?: number;
  /**
   * Width in `em` of the mark itself, so it scales with the surrounding font size (a
   * responsive headline). Takes precedence over `size`.
   */
  sizeEm?: number;
  className?: string;
};

/**
 * The animated "Thinking" mark. In the app it shows while the AI works, and the state is
 * said in words next to it; on the landing page it is decorative branding. Hidden from
 * assistive technology either way. With reduced motion, or inside a paused MotionScope, the
 * static mark replaces the animation (CSS only, so server and client render the same markup).
 */
export function ThinkingMark({ size = 16, sizeEm, className }: ThinkingMarkProps) {
  // The image's viewBox is wider than the mark's, so its box is larger than the mark's.
  const box = sizeEm === undefined ? size : `${sizeEm}em`;
  const image =
    sizeEm === undefined ? thinkingImageSize(size) : `${sizeEm * THINKING_IMAGE_RATIO}em`;

  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: box, height: box }}
    >
      {/* A static file with SMIL animation: next/image would only add a wrapper. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={THINKING_MARK_SRC}
        alt=""
        style={{ width: image, height: image }}
        className="max-w-none shrink-0 in-data-[motion-paused]:hidden motion-reduce:hidden"
      />
      <BrandMark
        style={{ width: box }}
        className="hidden text-ai in-data-[motion-paused]:block motion-reduce:block"
      />
    </span>
  );
}
