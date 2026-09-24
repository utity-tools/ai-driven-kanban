#!/usr/bin/env bash
# PreToolUse hook (Bash): enforces the branch workflow for Claude Code.
# Exit code 2 blocks the command and sends stderr back to Claude.
set -euo pipefail

input="$(cat)"
cmd="$(jq -r '.tool_input.command // ""' <<<"$input")"
cwd="$(jq -r '.cwd // "."' <<<"$input")"

# Only git commit / push commands are relevant.
grep -Eq '(^|[;&|[:space:]])git[[:space:]]+(commit|push)' <<<"$cmd" || exit 0

if grep -Eq -- '--no-verify|(^|[[:space:]])-n([[:space:]]|$)' <<<"$cmd"; then
  echo "Blocked: skipping git hooks (--no-verify) is not allowed. Fix the failing check instead." >&2
  exit 2
fi

if grep -Eq -- 'push.*(--force|-f([[:space:]]|$))' <<<"$cmd" && ! grep -q -- '--force-with-lease' <<<"$cmd"; then
  echo "Blocked: force push is not allowed. Use --force-with-lease on your own feature branch if really needed." >&2
  exit 2
fi

# Bootstrap exception: the very first commit of the repo can go on main.
git -C "$cwd" rev-parse --verify -q HEAD >/dev/null || exit 0

branch="$(git -C "$cwd" branch --show-current)"
if [[ "$branch" == "main" ]] || grep -Eq 'push[^;&|]*[[:space:]](HEAD:)?main([[:space:]]|$)' <<<"$cmd"; then
  echo "Blocked: never commit or push to main. Create a branch with /feature and open a PR with /ship." >&2
  exit 2
fi

exit 0
