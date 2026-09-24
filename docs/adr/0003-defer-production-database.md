# 0003. Start with a staging database only; add production at v0.1

- **Status:** accepted
- **Date:** 2026-09-24

## Context

ADR 0001 planned two Supabase cloud projects: `staging` (behind per-PR preview deployments)
and `prod` (behind production). The Supabase free plan allows **two active free projects per
user**, counted across every organization the user owns or administers. One slot is taken by
another active project, and the dashboard does not allow pausing it (the likely cause, not yet
confirmed, is that it is managed through the Vercel integration).

At this point the app has no schema and no users, so a production database would hold nothing.

## Decision

- Create only `kanban-staging` now. Preview deployments use it.
- Create `kanban-prod` when v0.1 is ready to publish, after freeing a free-plan slot.
- The migrations workflow already has a production job, disabled until the repo variable
  `PRODUCTION_DB_ENABLED` is set to `true`.

## Alternatives considered

- **Supabase Pro plan:** removes the limit and adds branching, but costs money for a portfolio
  project with no users yet.
- **One project shared by previews and production:** previews could corrupt real data. Rejected.

## Consequences

- Until v0.1, the production deployment has no database, which is acceptable because there is no
  feature using one yet.
- Enabling production later means:
  1. create `kanban-prod`,
  2. set `SUPABASE_PROJECT_REF` and `SUPABASE_POOLER_HOST` (variables) and `SUPABASE_DB_PASSWORD`
     (secret) in the `production` environment,
  3. set the repo variable `PRODUCTION_DB_ENABLED=true`,
  4. set the production env vars in Vercel.
