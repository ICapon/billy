# Implementation Plan: Dashboard Analysis Metrics

**Branch**: `002-dashboard-analysis-metrics` | **Date**: 2026-10-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-dashboard-analysis-metrics/spec.md`

## Summary

Replace the demonstration dashboard with real metrics from the documents analyzed by feature 001. No new data is collected. The API gains two read-only endpoints (`/api/dashboard/activity`, `/api/dashboard/attention`) and an optional `limit` on the product list; everything else reuses what exists (`/records/totals`, `/records/products`, `/costs/summary`) so dashboard numbers are the same numbers the analysis screen shows (SC-002). A pure `summarizeFinance` function in `@org/shared` turns the weekly totals rows into the dashboard's financial summary. The web dashboard is split into independent sections (activity, finance, attention, products, cost), each loading on its own with its own error/retry state, a period picker (default last 30 days), and automatic refresh while files are still being analyzed.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 24 (existing workspace)

**Primary Dependencies**: NestJS 11 + `nestjs-zod` + `@nestjs/swagger` (api), TypeORM query builder (db), zod 4 (shared), Next.js 16 + React 19 + HeroUI v3 + Tailwind 4 (web). No new dependencies: charts stay hand-written SVG (extending `components/charts.tsx`)

**Storage**: Postgres (existing tables only: `business_files`, `extraction_runs`, `transactions`, `line_items`, `duplicate_candidates`, `cost_entries`); no migration

**Testing**: Jest via Nx. Integration tests on the local Postgres (unique owner per suite, skip when unreachable); pure unit tests for `summarizeFinance` and period helpers

**Target Platform**: Linux containers; browser UI including 360 px phones

**Project Type**: Web application in an Nx monorepo (api + web + shared libs; the worker is untouched)

**Performance Goals**: Dashboard complete in <3 s with 1,000 files in the period (SC-001); period change <2 s (SC-006); figures reflect a finished file within 10 s (SC-005)

**Constraints**: `web` imports only `@org/shared`; every number must equal the analysis/files screens (SC-002); a failing section must not break the others (FR-015); UTC dates, same week-start setting as `/records`; no per-project filtering (single business in v1)

**Scale/Scope**: One owner, up to ~1,000 files and a few thousand records per period; 2 new endpoints, 1 new query param, 1 rewritten page with 5 sections

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                 | Status                         | Notes                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Enforced Module Boundaries             | PASS                           | New schemas and the pure finance summary live in `packages/shared`; aggregation queries live in `packages/db`; `api` composes them; `web` only reads `@org/shared` types. No new tag or rule |
| II. Workspace Packages via Nx             | PASS                           | No new library; no new dependency; tasks run through Nx                                                                                                                                      |
| III. Environment-Driven Configuration     | PASS                           | No new environment variables; the week start and currency already come from config                                                                                                           |
| IV. Local-Stack Parity & S3 Compatibility | PASS                           | No compose, port, script or storage change, so `infra/README.md` needs no update                                                                                                             |
| V. Verified Changes                       | PASS (gate for implementation) | New shared schemas and `summarizeFinance` get tests; new queries and endpoints get integration tests; `api:openapi-check` stays green after regenerating the OpenAPI files                   |

**Post-design re-check**: PASS. The design adds no cross-scope import, no env var and no schema change.

## Project Structure

### Documentation (this feature)

```text
specs/002-dashboard-analysis-metrics/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── dashboard-api.openapi.yaml
└── tasks.md             # created later by /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/src/lib/
├── dashboard.ts            # activity + attention schemas/types, summarizeFinance(), period helpers
├── dashboard.spec.ts
└── records.ts              # productsQuerySchema gains optional `limit`

packages/db/src/lib/repositories/
├── dashboard.ts            # activity summary, attention counts, unconfirmed by currency
├── dashboard.spec.ts       # integration tests
└── records.ts              # products(): honor `limit`

apps/api/src/app/
├── dashboard/              # controller, service, module (GET activity, GET attention)
├── records/records.controller.ts   # document `limit` on /records/products
└── dto.ts                  # new DTOs from the shared schemas
apps/api/openapi/           # regenerated (pnpm openapi)

apps/web/src/app/
├── (app)/dashboard/page.tsx        # rewritten: header, period picker, sections
├── (app)/files/page.tsx            # honors ?status= filter and a #duplicados anchor
├── components/dashboard/           # period-picker, section shell (loading/error/retry), activity, finance, attention, products, cost
├── components/charts.tsx           # real-data grouped bar / line charts with accessible table fallback (demo wording removed)
└── lib/files-api.ts                # getActivity, getAttention, getProducts(limit)
```

**Structure Decision**: Reuse the existing apps and packages. Sections are independent client components with their own requests so one failure never blanks the page. Financial figures are derived from the weekly totals endpoint the analysis screen already uses, which makes SC-002 true by construction. Only data that cannot be derived from existing endpoints (file activity over time and the attention counters) gets new endpoints.

## Glossary

- **Finished file**: status `completed`, `needs_review` or `failed`. **In progress**: `received` or `processing`. **Waiting**: `queued_limit`.
- **Period**: inclusive UTC date range (`from`, `to`) applied to every section except attention and cost, which are about "now" and "this month".

## Complexity Tracking

> No constitution violations; nothing to justify.
