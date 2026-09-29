"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { takeAccessLostMessage } from "@/lib/realtime/access-lost";

/**
 * Tells the viewer they lost access to a board they had open. The title comes
 * from sessionStorage (set right before the redirect), never from the URL, so a
 * crafted `?left=` link cannot show arbitrary text. A bare `?left=1` shows
 * nothing. Without the param nothing shows. The param is dropped so a reload does not repeat the notice.
 */
export function AccessLostNotice({ flagged }: { flagged: boolean }) {
  useEffect(() => {
    // Strict Mode runs this twice in development: the fixed toast id dedupes,
    // and the first run has already consumed the stored title.
    // The stored title is always consumed, so a stale one never shows up later.
    const message = takeAccessLostMessage();
    if (!flagged) return;
    if (message) toast.info(message, { id: "access-lost" });
    window.history.replaceState(null, "", window.location.pathname);
  }, [flagged]);
  return null;
}
