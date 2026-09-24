# 0001. Stack, environments and development workflow

- **Status:** accepted
- **Date:** 2026-09-24

## Context

Solo portfolio project built with heavy use of AI coding agents. It must show production-grade
engineering: reliable AI features, tests, a clean history and safe deployments, without process
overhead that a single developer cannot sustain.

## Decision

- **Single Next.js 16 app** (App Router, Server Actions) instead of a monorepo or a separate API.
  Types flow end to end from the DB schema and Zod schemas to the UI.
- **Supabase** for Postgres, Auth, RLS and Realtime. Migrations in the repo are the source of truth.
- **AI SDK v6 + AI Gateway** for provider-agnostic models, fallbacks and cost tracking.
  AI output is always a proposal confirmed by the user.
- **Environments:** local Supabase (Docker/OrbStack) for dev and CI; a Supabase `staging` project
  behind Vercel preview deployments (one per PR); a Supabase `prod` project behind production.
- **Trunk-based workflow:** short-lived branches, Conventional Commits, squash-merged PRs into `main`,
  which deploys to production.
- **Enforcement in layers:** agent instructions (AGENTS.md), Claude Code hooks, git hooks
  (Husky + commitlint) and CI with branch rules on `main`.

## Alternatives considered

- **`develop` branch as staging:** more merges and drift for no benefit with one developer;
  per-PR previews give the same safety.
- **Cloud-only Supabase for dev:** shared state and no disposable DB for CI.
- **Separate backend service:** duplicated types and more deploy surface without a real need.

## Consequences

- Docker (OrbStack) is required for local development.
- Every change needs a branch and a PR, including small ones.
- Migrations reach staging/prod only through the pipeline, never from a laptop.
