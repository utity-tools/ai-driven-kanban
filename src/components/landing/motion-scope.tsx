"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { PlayPauseButton } from "./play-pause-button";

const MotionContext = createContext<{ paused: boolean; toggle: () => void } | null>(null);

/**
 * An area whose decorative animations a visitor can pause (WCAG 2.2.2: motion over 5 seconds
 * must be pausable). While paused it carries `data-motion-paused`, and animations inside it
 * opt out with the `in-data-[motion-paused]:` variant, the same way they do with reduced motion.
 */
export function MotionScope({ className, children }: { className?: string; children: ReactNode }) {
  const [paused, setPaused] = useState(false);

  return (
    <MotionContext value={{ paused, toggle: () => setPaused((value) => !value) }}>
      <div data-motion-paused={paused ? "" : undefined} className={className}>
        {children}
      </div>
    </MotionContext>
  );
}

/** Pauses or plays the animations of the enclosing MotionScope. Hidden with reduced motion. */
export function MotionToggle({ className }: { className?: string }) {
  const motion = useContext(MotionContext);
  if (!motion) throw new Error("MotionToggle must be inside a MotionScope");

  return (
    <PlayPauseButton
      playing={!motion.paused}
      onToggle={motion.toggle}
      className={cn("motion-reduce:hidden", className)}
    />
  );
}
