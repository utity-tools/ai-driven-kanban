"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

import type { LandingVideoName } from "./content";
import { PlayPauseButton } from "./play-pause-button";

const THEMES = ["light", "dark"] as const;

/**
 * A decorative product loop from `public/landing/<name>-<theme>.{webm,mp4,png}`. There is one
 * video per theme, switched with CSS so the right one shows before hydration. Videos don't
 * preload: only the one on display plays, and only while on screen, so the other theme's files
 * are never downloaded. With reduced motion it starts paused on the poster. A button pauses or
 * plays the loop (WCAG 2.2.2: motion over 5 seconds must be pausable).
 */
export function LandingVideo({
  name,
  sizes,
  className,
}: {
  name: LandingVideoName;
  /** The poster's rendered width, as for next/image. */
  sizes: string;
  className?: string;
}) {
  const mediaRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  // `null` until the user presses the button: then their choice wins over reduced motion.
  const [choice, setChoice] = useState<"play" | "pause" | null>(null);
  const shouldPlay = choice === null ? !reducedMotion : choice === "play";

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const videos = Array.from(media.querySelectorAll("video"));
    let onScreen = false;

    function sync() {
      for (const video of videos) {
        // `display: none` on the other theme's wrapper leaves its video with no offsetParent.
        const displayed = video.offsetParent !== null;
        const visible = document.visibilityState === "visible";
        if (shouldPlay && onScreen && displayed && visible) {
          // Rejects if autoplay is blocked or a pause interrupts it: the poster stays, which is fine.
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    }

    const viewport = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry?.isIntersecting ?? false;
        sync();
      },
      { rootMargin: "200px" },
    );
    viewport.observe(media);

    // next-themes toggles the `dark` class on <html>, which swaps the displayed video.
    const theme = new MutationObserver(sync);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    // Pause in a background tab, and play again when it becomes visible (Chrome rejects play()
    // while hidden).
    document.addEventListener("visibilitychange", sync);

    return () => {
      viewport.disconnect();
      theme.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [shouldPlay]);

  return (
    <div className={cn("relative overflow-hidden rounded-xl border bg-card", className)}>
      <div ref={mediaRef} aria-hidden="true" className="size-full">
        {THEMES.map((theme) => (
          // The poster is a lazy image, not `poster=`: browsers fetch a video's poster even when
          // it's hidden, but skip lazy images that aren't rendered (the other theme's).
          <div
            key={theme}
            className={cn(
              "relative size-full",
              theme === "light" ? "dark:hidden" : "hidden dark:block",
            )}
          >
            <Image
              src={`/landing/${name}-${theme}.png`}
              alt=""
              fill
              sizes={sizes}
              className="object-cover"
            />
            <video
              muted
              loop
              playsInline
              preload="none"
              className="relative size-full object-cover"
            >
              <source src={`/landing/${name}-${theme}.webm`} type="video/webm" />
              <source src={`/landing/${name}-${theme}.mp4`} type="video/mp4" />
            </video>
          </div>
        ))}
      </div>
      <PlayPauseButton
        playing={shouldPlay}
        onToggle={() => setChoice(shouldPlay ? "pause" : "play")}
        className="absolute right-2 bottom-2"
      />
    </div>
  );
}
