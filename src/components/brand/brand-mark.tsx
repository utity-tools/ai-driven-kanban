import { MARK_PATHS, MARK_VIEW_BOX, markStrokeWidth } from "@/lib/brand/mark";

type BrandMarkProps = {
  /** Rendered width in px. */
  size?: number;
  className?: string;
  /** Accessible name. Without it the mark is decorative and hidden from assistive technology. */
  title?: string;
};

/** The board mark: a rounded rectangle split into three columns. Inherits `currentColor`. */
export function BrandMark({ size = 24, className, title }: BrandMarkProps) {
  const { x, y, width, height } = MARK_VIEW_BOX;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${x} ${y} ${width} ${height}`}
      width={size}
      height={(size * height) / width}
      fill="none"
      stroke="currentColor"
      strokeWidth={markStrokeWidth(size)}
      strokeLinejoin="round"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {MARK_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
