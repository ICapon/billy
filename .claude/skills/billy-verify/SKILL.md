---
name: billy-verify
description: Run the Billy quality gate (format, lint, test, typecheck, build) on affected projects and report results. USE WHEN finishing a change, before committing or opening a PR, or when the user says verify/check/validate.
---

# Verify changes

Run through Nx (never call jest/eslint/tsc directly). Prefer `affected`; use `run-many` only if asked for everything.

```
pnpm nx format:check --base=main
pnpm nx affected -t lint test typecheck build --base=main
```

- If `format:check` fails, fix with `pnpm nx format:write` and re-run.
- Staged-but-uncommitted work counts: `--base=main` compares against the working tree.
- On failure: show the failing task and the relevant output lines, find the root cause, fix, re-run only that task
  (`pnpm nx <target> <project>`). Do not disable rules or skip tests to get green.
- Module-boundary lint errors (`@nx/enforce-module-boundaries`) mean the architecture rule is being violated:
  fix the import, don't loosen `eslint.config.mjs` unless the user agrees. Consider `billy-boundary-reviewer`.
- If Docker/compose files changed, also run `billy-infra-reviewer`.
- If the worktree has env/compose changes, remember `docker compose config` validates compose syntax:
  `pnpm compose:local config -q`.

Report: what ran, what passed, what failed or was skipped (be explicit about anything not run, e.g. e2e or Docker builds).

Note: `.github/workflows/ci.yml` still uses `npm ci`/`npx` from the Nx scaffold while the repo uses pnpm; flag it if CI is in scope.
