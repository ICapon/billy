---
name: billy-local-stack
description: Start, stop, reset, inspect or debug the Billy local Docker stack (Postgres+pgvector, Redis, SeaweedFS S3, api, worker, web). USE WHEN the user asks to run the app, services are unhealthy or unreachable, ports clash, data must be reset, or code changes are not showing up in containers.
---

# Billy local stack

Source of truth: `infra/README.md`, `package.json` scripts, `infra/local/*.yml`, `scripts/dev-watch.sh`, `.env.example`.
Read them before acting; do not rely on this summary if they disagree.

## Modes

| Goal | Command |
|---|---|
| Full stack + live sync | `pnpm start` (long-running: run in background) |
| Full stack, no watch | `pnpm start:detached` |
| Only backing services (apps via `nx serve`) | `pnpm infra:up` |
| Stop (keeps data) | `pnpm stop` |
| Wipe data and restart | `pnpm reset` — destructive, confirm with the user first |

## Debug checklist

1. `pnpm compose:local ps` — which service is unhealthy? (all three infra services have healthchecks; apps `depends_on` them.)
2. `pnpm compose:local logs --tail=100 <service>` (avoid `pnpm logs`, it follows forever).
3. Ports: defaults Postgres 5442, Redis 6379, S3 9100, API 3000, Web 3001; overridden in `.env`. Check `lsof -i :<port>` for clashes.
4. `.env` missing → `pnpm env:init` (copies `.env.example`).
5. Stale image / "code not updating": images are built by Nx (`pnpm nx docker:build <project>`, tags `apps-<name>`).
   Compose never pulls them (`pull_policy: never`), so rebuild after Dockerfile or dependency changes.
   Source changes are synced by `develop.watch`: the host must be rebuilding (`scripts/dev-watch.sh`).
6. Web calls the API through `API_URL=http://api:3000` inside containers; from the host use `http://localhost:${API_PORT}`.

## Rules

- Never run `pnpm reset`, `docker compose down -v` or `docker volume rm` without explicit user approval (they delete Postgres/S3 data).
- Never print `.env` values; `ANTHROPIC_API_KEY` is a secret.
- If you change compose files, scripts or ports, update `infra/README.md` in the same change.
