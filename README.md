# AI-Driven Kanban

[![CI](https://github.com/utity-tools/ai-driven-kanban/actions/workflows/ci.yml/badge.svg)](https://github.com/utity-tools/ai-driven-kanban/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A Kanban board where AI works like a teammate under human supervision: when you create a task,
a language model proposes technical subtasks, estimates and dependencies. You review every
proposal (accept, edit or reject) before anything is saved. Blocked tasks, dependency cycles and
bottlenecks are detected with deterministic, tested logic and surfaced in real time.

> **Status:** v0.1 is live: boards, auth, RLS, drag and drop and a one-click demo. Next up: v0.2
> (AI task decomposition).
> Live: [ai-driven-kanban.vercel.app](https://ai-driven-kanban.vercel.app) (try the demo, no sign-up needed)

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
- [ ] **v0.2** AI task decomposition with streaming and human review
- [ ] **v0.3** Dependency graph, deterministic alerts, Realtime
- [ ] **v0.4** AI evals and observability panel (cost, latency, acceptance rate)

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

| Doc                          | What it covers                                                             |
| ---------------------------- | -------------------------------------------------------------------------- |
| [Setup](docs/setup.md)       | First run, commands, environments, where each variable lives, known issues |
| [Workflow](docs/workflow.md) | Branch → PR → preview → merge, agents, enforcement layers, dependencies    |
| [Security](docs/security.md) | Secrets inventory, rules, safeguards, leak procedure, incidents            |
| [ADRs](docs/adr)             | Architecture decisions and why they were made                              |

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
