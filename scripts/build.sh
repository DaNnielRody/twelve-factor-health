#!/usr/bin/env bash
# BUILD stage (Factor V): codebase at a commit -> immutable image tagged with that commit.
set -euo pipefail
cd "$(dirname "$0")/.."

SHA="$(git rev-parse --short HEAD 2>/dev/null || echo nogit)"
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then SHA="${SHA}-dirty"; fi
IMAGE="twelve-factor-health:${SHA}"

npm ci --ignore-scripts
npm test
docker build --build-arg RELEASE_VERSION="${SHA}" -t "${IMAGE}" .
echo "built ${IMAGE}"
