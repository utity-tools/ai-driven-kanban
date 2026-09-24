<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AI-Driven Kanban

Kanban board where AI proposes technical subtasks, estimates and dependencies, and a human
reviews every proposal before it is saved. Portfolio project: code quality, tests and a clean
history matter as much as features.

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript (strict)
- Tailwind CSS v4 · shadcn/ui · dnd-kit
- Supabase: Postgres, Auth, Row Level Security, Realtime
- Vercel AI SDK v6 via AI Gateway · Zod for every AI output
- Vitest (unit) · Playwright (E2E) · pnpm

## Commands

| Task                                       | Command                          |
| ------------------------------------------ | -------------------------------- |
| Dev server                                 | `pnpm dev`                       |
| Lint / format                              | `pnpm lint` / `pnpm format`      |
| Type check                                 | `pnpm typecheck`                 |
| Unit tests                                 | `pnpm test`                      |
| E2E tests                                  | `pnpm test:e2e`                  |
| Local Supabase                             | `pnpm db:start` / `pnpm db:stop` |
| Reset local DB (re-runs migrations + seed) | `pnpm db:reset`                  |
| New migration                              | `pnpm db:migration <name>`       |
| Regenerate DB types                        | `pnpm db:types`                  |
| DB tests (pgTAP: schema + RLS)             | `pnpm db:test`                   |
| SQL lint                                   | `pnpm db:lint`                   |
| Local Supabase URLs and status             | `pnpm db:status`                 |
| Generate `.env.local` from local Supabase  | `pnpm env:local`                 |

## Workflow (mandatory)

1. **Never work on `main`.** Every change lives on a branch: `feat/…`, `fix/…`, `chore/…`,
   `docs/…`, `test/…`, `refactor/…`, `ci/…`.
2. **Conventional Commits**, small and atomic: `feat(board): add column reordering`.
3. **Green before commit:** lint, typecheck and relevant tests must pass. Never use `--no-verify`.
4. **Everything reaches `main` through a PR** with CI green. PRs are squash-merged, so the PR
   title must also be a Conventional Commit.
5. Significant technical decisions get an ADR in `docs/adr/` (copy `0000-template.md`).

## Environments

| Environment      | Database                   | Deployed by                |
| ---------------- | -------------------------- | -------------------------- |
| Local dev        | Supabase local (Docker)    | `pnpm dev`                 |
| CI               | Ephemeral Supabase local   | GitHub Actions             |
| Preview (per PR) | Supabase `staging` project | Vercel preview             |
| Production       | Supabase `prod` project    | Vercel, on merge to `main` |

Migrations reach staging/prod only through the deploy pipeline, never from a local machine.

## Project structure

```
src/app/          Routes, layouts, Server Actions
src/components/   UI (board, columns, cards, AI proposal review)
src/lib/ai/       Prompts (versioned), Zod schemas, model calls
src/lib/graph/    Deterministic dependency logic (cycles, blocked tasks, bottlenecks)
src/lib/db/       Supabase clients (browser, server, session) and generated types
src/lib/auth/     Auth helpers: session, redirects, form schemas, error mapping
src/proxy.ts      Session refresh and route protection (Next 16 replaces middleware.ts)
supabase/         Migrations (source of truth for the schema) and seed
evals/            AI quality dataset and eval runner (not part of CI)
tests/            unit/ and e2e/
docs/             Architecture and ADRs
```

## Conventions

### Code

- Server Components by default; add `"use client"` only for interactivity.
- Mutations go through Server Actions; validate every input with Zod.
- No `any`. Prefer types inferred from Zod schemas and generated DB types.
- Keep modules small and pure where possible; business logic lives in `src/lib`, not in components.

### Database

- The schema lives in `supabase/migrations`. Never edit an applied migration; add a new one.
- Every new table enables RLS and gets policies **in the same migration**, using
  `public.has_board_role(board_id, roles)` (see [ADR 0004](docs/adr/0004-board-authorization-model.md)).
- Every new table also revokes default privileges and uses column-level updates:
  - `revoke all on table <t> from anon;`
  - `revoke truncate, references, trigger, maintain on table <t> from authenticated;`
    (Supabase grants them by default, and TRUNCATE bypasses RLS)
  - `revoke update` on the table, then `grant update (<columns>)` only for editable columns.
- Schemas ([ADR 0007](docs/adr/0007-date-only-due-dates-and-internal-schema.md)): `public` for tables and
  RPCs the app calls; `internal` for SECURITY INVOKER helpers only; `private` for SECURITY DEFINER
  internals. Never expose `internal` or `private` through the API.
- Dates without a time (due dates) use the `date` type and are interpreted in the viewer's time zone.
- After any migration: `pnpm db:reset && pnpm db:types && pnpm db:test`.
- RLS policies are tested with pgTAP in `supabase/tests/database/`: every new policy gets a test.

### AI

- AI output is always a **proposal**: it is never written to the database without explicit
  user confirmation.
- Every model output is validated against a Zod schema.
- User text is untrusted input: delimit it in prompts and never let it change instructions.
- Model calls live only in `src/lib/ai/` and run only on the server.

### Testing

- Logic in `src/lib` has unit tests.
- User flows have Playwright tests.
- Tests never call a real model: use the AI SDK mock model with fixtures.

### Security

- Never commit secrets. Only `.env.example` is versioned.
- Never read or print `.env` files.
