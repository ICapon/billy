---
name: billy-add-lib
description: Create a new internal library under packages/ in the Billy monorepo with the right Nx scope tag, module-boundary rule and workspace linking. USE WHEN the user wants a new shared package/lib (e.g. queue, storage, auth, billing) or to move code out of an app into a lib.
---

# Add a library to Billy

Follow the existing libs (`packages/shared`, `db`, `ai`). Invoke the `nx-generate` skill first for the generator,
then apply the Billy-specific steps below.

## Steps

1. **Pick the scope** (tag `scope:<name>`) and decide who may depend on it. Existing graph:
   `api`/`worker` → shared, db, ai · `web` → shared · `ai`/`db` → shared · `shared` → shared.
2. **Generate** with `@nx/js:lib` (see `nx-generate`; check `--help` for flags, never guess):
   directory `packages/<name>`, name `<name>`, import path `@org/<name>`, linter eslint, unit test runner jest, bundler none (source-consumed, like `@org/ai`).
3. **Match the existing shape** of `packages/ai/package.json`: `"type": "module"`, `main`/`types`/`exports` → `./src/index.ts`,
   `nx.name` = `<name>`, `nx.tags` = `["scope:<name>"]`.
4. **Boundaries**: add a `depConstraints` entry for the new `sourceTag` in `eslint.config.mjs`, and add the new tag to
   `onlyDependOnLibsWithTags` of every app/lib allowed to import it. Keep `web` restricted to `scope:shared`.
5. **Link consumers** with the package manager, not tsconfig paths (see `link-workspace-packages` skill):
   `pnpm add @org/<name> --workspace --filter @org/<consumer>`.
6. **Update docs**: the layout table in `CLAUDE.md` and the lib's README.
7. **Verify** with the `billy-verify` skill (`lint test typecheck build` on the new lib and its dependents).

## Don'ts

- No `project.json`; config goes in `package.json` under `nx`.
- No circular deps; no importing apps from libs.
- Do not put secrets or env access in `shared`; it is bundled into `web`.
