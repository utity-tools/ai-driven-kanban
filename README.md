# AI-Driven Kanban

[![CI](https://github.com/utity-tools/ai-driven-kanban/actions/workflows/ci.yml/badge.svg)](https://github.com/utity-tools/ai-driven-kanban/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A Kanban board where AI works like a teammate under human supervision: on any card, a language
model proposes technical subtasks with estimates, and the cards that block it. You review every
proposal (accept, edit or reject) before anything is saved. Blocked tasks, dependency cycles and
bottlenecks are detected with deterministic, tested logic and surfaced in real time.

> **Status:** released and live at [kanban.utitytools.com](https://kanban.utitytools.com): boards
> with drag and drop, auth (email confirmation, password reset, GitHub), Realtime collaboration,
> card dependencies with blocked badges and a bottlenecks view, and AI-proposed subtasks and
> blockers that you review before anything is saved. Try it with the one-click demo, no sign-up
> needed.

## Stack

| Area    | Tools                                                                                  |
| ------- | -------------------------------------------------------------------------------------- |
| App     | Next.js 16 (App Router, Server Actions, React Compiler) · React 19 · TypeScript strict |
| UI      | Tailwind CSS v4 · shadcn/ui · dnd-kit                                                  |
| Data    | Supabase: Postgres, Auth, Row Level Security, Realtime                                 |
| AI      | Vercel AI SDK v6 · AI Gateway · Zod-validated structured output                        |
| Quality | Vitest · Playwright · ESLint · Prettier · Husky · commitlint · GitHub Actions          |

## Roadmap

- [x] **v0.1** Board, auth, RLS, drag and drop, demo mode, deploy
- [x] **v0.2** AI task decomposition with streaming, human review and daily quotas
- [x] **v0.3** Card dependencies (cycle checks, blocked badges, bottlenecks), invites, Realtime
      and AI-proposed blockers
- [x] **v0.4** AI evals and observability (cost, latency, tokens, outcomes)
- [x] **Launch** Custom domain, email confirmation and password reset, AI live in production

## AI: privacy and limits

- **What is sent:** when you click **Suggest with AI** (subtasks), the card's title, description
  and existing subtask titles; when you click **Suggest blockers with AI**, the card's title,
  description and column, plus the titles, columns and done state of up to 100 other cards on
  the board. Nothing else. It goes through [Vercel AI Gateway](https://vercel.com/ai-gateway) to
  the model provider (Anthropic, Claude Haiku 4.5 by default). Don't put secrets or personal
  data in cards on a board where you use the AI.
- **What is stored:** nothing from the model until you accept it. Accepted subtasks and blockers
  are saved like any others. For quotas and monitoring, the app records metadata about each call
  (who, when, which feature, model, tokens, cost, duration and how it ended), never the card
  text or the response ([observability](docs/observability.md)).
- **Limits:** 20 suggestions a day per account and 3 per demo session (subtasks and blockers
  combined), plus a global daily budget. All reset at midnight UTC
  ([ADR 0016](docs/adr/0016-daily-ai-quotas-and-cost-cap.md),
  [ADR 0024](docs/adr/0024-launch-ai-cost-limits.md)).

## Getting started

Requirements: Node 24, pnpm, Docker (e.g. [OrbStack](https://orbstack.dev)).

```bash
pnpm install
pnpm db:start     # local Supabase in Docker
pnpm env:local    # writes local Supabase values into .env.local
pnpm dev          # http://localhost:3000
```

Full guide, commands, environments and known issues: [docs/setup.md](docs/setup.md).

## Documentation

| Doc                                    | What it covers                                                             |
| -------------------------------------- | -------------------------------------------------------------------------- |
| [Setup](docs/setup.md)                 | First run, commands, environments, where each variable lives, known issues |
| [Workflow](docs/workflow.md)           | Branch → PR → preview → merge, agents, enforcement layers, dependencies    |
| [Security](docs/security.md)           | Secrets inventory, rules, safeguards, leak procedure, incidents            |
| [Observability](docs/observability.md) | AI call events, usage records and ready-made SQL                           |
| [ADRs](docs/adr)                       | Architecture decisions and why they were made                              |

## How this project is built

Development is AI-assisted, with guardrails:

- **Context for agents:** [`AGENTS.md`](AGENTS.md) holds the stack, commands and conventions;
  [`CLAUDE.md`](CLAUDE.md) adds Claude Code specifics.
- **Specialised subagents** in [`.claude/agents`](.claude/agents): DB architect, frontend, AI,
  QA and a read-only code reviewer.
- **Enforced workflow:** feature branches, Conventional Commits, PRs squash-merged into `main`
  with CI green. Enforced by Claude Code hooks, git hooks and branch rules, not just by convention.
- **Decisions** are recorded as ADRs in [`docs/adr`](docs/adr), incidents as blameless
  post-mortems in [`docs/incidents`](docs/incidents).

## License

[MIT](LICENSE)
