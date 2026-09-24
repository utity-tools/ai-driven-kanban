/**
 * Up to two uppercase initials from a display name: first letter of the first
 * and last words ("Alice Martin" → "AM", "alice" → "A"). Returns `null` when
 * there is nothing usable, so the caller can show a generic placeholder.
 * Works on code points, so names starting with emoji or astral characters
 * are not split in half.
 */
export function getInitials(displayName: string | null | undefined): string | null {
  const words = (displayName ?? "")
    .trim()
    .split(/\s+/u)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+/u, ""))
    .filter((word) => word.length > 0);

  const first = words[0];
  if (first === undefined) return null;
  const last = words.length > 1 ? words[words.length - 1] : undefined;

  const initial = (word: string) => Array.from(word)[0]?.toLocaleUpperCase() ?? "";
  return initial(first) + (last ? initial(last) : "");
}
