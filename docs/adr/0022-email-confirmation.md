# 0022. Email confirmation on sign-up, with a scanner-safe confirm page

- **Status:** accepted
- **Date:** 2026-10-07

## Context

[ADR 0005](0005-authentication.md) skipped email confirmation because the free Supabase sender
only allows a few emails per hour. Both hosted projects now send through Resend over custom SMTP
from `no-reply@kanban.utitytools.com`, so that limit no longer applies. Without confirmation,
anyone can create accounts with fake or mistyped addresses.

A few constraints shape the confirm flow:

- `@supabase/ssr` uses PKCE. The default `{{ .ConfirmationURL }}` link only gives a session in
  the browser that signed up, because the code verifier is stored in that browser's cookies.
- Mail security scanners (Microsoft Defender / Safe Links and others) open links in emails
  before the user does. A link that confirms on `GET` gets used up by the scanner, and the user
  then sees "link expired".
- Vercel previews run on many different origins, and all of them share the staging project's
  Site URL.
- The sign-up and resend responses must not reveal whether an email already has an account.

## Decision

Enable **Confirm email** for email + password sign-ups. Confirmation works with a token hash and
a page where the user has to click a button.

- **Email link:** the template points to `<app origin>/auth/confirm?next=…&token_hash=…&type=email`.
  It reads the origin from `{{ .RedirectTo }}`, which the app sets with `emailRedirectTo`.
  Supabase validates that value against the redirect allow list. If it falls back to
  `{{ .SiteURL }}`, the template uses `{{ .SiteURL }}/auth/confirm` instead.
  The template is versioned in `supabase/templates/confirmation.html` and pasted into the
  hosted projects' dashboard settings.
- **Confirm page (`GET /auth/confirm`):** it only renders a "Confirm email" button. It never
  spends the token. The button posts a Server Action, which validates the input with Zod, calls
  `verifyOtp({ type: "email", token_hash })` (this sets the session cookie in whatever browser
  is used), and redirects to the sanitised `next`.
- **Sign-up:** when Supabase returns no session, the form shows "Check your email" with a
  resend button. A new account and an existing one get the same response. Supabase re-sends the
  link for an unconfirmed email, but rejects an already-confirmed one with
  `user_already_exists`, so the app maps that error to the same "Check your email" state (the
  copy adds "Already have an account? Sign in instead").
- **Login:** `email_not_confirmed` shows a resend button. Supabase only returns it when the
  password is correct, so it reveals nothing to someone without the password.
- **Resend:** the same response every time, except for rate limits.
- **Unchanged:** GitHub OAuth, demo mode (anonymous users), and the default board trigger.
- **Rollout:** the code handles both states (confirmation on or off), so it ships first. Each
  hosted project then gets the template and **Confirm email** turned on: staging first, then
  production.

## Alternatives considered

- **`GET` route that verifies directly:** one click fewer, but mail scanners break it.
- **Default `{{ .ConfirmationURL }}` + PKCE callback:** fails when the link is opened in another
  browser or device, and scanners can spend it too.
- **6-digit OTP code typed into the app:** scanner-proof, but more friction and a second UI to
  build. It is still an option if links prove unreliable.
- **`{{ .SiteURL }}` only in the template:** links from Vercel previews would open the staging
  Site URL instead of the preview that sent them.

## Consequences

- Fake or mistyped emails no longer get a working account. Unconfirmed users cannot sign in.
- Sign-up depends on email delivery: Resend's availability and the Supabase email rate limit
  (30/h per project).
- The hosted email template lives in the dashboard. Changes to the repo copy have to be pasted
  there by hand (documented in `docs/setup.md`).
- E2E tests read confirmation emails from the local Mailpit, so CI now starts Mailpit too.
- The sign-up response time still differs a little between a new email (an email is sent) and a
  confirmed one (nothing is sent). We accept that: the per-IP auth rate limit makes probing it
  slow, and it is far weaker than an explicit "already exists" message.
- Until confirmation is turned on in a project, signing up with a taken email there shows
  "Check your email" without sending one. The copy points those users to sign in.
- Users who signed up before confirmation was turned on remain confirmed. No backfill is needed.
- Partially supersedes ADR 0005 ("No email confirmation in v0.1").
