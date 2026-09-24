"use client";

import { useSyncExternalStore } from "react";

import { toDateOnly } from "@/lib/boards/due-date";

/** How often to re-check the date while the page stays open (the day may roll over). */
const CHECK_EVERY_MS = 60_000;

function subscribe(onChange: () => void): () => void {
  const interval = window.setInterval(onChange, CHECK_EVERY_MS);
  // Coming back to a tab that slept overnight updates at once.
  document.addEventListener("visibilitychange", onChange);
  window.addEventListener("focus", onChange);
  return () => {
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", onChange);
    window.removeEventListener("focus", onChange);
  };
}

function getSnapshot(): string {
  return toDateOnly(new Date());
}

function getServerSnapshot(): null {
  return null;
}

/**
 * The viewer's local calendar date ("YYYY-MM-DD"), or `null` on the server and
 * during hydration.
 *
 * Due-date status depends on the viewer's time zone, which the server doesn't
 * know. `useSyncExternalStore` renders the server snapshot (`null`) on the
 * server AND while hydrating, so the HTML always matches, then re-renders
 * with the browser's date right after. Client-side navigations skip the
 * `null` pass entirely. The snapshot is a string, so React only re-renders
 * when the date actually changes (e.g. at midnight).
 */
export function useToday(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
