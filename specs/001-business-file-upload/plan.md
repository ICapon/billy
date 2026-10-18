# Implementation Plan: Business File Upload & Ingestion

**Branch**: `001-business-file-upload` | **Date**: 2026-10-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-business-file-upload/spec.md`

## Summary

Owners upload receipts, invoices, sales reports and payroll sheets. The API stores the original in S3-compatible storage, records it in Postgres and enqueues a BullMQ job. The worker reads each file with the cheapest adequate method (digital parsing → local OCR → Claude vision), structures the content into transaction records and line items with a schema-validated LLM call, records tokens and cost per run, and indexes text chunks with embeddings (pgvector) for the later LangChain/agent/RAG workflow. The API documents itself with `@nestjs/swagger` decorators; `pnpm openapi` generates `apps/api/openapi/openapi.{json,yaml}`. The web app gets a file list with status, a review/edit screen and duplicate resolution. Analysis dashboards are out of scope; the feature ships a stable, queryable records API for them.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 24 (existing workspace)

**Primary Dependencies**: NestJS 11 (api, worker), `@nestjs/swagger` + `nestjs-zod` (OpenAPI from decorators and shared zod schemas), BullMQ + ioredis, TypeORM (Postgres, SQL migrations run with `nx run db:migrate`), `@aws-sdk/client-s3` + `@aws-sdk/lib-storage`, `@anthropic-ai/sdk`, `tesseract.js` (local OCR), `exceljs` / `papaparse` (spreadsheets), `unpdf` (PDF text layer + page rasterizing), `heic-convert` (HEIC → JPEG), `@langchain/textsplitters` (chunking), embeddings provider behind an interface (default Voyage), zod 4, Next.js 16 + HeroUI v3 (web)

**Storage**: Postgres 16 with pgvector (metadata, records, chunks, costs); SeaweedFS S3 (original files); Redis (BullMQ)

**Testing**: Jest via Nx (`@nx/jest`); pure-unit tests for strategy selection, cost and dedupe; integration tests for API + DB using the compose infra; extraction tests with a recorded-fixture LLM client (no live API calls in CI)

**Target Platform**: Linux containers (compose locally); browser UI

**Project Type**: Web application in an Nx monorepo (api + worker + web + shared libs)

**Performance Goals**: Upload of 10 typical files stored in <60 s; 95% of files reach Completed/Needs review within 2 min (SC-001, SC-002)

**Constraints**: S3-compatible SDK features only (SeaweedFS); config via env vars; `web` imports only `@org/shared`; worker image is a single webpack bundle (`dist/main.js`), so WASM/native deps must be bundled or externalized deliberately; 20 MB per file, 20 files per batch

**Scale/Scope**: Single business owner, hundreds of files per month, thousands of records; 3 new libs-worth of code in existing packages, 1 new web area

## Glossary

- **Owner / business owner**: the single fixed owner (`BUSINESS_OWNER_ID`); no login in v1.
- **Needs review** (UI) = `needs_review` (code); **Queued (limit reached)** = `queued_limit`.
- **Confirmed record**: edited or confirmed by the owner; otherwise **unconfirmed**.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                 | Status                         | Notes                                                                                                                                                                   |
| ----------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Enforced Module Boundaries             | PASS                           | `db`/`ai` used only by `api`/`worker`; `web` uses `@org/shared` only; no new tags needed. Queue names, job payloads and API DTO schemas live in `packages/shared`.      |
| II. Workspace Packages via Nx             | PASS                           | No new libs required; additions go into `@org/db`, `@org/ai`, `@org/shared`. Deps added with `pnpm add ... --filter`; tasks run through Nx.                             |
| III. Environment-Driven Configuration     | PASS                           | New vars added to `.env.example` (see research R9); no secrets in source.                                                                                               |
| IV. Local-Stack Parity & S3 Compatibility | PASS                           | Only basic S3 calls (PutObject/multipart, GetObject, DeleteObject, presign-free download via API stream). `infra/README.md` and compose env updated in the same change. |
| V. Verified Changes                       | PASS (gate for implementation) | Zod schemas in `packages/shared` get tests; `billy-verify` before commit.                                                                                               |

**Post-design re-check**: PASS. Design adds no cross-scope imports and no new tag. One watch item: the OCR/PDF dependencies in the worker bundle (Complexity Tracking).

## Project Structure

### Documentation (this feature)

```text
specs/001-business-file-upload/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── files-api.openapi.yaml
└── tasks.md             # created later by /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/src/lib/
├── files.ts               # file status enum, DTO zod schemas, limits
├── records.ts             # transaction/line-item schemas, query params
├── jobs.ts                # queue name + job payload schemas
└── *.spec.ts

packages/db/src/
├── index.ts
└── lib/
    ├── client.ts          # TypeORM DataSource (createDb) + migrations runner
    ├── entities/          # TypeORM entities: business_file, extraction_run, transaction, line_item, document_chunk, cost_entry, duplicate_candidate
    ├── repositories/      # files, records, chunks, costs
    └── migrations/        # TypeORM migrations (hand-written SQL, never synchronize)

packages/ai/src/lib/
├── extraction/
│   ├── strategy.ts        # picks tier from mime/size/quality signals
│   ├── readers/           # digital.ts (csv/xlsx/pdf-text), ocr.ts, vision.ts
│   ├── structure.ts       # LLM -> zod-validated transactions
│   └── confidence.ts
├── cost/                  # price table + cost calculator
├── embeddings/            # provider interface + voyage impl + chunking + embedQuery (vector search itself lives in packages/db)
└── llm-client.ts          # thin Anthropic wrapper (injectable for tests)

apps/api/src/app/
├── files/                 # controller (upload, list, get, download, delete, retry), service
├── records/               # list/query/update/confirm/delete, totals, duplicate resolution
├── costs/                 # cost summary + limit status
├── storage/               # S3 service
├── queue/                 # BullMQ producer
└── openapi/               # build-document.ts shared by main.ts (Swagger UI) and the generator

apps/worker/src/app/
├── extraction.processor.ts   # BullMQ consumer: read -> structure -> persist -> index
├── duplicates.service.ts
└── cost-guard.service.ts

apps/web/src/app/
├── (app)/upload/          # existing page: wire real upload with progress
├── (app)/files/           # list + status; (app)/files/[id]/ review & edit
└── components/            # upload-form (extend), files-table, record-editor, duplicate-dialog

apps/api/scripts/generate-openapi.ts   # `pnpm openapi` (Nx target api:openapi)
apps/api/openapi/                      # generated openapi.json / openapi.yaml (committed)
infra/local/ , .env.example , infra/README.md   # env vars, notes
```

**Structure Decision**: Reuse the existing Nx apps and packages. The API handles synchronous concerns (upload, CRUD, queries); the worker owns all slow/paid work; shared zod schemas are the contract between web and api. The web app talks to the API through a Next rewrite so the browser has a single origin.

## Complexity Tracking

| Violation                                                                  | Why Needed                                                  | Simpler Alternative Rejected Because                                                                                           |
| -------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Worker must bundle `tesseract.js` (WASM + language data) and PDF rendering | Local OCR is the cost-saving middle tier required by FR-010 | Vision-only for all images would cost far more per file; a separate OCR service adds a container for little gain at this scale |
