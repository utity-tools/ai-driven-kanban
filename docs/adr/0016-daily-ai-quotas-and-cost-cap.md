# 0016. Daily AI quotas and a global cost cap

- **Status:** accepted
- **Date:** 2026-09-28

## Context

AI decomposition (ADR 0014) and its review flow (ADR 0015) work on Vercel Preview, but
Production keeps `AI_DECOMPOSITION_ENABLED` off: sign-ups are open, demo (anonymous) sessions
cost one click, and nothing bounded how often anyone could call the model. Every call spends
AI Gateway credits on a portfolio project with a small, prepaid budget. Demo users were denied
outright (403) for the same reason, which hid the project's main feature from the visitors most
likely to try it.

We need limits that hold even if the client misbehaves, that can't be raced, and that cap the
total spend per day, not just each user's.

## Decision

Every decomposition first reserves one call in the database; the route calls the model only if
the reservation succeeds.

- **Storage (`private` schema, no API access):** `private.ai_limits` is a one-row config table
  (demo 3 calls/day, permanent accounts 20/day, global cap $0.25/day, $0.006 estimated per
  call). `private.ai_usage` has one row per reserved call (`user_id`, `is_demo`,
  `estimated_cost_usd`, `created_at`). Limits change only through a migration or SQL.
- **RPC:** `public.reserve_ai_decomposition()` (SECURITY DEFINER wrapper over the private
  function, `authenticated` only). It takes a transaction-level advisory lock so concurrent
  calls can't both pass, counts the caller's calls since midnight UTC (`AIQ01` when spent),
  then the day's total estimated cost (`AIQ02` when one more call would exceed the cap),
  inserts the row and returns `remaining`, `daily_limit` and `resets_at`.
- **Charged at reservation:** a call counts even if the model then fails or the user stops
  it. It is the simplest rule and the hardest to game; calling the RPC directly only burns the
  caller's own quota.
- **Cost is a worst-case estimate, computed in SQL:** Claude Haiku 4.5 at $1/M input and $5/M
  output tokens, with `maxOutputTokens` 1024 and a bounded prompt, is about $0.0065 per call,
  rounded to $0.006 (real calls use about a third of that). The client never reports a cost, so
  it can't under-report one. The cap therefore allows about 40 calls/day in total.
- **Route:** after the owner/editor check, `POST /api/cards/[cardId]/decompose` reserves. A
  quota error becomes **429** with `Retry-After` (seconds to midnight UTC) and a message that
  says whose limit was hit. A success streams as before with an `X-Quota-Remaining` header.
  The anonymous-user 403 is removed.
- **Demo users:** they can now suggest (3/day) and accept.
  `private.accept_ai_subtasks` no longer rejects anonymous callers; the owner/editor check
  still applies.
- **UI:** the button shows "N AI suggestions left today" once the count is known (after the
  first request) and becomes `aria-disabled` at zero (`aria-disabled` keeps focus on it after
  the review closes). A 429 shows its message without Retry.
- **Backstop:** the AI Gateway budget (prepaid credits, no auto-reload) stays the final limit,
  and `AI_DECOMPOSITION_ENABLED` remains the kill switch.

## Alternatives considered

- **Record actual token usage after each call:** exact costs, but the reservation would have
  to be finalised by a second call that the client could skip or forge, and failures in the
  middle of a stream would leave holes. Deferred to v0.4 observability, where logged usage
  (`ai.decompose`) can feed a report without being part of enforcement.
- **Counting in the app (e.g. KV or an in-memory counter):** needs another service or doesn't
  hold across serverless instances. Postgres is already there and transactional.
- **A cap per IP address for demo users:** anonymous sign-ins are already rate-limited per IP
  by Supabase Auth, and the global cap bounds the total, so a per-IP counter would add
  complexity (and personal data) for little gain.
- **Charging only successful calls:** fairer to users, but a user could repeat stopped or
  failing calls without limit, and those still cost tokens.

## Consequences

- Production can turn AI on: the worst day costs $0.25 whatever users do.
- Limits are global and coarse: one active user can use a large share of the shared cap. If
  real usage grows, raise the cap by migration (and the Gateway budget with it) or add a
  separate cap for demo users.
- The "remaining" count only appears after a request; showing it on load would need a
  read-only RPC, which isn't worth it for now.
- `ai_usage` rows are deleted along with their user (on delete cascade), so demo cleanup also
  removes their usage, but only after 7 days, well after the day they count towards.
- ADRs 0014 and 0015 describe demo users as refused; that part is superseded by this ADR.
