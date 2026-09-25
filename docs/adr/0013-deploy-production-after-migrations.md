# 0013. Deploy production after its migrations

- **Status:** accepted
- **Date:** 2026-09-25

## Context

Vercel's Git integration deployed every merge to `main` straight to production, while
`db-migrations.yml` migrated `kanban-prod` in parallel and waited for a manual approval. Merging
#22 put code that reads `card_subtasks` in production before the table existed there: board pages
could fail until the migration was approved. During v0.1 we always migrated first by hand, so the
race went unnoticed.

## Decision

Production is deployed by GitHub Actions, in order, never by the Git integration:

- `vercel.json` sets `git.deploymentEnabled: { "main": false }`. Previews of PR branches are
  unchanged.
- `deploy-production.yml` runs when CI succeeds on a push to `main` (or manually on `main`):
  1. **plan:** compares `supabase/migrations/` between the commit and the last successful
     production deploy (the GitHub deployments of the `production-deploy` environment). Comparing
     with the last deploy instead of the previous commit means a run superseded by a newer merge
     cannot skip its migrations. With no known deploy it migrates, which is a no-op when the
     schema is current.
  2. **migrate:** if needed, calls `db-migrations.yml` with `target: production`; the
     `production` environment still requires approval.
  3. **deploy:** only if the migration succeeded or was not needed, `vercel deploy --prod` builds
     on Vercel with the Production variables, as the Git integration did. It runs in the
     `production-deploy` environment (secret `VERCEL_TOKEN`, main only, no approval).
- `db-migrations.yml` becomes reusable (`workflow_call`) and loses its `push` trigger, so there is
  one path to production. Manual runs remain for bootstrap and recovery
  ([ADR 0010](0010-manual-production-migration-runs.md)).

Production now also waits for CI to pass, which it did not before.

## Alternatives considered

- **Staged production builds** (Vercel keeps building `main` with auto-assignment of production
  domains turned off, and the workflow runs `vercel promote`): faster rollout, but it depends on a
  dashboard setting outside the repository and on polling for the build of a given commit.
- **Keep auto-deploys and require backward-compatible migrations** (expand, then use the new
  schema in a later PR): good practice, but it relies on discipline and one mistake breaks
  production. It remains good practice on top of this.
- **Build in CI and deploy with `--prebuilt`:** the build would need the production variables on
  the runner; building on Vercel keeps them there.

## Consequences

- Code reaches production only after CI and after its migrations, and never after a rejected or
  failed migration.
- A deploy needs `VERCEL_TOKEN` in GitHub (a long-lived credential, scoped to the team; listed in
  `docs/security.md`). If it is missing or expired, the deploy job fails and production keeps the
  previous version; re-run the workflow after fixing it.
- A run whose commit is no longer the tip of `main` when it starts is skipped: the newer run
  deploys everything, and GitHub records deployments against the tip, so this keeps the record
  used by the plan step accurate.
- Recovery after a failed deploy (e.g. an expired token) is **Run workflow on `main`**, not
  **Re-run** of an old run: a re-run keeps its original commit and could deploy older code. If
  the last deploy failed, the next plan may ask for a (no-op) migration approval, since GitHub
  marks older successful deployments inactive.
- Production deploys take a few minutes longer (CI first) and appear in GitHub under the
  `production-deploy` environment. Rollback is unchanged: Vercel Instant Rollback.
- The first run after this change migrates (no-op) and so asks for one approval.
