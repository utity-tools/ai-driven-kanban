/**
 * HTTP security headers sent on every route (wired in `next.config.ts`).
 *
 * The CSP is deliberately partial: it covers framing, plugins, `<base>` and form
 * targets, but not `script-src`/`style-src`. A strict nonce-based script policy
 * needs dynamic rendering everywhere and is deferred (ADR 0011).
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

export function contentSecurityPolicy(supabaseUrl: string | undefined): string {
  const directives = [
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action ${formActionSources(supabaseUrl).join(" ")}`,
  ];
  return directives.join("; ");
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
