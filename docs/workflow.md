# Development workflow

Every change reaches `main` through a short-lived branch and a pull request with green CI.
The rules are not only written down: each layer below enforces them.

## Day to day

1. **Start:** in Claude Code, `/feature <what you want to build>`. Claude syncs `main`, creates
   `feat/…` (or `fix/…`, `chore/…`, `docs/…`, `test/…`, `refactor/…`, `ci/…`) and proposes a plan.
   Nothing is coded until you approve the plan.
2. **Build:** Claude delegates to the project subagents (`.claude/agents/`):

   | Agent               | Owns                                                        |
   | ------------------- | ----------------------------------------------------------- |
   | `db-architect`      | migrations, RLS policies, indexes, seed                     |
   | `frontend-engineer` | pages, components, drag and drop, Server Actions wiring     |
   | `ai-engineer`       | prompts, Zod output schemas, streaming, model config, evals |
   | `qa-engineer`       | Vitest and Playwright tests                                 |
   | `code-reviewer`     | read-only review of the diff before shipping                |

3. **Ship:** `/ship`. Runs lint, typecheck and tests, asks `code-reviewer` for a review, fixes
   blockers, commits with Conventional Commits, pushes and opens the PR from the template.
4. **Check:** GitHub runs CI, Vercel builds a preview of the PR and comments its URL, and if the PR
   has migrations, `db-migrations.yml` applies them to staging.
5. **Merge:** you review the preview and click **Squash and merge**. The PR title becomes the
   commit on `main`. The branch is deleted and Vercel deploys to production.
6. **Sync locally:**
   ```bash
   git switch main && git pull && git branch -d <branch>
   ```

Without Claude Code the flow is the same by hand: branch, commit (hooks run), push, `gh pr create`.

## Conventions

- **Branches:** `<type>/<kebab-case>`, e.g. `feat/board-drag-and-drop`.
- **Commits and PR titles:** [Conventional Commits](https://www.conventionalcommits.org),
  `type(scope): subject`, header up to 100 characters. Types: `feat`, `fix`, `chore`, `docs`,
  `test`, `refactor`, `ci`, `perf`, `build`, `style`, `revert`.
- **Commits are atomic:** one logical change each. PRs are squash-merged, so the PR title is what
  stays in `main`.
- **Decisions:** anything significant gets an ADR in `docs/adr/` (copy `0000-template.md`).

## Enforcement layers

| Layer                   | Where                                       | What it enforces                                                                                                                                     | Applies to                 |
| ----------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Agent instructions      | `AGENTS.md`, `CLAUDE.md`, `.claude/agents/` | stack, conventions, workflow                                                                                                                         | AI agents (guidance)       |
| Claude Code hooks       | `.claude/settings.json`, `.claude/hooks/`   | blocks commit/push on `main`, `--no-verify` and force push; formats every edited file                                                                | Claude Code                |
| Claude Code permissions | `.claude/settings.json`                     | cannot read `.env` files, run `supabase db push` or deploy to production                                                                             | Claude Code                |
| Git hooks (Husky)       | `.husky/`                                   | `pre-commit`: no commits on `main`, lint + format + related tests. `commit-msg`: commitlint. `pre-push`: no pushes to `main`, typecheck + unit tests | everyone                   |
| CI                      | `.github/workflows/ci.yml`, `pr-title.yml`  | format, lint, typecheck, unit tests, build, E2E, PR title                                                                                            | every PR                   |
| Branch rules            | ruleset "Protect main"                      | PR required, 3 checks green, branch up to date, conversations resolved, squash only, no force push or deletion                                       | everyone, including admins |

## Dependencies

Dependabot opens PRs weekly (npm, minor and patch updates grouped) and monthly (GitHub
Actions). They go through the same CI and are merged like any other PR.

- Major updates arrive one by one: review the changelog before merging.
- `@types/node` majors are ignored on purpose: they must match the Node runtime in `.nvmrc`.
- If a Dependabot PR is out of date, comment `@dependabot rebase`.
