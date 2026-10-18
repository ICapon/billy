# Research: Business File Upload & Ingestion

No `NEEDS CLARIFICATION` items remain from the spec. Decisions below resolve the technical unknowns.

## R1. Upload path

- **Decision**: Browser → Next rewrite → API multipart endpoint; the API streams to S3 and computes SHA-256 while streaming.
- **Rationale**: Server-side hash gives reliable duplicate detection (FR-005); one place to enforce limits (FR-003) and later auth; no CORS or presigned-URL config on SeaweedFS.
- **Alternatives**: Presigned direct-to-S3 PUT (less API load, but needs CORS setup, hash must be computed afterwards, and presign behavior varies on SeaweedFS). Revisit if files grow beyond 20 MB.

## R2. Async processing

- **Decision**: BullMQ queue `file-extraction` (Redis), consumed by `apps/worker`; job payload is only `{ fileId }`; job id = file id for idempotency; 3 attempts with exponential backoff.
- **Rationale**: Matches the planned worker design (FR-007); retries and a "Failed" state are native (FR-015).
- **Alternatives**: In-API background tasks (blocks scaling, lost on restart); Postgres-based queue (extra code, Redis already in the stack).

## R3. Reading strategy (cost tiers)

- **Decision**: Three ordered tiers; the strategy picks the first tier expected to succeed and escalates on low quality.
  1. **Digital** (cost ≈ 0 for reading): CSV/XLSX parsed to rows; PDFs with a usable text layer (≥ N characters per page) and plain text. Result text goes to a **text-only** structuring call on the cheap model.
  2. **OCR** (local, no API cost): images and scanned PDFs → `tesseract.js` (spa+eng). Accept if mean word confidence ≥ 0.70 and ≥ minimum text length; then the same text-only structuring call.
  3. **Vision** (highest cost): send the image/PDF pages to a vision-capable Claude model for direct extraction. Used when OCR confidence is low, handwriting/complex layout is detected, or the text structuring result fails validation twice.
- **Image formats**: HEIC photos are converted to JPEG (`heic-convert`) before OCR or vision, since neither Tesseract nor the vision API accepts HEIC.
- **Rationale**: Directly implements FR-010/FR-011 and SC-005. Most receipts and spreadsheets never need vision.
- **Alternatives**: Vision for everything (simplest, most expensive); OCR only (cheap but unreliable on photos); managed OCR (extra vendor/cost).
- **Models**: default structuring = `claude-haiku-5-5`; vision escalation = `claude-sonnet-5-5`. Both configurable via env so costs can be tuned without code changes.

## R4. Structured extraction

- **Decision**: One LLM call per document (or per batch of pages) using tool/JSON-schema output validated with the shared zod `extractedDocumentSchema`; invalid output is retried once with the validation error, then escalates a tier or marks Needs review. Each field carries a model-reported confidence; record confidence = min of critical fields (date, amount, type).
- **Rationale**: Deterministic contract, easy to test with recorded fixtures (FR-008, FR-009, FR-012).
- **Alternatives**: LangChain structured-output chain (adds a dependency to the hot path; the LangChain/agent layer is reserved for the analysis workflow that consumes this data).

## R5. Confidence → status

- **Decision**: File = Completed if all records ≥ 0.80 confidence and totals reconcile (line items sum ≈ document total within 1%); otherwise Needs review. Parse/transport errors = Failed with reason.
- **Rationale**: Satisfies FR-012 and SC-004 with an explainable rule. Thresholds are env-tunable.

## R6. Cost accounting and limit

- **Decision**: `cost_entries` row per paid call (model, input/output tokens, cost in micro-USD from a versioned price table in `packages/ai`). OCR/parsing log cost 0 with their duration. Monthly limit via `PROCESSING_COST_LIMIT_USD` (unset = no limit): the worker checks the month-to-date sum before each paid call; if exceeded the file becomes `queued_limit` and is re-enqueued by a repeatable job once the limit is raised or the month rolls over.
- **Rationale**: FR-011, FR-018 and the clarified "Queued (limit reached)" behavior.
- **Soft limit**: the check happens before each paid call and cannot know that call's cost, so one call may overshoot the limit; the overshoot is logged.
- **Alternatives**: Enforce in the API (cannot know cost beforehand); hard-fail jobs over the limit (loses work).

## R7. Content index for RAG

- **Boundaries**: embedding the query lives in `packages/ai` (`embedQuery`); the cosine search over `document_chunks` lives in `packages/db` (`searchChunks`), because `ai` may depend only on `shared`.
- **Decision**: Chunk extracted text (~800 tokens, 100 overlap, `@langchain/textsplitters`), embed through an `EmbeddingProvider` interface (default Voyage, dimension 1024, configurable), store in `document_chunks` with an HNSW cosine index. Embedding cost is logged in `cost_entries`.
- **Rationale**: FR-017 needs semantic retrieval; Anthropic has no embeddings endpoint, so a provider interface avoids lock-in. pgvector is already in the stack.
- **Risk**: vector dimension is fixed in the column; changing model/dimension requires a re-embed migration.

## R8. Duplicate handling

- **Decision**: Two levels. (a) File level: SHA-256 per owner; on match the upload endpoint returns a per-file result with `outcome: duplicate` and the existing file id (inside the `207` multi-status response); the client may re-send with `onDuplicate=keep`. (b) Record level: after extraction, a likely-duplicate candidate is created for records in _other_ files with same date and amount (±0.01) and similar counterparty (normalized, trigram/equality); stored in `duplicate_candidates`; owner resolves keep-both or merge (merge soft-excludes the losing record from totals).
- **Rationale**: Clarified FR-021; never merges silently.

## R9. Configuration (added to `.env.example`)

`MAX_FILE_SIZE_MB=20`, `MAX_FILES_PER_BATCH=20`, `EXTRACTION_MODEL=claude-haiku-5-5`, `VISION_MODEL=claude-sonnet-5-5`, `OCR_MIN_CONFIDENCE=0.70`, `RECORD_MIN_CONFIDENCE=0.80`, `PROCESSING_COST_LIMIT_USD=` (empty = off), `EMBEDDING_PROVIDER=voyage`, `EMBEDDING_MODEL=`, `EMBEDDING_DIMENSIONS=1024`, `VOYAGE_API_KEY=`, `BUSINESS_OWNER_ID=default`, `BUSINESS_WEEK_START=monday`, `BUSINESS_CURRENCY=USD`. `ANTHROPIC_API_KEY`, `S3_*`, `DATABASE_URL`, `REDIS_URL` already exist.

## R10. Ownership without login

- **Decision**: Every row carries `owner_id` populated from `BUSINESS_OWNER_ID`; repositories always filter by it. Files are served only through authenticated-capable API endpoints (streamed from S3), never via public bucket URLs.
- **Rationale**: Clarified FR-019; adding login later means swapping the owner source, not migrating data.
- **Note**: The existing web `Project` concept (selector, `projectSchema`) is unrelated to ownership; it is left untouched and not used as the owner scope in this feature.

## R11. Weeks and totals

- **Decision**: Week boundaries computed in the API with `BUSINESS_WEEK_START` (Monday default) using `date_trunc`-style logic on `transactions.occurred_on` (a DATE). The totals endpoint returns `total`, `confirmedTotal`, `unconfirmedTotal`; records from files in `needs_review` are excluded; merged-away duplicates are excluded.
- **Rationale**: Gives the future dashboards a stable aggregation API (FR-016, clarified totals rule).

## R12. Worker bundling

- **Decision**: Externalize `tesseract.js` and PDF rasterizing deps from the webpack bundle and install them in the worker image, or ship language data via a mounted/prebaked path. Confirm in the Docker build task during implementation.
- **Rationale**: The worker image currently copies a single `dist/main.js`; WASM assets and worker threads break when bundled naively.

## R13. OpenAPI generation

- **Decision**: Controllers are annotated with `@nestjs/swagger` (`@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiQuery`, `@ApiConsumes`). Request/response DTOs are produced from the shared zod schemas with `nestjs-zod` (`createZodDto`), so the schemas in `packages/shared` stay the single source of truth for validation, types and documentation. `pnpm openapi` (Nx target `api:openapi`) boots the Nest module graph in `preview` mode (providers are not instantiated, so no Postgres/Redis/S3 is needed) and writes `apps/api/openapi/openapi.json` and `openapi.yaml`; `api:openapi-check` fails if the committed files are stale. Swagger UI is served at `/api/docs` outside production.
- **Rationale**: Documentation cannot drift from the code, and the generated spec can later feed typed clients for `web`.
- **Alternatives**: Hand-maintained `contracts/files-api.openapi.yaml` only (drifts); Nest CLI swagger plugin (needs the Nest compiler, while this repo builds with webpack/swc); `@ApiProperty` classes duplicating the zod types.
- **Risk**: confirm `nestjs-zod` supports zod 4 (workspace uses `^4.6.7`) when installing; fallback is explicit `@ApiProperty` DTO classes for the few request bodies.
- **Status of the hand-written contract**: it remains the design-time reference; once the generated files exist (task T072) they are the source of truth.
