---
description: 'Task list for Dashboard Analysis Metrics'
---

# Tasks: Dashboard Analysis Metrics

**Input**: Design documents from `/specs/002-dashboard-analysis-metrics/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/dashboard-api.openapi.yaml, quickstart.md. Feature 001 (upload and analysis) is already merged.

**Tests**: Included. The Billy constitution (Principle V) requires tests for new shared schemas and tests proportionate to risk for new queries and endpoints. Integration tests use the local Postgres (`pnpm infra:up`, `pnpm db:migrate`) with a unique owner per suite and skip with a warning when it is unreachable.

**Organization**: Tasks are grouped by user story so each can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story the task belongs to (US1-US6)
- Paths are relative to the repo root. Run tasks with `pnpm nx <target> <project>`; no new dependencies are needed.

## Path Conventions

Nx monorepo (see plan.md): `apps/api`, `apps/web`, `packages/shared`, `packages/db`. The worker and the `ai` package are untouched.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Make room for the new dashboard without breaking what exists

- [x] T001 Remove the demonstration code from `apps/web/src/app/(app)/dashboard/page.tsx` (seeded `demoData`, the `useProjects` dependency and the "datos de demostración" copy) and replace it with a minimal placeholder page titled "Dashboard", so the app keeps building while the real sections are added; keep `apps/web/src/app/components/projects-provider.tsx` and `project-selector.tsx` untouched
- [x] T002 [P] Remove the "solo para demo (datos ficticios)" wording from `apps/web/src/app/components/charts.tsx` and confirm nothing else imports the old `LineChart`/`BarChart`/`DonutChart` signatures (they are rewritten for real data in T020 and T031) _(Done: `charts.tsx` was rewritten for real data; only the dashboard page imported the old charts.)_

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared schemas, period helpers, API module and the web section shell that ALL stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 [P] Create `packages/shared/src/lib/dashboard.ts` with the zod schemas of data-model.md and export it from `packages/shared/src/index.ts`: `activityQuerySchema` (`from`, `to` as `z.iso.date()`, refined so `from <= to`), `activitySummarySchema` (`bucket` enum `day|week`; `counts` with `received`, `processing`, `queuedLimit`, `completed`, `needsReview`, `failed` as non-negative integers; `total`, `finished` non-negative integers; `successRate` number 0..1 or null; `avgAnalysisSeconds` non-negative number or null; `series` items `{ bucketStart: date, uploaded: non-negative integer, finished: non-negative integer }`; `byMethod` with `digital`, `ocr`, `vision` non-negative integers) and `attentionItemsSchema` (`needsReview`, `failed`, `queuedLimit`, `pendingDuplicates` non-negative integers; `unconfirmed` array of `{ currency: 3-letter ISO code, amountMinor: integer }`)
- [x] T004 [P] Add period helpers to `packages/shared/src/lib/dashboard.ts`: `periodPresets` (`7d`, `30d`, `90d`, `month`, `custom`), `periodFromPreset(preset, today)` returning inclusive UTC `{ from, to }` (default preset `30d` ends today), `validatePeriod({ from, to })` returning an error message in Spanish when a date is missing or `from` is after `to`, and `bucketFor(from, to)` returning `day` when the period spans at most 31 days, otherwise `week` _(`bucketStartOf`, `bucketStarts` and `fillSeries` were added here too: the series is zero-filled in TypeScript instead of SQL `generate_series`, which keeps it unit-testable.)_
- [x] T005 [P] Write tests in `packages/shared/src/lib/dashboard.spec.ts` for the schemas (negative counts, `successRate` above 1, bad dates, `from` after `to`) and the period helpers (each preset, "month" starts on day 1, 31-day period is `day` and 32-day is `week`, missing/inverted range messages)
- [x] T006 Create the API module skeleton in `apps/api/src/app/dashboard/` (`dashboard.module.ts`, `dashboard.service.ts`, `dashboard.controller.ts` with `@ApiTags('dashboard')` and `@Controller('dashboard')` and no routes yet), add DTO classes `ActivityQueryDto`, `ActivitySummaryDto` and `AttentionItemsDto` to `apps/api/src/app/dto.ts` with `createZodDto`, add the `dashboard` tag to `apps/api/src/openapi/build-document.ts`, and register `DashboardModule` in `apps/api/src/app/app.module.ts`
- [x] T007 Create the owner-scoped repository file `packages/db/src/lib/repositories/dashboard.ts` exporting `dashboardRepository(db, ownerId)` (empty object for now) and export it from `packages/db/src/lib/repositories/index.ts`; expose it as `readonly dashboard` in `apps/api/src/app/database/repositories.service.ts`
- [x] T008 [P] Add the API client helpers to `apps/web/src/app/lib/files-api.ts`: `getActivity({ from, to })` parsed with `activitySummarySchema` and `getAttention()` parsed with `attentionItemsSchema`
- [x] T009 [P] Create the section shell `apps/web/src/app/components/dashboard/dashboard-section.tsx`: a card with a title, a period/unit subtitle, a loading skeleton, an error state with a "Reintentar" button, and a hook `useSection(loader, deps, { refreshKey, pollMs, enabled })` that loads on mount and when deps/refreshKey change, ignores stale responses, and polls every `pollMs` only while `document.visibilityState === 'visible'`
- [x] T010 Create the new dashboard page `apps/web/src/app/(app)/dashboard/page.tsx` (replacing the T001 placeholder) as a client component holding the period state (default `periodFromPreset('30d')`), a `refreshKey` bumped by an "Actualizar" button, and a layout of five section slots that stay empty until their stories land; keep it usable at 360 px (single column, no horizontal page scroll)

**Checkpoint**: Foundation ready - user story work can begin

---

## Phase 3: User Story 1 - See how my document analysis is going (Priority: P1) 🎯 MVP

**Goal**: Real activity figures: files by state, success rate, average analysis time, activity over time, empty state and automatic refresh.

**Independent Test**: Upload a mix of files (some complete, one fails, one needs review) and verify every dashboard figure equals the files list for the same dates (quickstart scenarios 1, 2 and 3).

### Tests for User Story 1

- [x] T011 [P] [US1] Integration tests for the activity query in `packages/db/src/lib/repositories/dashboard.spec.ts`: counts per status for files uploaded inside the period (inclusive dates, UTC), files outside the period excluded, `total == sum(counts)`, `successRate` equals completed / finished and is `null` with no finished files, `avgAnalysisSeconds` averages the summed run durations per file and ignores files without runs, the series is zero-filled with `bucket` `day` for a period of at most 31 days and `week` otherwise, `sum(series.uploaded) == total`, `byMethod` counts per reading method, and another owner's files never appear
- [x] T012 [P] [US1] Integration tests for `GET /api/dashboard/activity` in `apps/api/src/app/dashboard/dashboard.controller.spec.ts` using `createTestApp`: matches `GET /api/files` counts for the same dates, 400 when `from`/`to` are missing, malformed or `from` is after `to`, and an empty period returns zeros, `successRate: null`, `avgAnalysisSeconds: null` and a zero-filled series

### Implementation for User Story 1

- [x] T013 [US1] Implement `activity({ from, to, bucket })` in `packages/db/src/lib/repositories/dashboard.ts`: counts by status from `business_files` filtered by `uploaded_at >= from` and `< to + 1 day`; `avgAnalysisSeconds` from `extraction_runs` (sum of `finished_at - started_at` per file, then the mean over finished files that have runs); the `uploaded` series from `uploaded_at` and the `finished` series from `updated_at` of files whose status is `completed`, `needs_review` or `failed`, both grouped with `date_trunc('day'|'week', ...)` (week starts Monday, matching `BUSINESS_WEEK_START` default) and zero-filled with `generate_series`; `byMethod` from `reading_method` (depends on T007) _(Done: the repository returns sparse series; `DashboardService` zero-fills them with `fillSeries`.)_
- [x] T014 [US1] Implement `DashboardService.activity(query)` in `apps/api/src/app/dashboard/dashboard.service.ts` (choose `bucket` with `bucketFor`, derive `finished`, `successRate` and map to `ActivitySummary`) and `GET /api/dashboard/activity` in `apps/api/src/app/dashboard/dashboard.controller.ts` with `@ApiOperation`, `@ApiQuery` for `from`/`to`, `@ApiBadRequestResponse` and `@ZodResponse({ type: ActivitySummaryDto })`
- [x] T015 [P] [US1] Replace the chart components in `apps/web/src/app/components/charts.tsx` with real-data versions used by this story: `SeriesLineChart` (two named series over bucket labels, formatted axis, `<title>` per point), keeping the SVG approach and theme tokens, with `role="img"`, an `aria-label` and a visually hidden data table as accessible fallback
- [x] T016 [US1] Create `apps/web/src/app/components/dashboard/activity-section.tsx`: counters for received, in progress (received + processing), waiting (queued limit), completed, in review and failed; success rate and average analysis time (show "—" when null, durations as seconds/minutes); the uploads vs finished analyses chart from T015 labelled by day or week; a small reading-method mix; the empty state when `total` is 0 with a link to `/upload` and no numbers; polls every 10 s while `counts.received + counts.processing + counts.queuedLimit > 0`; wire it into the page from T010 with the current period
- [x] T017 [US1] Make every activity figure carry its unit and period in its label (for example "Archivos recibidos · 18 sep – 18 oct") in `activity-section.tsx` (FR-016)

**Checkpoint**: US1 delivers a trustworthy activity overview (MVP)

---

## Phase 4: User Story 2 - See my business numbers from the analyzed documents (Priority: P1)

**Goal**: Expenses, income, difference, staff share, category breakdown and weekly comparison, consistent with the analysis screen.

**Independent Test**: With processed files over several weeks, the dashboard totals equal `/records` for the same dates, and files in review and merged duplicates are excluded (quickstart scenario 4).

### Tests for User Story 2

- [x] T018 [P] [US2] Unit tests for `summarizeFinance` in `packages/shared/src/lib/dashboard.spec.ts`: sums per currency without mixing currencies, `netMinor` can be negative, `staffMinor` only counts expense rows with category `staff`, `staffShare` is `null` when expenses are 0 (no division by zero), `byCategory` lists expense categories largest first with shares adding up to 1, `weekly` is ordered by week and zero-fills a kind with no rows, `unconfirmedMinor` sums the unconfirmed parts, and an empty input returns an empty list

### Implementation for User Story 2

- [x] T019 [US2] Implement `summarizeFinance(rows: TotalsRow[])` in `packages/shared/src/lib/dashboard.ts` returning, per currency, `{ currency, expensesMinor, incomeMinor, netMinor, staffMinor, staffShare (0..1 or null), unconfirmedMinor, byCategory: { category, totalMinor, share }[], weekly: { bucketStart, expensesMinor, incomeMinor }[] }` as described in data-model.md, and export its types
- [x] T020 [P] [US2] Add `GroupedBarChart` (two series per bucket, expenses vs income) to `apps/web/src/app/components/charts.tsx` and a `HorizontalBars` component for the category breakdown, both with the same accessibility fallback as T015
- [x] T021 [US2] Create `apps/web/src/app/components/dashboard/finance-section.tsx`: calls `getTotals({ from, to, groupBy: 'week' })` (already in `files-api.ts`), runs `summarizeFinance`, and shows total expenses, total income, the difference, the staff total and its share, the category breakdown, the weekly expenses vs income chart and, per currency, a currency switcher when more than one currency exists; show the unconfirmed amount separately with a note that it is included in the totals; label the first/last week as partial when it straddles the period; empty state without invented numbers; wire it into the dashboard page
- [x] T022 [US2] Add a link "Ver detalle" from the finance section to `/records` carrying the same period when possible, so the owner can compare with the analysis screen (SC-002)

**Checkpoint**: US1 + US2 give the core value of the dashboard

---

## Phase 5: User Story 3 - Know what needs my attention (Priority: P2)

**Goal**: Counters for files in review, failed, waiting for budget, possible duplicates and unconfirmed amounts, each linking to where the owner can act.

**Independent Test**: Create one file of each pending kind, open the dashboard and see the right counters and working links; resolve one and see the counter drop (quickstart scenario 5).

### Tests for User Story 3

- [x] T023 [P] [US3] Integration tests for the attention query in `packages/db/src/lib/repositories/dashboard.spec.ts`: counts of `needs_review`, `failed` and `queued_limit` files regardless of upload date, pending duplicate pairs (resolved pairs excluded), `unconfirmed` per currency using the same exclusions as totals (no files in `needs_review`, no `merged_duplicate`) and not mixing currencies, and owner isolation
- [x] T024 [P] [US3] Integration tests for `GET /api/dashboard/attention` in `apps/api/src/app/dashboard/dashboard.controller.spec.ts`: counters match `GET /api/files?status=...` and `GET /api/duplicates`, a resolved item lowers its counter, and an empty business returns zeros and an empty `unconfirmed` array

### Implementation for User Story 3

- [x] T025 [US3] Implement `attention()` in `packages/db/src/lib/repositories/dashboard.ts` (counts by status, count of `duplicate_candidates` with status `pending`, and the unconfirmed amount per currency from `transactions` joined to `business_files` with `confirmed = false`, `excluded_reason IS NULL` and file status not `needs_review`)
- [x] T026 [US3] Implement `DashboardService.attention()` and `GET /api/dashboard/attention` in `apps/api/src/app/dashboard/` with `@ApiOperation` stating the result is not period based and `@ZodResponse({ type: AttentionItemsDto })`
- [x] T027 [P] [US3] Let `apps/web/src/app/components/files-table.tsx` honor a `?status=` search param (valid file statuses only, with a visible "Mostrando: <estado> · Quitar filtro" chip) by passing it to `listFiles`, and add `id="duplicados"` to the duplicates panel wrapper in `apps/web/src/app/components/duplicates-panel.tsx` so `/files#duplicados` scrolls to it
- [x] T028 [US3] Create `apps/web/src/app/components/dashboard/attention-section.tsx`: counters for in review, failed, waiting for budget, possible duplicates and the unconfirmed amount per currency, each linking to `/files?status=needs_review`, `/files?status=failed`, `/files?status=queued_limit` and `/files#duplicados`; an "all clear" message when everything is zero; not affected by the period; refreshed together with the other sections; wire it into the page above the financial section

**Checkpoint**: The dashboard is now an entry point for pending work

---

## Phase 6: User Story 4 - See the most relevant products (Priority: P2)

**Goal**: Top purchased and top sold products with quantity and total.

**Independent Test**: With purchase and sale line items, the dashboard lists match the product tables of `/records` (quickstart scenario 6).

### Tests for User Story 4

- [x] T029 [P] [US4] Tests for the optional `limit` of the product query: in `packages/shared/src/lib/records.spec.ts` (`productsQuerySchema` accepts 1-100, rejects 0 and 101, `limit` optional) and in `apps/api/src/app/records/products.spec.ts` (with 3 products, `limit=2` returns the 2 with the largest totals in order; without `limit` all are returned)

### Implementation for User Story 4

- [x] T030 [US4] Add the optional `limit` (`z.coerce.number().int().min(1).max(100)`) to `productsQuerySchema` in `packages/shared/src/lib/records.ts`, apply `.limit()` after the descending total ordering in `products()` of `packages/db/src/lib/repositories/records.ts`, pass it through `RecordsService.products` in `apps/api/src/app/records/records.service.ts`, and document it with `@ApiQuery({ name: 'limit' })` in `apps/api/src/app/records/records.controller.ts`
- [x] T031 [P] [US4] Extend `getProducts` in `apps/web/src/app/lib/files-api.ts` with the optional `limit`
- [x] T032 [US4] Create `apps/web/src/app/components/dashboard/products-section.tsx`: two compact lists (purchased and sold, 5 each) with quantity and total, a link to `/records`, and a short explanation when a list is empty; wire it into the dashboard page

**Checkpoint**: Product highlights available

---

## Phase 7: User Story 5 - Understand analysis cost and reading method (Priority: P3)

**Goal**: Month cost, optional limit, average per file, share per reading method and a warning when the limit is reached.

**Independent Test**: Costs, average and method share equal what the files screen shows; the warning appears when the limit is reached (quickstart scenario 7).

### Implementation for User Story 5

- [x] T033 [US5] Create `apps/web/src/app/components/dashboard/cost-section.tsx` reusing `getCostSummary()` and `formatCost` from the existing code: month cost, limit when set (with a progress bar capped at 100%), average per file, share of files read with direct reading, OCR and AI vision computed from `byTier` (show "—" when there are no files), and the limit-reached warning text already used by `cost-banner.tsx`; wire it into the dashboard page
- [x] T034 [US5] Make the files page and the dashboard share one source of wording for the limit warning by extracting it from `apps/web/src/app/components/cost-banner.tsx` into `apps/web/src/app/lib/format.ts` (`limitReachedMessage`) and using it in both places

**Checkpoint**: Cost visibility on the dashboard

---

## Phase 8: User Story 6 - Choose the period I want to look at (Priority: P3)

**Goal**: Period presets and a validated custom range that every period-based section follows.

**Independent Test**: Changing the period updates all period-based sections together and matches the same period on the other screens; an invalid range shows a message and keeps the previous data (quickstart scenario 8).

### Implementation for User Story 6

- [x] T035 [US6] Create `apps/web/src/app/components/dashboard/period-picker.tsx`: buttons for 7, 30 and 90 days and "Este mes", a "Personalizado" mode with two date inputs and an "Aplicar" button, validation through `validatePeriod` showing its message with `role="alert"` and leaving the applied period unchanged, and the applied period shown as text ("18 sep – 18 oct 2026")
- [x] T036 [US6] Use the picker in `apps/web/src/app/(app)/dashboard/page.tsx`: the applied period feeds the activity, finance and products sections (attention and cost stay "now" and "this month", and their subtitles say so); the default is always the last 30 days on a fresh visit (no persistence); changing the period must not blank sections that are already loaded (show the previous data until the new data arrives)

**Checkpoint**: All user stories are independently functional

---

## Phase 9: Polish & Cross-Cutting Concerns

- [x] T037 [P] Regenerate and commit the API spec with `pnpm openapi`, then confirm `pnpm nx run api:openapi-check` passes and that `apps/api/openapi/openapi.yaml` contains `/api/dashboard/activity`, `/api/dashboard/attention` and the `limit` parameter of `/api/records/products`; compare with `specs/002-dashboard-analysis-metrics/contracts/dashboard-api.openapi.yaml`
- [x] T038 [P] Check the dashboard at 360 px wide and in dark mode: no horizontal page scroll, tables and charts scroll or scale inside their card, every chart has its accessible fallback, focus order is logical (SC-008) _(Done by code review only: the layout collapses to 2 columns, charts scale with `viewBox`, nothing is wider than its card. It was NOT checked in a real browser or at 360 px; no browser tool was available.)_
- [x] T039 [P] Failure isolation: make each section's request fail (stop the API, or block one path in the browser) and confirm only that section shows an error with a working "Reintentar" while the others render (FR-015); fix any section that blanks the page _(Covered by `apps/web/specs/dashboard.spec.tsx`: a failing finance section leaves activity and cost visible and its Reintentar works; stale answers are ignored and a failed refresh keeps the last data.)_
- [x] T040 Measure SC-001, SC-005 and SC-006 against the local stack with about 1,000 seeded files (seed through the repositories, not by uploading) and record the timings in `specs/002-dashboard-analysis-metrics/quickstart.md`; add an index in a new TypeORM migration under `packages/db/src/lib/migrations/` only if a query is slow _(Measured with 1,000 files, 3,000 records and 3,000 line items: every dashboard query finished in 2-8 ms except the top-5 product query (157 ms). No index or migration needed.)_
- [x] T041 Run every scenario of `specs/002-dashboard-analysis-metrics/quickstart.md` against the local stack (live-LLM scenarios may be seeded when no `ANTHROPIC_API_KEY` is set) and note any that could not run _(Run against the rebuilt stack through the web proxy: activity matches the files list, attention, totals, products with `limit` and validation answer as expected, and the dashboard and filtered files pages respond. Visual scenarios (charts, 360 px, dark mode) were not seen in a browser.)_
- [x] T042 Run `billy-verify` (format, lint, test, typecheck, build on affected projects) and fix failures; run `typecheck` before `build` or delete `apps/<app>/dist` between them (see `infra/README.md`)
- [x] T043 Run the `billy-boundary-reviewer` and `billy-infra-reviewer` checklists on the diff (inline if agents are not spawned) and fix findings; confirm `apps/web` imports only `@org/shared` and no env var, compose or port changed

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup; BLOCKS all stories. T003 before T004 (same file), T003 before T006 and T008; T007 before T013/T025
- **US1 (P1)**: after Foundational; no dependency on other stories
- **US2 (P1)**: after Foundational; independent of US1 (uses the existing totals endpoint)
- **US3 (P2)**: after Foundational; independent of US1/US2
- **US4 (P2)**: after Foundational; independent
- **US5 (P3)**: after Foundational; reuses the existing costs endpoint
- **US6 (P3)**: after Foundational; its UI wires into sections from US1, US2 and US4 as they exist
- **Polish**: after the desired stories

### Within Each Story

Tests -> shared schemas/helpers -> db query -> api endpoint -> web section. Tasks that edit the same file run in order: `packages/shared/src/lib/dashboard.ts` (T003, T004, T019), `packages/db/src/lib/repositories/dashboard.ts` (T007, T013, T025), `apps/api/src/app/dashboard/*` (T006, T014, T026), `apps/web/.../charts.tsx` (T002, T015, T020) and `apps/web/src/app/(app)/dashboard/page.tsx` (T001, T010, T016, T021, T028, T032, T033, T036).

### Parallel Opportunities

- Setup: T001 and T002 touch different files
- Foundational: T003/T005 with T008/T009 (different files) once T001 is done; T004 follows T003
- US1: T011 and T012 together; T015 beside T013/T014
- US2: T018 and T020 together
- US3: T023, T024 and T027 together
- US4: T029 and T031 together
- Different stories can proceed in parallel after Foundational, except for the shared files listed above

### Parallel Example: User Story 1

```bash
Task: "Integration tests for the activity query in packages/db/src/lib/repositories/dashboard.spec.ts"
Task: "Integration tests for GET /api/dashboard/activity in apps/api/src/app/dashboard/dashboard.controller.spec.ts"
Task: "SeriesLineChart in apps/web/src/app/components/charts.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup, Phase 2 Foundational, Phase 3 US1
2. **STOP and VALIDATE**: quickstart scenarios 1-3; the dashboard already shows real activity instead of demo numbers
3. Demo it

### Incremental Delivery

1. Foundation + US1 -> real activity (MVP)
2. - US2 -> business numbers (the main value)
3. - US3 -> pending work entry point
4. - US4 -> product highlights
5. - US5 -> cost visibility
6. - US6 -> period selection
7. Polish -> OpenAPI, accessibility, failure isolation, timings, verification

---

## Notes

- [P] tasks touch different files and have no dependency on incomplete tasks
- No database migration is planned; T040 adds one only if measurements show a slow query
- Finance figures must keep coming from `/records/totals` so they equal the analysis screen (SC-002); do not add a second aggregation for money
- Commit per task or logical group with Conventional Commits (for example `feat(api): add dashboard activity endpoint`)
