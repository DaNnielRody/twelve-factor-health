#!/usr/bin/env bash
# Graceful stop for a process started with scripts/start.sh -d.
# Sends SIGTERM (Factor IX) and waits for the process to drain and exit.
set -euo pipefail
cd "$(dirname "$0")/.."

PID_FILE=.run/app.pid
[ -f "${PID_FILE}" ] || { echo "not running (no ${PID_FILE})"; exit 0; }
PID="$(cat "${PID_FILE}")"

if kill -0 "${PID}" 2>/dev/null; then
  kill -TERM "${PID}"
  for _ in $(seq 1 150); do kill -0 "${PID}" 2>/dev/null || break; sleep 0.1; done
  if kill -0 "${PID}" 2>/dev/null; then
    echo "pid ${PID} still alive after 15s, sending SIGKILL"; kill -KILL "${PID}"
  else
    echo "pid ${PID} stopped gracefully"
  fi
fi
rm -f "${PID_FILE}"
