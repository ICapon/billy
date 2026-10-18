---
description: Create a Conventional Commit from the current changes (Billy style)
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git add:*), Bash(git commit:*)
---

## Context

- Status: !`git status --short`
- Diff (staged + unstaged): !`git diff HEAD --stat`
- Recent commits: !`git log --oneline -8`

## Task

Create one commit for the changes above. Style, as in history: `type(scope): summary` in English, imperative, no trailing period,
e.g. `feat(infra): dockerize apps with Nx and split compose files`. Types: feat, fix, chore, docs, refactor, test, ci, build.
Scope = area touched (`infra`, `api`, `web`, `worker`, `db`, `ai`, `shared`, `nx`...). Body only when the "why" is not obvious.

- Stage specific files; never `git add -A` blindly and never commit `.env` or secrets.
- If the changes mix unrelated concerns, propose splitting into several commits.
- Do not push. $ARGUMENTS
