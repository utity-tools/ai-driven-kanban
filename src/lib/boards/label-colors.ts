/** Label colours allowed by the `board_labels_color_check` constraint. */
export const LABEL_COLORS = [
  "green",
  "yellow",
  "orange",
  "red",
  "purple",
  "blue",
  "sky",
  "lime",
  "pink",
  "black",
] as const;

export type LabelColor = (typeof LABEL_COLORS)[number];

type LabelColorClasses = {
  /** Chip with text: tinted background, dark text (light) / light text (dark). AA contrast. */
  chip: string;
  /** Colour-only swatch (no text), solid and visible on the card background in both themes. */
  swatch: string;
};

// Full class names written out so Tailwind can find them when scanning sources.
const CLASSES: Record<LabelColor, LabelColorClasses> = {
  green: {
    chip: "bg-green-100 text-green-900 dark:bg-green-400/20 dark:text-green-100",
    swatch: "bg-green-600 dark:bg-green-400",
  },
  yellow: {
    chip: "bg-yellow-100 text-yellow-900 dark:bg-yellow-300/20 dark:text-yellow-100",
    swatch: "bg-yellow-500 dark:bg-yellow-300",
  },
  orange: {
    chip: "bg-orange-100 text-orange-900 dark:bg-orange-400/20 dark:text-orange-100",
    swatch: "bg-orange-500 dark:bg-orange-400",
  },
  red: {
    chip: "bg-red-100 text-red-900 dark:bg-red-400/20 dark:text-red-100",
    swatch: "bg-red-600 dark:bg-red-400",
  },
  purple: {
    chip: "bg-purple-100 text-purple-900 dark:bg-purple-400/20 dark:text-purple-100",
    swatch: "bg-purple-600 dark:bg-purple-400",
  },
  blue: {
    chip: "bg-blue-100 text-blue-900 dark:bg-blue-400/20 dark:text-blue-100",
    swatch: "bg-blue-600 dark:bg-blue-400",
  },
  sky: {
    chip: "bg-sky-100 text-sky-900 dark:bg-sky-400/20 dark:text-sky-100",
    swatch: "bg-sky-500 dark:bg-sky-400",
  },
  lime: {
    chip: "bg-lime-100 text-lime-900 dark:bg-lime-400/20 dark:text-lime-100",
    swatch: "bg-lime-500 dark:bg-lime-400",
  },
  pink: {
    chip: "bg-pink-100 text-pink-900 dark:bg-pink-400/20 dark:text-pink-100",
    swatch: "bg-pink-500 dark:bg-pink-400",
  },
  black: {
    chip: "bg-neutral-800 text-neutral-50 dark:bg-neutral-950 dark:text-neutral-100 dark:ring-1 dark:ring-neutral-600",
    swatch: "bg-neutral-800 dark:bg-neutral-950 dark:ring-1 dark:ring-neutral-500",
  },
};

const FALLBACK: LabelColorClasses = {
  chip: "bg-muted text-foreground",
  swatch: "bg-muted-foreground",
};

export function isLabelColor(value: string): value is LabelColor {
  return (LABEL_COLORS as readonly string[]).includes(value);
}

/** Tailwind classes for a label colour; unknown colours get a neutral fallback. */
export function labelColorClasses(color: string): LabelColorClasses {
  return isLabelColor(color) ? CLASSES[color] : FALLBACK;
}

/**
 * Accessible name of a label: its name, or "<Colour> label" for colour-only labels.
 */
export function labelAccessibleName({ name, color }: { name: string; color: string }): string {
  const trimmed = name.trim();
  if (trimmed) return trimmed;
  const colour = isLabelColor(color) ? color : "Unnamed";
  return `${colour.charAt(0).toUpperCase()}${colour.slice(1)} label`;
}
