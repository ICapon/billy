# Implementation Plan: Document Type Metrics and Losses

**Branch**: `003-document-type-metrics` | **Date**: 2026-10-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-document-type-metrics/spec.md`

## Summary

Today the analysis extracts only dates, amounts and categories. This feature makes the extraction **type-aware**: in the same single model call it now classifies each logical document (bank statement, payroll, invoice, receipt, sales report, other) and extracts the data specific to that type. The worker stores one `extracted_documents` row per logical document (type, period, currency, consistency state, type-specific `details` as validated JSON) plus `payroll_lines` for per-employee rows, and links the usual transactions to their document. Type-specific consistency checks (balances reconcile, gross minus deductions equals net, subtotal plus tax equals total) send inconsistent documents to review. The API gains read-only views per type under `/api/documents/*`, a type correction endpoint and re-analysis endpoints (one file, or all unclassified with a cost estimate). Losses come from the existing weekly/monthly totals through a pure shared function. The web app adds a `/results` page with five tabs and shows/corrects the type in the files screens.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 24 (existing workspace)

**Primary Dependencies**: Existing only: NestJS 11 + `nestjs-zod` + `@nestjs/swagger`, TypeORM + Postgres, zod 4, `@anthropic-ai/sdk` (via `@org/ai`), BullMQ, Next.js 16 + HeroUI v3 + Tailwind 4. No new dependencies; charts stay hand-written SVG

**Storage**: Postgres: one TypeORM migration adds `business_files.document_type` columns, `extracted_documents`, `payroll_lines` and `transactions.document_id`; nothing else changes

**Testing**: Jest via Nx. Fake-LLM fixtures for extraction (no live calls in CI); integration tests on the local Postgres (unique owner per suite, skip when unreachable); pure unit tests for consistency checks, loss analysis and continuity detection; web tests with Testing Library

**Target Platform**: Linux containers; browser UI including 360 px phones

**Project Type**: Web application in an Nx monorepo (api + worker + web + shared/db/ai libs)

**Performance Goals**: Each results view in under 3 s with 1,000 documents and 5 years of history (SC-005); type correction visible after re-reading (SC-006)

**Constraints**: `web` imports only `@org/shared`; one model call per reading attempt (cost, FR-020); figures never mix currencies and follow the totals' inclusion rules (FR-014); payroll names never logged (FR-019); re-analysis respects the monthly cost limit; UTC dates and the configured week start

**Scale/Scope**: One owner, up to ~1,000 documents; 1 migration, 2 tables, ~8 new endpoints, 1 new web page with 5 tabs, changes to the extraction pipeline, files list and file detail

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                 | Status                         | Notes                                                                                                                                                                                                                                                    |
| ----------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Enforced Module Boundaries             | PASS                           | Schemas, consistency checks, loss analysis and continuity detection are pure code in `packages/shared` (or `packages/ai` for extraction); queries live in `packages/db`; `api`/`worker` compose them; `web` reads only `@org/shared`. No new tag or rule |
| II. Workspace Packages via Nx             | PASS                           | No new library or dependency; tasks run through Nx                                                                                                                                                                                                       |
| III. Environment-Driven Configuration     | PASS                           | No new environment variables; the extraction models, limits, week start and currency already come from config                                                                                                                                            |
| IV. Local-Stack Parity & S3 Compatibility | PASS                           | No compose, port or storage change, so `infra/README.md` needs only a short note about the new migration (applied by `pnpm db:migrate`)                                                                                                                  |
| V. Verified Changes                       | PASS (gate for implementation) | New shared schemas and pure functions get tests; the migration, queries and endpoints get integration tests; extraction changes get fake-LLM fixtures; `api:openapi-check` stays green after regenerating                                                |

**Post-design re-check**: PASS. One watch item: the extraction output schema grows, so the LLM contract tests (`structure.spec.ts`, `extract-file.spec.ts`, the worker integration test) must be updated together with it.

## Project Structure

### Documentation (this feature)

```text
specs/003-document-type-metrics/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── documents-api.openapi.yaml
└── tasks.md             # created later by /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/src/lib/
├── documents.ts           # document types, per-type detail schemas, extraction output schema, views' response schemas
├── consistency.ts         # pure per-type consistency checks
├── results.ts             # pure loss analysis (analyzeResults), balance continuity, payroll helpers
├── records.ts             # extractedDocumentSchema moves to the multi-document shape; records query gains documentType/documentId
└── *.spec.ts

packages/db/src/lib/
├── entities/extracted-document.entity.ts, payroll-line.entity.ts   # + columns on business-file / transaction entities
├── migrations/<ts>-document-types.ts                               # registered in migrations/index.ts
└── repositories/documents.ts (+ spec)                              # persist/replace documents, view queries

packages/ai/src/lib/extraction/
├── structure.ts           # prompt with type definitions; accepts a forced type
├── confidence.ts          # evaluation adds the consistency checks
├── extract-file.ts        # returns documents[] (type, details, records)
└── money.ts / types.ts    # records carry their document index

apps/worker/src/app/extraction/extraction.service.ts   # persists documents, payroll lines, links records; forced type on re-analysis

apps/api/src/app/
├── documents/             # controller, service, module: bank-statements, payroll, commercial, sales
├── files/                 # PATCH /files/:id/type, POST /files/:id/reanalyze, bulk reanalyze + estimate
└── records/               # documentType / documentId filters

apps/web/src/app/
├── (app)/results/page.tsx                 # tabs: Resultados y pérdidas, Estados de cuenta, Nóminas, Facturas y recibos, Ventas
├── components/results/                    # one component per tab + drill-down drawer
├── components/charts.tsx                  # + NetBarChart (profit/loss bars)
├── components/files-table.tsx, file-detail.tsx   # type chip, type correction, unclassified + re-analyze actions
└── lib/files-api.ts, lib/format.ts
```

**Structure Decision**: Reuse the existing apps and packages. Extraction stays in `packages/ai`, storage in `packages/db`, and every number shown in the new views is computed by pure shared functions or by SQL over the same tables the other screens use, which keeps the figures consistent (SC-004). The work is delivered by story: classification and storage first, because every view depends on it.

## Complexity Tracking

> No constitution violations; nothing to justify.
