import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** The page's content column: centered, capped width, side padding. */
export function SectionContainer({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4", className)} {...props} />;
}
