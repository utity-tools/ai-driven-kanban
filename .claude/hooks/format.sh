#!/usr/bin/env bash
# PostToolUse hook (Edit|Write): formats the file Claude just changed with Prettier.
# Never blocks: formatting problems surface later in lint and CI.

file="$(jq -r '.tool_input.file_path // ""')"
prettier="$CLAUDE_PROJECT_DIR/node_modules/.bin/prettier"

[[ -n "$file" && -f "$file" && -x "$prettier" ]] || exit 0
"$prettier" --write --ignore-unknown --log-level silent "$file" || true
exit 0
