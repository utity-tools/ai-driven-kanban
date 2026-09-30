"use client";

import { type ComponentProps, useState } from "react";

import { wasJustAdded } from "@/lib/ai/just-added";
import { cn } from "@/lib/utils";

/** A list item that snaps into place when it appears because the user just accepted it from an AI proposal. */
export function SnapItem({ id, className, ...props }: { id: string } & ComponentProps<"li">) {
  // Asked once, on mount: rows that were already there never animate.
  const [snap] = useState(() => wasJustAdded(id));
  return <li className={cn(snap && "motion-safe:animate-accept-snap", className)} {...props} />;
}
