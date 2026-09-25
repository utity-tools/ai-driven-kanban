# 0009. Demo mode with anonymous users and a per-visitor demo board

- **Status:** accepted
- **Date:** 2026-09-25

## Context

Most visitors of this portfolio project are developers and technical recruiters. Many of them
will not create an account just to look around, but an empty board after sign-up shows little
of what the app does. We need a way to reach a realistic, editable board in one click without
creating an account.

Constraints:

- Boards are private and protected by RLS (ADR 0004). A shared public board would need its own
  rules, and visitors would overwrite each other's changes.
- The Supabase free plan limits database size, so demo data must not pile up forever.

## Decision

A "Try the demo" button on the public landing page signs the visitor in with **Supabase
anonymous sign-in**. Each visitor gets **a private copy of a demo board**, which is deleted
after **7 days**.

- **Anonymous users are ordinary `authenticated` users** whose JWT has `is_anonymous = true`.
  RLS and every existing policy apply to them unchanged, so each visitor can only see their own
  copy.
- **The demo board is seeded by the sign-up trigger.** `public.handle_new_user` (ADR 0005)
  calls `private.seed_demo_board(user_id)` for anonymous users, in the same transaction as the
  `auth.users` insert. The visitor always lands on a complete board, and the content lives in
  one SQL function covered by pgTAP. Permanent users still get the empty "My board".
- **The demo content is realistic:** four columns, labels, markdown descriptions, due dates
  relative to the sign-up day (one overdue, one due soon) and the visitor as a member of some
  cards. This way it shows the features of v0.1.
- **The visitor is named "Demo visitor"** in their profile, so avatars on assigned cards have a
  readable name. Seeded cards have no `created_by`, because the system wrote them, not the
  visitor.
- **Daily cleanup job.** A `pg_cron` job runs `private.delete_expired_demo_users()` every day.
  It deletes anonymous users older than 7 days, and foreign keys cascade to their boards and
  everything in them. The job is named `delete-expired-demo-users` and runs at 03:17 UTC;
  scheduling by name makes re-running the migration idempotent.
- **The UI flags demo sessions.** A banner explains that the data is temporary and offers two
  actions: "Create an account" (signs out and goes to sign-up) and "Exit demo".
- **Abuse control:** Supabase's per-IP rate limit on anonymous sign-ins (30 per hour) plus the
  7-day expiry.

## Alternatives considered

- **One shared, read-only demo account:** simpler, but visitors could not try editing or drag
  and drop, and credentials would have to be published.
- **One shared, writable demo board:** visitors would see each other's changes and vandalism.
  It would also need a periodic reset.
- **Seeding from a Server Action after sign-in:** if it failed, the user would exist without a
  board, and the seeding logic would live in two places (app and SQL).
- **Upgrading the anonymous user to a permanent account (`linkIdentity` / `updateUser`):** it
  would keep the visitor's demo changes. It is deferred because it adds edge cases (OAuth
  linking, email collisions) that the portfolio does not need yet.
- **CAPTCHA (Cloudflare Turnstile) on anonymous sign-in:** Supabase recommends it against bots.
  It is deferred until abuse shows up, because it needs keys per environment and a widget on the
  landing page.

## Consequences

- Hosted projects must have **Anonymous sign-ins enabled** (Authentication settings), in
  addition to `enable_anonymous_sign_ins = true` in `supabase/config.toml` for local development
  and CI.
- Anonymous users count as monthly active users and take up database space until the cleanup
  job removes them.
- Demo changes are lost when the visitor creates an account. If account upgrade is added later,
  the profile keeps the "Demo visitor" name and the user never gets "My board".
- Any feature with a real cost, above all the AI calls from v0.2, must check `is_anonymous` and
  deny access or apply stricter limits.
- Changing the demo content means adding a new migration that replaces
  `private.seed_demo_board`. Existing demo boards are not affected.
