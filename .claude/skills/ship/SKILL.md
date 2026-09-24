---
name: ship
description: Validate the current branch, review it, commit with Conventional Commits, push and open a PR.
disable-model-invocation: true
---

Ship the current branch.

1. Check the branch with `git branch --show-current`. If it is `main`, stop: work must be on a branch.
2. Run `pnpm lint`, `pnpm typecheck` and `pnpm test`. If anything fails, fix it (or stop and explain
   if the fix is not obvious). Never skip checks or use `--no-verify`.
3. If the change touches user flows, run `pnpm test:e2e` too.
4. Launch the `code-reviewer` subagent on the diff. Fix every blocker; list the rest for the PR.
5. Commit the pending changes as one or more atomic Conventional Commits.
6. Push: `git push -u origin HEAD`.
7. Open the PR with `gh pr create`, filling `.github/pull_request_template.md`:
   - title as a Conventional Commit (it becomes the squash commit on main),
   - what changed and why, how it was tested, screenshots if the UI changed,
   - remaining non-blocking review notes.
8. Return the PR link. Do not merge: the human merges after CI and the preview look good.
