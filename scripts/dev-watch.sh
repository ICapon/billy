#!/usr/bin/env bash
# Keeps running containers in sync with the source: Nx rebuilds on the host, and
# `docker compose watch` syncs the build output into the containers (see develop.watch
# in infra/local/compose.services.yml). Ctrl+C stops the watchers; containers keep running
# (use `pnpm stop` to bring them down).
set -euo pipefail
cd "$(dirname "$0")/.."

# Plain output: the Nx TUI would hide the output of the other watchers
export NX_TUI=false

pids=()
cleanup() {
  trap - EXIT INT TERM
  # Background jobs of a non-interactive shell ignore SIGINT, so send SIGTERM
  # and also reach their children (webpack, nx daemon clients, compose).
  for pid in "${pids[@]}"; do
    pkill -TERM -P "$pid" 2>/dev/null || true
    kill -TERM "$pid" 2>/dev/null || true
  done
}
trap 'cleanup; exit 130' INT TERM
trap cleanup EXIT

# api + worker: webpack in watch mode rewrites dist/main.js
pnpm nx run-many -t build -p api worker --parallel=2 -- --watch &
pids+=($!)

# web: rebuild the Next standalone output when sources change
pnpm nx watch --projects=web --includeDependentProjects -- pnpm nx run web:build &
pids+=($!)

docker compose --env-file .env \
  -f infra/local/compose.infra.yml -f infra/local/compose.services.yml \
  watch --no-up &
pids+=($!)

# `wait` (unlike a foreground command) lets the INT/TERM trap run immediately
wait
