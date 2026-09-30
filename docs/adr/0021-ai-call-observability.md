# 0021. AI call observability: one event and one usage record per call

- **Status:** accepted (amends [0016](0016-daily-ai-quotas-and-cost-cap.md))
- **Date:** 2026-09-30

## Context

Each AI feature (decomposition, ADR 0014, and dependency suggestions, ADR 0020) logged a loose
`console.info` on finish and a `console.error` on error. Nobody could answer basic questions: how
much a call really costs, how often the model returns invalid or empty output, how often users
press Stop, or how latency changes between prompt versions. Quotas (ADR 0016) charge a worst-case
estimate of $0.006 per call, but the first eval run (v0.4) measured about $0.0014 per call, so the
global cap allowed about four times fewer calls than it needed to.

We want real data per call, without ever storing or logging user text, and without letting the
new data weaken the quota guarantees.

## Decision

Every call made through the app is designed to end with **exactly one** `ai.call` log event and
**one** completed row in `private.ai_usage`, whatever way it ends. Rows that stay open are
possible and bounded (see Consequences).

- **Outcome:** one of `ok`, `empty`, `invalid`, `error` or `aborted` (see `src/lib/ai/outcome.ts`).
  `trackCall` (`src/lib/ai/track-call.ts`) wraps the SDK's `onFinish`, `onError` and `onAbort` and
  also listens to the abort signal. The first path to fire wins, so overlapping callbacks report
  once.
- **Event:** `ai.call` (`src/lib/observability/ai-log.ts`) with `requestId`, `feature`,
  `promptVersion`, `model`, `outcome`, `latencyMs`, tokens and gateway cost. It carries metadata
  only, never a prompt, an output or card text. `error` goes to `console.error`; everything else
  goes to `console.info`.
- **Record:** `reserve_ai_decomposition(p_feature)` returns a `usage_id`, which stays on the
  server. `record_ai_usage` completes it with the real values. The routes register an `after()`
  task up front, in request scope. It waits for the SDK's completion and then writes the record,
  so the write survives the end of the streamed response. A failed record is logged
  (`ai.usage.record_failed`) and never affects the user.
- **Cost cap:** the global daily cap counts `least(real, estimated)` per row. A reserved call is
  charged the worst-case estimate until it completes. A reported real cost can then only
  **lower** its own row's charge.

## Alternatives considered

- **Logs only (no database columns):** cheaper, but the cap could not use real costs, and
  aggregating across Vercel log retention windows is awkward.
- **Trust reported costs fully (`coalesce(real, estimated)`):** any signed-in user can reserve
  through the API and get a `usage_id` for their own row. Reporting a huge cost would then exhaust
  the shared budget for everyone. `least()` plus a 0..1 range check removes that denial of
  service.
- **Record with the service role:** that would make the reported values fully trusted, but it
  adds a service-role client to request handling, which the app avoids everywhere else. With
  `least()`, under-reporting only affects rows that never called the model, because real calls
  keep their `usage_id` server-side, so the extra trust isn't needed.
- **An observability vendor (Sentry, OpenTelemetry exporter, Langfuse):** worth it at scale.
  For now, structured logs plus SQL answer every question we have, at no extra cost or new data
  processor.

## Consequences

- `docs/observability.md` has ready-made SQL for real vs estimated cost, latency percentiles and
  outcome rates per prompt version, and explains how to read the `ai.call` events.
- ADR 0016's "the client never reports a cost" no longer holds as written: the app now reports
  one, and the cap trusts it only downward.
- A real cost above the estimate is undercounted by design. `cost_per_call_usd` must stay at or
  above the real worst case, and is raised with a migration before AI is enabled in production.
- **Completion values are caller-reported.** A signed-in user can reserve directly through the
  API (within their own daily limit) and record any outcome, model, tokens, latency or cost
  (0..1) for those rows. That can't touch the cap or other users, but it can skew aggregates.
  Decisions such as raising `cost_per_call_usd` are therefore checked against the AI Gateway
  dashboard, and the SQL guide uses percentiles and per-user breakdowns rather than `max()`.
- Rows reserved by the previous app version during a deploy, by direct API calls, or by a call
  whose record failed stay open and keep their estimate, as before.
- `p_feature` defaults to `'decompose'` only for rollout compatibility. A later migration can
  drop the default once every caller passes it.
