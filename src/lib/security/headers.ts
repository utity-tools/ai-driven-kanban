/**
 * HTTP security headers.
 *
 * `next.config.ts` sends the static headers on every route, static assets included, with a
 * CSP that needs no nonce. The proxy replaces that CSP on rendered routes with one that adds a
 * nonce-based `script-src` (ADR 0012). `style-src` stays open: Tailwind, Radix and dnd-kit set
 * inline styles.
 */

export type SecurityHeader = { key: string; value: string };

/** Where a form submission may navigate, including redirects after it (Chrome enforces those). */
function formActionSources(supabaseUrl: string | undefined): string[] {
  // "Continue with GitHub" posts to a Server Action that redirects to Supabase Auth,
  // which redirects to GitHub's authorize page.
  const sources = ["'self'", "https://github.com"];
  if (supabaseUrl) {
    try {
      sources.push(new URL(supabaseUrl).origin);
    } catch {
      // An invalid URL is reported by getPublicEnv() at request time; keep the stricter policy.
    }
  }
  return sources;
}

export type ScriptPolicy = {
  /** Per-request nonce; Next.js reads it from the request's CSP and adds it to its scripts. */
  nonce: string;
  /** React uses `eval` in development to rebuild server error stacks. */
  isDev: boolean;
};

/**
 * Only scripts carrying the nonce run, plus the scripts they load (`'strict-dynamic'`).
 * `'self'` is ignored by browsers that support `'strict-dynamic'` and is a fallback for older ones.
 */
function scriptSources({ nonce, isDev }: ScriptPolicy): string[] {
  const sources = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (isDev) sources.push("'unsafe-eval'");
  return sources;
}

export function contentSecurityPolicy(
  supabaseUrl: string | undefined,
  scripts?: ScriptPolicy,
): string {
  const directives = [
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action ${formActionSources(supabaseUrl).join(" ")}`,
  ];
  if (scripts) directives.push(`script-src ${scriptSources(scripts).join(" ")}`);
  return directives.join("; ");
}

/** A fresh, unguessable nonce: 128 random bits, base64-encoded. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function securityHeaders(supabaseUrl: string | undefined): SecurityHeader[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(supabaseUrl) },
    // Legacy equivalent of frame-ancestors 'none' for browsers without CSP level 2.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Other sites see only the origin, never paths such as /boards/<id>?card=<id>.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
    },
  ];
}
