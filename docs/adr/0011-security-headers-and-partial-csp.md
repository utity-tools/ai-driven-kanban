# 0011. Security headers and a partial CSP

- **Status:** accepted; `script-src` added by [0012](0012-nonce-based-script-csp.md)
- **Date:** 2026-09-25

## Context

v0.1 went live sending only the `Strict-Transport-Security` header that Vercel adds. Without
anti-framing headers the app can be embedded for clickjacking, and browsers may MIME-sniff
responses or leak full URLs (board and card ids) in the `Referer` header.

A complete Content Security Policy also restricts scripts with a per-request nonce. In Next.js
that requires dynamic rendering for every page (the static landing page would lose prerendering),
passing the nonce to inline scripts such as the one `next-themes` injects, and relaxing the policy
in development (`'unsafe-eval'`).

## Decision

Send static security headers on every route from `next.config.ts`, built by a pure, unit-tested
module (`src/lib/security/headers.ts`):

- `Content-Security-Policy` with only the directives that need no nonce:
  `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'` and a `form-action` allow-list.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin` and a restrictive `Permissions-Policy`.

`form-action` lists `'self'`, the Supabase origin (read from `NEXT_PUBLIC_SUPABASE_URL` at build
time) and `https://github.com`, because Chrome applies it to the redirects that follow a form
submission and the GitHub sign-in form redirects to Supabase Auth and then to GitHub.

## Alternatives considered

- **Strict nonce-based CSP now:** the largest XSS benefit, but it makes every page dynamic and
  touches the theme script and every sign-in flow. The app renders no user HTML today (Markdown
  is sanitised and drops raw HTML and images), so the risk it removes is small until v0.2.
- **Headers in `src/proxy.ts`:** the proxy skips static assets, so `nosniff` and framing
  protection would not cover them; `next.config.ts` headers apply to every response.

## Consequences

- Clickjacking, MIME sniffing and referrer leaks are covered on every route, with an E2E test
  checking the headers.
- A change of Supabase project URL needs a rebuild to update `form-action` (it already does for
  the inlined `NEXT_PUBLIC_*` values).
- **Revisit in v0.2:** add a nonce-based `script-src` (with `'strict-dynamic'`) in the proxy
  before AI-generated content reaches the UI, and consider CSP violation reporting.
