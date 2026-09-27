#!/usr/bin/env bash
# RUN stage, host mode. Loads .env if present (real env vars always win),
# then execs node so it receives signals directly.
#   scripts/start.sh        foreground, logs on stdout
#   scripts/start.sh -d     background; stdout routed to .run/app.log, pid in .run/app.pid
set -euo pipefail
cd "$(dirname "$0")/.."

cmd=(node --env-file-if-exists=.env src/server.js)

if [ "${1:-}" = "-d" ]; then
  mkdir -p .run
  if [ -f .run/app.pid ] && kill -0 "$(cat .run/app.pid)" 2>/dev/null; then
    echo "already running (pid $(cat .run/app.pid))"; exit 1
  fi
  nohup "${cmd[@]}" >> .run/app.log 2>&1 &
  echo $! > .run/app.pid
  echo "started pid $! - logs: tail -f .run/app.log"
else
  exec "${cmd[@]}"
fi
