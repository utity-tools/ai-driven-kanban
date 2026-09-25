# 0005. Authentication: email + GitHub, no email confirmation in v0.1, default board on signup

- **Status:** accepted
- **Date:** 2026-09-24

## Context

v0.1 needs accounts so boards can be private (ADR 0004). The audience of this portfolio project
is mostly developers and technical recruiters, who should get from the landing page to a working
board in seconds.

The Supabase free plan's built-in email sender allows only a handful of emails per hour. That is
not enough to rely on confirmation emails for sign-ups.

## Decision

- **Sign-in methods:** email + password, and GitHub OAuth.
  - GitHub is configured on the hosted projects only (staging now, production at v0.1), through a
    GitHub OAuth App whose callback is the Supabase project's `/auth/v1/callback`.
  - Local development uses email + password with the seeded users, so no OAuth secrets are
    needed on developer machines.
- **No email confirmation in v0.1:** sign-up logs the user in directly. Enable it once a custom
  SMTP provider is configured.
- **Default board on sign-up:** a trigger on `auth.users` (`handle_new_user`) creates "My board"
  with To do / In progress / Done for every non-anonymous user. Anonymous users are left to demo
  mode ([ADR 0009](0009-demo-mode-with-anonymous-users.md) seeds their demo board in the same trigger).
- **Sessions:** `@supabase/ssr` with cookies.
  - `src/proxy.ts` (Next 16's replacement for `middleware.ts`) refreshes the session and
    redirects between public and protected routes.
  - Pages verify the user again on the server with `getClaims()` rather than trusting the proxy
    alone.
- **Redirect safety:** the `next` parameter only accepts same-origin relative paths, so there are
  no open redirects. Supabase only redirects to the allow-listed URLs (production, Vercel
  previews, localhost).

## Alternatives considered

- **Magic links only:** no passwords, but every sign-in depends on email delivery speed and the
  free sender's limits.
- **Email confirmation from day one:** safer against fake sign-ups, but blocked by the free
  sender's rate limit.
- **Creating the default board in app code on first visit:** it would have to run on every entry
  point (email, OAuth, future providers). The trigger covers all of them atomically.

## Consequences

- Fake or mistyped emails can create accounts until confirmation is enabled.
- GitHub sign-in cannot be tested locally or in CI; E2E covers email + password only.
- Users created before the trigger migration have no default board (no backfill; none exist in
  staging yet).
- A failing trigger would block sign-up, so `handle_new_user` stays minimal and is covered by
  pgTAP tests.
  Extended in [ADR 0006](0006-public-profiles.md) to create the user's profile first.
