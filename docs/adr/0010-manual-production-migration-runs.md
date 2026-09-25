# 0010. Manual migration runs can target production

- **Status:** accepted
- **Date:** 2026-09-25

## Context

`db-migrations.yml` was designed while production had no database
([ADR 0003](0003-defer-production-database.md)):

- **Production** was migrated only by a push to `main` that changes `supabase/migrations/`. In
  steady state that is exactly when the production schema must change, so there was no need for
  anything else. The job stayed disabled until `PRODUCTION_DB_ENABLED=true`.
- **Manual runs** (`workflow_dispatch`) targeted staging only. They were added to inspect or
  re-apply staging migrations. A manual path to a database that did not exist yet would have been
  unused code on the most sensitive job, so we left it out on purpose.

Creating `kanban-prod` for v0.1 exposes a gap in that design. The new database is empty, and
every existing migration was merged to `main` before the production job was enabled. The push
trigger only fires when a migration changes, so the existing migrations would never reach
production until someone merged a new one.

## Decision

`workflow_dispatch` takes a `target` input (`staging` by default, or `production`) next to the
existing `dry_run` input (default `true`).

- A manual run with `target=production` runs the production job. It has the same guards as a
  push: `PRODUCTION_DB_ENABLED=true` and manual approval of the `production` environment.
- On a manual run the apply step runs only when `dry_run` is off. Push runs always apply, as before.
- The concurrency group follows the target, so a manual production run and a push to production
  never overlap.

Bootstrapping production is therefore: a dry run (lists all migrations), then the real run.

## Alternatives considered

- **Merge an empty migration to trigger the push job:** it works once, but adds a meaningless
  migration to the schema history and hides the real reason in a trick.
- **Run `supabase db push` from a local machine:** breaks the rule that migrations reach hosted
  databases only through the pipeline (AGENTS.md, ADR 0002), and needs the production password
  on a laptop.
- **Remove the `paths` filter on push:** production would be migrated (and ask for approval) on
  every merge, almost always as a no-op.

## Consequences

- The initial production migration goes through the same audited, approved pipeline as every
  later one.
- Manual production runs stay available for recovery, e.g. re-running after a failed or rejected
  push run. The environment approval remains the safety net against mistakes.
- Manual staging runs keep their previous behaviour because `staging` is the default target.
