import { cn } from "@/lib/utils";

/** An empty, decorative frame reserved for future product media. */
export function MediaPlaceholder({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("rounded-xl border bg-card", className)} />;
}
