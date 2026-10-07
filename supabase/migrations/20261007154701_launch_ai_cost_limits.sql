-- Launch AI cost limits (ADR 0024, amends ADR 0016).
--
-- cost_per_call_usd 0.006 -> 0.02. The old estimate covered decomposition only, and
-- under-counted it: its worst case is a 10,000-char description plus up to 20 existing
-- subtask titles (~6k input tokens with the system prompt), about $0.011 with
-- anthropic/claude-haiku-4.5 ($1/M input, $5/M output, maxOutputTokens 1024). Dependency
-- suggestions (v0.3) send the same description plus up to 100 candidate cards (title 200 +
-- column 50 chars each), ~13k input tokens, about $0.019. One estimate covers both features,
-- so it must cover the more expensive one. Real calls cost far less (~$0.0014 in the evals),
-- and the global cap counts least(real, estimate) per completed row, so this only bounds the
-- worst case. The figures assume typical text (~3 chars/token): adversarial card text (CJK,
-- emoji, random Unicode) can cost more than the estimate, which the cap undercounts by design
-- (ADR 0021); the AI Gateway's own spend limit is the hard backstop.
--
-- global_daily_cost_usd 0.25 -> 0.40: with the higher estimate, 0.25 would allow only 12
-- worst-case calls per day across every user; 0.40 allows 20 worst-case calls (many more real
-- ones), about $12/month at most for typical text. Per-user limits (demo 3/day, accounts
-- 20/day) are unchanged.
--
-- Both the row and the column defaults change, so a fresh database matches the hosted ones.

alter table private.ai_limits
  alter column global_daily_cost_usd set default 0.40,
  alter column cost_per_call_usd set default 0.02;

update private.ai_limits
set global_daily_cost_usd = 0.40,
    cost_per_call_usd = 0.02
where id;

comment on table private.ai_limits is
  'Singleton row of AI quota configuration (daily call counts per kind of user, the shared '
  'daily cost cap, and the estimated cost charged per reserved call). Not exposed through '
  'the API; changed only by a migration or direct SQL. See ADR 0024 and migration '
  '20261007154701_launch_ai_cost_limits for the current cost_per_call_usd estimate.';
