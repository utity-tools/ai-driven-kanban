# 0012. Nonce-based script CSP

- **Status:** accepted
- **Date:** 2026-09-25

## Context

[ADR 0011](0011-security-headers-and-partial-csp.md) shipped a CSP without `script-src` and
deferred it to v0.2, before AI-generated text reaches the UI. v0.2 renders model output (subtask
titles and descriptions) that is derived from user text, so an injection bug in rendering would
be exploitable without a script policy.

A nonce-based policy needs a fresh nonce per request, which Next.js reads from the request's
`Content-Security-Policy` header and adds to its own scripts. Pages therefore must render
dynamically. Most pages already did (they read the session on each request); the public landing
page was prerendered.

## Decision

The proxy generates a 128-bit nonce per request and sets, on both the request and the response:

```
script-src 'self' 'nonce-<nonce>' 'strict-dynamic'
```

added to the ADR 0011 directives (`'unsafe-eval'` is added only in development, where React needs
it). The policy is built by `contentSecurityPolicy()` in `src/lib/security/headers.ts`.

- `next.config.ts` still sends the nonce-less CSP on every response, so static assets, which the
  proxy skips, keep `frame-ancestors`, `object-src` and the other directives. On rendered routes
  the proxy's header replaces it (one header, verified by E2E).
- The root layout reads the nonce from `x-nonce` and passes it to `next-themes`, whose inline
  script prevents the theme flash. Reading headers also makes every page dynamic.
- `src/instrumentation-client.ts` sets `z.config({ jitless: true })`: Zod 4 probes
  `new Function("")` to decide whether to compile validators, and the probe would report a CSP
  violation on every page load.
- `style-src` stays unrestricted: Tailwind, Radix and dnd-kit set inline styles, and styles are a
  much weaker injection vector than scripts.

## Alternatives considered

- **Subresource Integrity (hash-based, experimental in Next.js):** keeps static pages, but it is
  experimental and cannot cover inline scripts such as the `next-themes` one.
- **`'unsafe-inline'` scripts:** keeps static pages but gives no XSS protection, which is the
  point of the policy.
- **A host allow-list (`script-src 'self'`) without nonces:** blocks inline scripts that Next.js
  itself needs to hydrate.

## Consequences

- Injected markup cannot run inline event handlers, `javascript:` URLs or inline scripts; an E2E
  test checks that the board loads with no violations and that an injected `onerror` is blocked.
- Every page, the landing page included, is rendered on each request instead of prerendered:
  slightly more server work and no CDN caching for HTML. Acceptable at this scale.
- Third-party scripts injected by the platform without the nonce, such as the Vercel preview
  toolbar, are blocked on previews.
- The proxy matcher skips paths ending in asset extensions (`.png`, `.txt`, …) even when no such
  file exists, so a not-found page at such a path gets only the static CSP. It renders no user
  content, so the gap is accepted.
- Prefetch requests are deliberately not excluded from the proxy (the Next.js guide suggests it):
  the proxy also refreshes the session and protects routes.
- Any future third-party script must receive the nonce (read `x-nonce` in a Server Component).
- Still open: CSP violation reporting (`report-to`), and restricting `connect-src` once the AI
  endpoints and Supabase Realtime origins are settled.
