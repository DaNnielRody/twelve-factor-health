#!/usr/bin/env bash
# Demonstrates graceful shutdown (Factor IX):
#   1. start the service on a free port
#   2. fire a 3 s request that is still in flight
#   3. send SIGTERM while it runs
#   4. show that /health flips to 503, the in-flight request still completes (200),
#      and the process exits 0 with a "shutdown complete" log line.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-3999}"
LOG="$(mktemp)"
PORT="${PORT}" LOG_LEVEL=info node src/server.js > "${LOG}" 2>&1 &
PID=$!
until curl -fs "http://127.0.0.1:${PORT}/health/live" >/dev/null; do sleep 0.1; done
echo "== service up, pid ${PID}"

curl -s -o /tmp/tfh-inflight.json -w "in-flight request -> HTTP %{http_code}\n" \
  "http://127.0.0.1:${PORT}/api/work?ms=3000" &
CURL=$!
sleep 0.5

echo "== kill -TERM ${PID}"
kill -TERM "${PID}"
sleep 0.2
if code="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/health")"; then
  echo "new request during drain -> HTTP ${code}"
else
  echo "new request during drain -> connection refused (listener already closed)"
fi

wait "${CURL}"
echo "in-flight body: $(cat /tmp/tfh-inflight.json)"
set +e; wait "${PID}"; CODE=$?; set -e
echo "== process exit code: ${CODE}"
echo "== service logs (stdout):"
cat "${LOG}"
rm -f "${LOG}" /tmp/tfh-inflight.json
