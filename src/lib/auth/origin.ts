/**
 * Resolves the public origin of the current request from its headers, for
 * building absolute OAuth callback URLs. Prefers `Origin` (set by browsers on
 * POSTs and checked by Next.js against `Host` for Server Actions), then the
 * forwarded/host headers. Returns `null` if nothing usable is present.
 */
export function getRequestOrigin(headers: Pick<Headers, "get">): string | null {
  const origin = parseOrigin(headers.get("origin"));
  if (origin) return origin;

  const host = firstValue(headers.get("x-forwarded-host")) ?? headers.get("host");
  if (!host) return null;
  const forwardedProto = firstValue(headers.get("x-forwarded-proto"));
  const proto = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : "https";
  return parseOrigin(`${proto}://${host}`);
}

function firstValue(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first ? first : null;
}

function parseOrigin(value: string | null): string | null {
  if (!value || value === "null") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}
