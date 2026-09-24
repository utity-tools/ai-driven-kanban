# Development setup

How to get the project running from scratch, how the environments fit together, and fixes for
the problems already found. For the reasoning behind each choice, see the [ADRs](adr/).

## Requirements

| Tool       | Version           | Notes                                                                                                    |
| ---------- | ----------------- | -------------------------------------------------------------------------------------------------------- |
| Node.js    | 24 (see `.nvmrc`) | `engines` in `package.json` enforces `>=24`                                                              |
| pnpm       | 12+               | `npm i -g pnpm`                                                                                          |
| Docker     | any recent        | [OrbStack](https://orbstack.dev) recommended on macOS (free for personal use). Needed for local Supabase |
| GitHub CLI | optional          | `gh`, used by the `/ship` skill to open PRs                                                              |
| Vercel CLI | optional          | `vercel`, only to manage env vars and inspect deployments                                                |

## First run

```bash
git clone https://github.com/utity-tools/ai-driven-kanban.git
cd ai-driven-kanban
pnpm install              # also installs the git hooks (Husky)
pnpm exec playwright install chromium
pnpm db:start             # first time pulls the Supabase images (a few GB, several minutes)
pnpm env:local            # writes the local Supabase URL and keys into .env.local
pnpm dev                  # http://localhost:3000
```

Local Supabase services (URLs also shown by `pnpm db:status`):

| Service               | URL                    |
| --------------------- | ---------------------- |
| API                   | http://127.0.0.1:54321 |
| Studio (database UI)  | http://127.0.0.1:54323 |
| Mailpit (auth emails) | see `pnpm db:status`   |

Seeded local users: `alice@example.com` and `bob@example.com`, password `password123`.
New sign-ups get a default board automatically.

Stop the database when you are not using it: `pnpm db:stop`.

## Commands

| Task                                          | Command                                           |
| --------------------------------------------- | ------------------------------------------------- |
| Dev server                                    | `pnpm dev`                                        |
| Lint / format / format check                  | `pnpm lint` / `pnpm format` / `pnpm format:check` |
| Type check                                    | `pnpm typecheck`                                  |
| Unit tests (watch, coverage)                  | `pnpm test` (`test:watch`, `test:coverage`)       |
| E2E tests                                     | `pnpm test:e2e`                                   |
| Local Supabase                                | `pnpm db:start` / `db:stop` / `db:status`         |
| Reset local DB (migrations + seed)            | `pnpm db:reset`                                   |
| New migration                                 | `pnpm db:migration <name>`                        |
| Regenerate DB types                           | `pnpm db:types`                                   |
| DB tests (pgTAP) / SQL lint                   | `pnpm db:test` / `pnpm db:lint`                   |
| Write local Supabase values into `.env.local` | `pnpm env:local`                                  |

## Environments

```
 local                  CI                      preview (per PR)          production
 ─────                  ──                      ────────────────          ──────────
 pnpm dev               GitHub Actions          Vercel preview URL        ai-driven-kanban.vercel.app
 Supabase in Docker     ephemeral Postgres      Supabase kanban-staging   no database until v0.1
```

| Environment | App                                                            | Database                                                                        | Schema changes arrive via                                     |
| ----------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Local       | `pnpm dev`                                                     | Supabase local (Docker)                                                         | `pnpm db:reset`                                               |
| CI          | GitHub Actions                                                 | ephemeral local Supabase: Postgres for DB tests; Postgres + Auth + REST for E2E | migrations + seed on every run                                |
| Preview     | Vercel, one deployment per PR, private (Vercel Authentication) | `kanban-staging` (eu-west-1)                                                    | `db-migrations.yml` on PRs that change `supabase/migrations/` |
| Production  | Vercel, deployed on every merge to `main`                      | not created yet ([ADR 0003](adr/0003-defer-production-database.md))             | `db-migrations.yml` after merge, with manual approval         |

### Where each variable lives

| Name                                           | Where                                       | Kind                      | Used by                        |
| ---------------------------------------------- | ------------------------------------------- | ------------------------- | ------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`                     | `.env.local` · Vercel **Preview**           | public                    | app                            |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`         | `.env.local` · Vercel **Preview**           | public (protected by RLS) | app                            |
| `SUPABASE_SECRET_KEY`                          | `.env.local` only                           | **secret**, bypasses RLS  | server code, when needed       |
| `VERCEL_OIDC_TOKEN`                            | `.env.local` (written by `vercel env pull`) | secret, short-lived       | Vercel services from local dev |
| `SUPABASE_DB_PASSWORD`                         | GitHub environment `staging`                | **secret**                | migrations workflow            |
| `SUPABASE_PROJECT_REF`, `SUPABASE_POOLER_HOST` | GitHub environment `staging`                | variables                 | migrations workflow            |
| `PRODUCTION_DB_ENABLED`                        | GitHub repo variable (not set yet)          | variable                  | turns on production migrations |

`.env.example` documents the app variables. Only that file is committed.

### Enabling production (v0.1)

Summary of [ADR 0003](adr/0003-defer-production-database.md):

1. Create the Supabase project `kanban-prod` (same region, eu-west-1).
2. GitHub environment `production`: variables `SUPABASE_PROJECT_REF`, `SUPABASE_POOLER_HOST`
   (Connect → Session pooler) and secret `SUPABASE_DB_PASSWORD`.
3. GitHub repo variable `PRODUCTION_DB_ENABLED=true`.
4. Vercel **Production** env: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` of `kanban-prod`.

## Known issues and fixes

| Symptom                                                                               | Cause                                                                                       | Fix                                                                                                                               |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:e2e` passes but never exits; a `next-server` keeps port 3000 busy          | `pnpm start` as Playwright's `webServer` leaves `next-server` running                       | Already fixed: `playwright.config.ts` calls `next` directly. To free the port: `lsof -iTCP:3000 -sTCP:LISTEN`, then kill that PID |
| Supabase or Vercel variables disappear from `.env.local`                              | `vercel link` / `vercel env pull` rewrite the file                                          | `pnpm env:local` merges its values back and keeps the rest                                                                        |
| PR says "This branch is out-of-date with the base branch"                             | `main` requires branches to be up to date before merging                                    | Click **Update branch** (or `@dependabot rebase` on Dependabot PRs), wait for CI, merge                                           |
| Pre-commit fails with "File ignored because of a matching ignore pattern"             | ESLint warning on ignored files plus `--max-warnings=0`                                     | Already fixed: lint-staged passes `--no-warn-ignored`                                                                             |
| Migrations job cannot reach the database from CI                                      | GitHub runners are IPv4-only; the direct DB host is IPv6                                    | Use the **Session pooler** host (port 5432), never the direct or transaction pooler one                                           |
| "Continue with GitHub" fails locally with "provider is not enabled"                   | GitHub OAuth is only configured on hosted projects ([ADR 0005](adr/0005-authentication.md)) | Use email + password locally (seeded `alice@example.com` / `password123`, or sign up)                                             |
| Preview URL answers 302 / asks to log in                                              | Vercel Authentication protects previews                                                     | Expected: previews are private, production is public                                                                              |
| First deployment of a new Vercel project shows up as Production from a feature branch | Observed with a brand new project that had no production deployment yet                     | Resolves on the next merge to `main`                                                                                              |
