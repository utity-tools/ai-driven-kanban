# 0024. AI cost limits for the production launch

- **Status:** accepted
- **Date:** 2026-10-07

## Context

Production is about to turn AI on (`AI_DECOMPOSITION_ENABLED`). The limits from
[ADR 0016](0016-daily-ai-quotas-and-cost-cap.md) were set before dependency suggestions existed
and before the prompt carried existing subtasks:

- `cost_per_call_usd` (0.006) must be at least the real worst case, because a call without a
  reported cost is charged that estimate against the global cap
  ([ADR 0021](0021-ai-call-observability.md)). It no longer was:
  - **Decomposition:** a 10,000-char description plus up to 20 existing subtask titles, about 6k
    input tokens with the system prompt, is about $0.011 with `anthropic/claude-haiku-4.5`
    ($1/M input, $5/M output) and `maxOutputTokens` 1024.
  - **Dependency suggestions:** the same description plus up to 100 candidate cards (title 200 +
    column 50 chars each), about 13k input tokens, is about $0.019.
- With a correct estimate, the $0.25 global cap would allow only 12 worst-case calls per day
  across every user, which a single visitor trying the demo and an account could use up. The
  project is a portfolio: recruiters and reviewers must be able to try the AI features.

## Decision

Raise `cost_per_call_usd` to **$0.02** (one estimate covers both features, so it covers the more
expensive one) and `global_daily_cost_usd` to **$0.40**, in a migration that updates both the
row and the column defaults. Per-user limits stay at 3/day for demo users and 20/day for
accounts.

## Alternatives considered

- **Keep $0.25/day:** at most ~$7.5/month, but only 12 worst-case calls per day for everyone.
- **$1/day:** ~50 worst-case calls per day, at up to ~$30/month; more than a portfolio needs.
- **One estimate per feature:** more accurate, but needs a schema and RPC change for a gain of
  a few cents; revisit if the features' costs drift further apart.

## Consequences

- For typical text the worst day costs $0.40 (~$12/month). The estimates assume ~3 chars per
  token: adversarial card text (CJK, emoji, random Unicode) can reach ~1 token per char and cost
  more than $0.02 per call, which the cap undercounts by design (ADR 0021), so 20 such calls could
  cost about $1. The AI Gateway's own spend limit is the hard backstop and must be set before
  launch.
- The margin is thin (~$0.019 against $0.02): any growth of a prompt uses it up.
- Real calls cost far less (about $0.0014 in the evals) and completed calls are charged their
  real cost, so the cap allows many more than 20 real calls a day.
- Any change that grows a prompt's worst case (larger limits, more context, another model) must
  recheck this estimate and raise it in a migration if needed.
- pgTAP cap tests pin their own limits, so tuning these values does not change what they prove.
