# Implementation Plan: Document Chat

**Branch**: `004-document-chat` | **Date**: 2026-10-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-document-chat/spec.md`

## Summary

Add a chat panel to the home screen (`/dashboard`, the redirect target of `/`) where the owner asks natural-language questions about already analyzed documents. The API runs a bounded tool-use loop with Claude: the model never sees raw files, only the results of **read-only, owner-scoped tools** that wrap existing repositories (semantic chunk search, document/record listings, totals, document details). The final answer is returned through a structured `final_answer` tool carrying the text and the ids of the files it used; the server validates those ids against what the tools actually returned in that turn and turns them into source links. Conversations and messages are persisted per owner so follow-ups, history, reopen and delete work. v1 is request/response (no token streaming).

## Technical Context

**Language/Version**: TypeScript (strict) on Node, Nx + pnpm monorepo

**Primary Dependencies**: NestJS 11 + `nestjs-zod` (api), `@anthropic-ai/sdk` (already in `@org/ai`), Voyage embeddings via the existing `EmbeddingProvider`, TypeORM (`@org/db`), Next.js 16 / React 19 / HeroUI v3 / Tailwind 4 (web), zod schemas in `@org/shared`

**Storage**: Postgres (new `chat_conversations` and `chat_messages` tables; reads `document_chunks`, `extracted_documents`, `transactions`, `business_files`)

**Testing**: Jest (`@org/ai` with a scripted fake LLM, `@org/db` and `apps/api` integration specs using the existing `createTestApp` helper, `apps/web/specs` component specs)

**Target Platform**: Web (desktop and mobile layouts), API behind the existing `/backend/*` Next proxy

**Project Type**: Web application (Nx monorepo: api + web + shared libs)

**Performance Goals**: 90% of answers within 10 s (SC-004); each turn capped at 6 tool iterations and `CHAT_TURN_TIMEOUT_MS` (default 45 s)

**Constraints**: Read-only access; owner-scoped queries only; cost tracked in `cost_entries`; reply language follows the user; no new infrastructure services

**Scale/Scope**: Single business owner (`BUSINESS_OWNER_ID`), dozens to low thousands of documents; ~7 endpoints, 2 tables, 1 new web section

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How the plan complies |
|-----------|--------|-----------------------|
| I. Enforced Module Boundaries | PASS | Agent loop and prompts live in `@org/ai` (depends only on `shared`); the tool handlers that touch the database are defined in `apps/api` and injected into the loop. Web imports only `@org/shared` schemas. No `db`/`ai` import from `web`. |
| II. Workspace Packages via Nx | PASS | No new package; code goes into existing `ai`, `db`, `shared`, `api`, `web`. Tasks run through `pnpm nx`. |
| III. Environment-Driven Configuration | PASS | New settings (`CHAT_MODEL`, `CHAT_MAX_MESSAGE_CHARS`, `CHAT_RATE_LIMIT_PER_MINUTE`, `CHAT_CONTEXT_MESSAGES`, `CHAT_TURN_TIMEOUT_MS`) added to `envSchema`, `AppConfig` and `.env.example`. |
| IV. Local-Stack Parity | PASS | No compose, port or script change. Uses existing Postgres/pgvector. `infra/README.md` gets a short note on the new env vars only. |
| V. Verified Changes | PASS (gate) | Tests planned at every layer (see Testing); `billy-verify` before commit. Shared chat schemas get their own spec. |

**Post-design re-check**: still PASS. The only deliberate deviation from "new package" is keeping tool handlers in `apps/api`; this is what keeps boundary I intact.

## Project Structure

### Documentation (this feature)

```text
specs/004-document-chat/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── chat-api.md
└── tasks.md             # created by /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/src/lib/
└── chat.ts                      # zod: conversation, message, source ref, request/response, limits (+ chat.spec.ts)

packages/db/src/lib/
├── entities/chat-conversation.entity.ts
├── entities/chat-message.entity.ts
├── migrations/1762000000000-document-chat.ts
└── repositories/chat.ts         # owner-scoped CRUD, recent-messages, rate-limit count (+ chat.spec.ts)

packages/ai/src/lib/
├── llm-client.ts                # + converse() on the LlmClient seam (tool-use turn)
├── metered-llm-client.ts        # meter converse() too
├── testing/fake-llm-client.ts   # scripted converse() responses
└── chat/
    ├── answer-question.ts       # bounded tool loop, final_answer handling, source validation
    ├── system-prompt.ts         # grounding, read-only, language, injection rules
    └── answer-question.spec.ts

apps/api/src/app/chat/
├── chat.module.ts
├── chat.controller.ts
├── chat.service.ts              # conversation lifecycle, rate limit, context window, cost entries
├── chat-tools.ts                # tool definitions + handlers over RepositoriesService
└── chat.spec.ts                 # integration (scripted LLM)

apps/web/src/app/
├── (app)/dashboard/page.tsx     # mounts the chat section at the top
├── components/chat/
│   ├── chat-section.tsx         # panel: messages, input, suggestions, empty/error states
│   ├── conversation-list.tsx    # history, reopen, delete, new conversation
│   └── source-chips.tsx         # source documents -> file detail
└── lib/chat-api.ts
apps/web/specs/chat.spec.tsx
```

**Structure Decision**: Extend the existing layered layout (shared schemas → db repository → ai logic → api module → web component) instead of creating a package. The tool handlers sit in `apps/api` because they need `@org/db`, which `@org/ai` may not import; `@org/ai` receives them as plain functions.

## Complexity Tracking

No constitution violations to justify.
