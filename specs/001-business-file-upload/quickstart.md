# Quickstart: Validating Business File Upload & Ingestion

## Prerequisites

- `pnpm install`; `ANTHROPIC_API_KEY` (and `VOYAGE_API_KEY` for embeddings) in `.env` (`pnpm env:init`, then edit).
- Local stack: `pnpm start:detached` (full stack) or `pnpm infra:up` plus `pnpm nx serve api` / `pnpm nx serve worker` / `pnpm nx dev web`.
- Apply migrations: `pnpm nx run db:migrate`.
- Sample files in a scratch folder: a digital PDF invoice, a CSV of sales, a clear receipt photo, a blurry receipt photo, a payroll XLSX.

## Scenarios

1. **Upload batch (US1)** – Open `http://localhost:3001/upload`, drop the 5 sample files. Expect per-file progress, then all listed in `/files` with status `Received` → `Processing`. Reload the page: files persist. A `.exe` is rejected with a reason while the others upload. Include one ~20 MB file and one HEIC photo: both upload, and the HEIC is read after conversion.
2. **Duplicate file (US1)** – Upload the same PDF again. Expect a duplicate warning with skip/keep-both.
3. **Extraction tiers (US2, US5)** – After processing, each file shows its reading method: CSV/PDF → `digital`, clear photo → `ocr`, blurry photo → `vision`. `GET /api/costs/summary` shows non-zero cost only for the vision file (plus embeddings).
4. **Review (US3)** – Open the blurry receipt (`Needs review`), fix an amount and category to `staff`, confirm. Status becomes `Completed`; the record shows `confirmed`.
5. **Totals and filters (US4)** – `GET /api/records/totals?from=2026-01-01&to=2026-01-31&groupBy=week` returns weekly expense and income totals with `unconfirmedTotal`; staff expenses via `category=staff`; products via `GET /api/records/products?direction=purchase`.
6. **Likely duplicate (FR-021)** – Upload an invoice and a bank-statement line for the same purchase; a pending duplicate candidate appears; merge it and confirm the total counts it once.
7. **Cost limit (FR-018)** – Set `PROCESSING_COST_LIMIT_USD=0.0001`, restart worker, upload a photo. Expect `Queued (limit reached)` (the limit is soft: one call may overshoot); raise the limit and it processes.
8. **Delete (FR-020)** – Delete a file; its records disappear from totals and the S3 object is gone.

## OpenAPI

- `pnpm openapi` regenerates `apps/api/openapi/openapi.json` and `openapi.yaml` (no database or Redis needed).
- `pnpm nx run api:openapi-check` fails if the committed files are out of date.
- With the API running, the interactive docs are at `http://localhost:3000/api/docs`.

## Automated checks

`pnpm nx run-many -t lint test typecheck build -p shared db ai api worker web` (or `billy-verify`). Extraction tests use recorded LLM fixtures; no network needed.

API reference: [contracts/files-api.openapi.yaml](./contracts/files-api.openapi.yaml). Schema: [data-model.md](./data-model.md).
