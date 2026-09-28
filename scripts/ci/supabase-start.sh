#!/usr/bin/env bash
# Starts local Supabase in CI, retrying transient failures.
#
# Usage: scripts/ci/supabase-start.sh <supabase args…>
#   e.g. scripts/ci/supabase-start.sh db start
#        scripts/ci/supabase-start.sh start -x realtime,studio
#
# Hosted runners hit two flakes: the image registry (public.ecr.aws) throttling
# pulls ("toomanyrequests: Rate exceeded"), and a failed attempt leaving
# half-started containers that hold port 54322 ("address already in use"). So
# between attempts we stop Supabase (removing its containers, freeing the ports)
# and back off before retrying.
set -euo pipefail

max_attempts=3

for attempt in $(seq 1 "$max_attempts"); do
  if pnpm exec supabase "$@"; then
    exit 0
  fi
  if [ "$attempt" -eq "$max_attempts" ]; then
    echo "::error::supabase $* failed after $max_attempts attempts"
    exit 1
  fi
  delay=$((attempt * 10))
  echo "::warning::supabase $* failed (attempt $attempt of $max_attempts); cleaning up and retrying in ${delay}s"
  pnpm exec supabase stop --no-backup || true
  sleep "$delay"
done
