---
name: feature
description: Start a new piece of work - sync main, create a branch and propose a plan before writing code.
argument-hint: <short-description>
disable-model-invocation: true
---

Start new work for: $ARGUMENTS

1. Run `git status`. If there are uncommitted changes, stop and ask what to do with them.
2. Update main: `git switch main && git pull --ff-only` (skip the pull if there is no remote yet).
3. Pick the branch type from the description (`feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `ci`)
   and create the branch: `git switch -c <type>/<kebab-case-name>`.
4. Explore the relevant code and write a short plan:
   - goal and acceptance criteria,
   - files to create or change,
   - which subagents will handle which parts,
   - tests that will prove it works,
   - whether it needs a migration or an ADR.
5. Stop and wait for approval of the plan before writing any code.
