import { WORDMARK_TRACKING, lockupMetrics } from "@/lib/brand/lockup";
import { SITE_NAME } from "@/lib/brand/site";
import { cn } from "@/lib/utils";

import { BrandMark } from "./brand-mark";

const { markWidth, gap } = lockupMetrics();

type BrandLockupProps = {
  /**
   * Font size of the wordmark in px, used only to pick the mark's stroke. Set the actual size
   * with a text class: the lockup is sized in em. With responsive classes, pass the largest size.
   */
  size: number;
  className?: string;
};

/** The horizontal lockup: the mark and the lowercase wordmark. Reads as the product name. */
export function BrandLockup({ size, className }: BrandLockupProps) {
  return (
    <span
      className={cn("inline-flex items-center font-heading leading-none font-bold", className)}
      style={{ gap: `${gap}em`, letterSpacing: `${WORDMARK_TRACKING}em` }}
    >
      <BrandMark size={size * markWidth} className="shrink-0" style={{ width: `${markWidth}em` }} />
      {SITE_NAME}
    </span>
  );
}
