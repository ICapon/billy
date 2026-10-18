---
name: billy-dockerize-app
description: Add or modify Docker packaging for a Billy app or service (Nx docker:build target, Dockerfile, .dockerignore, compose service, develop.watch). USE WHEN a new app/service must run in the local Docker stack, or an existing image/Dockerfile/compose entry needs changes.
---

# Dockerize an app (Billy pattern)

Reference implementations: `apps/api` and `apps/worker` (webpack bundle + pruned lockfile), `apps/web` (Next standalone).
Compare against them with `git show 56f23a6` (the commit that introduced this pattern) before inventing anything.

## Pattern

1. **Nx**: `@nx/docker` plugin infers `docker:build`. For Node bundles add the `prune`, `prune-lockfile`, `copy-workspace-modules`
   targets and `"docker:build": {"dependsOn": ["prune"]}` in the app's `package.json` `nx.targets` (copy from `apps/worker/package.json`).
   For Next, `docker:build` depends on `build`; `next.config.js` needs `output: 'standalone'` and `outputFileTracingRoot` at the repo root.
2. **Dockerfile** (in the app folder, build context = app folder): `node:24-alpine`, `NODE_ENV=production`,
   run as `USER node`, no secrets baked in. Node bundles: `COPY dist/ ./` then `pnpm install --prod --frozen-lockfile` (corepack, pnpm 10.0.0). 
3. **`.dockerignore`**: copy from a sibling app.
4. **Image name** is `apps-<name>`; in compose use `image: apps-<name>` with `pull_policy: never`.
5. **Compose** (`infra/local/compose.services.yml`): reuse `x-app-env` and `x-infra-ready`; take ports from `.env` with defaults
   (`'${X_PORT:-3000}:3000'`); add `develop.watch` (`sync+restart` of the build output into the container).
6. **Env**: add new variables to `.env.example` (host values use `localhost`) and to `x-app-env` (container-internal hosts).
7. **Watch script**: add the app's build-watch to `scripts/dev-watch.sh`.
8. **Docs**: update the tables in `infra/README.md`.

## Verify

`pnpm nx docker:build <app>` → `pnpm start:detached` → `pnpm compose:local ps` shows healthy/running →
hit the service (`curl localhost:<port>`). Then ask `billy-infra-reviewer` to review the diff.
