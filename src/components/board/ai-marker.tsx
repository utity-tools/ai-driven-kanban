import { BrandMark } from "@/components/brand/brand-mark";
import { Badge } from "@/components/ui/badge";

/** Small "AI" badge for things that came from an accepted AI proposal. */
export function AiMarker({ label = "Proposed by AI" }: { label?: string }) {
  return (
    <Badge variant="outline" title={label} className="text-muted-foreground">
      {/* In a span: the badge forces a square size on direct svg children. */}
      <span aria-hidden className="inline-flex">
        <BrandMark size={12} className="text-ai" />
      </span>
      <span aria-hidden>AI</span>
      <span className="sr-only">{label}</span>
    </Badge>
  );
}
