# syntax=docker/dockerfile:1
# Factor V - build stage: turns the codebase + lockfile into an immutable image.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Factor II - exact dependency tree from the lockfile, no dev deps.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
# Release identity is baked at build time and surfaced by /health.
ARG RELEASE_VERSION=dev
ENV RELEASE_VERSION=${RELEASE_VERSION}
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY bin ./bin
# Factor VI - runs as an unprivileged user and writes nothing to disk.
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health/live" >/dev/null || exit 1
# Exec form: node is PID 1 and receives SIGTERM directly (Factor IX).
CMD ["node", "src/server.js"]
