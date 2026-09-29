"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Tells the viewer they were removed from a board they had open, then drops
 * the `?left=` param so a reload does not repeat it.
 */
export function AccessLostNotice({ message }: { message: string | null }) {
  useEffect(() => {
    if (!message) return;
    toast.info(message);
    window.history.replaceState(null, "", window.location.pathname);
  }, [message]);
  return null;
}
