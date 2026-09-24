import { labelAccessibleName, labelColorClasses } from "@/lib/boards/label-colors";
import type { Label } from "@/lib/boards/view-model";
import { cn } from "@/lib/utils";

/**
 * A label: a coloured chip with its name, or a short colour bar for
 * colour-only labels (named by colour for assistive tech).
 */
export function LabelChip({ label, className }: { label: Label; className?: string }) {
  const classes = labelColorClasses(label.color);
  const name = label.name.trim();

  if (!name) {
    return (
      <span
        role="img"
        aria-label={labelAccessibleName(label)}
        title={labelAccessibleName(label)}
        className={cn("inline-block h-2 w-10 rounded-full", classes.swatch, className)}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-full items-center truncate rounded-sm px-1.5 text-xs font-medium",
        classes.chip,
        className,
      )}
    >
      {name}
    </span>
  );
}

/** Labels as a list; renders nothing when there are none. */
export function LabelList({ labels, className }: { labels: Label[]; className?: string }) {
  if (labels.length === 0) return null;
  return (
    <ul aria-label="Labels" className={cn("flex flex-wrap items-center gap-1", className)}>
      {labels.map((label) => (
        <li key={label.id} className="flex max-w-full">
          <LabelChip label={label} />
        </li>
      ))}
    </ul>
  );
}
