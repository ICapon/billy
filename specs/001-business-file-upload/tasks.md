---
description: 'Task list for Business File Upload & Ingestion'
---

# Tasks: Business File Upload & Ingestion

**Input**: Design documents from `/specs/001-business-file-upload/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/files-api.openapi.yaml, quickstart.md

**Tests**: Included. The Billy constitution (Principle V) requires tests proportionate to risk and requires tests for every schema in `packages/shared`. LLM calls are always mocked with recorded fixtures; no live API calls in CI.

**Organization**: Tasks are grouped by user story so each can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story the task belongs to (US1–US5)
- Paths are relative to the repo root. Add dependencies with `pnpm add <pkg> --filter @org/<project>`; run tasks with `pnpm nx <target> <project>`.

## Path Conventions

Nx monorepo (see plan.md): `apps/api`, `apps/worker`, `apps/web`, `packages/shared`, `packages/db`, `packages/ai`, `infra/local`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and configuration needed by every story

- [x] T001 Add env vars to `.env.example` per research R9: `MAX_FILE_SIZE_MB=20`, `MAX_FILES_PER_BATCH=20`, `EXTRACTION_MODEL=claude-haiku-5-5`, `VISION_MODEL=claude-sonnet-5-5`, `OCR_MIN_CONFIDENCE=0.70`, `RECORD_MIN_CONFIDENCE=0.80`, `PROCESSING_COST_LIMIT_USD=`, `EMBEDDING_PROVIDER=voyage`, `EMBEDDING_MODEL=`, `EMBEDDING_DIMENSIONS=1024`, `VOYAGE_API_KEY=`, `BUSINESS_OWNER_ID=default`, `BUSINESS_WEEK_START=monday`, `BUSINESS_CURRENCY=USD` (ISO code used when a document shows no currency); pass the same vars to `api` and `worker` in `infra/local/compose.services.yml` (compose uses container-internal hosts)
- [x] T002 [P] Add dependencies to `packages/db/package.json` (`typeorm`, `reflect-metadata`, `pg`, dev: `@types/pg`) and add Nx targets `migrate`, `migrate-revert` and `migration-create` under the `nx` key (no `project.json`); models are managed with TypeORM
- [x] T003 [P] Add dependencies to `packages/ai/package.json` (`@anthropic-ai/sdk`, `tesseract.js`, `exceljs`, `papaparse`, `unpdf`, `@langchain/textsplitters`, `heic-convert`)
- [x] T004 [P] Add dependencies to `apps/api/package.json` (`@nestjs/platform-express` multer types, `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`, `bullmq`, `ioredis`, `@nestjs/swagger`, `nestjs-zod`) and wire workspace deps with `pnpm add @org/shared @org/db @org/ai --workspace --filter @org/api`
- [x] T005 [P] Add dependencies to `apps/worker/package.json` (`bullmq`, `ioredis`, `@aws-sdk/client-s3`) and wire `@org/shared @org/db @org/ai` with `--workspace`; externalize `tesseract.js` and `unpdf` in the worker webpack config and make `apps/worker/Dockerfile` install them in the image (research R12) _(Done differently: the default webpack externals only see the root `node_modules`, which misses pnpm's per-app packages, so `apps/api` and `apps/worker` webpack configs externalize every bare import and bundle only `@org/*` sources; the image installs the rest from the generated package.json.)_
- [x] T006 [P] Add a Next.js rewrite in `apps/web/next.config.js` proxying `/backend/:path*` to `${API_URL}/api/:path*` (`API_URL` is already set to `http://api:3000` in compose) and confirm `@org/shared` is the only workspace import in `apps/web`. Uploads are up to "20 MB per file", so check the Next.js 16 documentation for the maximum proxied request body size (it defaults to roughly 10 MB) and raise it above `MAX_FILE_SIZE_MB`; if it cannot be raised for rewrites, instead let the browser call the API directly via `NEXT_PUBLIC_API_URL` and enable CORS for the web origin in `apps/api/src/main.ts`. Verify with a 20 MB file _(Done differently: `apps/web/src/app/backend/[...path]/route.ts` is a streaming route handler instead of a rewrite, so `API_URL` is read at runtime and the proxy body-size limit does not apply.)_

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared schemas, database, storage and queue plumbing that ALL stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 [P] Create zod schemas in `packages/shared/src/lib/files.ts`: `fileStatusSchema` enum (`received`, `queued_limit`, `processing`, `completed`, `needs_review`, `failed`), `readingMethodSchema` (`digital`, `ocr`, `vision`), `businessFileSchema`, `uploadResultSchema` (`outcome`: `accepted|rejected|duplicate`), allowed MIME list and limit constants; export from `packages/shared/src/index.ts`. DTO classes for Swagger are derived from these schemas in the api with `createZodDto` from `nestjs-zod` (no duplicated type definitions)
- [x] T008 [P] Create zod schemas in `packages/shared/src/lib/records.ts`: `transactionSchema` (`amountMinor` non-negative integer, `occurredOn` ISO date, `currency` 3-letter ISO code, `kind` enum `expense|income`, `category` text with `staff` among allowed values), `lineItemSchema` (`direction` enum `purchase|sale`, `quantity` numeric(12,3)), `extractedDocumentSchema` (LLM output contract with per-field confidence 0–1), `transactionUpdateSchema`, `recordsQuerySchema` (`from`, `to`, `kind`, `category`, `groupBy=week|month`); export from index. Define the canonical category list as an exported const `transactionCategories` (`supplies`, `inventory`, `rent`, `utilities`, `staff`, `transport`, `marketing`, `taxes`, `equipment`, `sales`, `services`, `other`) used by the LLM prompt, validation and the editor dropdown; add an optional `product` filter (case-insensitive match on line item product name) to `recordsQuerySchema`; `extractedDocumentSchema` holds a `transactions[]` array so one file can yield several records
- [x] T009 [P] Create `packages/shared/src/lib/jobs.ts`: queue name constant `file-extraction` and `jobPayloadSchema` (`{ fileId: uuid }`); export from index
- [x] T010 [P] Add tests for the schemas in `packages/shared/src/lib/files.spec.ts`, `records.spec.ts`, `jobs.spec.ts` (valid/invalid cases: negative amounts, bad dates, unknown status, oversize name)
- [x] T011 Create the TypeORM client in `packages/db/src/lib/client.ts` (`createDataSource()` and async `createDb()` returning `{ db, close }`, URL from `DATABASE_URL`, `synchronize: false`, `uuidExtension: 'pgcrypto'`), the migrations runner `packages/db/src/lib/migrate.ts` and `packages/db/scripts/migrate.cjs`, and export from `packages/db/src/index.ts`
- [x] T012 Define TypeORM entities in `packages/db/src/lib/entities/` (`*.entity.ts`, explicit column types, bigint/numeric transformers) exactly per data-model.md: `business-files.ts` (`status` enum `received|queued_limit|processing|completed|needs_review|failed`, `sha256 char(64)`, `size_bytes bigint`, `duplicate_of uuid null fk`), `extraction-runs.ts`, `transactions.ts` (`amount_minor bigint` positive, `currency char(3)`, `confidence numeric(3,2)`, `confirmed boolean default false`, `excluded_reason enum null`), `line-items.ts` (`quantity numeric(12,3)`, `direction enum(purchase|sale)`, `product_key` lowercase), `duplicate-candidates.ts`, `document-chunks.ts` (`embedding vector(1024)` + HNSW cosine index), `cost-entries.ts`; every table has `owner_id text not null`, `created_at`, `updated_at`; add indexes `(owner_id, occurred_on)`, `(owner_id, kind, occurred_on)`, `(file_id)`; cascade deletes from `business_files`
- [x] T013 Write the initial TypeORM migration `packages/db/src/lib/migrations/1760000000000-initial-schema.ts` (starts with `CREATE EXTENSION IF NOT EXISTS vector`, includes the HNSW cosine index TypeORM cannot declare) and verify `pnpm nx run db:migrate` applies cleanly on the local Postgres (`pnpm infra:up`)
- [x] T014 [P] Implement repositories in `packages/db/src/lib/repositories/` (`files.ts`, `records.ts`, `chunks.ts`, `costs.ts`); every query MUST filter by `owner_id` (research R10); add integration tests in `packages/db/src/lib/repositories/*.spec.ts` against the compose Postgres
- [x] T015 [P] Implement `StorageService` in `apps/api/src/app/storage/storage.service.ts` using only S3-compatible calls (multipart `Upload` from `@aws-sdk/lib-storage`, `GetObject`, `DeleteObject`) with `forcePathStyle` for SeaweedFS and key format `owner/yyyy/mm/<id>-<name>`; ensure the `S3_BUCKET` exists on startup
- [x] T016 [P] Create the BullMQ producer in `apps/api/src/app/queue/queue.module.ts` + `queue.service.ts` (queue `file-extraction`, job id = file id, 3 attempts, exponential backoff) using `REDIS_URL`
- [x] T017 [P] Create an owner/config provider in `apps/api/src/app/config/owner.provider.ts` returning `BUSINESS_OWNER_ID` and validated limits from env; mirror it in `apps/worker/src/app/config/owner.provider.ts`. Also expose `BUSINESS_CURRENCY` and `BUSINESS_WEEK_START`
- [x] T018 [P] Bootstrap Swagger in `apps/api/src/main.ts`: build the document with `DocumentBuilder` + `SwaggerModule.createDocument` (title "Billy API", version from `package.json`, tags `files`, `records`, `duplicates`, `costs`) and serve the UI at `/api/docs` only when `NODE_ENV !== 'production'`; extract the document-building code into `apps/api/src/openapi/build-document.ts` so the app and the generator share it
- [x] T019 Create the generator `apps/api/scripts/generate-openapi.ts`: `NestFactory.create(AppModule, { preview: true, logger: false })` (builds the module graph without connecting to Postgres, Redis or S3), call `buildDocument()` from T018, and write `apps/api/openapi/openapi.json` and `apps/api/openapi/openapi.yaml` (stable key order, no timestamps so diffs stay clean); add the Nx targets `openapi:generate` (runs the script via `@swc-node/register`) and `openapi:check` (regenerates to a temp path and fails if it differs from the committed files) under the `nx` key of `apps/api/package.json`, and add the root script `"openapi": "nx run api:openapi:generate"` to `package.json` _(Done: targets are `openapi` and `openapi-check`: `pnpm openapi`, `pnpm nx run api:openapi-check`.)_
- [x] T020 Create the BullMQ consumer skeleton in `apps/worker/src/app/extraction.processor.ts` (parses `jobPayloadSchema`, loads the file, logs the job and leaves the status as `received`; it MUST NOT set `processing` until the real pipeline in T042 exists, so MVP files are not stuck in "Processing") and register it in `apps/worker/src/app/app.module.ts`
- [x] T021 [P] Create the LLM client wrapper in `packages/ai/src/lib/llm-client.ts` (injectable interface `LlmClient` with a real Anthropic implementation and a fixture-backed fake in `packages/ai/src/lib/testing/fake-llm-client.ts`)
- [x] T022 [P] Create the price table and calculator in `packages/ai/src/lib/cost/pricing.ts` + `calculate-cost.ts` (cost in micro-USD from input/output tokens per model) with tests in `packages/ai/src/lib/cost/calculate-cost.spec.ts`

**Checkpoint**: Foundation ready — user story work can begin

---

## Phase 3: User Story 1 - Upload business documents (Priority: P1) 🎯 MVP

**Goal**: Owner uploads files, sees them listed with status, can download and delete them.

**Independent Test**: Upload a mix of valid, invalid and duplicate files; each valid one appears in the list with status `received`, survives reload, downloads intact, and can be deleted (quickstart scenarios 1, 2, 8 — file part).

### Tests for User Story 1

- [x] T023 [P] [US1] Unit tests for upload validation (MIME allow-list, "20 MB per file", "20 files per batch", partial success) in `apps/api/src/app/files/upload-validation.spec.ts`
- [x] T024 [P] [US1] Integration test for `POST /api/files`, `GET /api/files`, `GET /api/files/{id}/download`, `DELETE /api/files/{id}` incl. duplicate `onDuplicate=skip|keep` in `apps/api/src/app/files/files.controller.spec.ts`

### Implementation for User Story 1

- [x] T025 [US1] Implement upload validation helper in `apps/api/src/app/files/upload-validation.ts` (limits from env, per-file rejection reasons)
- [x] T026 [US1] Implement `FilesService` in `apps/api/src/app/files/files.service.ts`: stream to S3 while computing SHA-256, detect duplicates per owner (`sha256`), honor `onDuplicate` (`skip` returns `outcome: duplicate` with `existingFileId`; `keep` stores and sets `duplicate_of`), insert `business_files` row with status `received`, enqueue the job (depends on T012, T014, T015, T016)
- [x] T027 [US1] Implement `FilesController` in `apps/api/src/app/files/files.controller.ts` per contracts/files-api.openapi.yaml: `POST /api/files` (multipart, returns 207 with per-file results), `GET /api/files` (status/date filters, cursor), `GET /api/files/{id}`, `GET /api/files/{id}/download` (stream from S3, no public URLs), `DELETE /api/files/{id}` (removes object, row and cascades; 204) and register `FilesModule` in `apps/api/src/app/app.module.ts`. Annotate with `@ApiTags('files')`, `@ApiOperation`, `@ApiConsumes('multipart/form-data')`, `@ApiBody`, `@ApiResponse` (207, 204, 404) and `@ApiParam`/`@ApiQuery`, matching contracts/files-api.openapi.yaml
- [x] T028 [P] [US1] Add typed API client helpers in `apps/web/src/app/lib/files-api.ts` using `@org/shared` schemas and the `/backend` rewrite
- [x] T029 [US1] Extend `apps/web/src/app/components/upload-form.tsx` and `apps/web/src/app/(app)/upload/page.tsx` for real uploads: multi-file select/drop, per-file progress, per-file rejection reasons, duplicate prompt (skip / keep both). Use `XMLHttpRequest` (or one request per file) because `fetch` cannot report upload progress; on a network failure mark only the affected files as failed with a "Retry upload" action and keep the others
- [x] T030 [P] [US1] Create `apps/web/src/app/(app)/files/page.tsx` and `apps/web/src/app/components/files-table.tsx`: list with name, size, date, status chip (including "Queued (limit reached)"), download and delete-with-confirmation; add a "Files" entry to `apps/web/src/app/components/sidebar.tsx`

**Checkpoint**: US1 delivers a working document vault (MVP)

---

## Phase 4: User Story 2 - Automatic data extraction (Priority: P1)

**Goal**: Worker reads each file with the cheapest adequate method, produces validated records, indexes content, records cost, and sets status.

**Independent Test**: Process a CSV, a text-layer PDF, a clear receipt photo and a blurry photo; each yields records linked to its file with the expected tier (`digital`, `digital`, `ocr`, `vision`), status `completed` or `needs_review`, and failures show a reason and can be retried (quickstart scenario 3).

### Tests for User Story 2

- [x] T031 [P] [US2] Unit tests for tier selection and escalation (MIME/size/text-layer/OCR confidence thresholds `OCR_MIN_CONFIDENCE`, `RECORD_MIN_CONFIDENCE`) in `packages/ai/src/lib/extraction/strategy.spec.ts`. Cover HEIC input being normalized to JPEG before OCR/vision
- [x] T032 [P] [US2] Unit tests for structuring with recorded LLM fixtures (valid output, invalid output → one retry with validation error → escalate) in `packages/ai/src/lib/extraction/structure.spec.ts` using the fake client from T021. Cover a multi-receipt document yielding several records, a missing currency falling back to `BUSINESS_CURRENCY`, and an ambiguous day/month date lowering confidence so the file goes to `needs_review`
- [x] T033 [P] [US2] Unit tests for reconciliation and status rule (all records ≥ 0.80 and "line items sum ≈ document total within 1%" → completed, else needs_review) in `packages/ai/src/lib/extraction/confidence.spec.ts`
- [x] T034 [P] [US2] Unit tests for chunking and embedding batching with a fake `EmbeddingProvider` in `packages/ai/src/lib/embeddings/chunk.spec.ts`
- [x] T035 [US2] Integration test for the worker pipeline (fake LLM, real Postgres/S3 via compose) covering success, low confidence, failure and retry in `apps/worker/src/app/extraction.processor.spec.ts`. Also cover: a re-run (retry) of a `needs_review` file keeps already confirmed records and does not duplicate them; corrupted, password-protected and empty files end as `failed` with a reason; and a fixture set of known documents with expected values asserts at least 90% of amounts and dates match (SC-003)

### Implementation for User Story 2

- [x] T036 [P] [US2] Implement the digital reader in `packages/ai/src/lib/extraction/readers/digital.ts` (CSV via `papaparse`, XLSX via `exceljs`, PDF text layer via `unpdf`, plain text) returning text and a "usable text" signal. Detect corrupted, password-protected and empty files and throw a typed error with a user-readable reason (the processor stores it as `failure_reason`)
- [x] T037 [P] [US2] Implement the OCR reader in `packages/ai/src/lib/extraction/readers/ocr.ts` (`tesseract.js`, languages `spa+eng`, returns text + mean word confidence; rasterize scanned PDF pages with `unpdf`). Add `packages/ai/src/lib/extraction/readers/normalize-image.ts` converting HEIC to JPEG with `heic-convert` (spec FR-002 accepts HEIC; Tesseract and the vision API do not) and use it in both the OCR and vision readers
- [x] T038 [P] [US2] Implement the vision reader in `packages/ai/src/lib/extraction/readers/vision.ts` (sends images/PDF pages to `VISION_MODEL`, returns structured output directly, reports token usage). Use `normalize-image.ts` from the OCR reader task so HEIC photos are converted first _(Done inside `extract-file.ts`: the vision tier sends the image/PDF to `VISION_MODEL` through `structureContent` with the same prompt and schema as the text path.)_
- [x] T039 [US2] Implement `structure.ts` in `packages/ai/src/lib/extraction/structure.ts`: text → `extractedDocumentSchema` via schema-constrained LLM output on `EXTRACTION_MODEL`, one retry on validation error, per-field confidence (record confidence = min of date, amount, type). Prompt uses `transactionCategories` and instructs: emit one transaction per receipt/invoice found, return dates as ISO and lower the date confidence when day/month order is ambiguous, leave currency empty when absent (caller falls back to `BUSINESS_CURRENCY`)
- [x] T040 [US2] Implement `strategy.ts` + `confidence.ts` in `packages/ai/src/lib/extraction/` (pick tier, escalate digital → OCR → vision, compute record/file status per research R5) and export `extractFile()` from `packages/ai/src/index.ts`
- [x] T041 [P] [US2] Implement the `EmbeddingProvider` interface, Voyage implementation and chunker (~800 tokens, 100 overlap) in `packages/ai/src/lib/embeddings/` (`provider.ts`, `voyage.ts`, `chunk.ts`)
- [x] T042 [US2] Implement persistence in `apps/worker/src/app/extraction.processor.ts`: download from S3, call `extractFile()`, write `extraction_runs`, `transactions` and `line_items` (category `staff` sets `is_staff`), store extracted text key, write `document_chunks` with embeddings, write `cost_entries` per paid call and update `business_files.total_cost_micro_usd`, `reading_method` and final `status`; on error set `failed` with `failure_reason` and keep the original file (depends on T014, T020, T040, T041). On a re-run, delete only the file's unconfirmed records and keep confirmed ones (with their line items); skip creating a new record that matches a confirmed one on date, amount and counterparty (FR-014) _(Done in `apps/worker/src/app/extraction/extraction.service.ts`, called by `extraction.processor.ts`; also `cost-guard.service.ts`.)_
- [x] T043 [US2] Add `POST /api/files/{id}/retry` (409 unless status is `failed` or `needs_review`) to `apps/api/src/app/files/files.controller.ts` and service, re-enqueueing the job. Annotate the retry endpoint (`@ApiResponse` 202 and 409). Retry never discards records the owner already confirmed (see T042)
- [x] T044 [P] [US2] Show reading method, failure reason and a retry button in `apps/web/src/app/(app)/files/[id]/page.tsx` (file detail with extracted records read-only) and link rows from `files-table.tsx`
- [x] T045 [US2] Add structured logging (file id, tier, duration, status) in `apps/worker/src/app/extraction.processor.ts`

**Checkpoint**: Uploaded files are automatically converted into structured, searchable data

---

## Phase 5: User Story 3 - Review and correct extracted data (Priority: P2)

**Goal**: Owner edits/confirms records, resolves likely duplicates, and files move to `completed`.

**Independent Test**: Edit an amount and category on a `needs_review` file, confirm all records, status becomes `completed`; resolve a likely-duplicate pair by merge and by keep-both (quickstart scenarios 4 and 6).

### Tests for User Story 3

- [x] T046 [P] [US3] Integration tests for `PATCH /api/records/{id}`, `POST /api/records/{id}/confirm`, `DELETE /api/records/{id}`, file status transition to `completed`, in `apps/api/src/app/records/records.controller.spec.ts`
- [x] T047 [P] [US3] Unit tests for duplicate detection (same date, amount ±0.01, normalized counterparty; never within the same file) in `apps/worker/src/app/duplicates.service.spec.ts`
- [x] T048 [P] [US3] Integration tests for `GET /api/duplicates` and `POST /api/duplicates/{id}/resolve` (`keep_both`, `merge` with `keepTransactionId`; merged loser gets `excluded_reason='merged_duplicate'`) in `apps/api/src/app/records/duplicates.controller.spec.ts`

### Implementation for User Story 3

- [x] T049 [US3] Implement `RecordsService`/`RecordsController` edit, confirm and delete in `apps/api/src/app/records/records.service.ts` and `records.controller.ts`: edits validated with `transactionUpdateSchema`, editing sets `confirmed=true`, and when every record of a `needs_review` file is confirmed the file status becomes `completed`; register `RecordsModule`. Annotate with `@ApiTags('records')`, `@ApiOperation`, `@ApiResponse` and `@ApiParam`
- [x] T050 [US3] Implement `DuplicatesService` in `apps/worker/src/app/duplicates.service.ts` and call it after persistence in `extraction.processor.ts`, inserting pending `duplicate_candidates` (unique per unordered pair)
- [x] T051 [US3] Implement `GET /api/duplicates` and `POST /api/duplicates/{id}/resolve` in `apps/api/src/app/records/duplicates.controller.ts` (merge excludes the loser from totals; never merge silently). Annotate with `@ApiTags('duplicates')`, `@ApiOperation`, `@ApiResponse`
- [x] T052 [P] [US3] Create `apps/web/src/app/components/record-editor.tsx` (edit date, amount, currency, kind, category, counterparty, line items; confirm button) and use it in `apps/web/src/app/(app)/files/[id]/page.tsx`, showing the original file next to the records. Category dropdown is built from `transactionCategories`
- [x] T053 [P] [US3] Create `apps/web/src/app/components/duplicate-dialog.tsx` and a "Possible duplicates" section on `apps/web/src/app/(app)/files/page.tsx` with keep-both / merge actions

**Checkpoint**: Owner can trust and fix the data

---

## Phase 6: User Story 4 - Data ready for analysis and date filtering (Priority: P2)

**Goal**: Stable query/aggregation API for weekly/monthly expense and income, staff expenses, and purchased/sold product lists, all date-filterable, following the clarified totals rule.

**Independent Test**: With processed files across several weeks, `GET /api/records/totals` and `/products` return values that match the included records exactly, with confirmed/unconfirmed split (quickstart scenario 5).

### Tests for User Story 4

- [x] T054 [P] [US4] Integration tests for `GET /api/records` filters and `GET /api/records/totals` (week/month buckets, Monday week start via `BUSINESS_WEEK_START`, excludes files in `needs_review` and `merged_duplicate`, `confirmedMinor + unconfirmedMinor = totalMinor`, staff via `category=staff`) in `apps/api/src/app/records/totals.spec.ts`
- [x] T055 [P] [US4] Integration tests for `GET /api/records/products` purchase vs sale aggregation in `apps/api/src/app/records/products.spec.ts`

### Implementation for User Story 4

- [x] T056 [US4] Add aggregation queries in `packages/db/src/lib/repositories/records.ts` (bucket by week/month using the configured week start, group by kind and category, split confirmed/unconfirmed, apply exclusions)
- [x] T057 [US4] Implement `GET /api/records` (filters + cursor), `GET /api/records/totals` and `GET /api/records/products` in `apps/api/src/app/records/records.controller.ts` validated with `recordsQuerySchema`. Annotate every query parameter with `@ApiQuery` (enums for `groupBy`, `kind`, `direction`) and describe the totals exclusions in `@ApiOperation({ description })`. Support the `product` filter from `recordsQuerySchema` (joins `line_items.product_key`) and add it as an `@ApiQuery`
- [x] T058 [P] [US4] Create a minimal records explorer in `apps/web/src/app/(app)/records/page.tsx` with date-range filters, week/month grouping, expense/income/staff filter and purchase/sale product tables (full dashboards remain a follow-up feature) and link it in `sidebar.tsx`
- [x] T059 [P] [US4] Add semantic retrieval for the downstream agent workflow without breaking module boundaries (`ai` may depend only on `shared`): in `packages/ai/src/lib/embeddings/query.ts` add `embedQuery(text): Promise<number[]>` using the `EmbeddingProvider`, and in `packages/db/src/lib/repositories/chunks.ts` add `searchChunks(queryVector, { limit, fileId? })` ordering `document_chunks` by cosine distance; the api/worker combines the two. Unit-test `embedQuery` in `packages/ai/src/lib/embeddings/query.spec.ts` and `searchChunks` in `packages/db/src/lib/repositories/chunks.spec.ts` (FR-017)

**Checkpoint**: Data is queryable and ready for dashboards and agents

---

## Phase 7: User Story 5 - Cost visibility and control (Priority: P3)

**Goal**: Visible per-file and monthly cost, plus a monthly limit that queues files instead of losing them.

**Independent Test**: Set `PROCESSING_COST_LIMIT_USD` very low; a photo upload becomes `queued_limit`; raising the limit processes it; `GET /api/costs/summary` reports totals (quickstart scenario 7).

### Tests for User Story 5

- [x] T060 [P] [US5] Unit tests for the cost guard (month-to-date sum, unset limit = off, check before each paid call, month rollover) in `apps/worker/src/app/cost-guard.service.spec.ts`
- [x] T061 [P] [US5] Integration test for `GET /api/costs/summary` in `apps/api/src/app/costs/costs.controller.spec.ts`

### Implementation for User Story 5

- [x] T062 [US5] Implement `CostGuardService` in `apps/worker/src/app/cost-guard.service.ts` and call it before each paid step in `extraction.processor.ts`; when over the limit set status `queued_limit` and stop without failing the job. The limit is soft: it is checked before each paid call, so a single call may overshoot it (the log records the overshoot)
- [x] T063 [US5] Add a repeatable BullMQ job in `apps/worker/src/app/cost-guard.service.ts` that re-enqueues `queued_limit` files when the limit is raised or the month rolls over
- [x] T064 [US5] Implement `GET /api/costs/summary` (`month`, `totalMicroUsd`, `limitMicroUsd`, `limitReached`, `byKind`) in `apps/api/src/app/costs/costs.controller.ts` and register `CostsModule`. Annotate with `@ApiTags('costs')`, `@ApiOperation`, `@ApiResponse`. Also return `avgPerFileMicroUsd` and `byTier` (file counts per reading method) so SC-005 (at least 60% on the lowest-cost tiers, average cost visible) can be checked
- [x] T065 [P] [US5] Show per-file cost in `files-table.tsx` and a monthly cost/limit banner on `apps/web/src/app/(app)/files/page.tsx`

**Checkpoint**: All user stories independently functional

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T066 [P] Update `infra/README.md` with the new env vars, the worker's OCR/PDF dependencies and how to run migrations (constitution Principle IV) and document `pnpm openapi` / `pnpm nx run api:openapi-check`, the Swagger UI at `/api/docs` and where the generated files live (`apps/api/openapi/`)
- [x] T067 [P] Update `packages/db` startup docs and ensure `pnpm nx run db:migrate` runs in `pnpm start` before `api`/`worker` (compose or script) and document it in `infra/README.md`
- [x] T068 Run `pnpm nx run-many -t docker:build -p api worker web` and verify the worker image runs OCR end to end (research R12) _(Verified: images build; in a throwaway container from `apps-worker`, bundled Spanish/English OCR read a PNG with 96% confidence, and all runtime dependencies resolve.)_
- [x] T069 Security pass: confirm no public bucket URLs, uploads cannot escape the owner prefix, filenames are sanitized in storage keys, and payroll data is never logged _(Verified: anonymous S3 listing/read return 403, `storageKey` never appears in API responses, keys are sanitized, logs use ids only, multipart fields are capped. Credentials no longer have defaults in source.)_
- [x] T070 Run the `billy-boundary-reviewer` and `billy-infra-reviewer` agents on the diff and fix findings _(Done inline against the two agents' checklists instead of spawning them: imports match the allowed graph, `compose config -q` and `bash -n scripts/*.sh` pass, new env vars are in `.env.example` and compose, images keep `USER node`.)_
- [x] T071 Run every scenario in `specs/001-business-file-upload/quickstart.md` against the local stack. Time the 10-file upload (SC-001 under 1 minute) and the time to `completed`/`needs_review` (SC-002 under 2 minutes) and record the results _(Run against the rebuilt stack: SC-001 met, 10 files stored in 0.14 s. The live-LLM scenarios could not run because `ANTHROPIC_API_KEY` is empty in `.env`: files fail fast with "ANTHROPIC_API_KEY is not set" and retry works; extraction itself is covered by fake-LLM integration tests. SC-002 and SC-003 need a real key to measure.)_
- [x] T072 Run `pnpm openapi`, commit `apps/api/openapi/openapi.json` and `openapi.yaml`, and compare them with `specs/001-business-file-upload/contracts/files-api.openapi.yaml`; fix controller annotations or update the contract until they agree (the generated files are the source of truth afterwards) _(Generated spec covers all 15 contract operations plus the scaffold `GET /api`; `pnpm nx run api:openapi-check` passes.)_
- [x] T073 Run `billy-verify` (format, lint, test, typecheck, build on affected projects) and fix failures. Include `pnpm nx run api:openapi-check` in the gate so the committed OpenAPI files never drift from the controllers

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup; BLOCKS all stories
- **US1 (P1)**: after Foundational; no dependency on other stories
- **US2 (P1)**: after Foundational; needs files to exist, so integration testing uses US1's upload (or direct DB seed); code is independent of US1
- **US3 (P2)**: after Foundational; needs records from US2 to be meaningful (seed data works for tests)
- **US4 (P2)**: after Foundational; reads US2/US3 data; `excluded_reason` and `confirmed` come from US3 tasks T049/T051 for full behavior
- **US5 (P3)**: after US2 (extends the processor); T062 modifies `extraction.processor.ts`
- **Polish**: after the desired stories

### Within Each Story

Tests → repositories/services → endpoints → web. Tasks editing the same file (e.g., `extraction.processor.ts`: T020, T042, T045, T050, T062) run sequentially.

### Parallel Opportunities

- Setup: T002–T006 in parallel after T001
- Foundational: T007–T010 (shared), T014–T017, T021–T022 in parallel once T011–T013 are done
- US1: T023/T024 together; T028 and T030 alongside API work
- US2: T031–T034 together; readers T036/T037/T038/T041 together
- US3: T046–T048 together; T052/T053 together
- US4: T054/T055/T058/T059 together
- Different stories can proceed in parallel after Foundational, except for the shared-file notes above

### Parallel Example: User Story 2

```bash
Task: "Digital reader in packages/ai/src/lib/extraction/readers/digital.ts"
Task: "OCR reader in packages/ai/src/lib/extraction/readers/ocr.ts"
Task: "Vision reader in packages/ai/src/lib/extraction/readers/vision.ts"
Task: "Embedding provider + chunker in packages/ai/src/lib/embeddings/"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational → Phase 3 US1
2. **STOP and VALIDATE**: quickstart scenarios 1, 2 and the file part of 8
3. Demo the document vault

### Incremental Delivery

1. Foundation + US1 → vault (MVP)
2. - US2 → automatic extraction and RAG index (the core value)
3. - US3 → trusted data and duplicate handling
4. - US4 → analysis-ready API and minimal explorer
5. - US5 → cost limits and visibility
6. Polish → docs, images, boundary/infra review, `billy-verify`

---

## Notes

- [P] tasks touch different files and have no dependency on incomplete tasks
- Never import `@org/db` or `@org/ai` from `apps/web` (module boundaries are lint-enforced)
- Commit per task or logical group with Conventional Commits (e.g., `feat(api): add file upload endpoint`)
- LLM and embedding calls are always faked in automated tests
