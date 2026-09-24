@AGENTS.md

## Claude Code specifics

- Start work with `/feature <name>` and finish it with `/ship`.
- Plan before coding: for anything beyond a trivial fix, propose a short plan and wait for approval.
- Delegate to the project subagents in `.claude/agents/`:
  - schema, migrations, RLS → `db-architect`
  - UI, components, drag and drop → `frontend-engineer`
  - prompts, AI schemas, streaming, evals → `ai-engineer`
  - unit and E2E tests → `qa-engineer`
  - review the diff before shipping → `code-reviewer`
- If a hook blocks a command, do not try to work around it: explain why it was blocked.
