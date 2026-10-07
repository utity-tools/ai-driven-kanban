# 0023. Password reset by email, limited to freshly verified sessions

- **Status:** accepted
- **Date:** 2026-10-07

## Context

Email + password users who forget their password have no way back in. Confirmation emails now
go out through Resend ([ADR 0022](0022-email-confirmation.md)), and the same building blocks
work for a reset flow: token-hash links, a page with a button, and an enumeration-safe
response.

The flow ends with a session that sets a new password **without knowing the current one**, so
the risky part is deciding which sessions may do that. If "any signed-in session" were enough,
a stolen session cookie would be enough to lock the owner out of their account.

## Decision

- **Request (`/forgot-password`, linked from sign-in):** `resetPasswordForEmail` with
  `redirectTo` = `/auth/reset?next=…` on the current origin. The answer is the same whether or
  not the email has an account. Only rate limits and outages are reported, and outages are
  logged with code and status only.
- **Email:** `supabase/templates/recovery.html`, built from `RedirectTo` / `SiteURL` in the same
  way as the confirmation template.
- **Link page (`/auth/reset`):** a button only, so mail scanners can't spend the token. The
  button calls `verifyOtp({ type: "recovery", token_hash })`, which opens a session, and then
  redirects to `/reset-password?next=…`.
- **New password (`/reset-password`):** only a session opened by an emailed link **within the
  last 15 minutes** may use it. The check reads the Supabase-signed JWT `amr` claim (method `otp`
  plus its timestamp). It runs on the page and again in the Server Action.
  - Verified locally: a password sign-in is `password`; recovery and sign-up confirmation are
    both `otp`. GitHub is `oauth`, and demo users are refused.
  - A just-confirmed sign-up also qualifies. That is intended: it proves the same thing a reset
    link proves, namely control of the email.
- After `updateUser({ password })`, the action calls `signOut({ scope: "others" })`, so a reset
  also ends sessions an attacker may hold. The user stays signed in on this device and goes to
  `next`.

## Alternatives considered

- **Any signed-in session may change the password:** simple, but it turns a stolen session into
  an account takeover.
- **Our own "recovery" cookie set by the link page:** cookies are client-controlled, so it would
  need an HMAC secret (a new secret in every environment, plus rotation) to do what the signed
  `amr` claim already does.
- **Changing the password on the `/auth/reset` page itself, in one step:** the page would need
  the token to stay valid until the form is submitted, and a scanner-safe GET could no longer
  spend it on a second press.
- **Supabase "Secure password change" (reauthentication nonce):** it targets password changes
  from an account page, which this app doesn't have.

## Consequences

- Forgotten passwords are recoverable without support. Every reset also signs out other
  devices.
- A 15-minute window: a user who opens the link and walks away has to request a new one.
- The hosted "Reset password" template must be pasted into each Supabase project, like the
  confirmation template (`docs/setup.md`). Until then, the default template's link doesn't match
  `/auth/reset`. That is harmless while the feature is new.
- A GitHub-only account that gets a reset link ends up with an email + password sign-in as
  well. That is acceptable: it still requires control of the email. This can't be tested
  locally, because GitHub sign-in only exists on the hosted projects.
- The quota abuse and confirm-link CSRF trade-offs from ADR 0022 apply here unchanged.
