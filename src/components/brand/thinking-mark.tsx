import { preload } from "react-dom";

import { BrandMark } from "@/components/brand/brand-mark";
import { thinkingImageSize } from "@/lib/brand/mark";

const THINKING_MARK_SRC = "/brand/thinking.svg";

/**
 * Fetches the animated mark ahead of time. Call it where the AI can be asked (the
 * "Suggest with AI" button): the first answer can start streaming before a cold image loads.
 */
export function preloadThinkingMark() {
  preload(THINKING_MARK_SRC, { as: "image", fetchPriority: "low" });
}

type ThinkingMarkProps = {
  /** Width in px of the mark itself, as a static `BrandMark` of that size would be. */
  size?: number;
};

/**
 * The animated "Thinking" mark, shown while the AI works. Decorative: the state is
 * said in words next to it. With reduced motion the static mark replaces the animation
 * (CSS only, so server and client render the same markup).
 */
export function ThinkingMark({ size = 16 }: ThinkingMarkProps) {
  const image = thinkingImageSize(size);

  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* A static file with SMIL animation: next/image would only add a wrapper. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={THINKING_MARK_SRC}
        alt=""
        width={image}
        height={image}
        className="max-w-none shrink-0 motion-reduce:hidden"
      />
      <BrandMark size={size} className="hidden text-ai motion-reduce:block" />
    </span>
  );
}
