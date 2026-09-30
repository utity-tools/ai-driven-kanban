# Observability

How to see what the AI features do in each environment: cost, latency, tokens and outcomes.
The design is in [ADR 0021](adr/0021-ai-call-observability.md).

## What is recorded

Every AI call reserved through `reserve_ai_decomposition` ends with:

- **One log event, `ai.call`**, with `requestId`, `feature` (`decompose` | `dependencies`),
  `promptVersion`, `model`, `outcome`, `latencyMs`, `inputTokens`, `outputTokens` and `costUsd`
  (from the AI Gateway). Outcome `error` is logged at error level and adds a truncated
  `errorMessage`; every other outcome is logged at info level.
- **One completed row in `private.ai_usage`** with the same values, used by the SQL below.

| Outcome   | Meaning                                                          |
| --------- | ---------------------------------------------------------------- |
| `ok`      | Valid proposal with at least one item                            |
| `empty`   | Valid output that proposes nothing                               |
| `invalid` | Output failed the schema (includes truncation at the token cap)  |
| `error`   | Provider or SDK error, or the route failed before the model call |
| `aborted` | The user pressed Stop or the client disconnected                 |

Neither the event nor the row ever contains a prompt, a model output or card text.

Other log lines, all keyed by `requestId` where one exists: `ai.usage.record_failed` (the row
could not be completed; never affects the user), `ai.call.incomplete` (the call never reported
its end), and the route's `ai.decompose.*` / `ai.dependencies.*` errors.

## Reading the logs

Vercel keeps function logs per deployment. To follow the AI events of a preview branch:

```bash
vercel logs --branch <branch> --since 1h --query ai.call --expand
```

For production, drop `--branch` and use `--environment production`. Locally, the events print in
the `pnpm dev` terminal.

## SQL

`private` is not exposed through the API. Run these in the Supabase SQL editor of the staging or
prod project, or locally with `psql` on the `DB_URL` printed by `pnpm db:status`. They are
read-only.

### 1. Daily cost: real vs estimated vs charged

```sql
select (created_at at time zone 'utc')::date as day, feature, count(*) as calls,
  round(sum(actual_cost_usd), 4) as real_usd,
  round(sum(estimated_cost_usd), 4) as estimated_usd,
  round(sum(least(coalesce(actual_cost_usd, estimated_cost_usd), estimated_cost_usd)), 4) as charged_usd
from private.ai_usage
where created_at >= now() - interval '14 days'
group by 1, 2 order by 1 desc, 2;
```

`charged_usd` is what the global cap counts: `least(real, estimated)` per row. A call without a reported cost (aborted, provider error, or reserved by an older app version) is charged the full estimate.

### 2. Latency and tokens per prompt version (successful calls)

```sql
select feature, prompt_version, count(*) as calls,
  percentile_cont(0.5) within group (order by latency_ms) as p50_ms,
  percentile_cont(0.95) within group (order by latency_ms) as p95_ms,
  round(avg(input_tokens)) as avg_in, round(avg(output_tokens)) as avg_out,
  max(actual_cost_usd) as max_real_usd
from private.ai_usage
where outcome = 'ok' and created_at >= now() - interval '14 days'
group by 1, 2 order by 1, 2;
```

Compare these numbers across prompt versions after a prompt change, together with the eval baseline (`evals/results/baseline/`). `max_real_usd` is the value to check against `private.ai_limits.cost_per_call_usd`, which must stay at or above it.

### 3. Outcome rates per prompt version

```sql
select feature, prompt_version, outcome, count(*) as calls,
  round(100.0 * count(*) / sum(count(*)) over (partition by feature, prompt_version), 1) as pct
from private.ai_usage
where completed_at is not null and created_at >= now() - interval '14 days'
group by 1, 2, 3 order by 1, 2, 4 desc;
```

A rise in `invalid` or `error` after a deploy is the first thing to look at. `aborted` means the user pressed Stop or closed the review panel.

### 4. Rows never completed

```sql
select count(*) as open_rows
from private.ai_usage
where completed_at is null and created_at < now() - interval '1 hour';
```

Reserved more than an hour ago and never completed, so they can no longer be completed. A few are expected (rows from a deploy window, direct API reservations). A steady number means the completion path is broken: search the logs for `ai.call.incomplete` and `ai.usage.record_failed`.
