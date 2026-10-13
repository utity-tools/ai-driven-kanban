import { WORDMARK_TRACKING, lockupMetrics } from "@/lib/brand/lockup";
import { SITE_NAME } from "@/lib/brand/site";
import { cn } from "@/lib/utils";

import { BrandMark } from "./brand-mark";

const { markWidth, gap } = lockupMetrics();

type BrandLockupProps = {
  /** Set the size with a text class (e.g. `text-[22px]`): the lockup is sized in em. */
  className?: string;
};

/**
 * The horizontal lockup: the orange mark and the lowercase wordmark. Reads as the product name.
 * The mark is the AI color on purpose: orange always means "needs your call".
 */
export function BrandLockup({ className }: BrandLockupProps) {
  return (
    <span
      className={cn("inline-flex items-center font-heading leading-none font-bold", className)}
      style={{ gap: `${gap}em`, letterSpacing: `${WORDMARK_TRACKING}em` }}
    >
      <BrandMark className="shrink-0 text-ai" style={{ width: `${markWidth}em` }} />
      {SITE_NAME}
    </span>
  );
}
