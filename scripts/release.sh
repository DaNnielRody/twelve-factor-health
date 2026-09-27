#!/usr/bin/env bash
# RELEASE stage (Factor V): build artifact + environment config = uniquely identified release.
# Runs the release-phase check (Procfile `release:`) against that exact combination
# and refuses to tag it if config is invalid or backing services are unreachable.
#   scripts/release.sh [image] [env-file]
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE="${1:-twelve-factor-health:$(git rev-parse --short HEAD)}"
ENV_FILE="${2:-.env}"
RELEASE_ID="v$(date -u +%Y%m%d%H%M%S)-${IMAGE##*:}"
NETWORK="${RELEASE_NETWORK:-twelve-factor-health_default}"

env_args=()
[ -f "${ENV_FILE}" ] && env_args=(--env-file "${ENV_FILE}")

docker run --rm --network "${NETWORK}" "${env_args[@]}" "${IMAGE}" node bin/admin.js check
docker tag "${IMAGE}" "twelve-factor-health:${RELEASE_ID}"
# Append-only ledger: rollback = run an older tag, never edit a release in place.
echo "$(date -u +%FT%TZ) ${RELEASE_ID} image=${IMAGE} env=${ENV_FILE}" >> releases.log
echo "released twelve-factor-health:${RELEASE_ID}"
