import { SparklesIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/** Small "AI" badge for things that came from an accepted AI proposal. */
export function AiMarker({ label = "Proposed by AI" }: { label?: string }) {
  return (
    <Badge variant="outline" title={label} className="text-muted-foreground">
      <SparklesIcon aria-hidden />
      <span aria-hidden>AI</span>
      <span className="sr-only">{label}</span>
    </Badge>
  );
}
