---
description: 'Task list for Document Type Metrics and Losses'
---

# Tasks: Document Type Metrics and Losses

**Input**: Design documents from `/specs/003-document-type-metrics/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/documents-api.openapi.yaml, quickstart.md. Features 001 (upload and analysis) and 002 (dashboard) are already merged.

**Tests**: Included. The Billy constitution (Principle V) requires tests for new shared schemas and tests proportionate to risk for the migration, queries, endpoints and extraction changes. LLM calls are always faked with recorded fixtures. Integration tests use the local Postgres (`pnpm infra:up`, `pnpm db:migrate`) with a unique owner per suite and skip with a warning when it is unreachable.

**Organization**: Tasks are grouped by user story so each can be implemented and tested independently. US1 is the foundation of the other stories: they need the document type and the type-specific data to exist.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story the task belongs to (US1-US6)
- Paths are relative to the repo root. Run tasks with `pnpm nx <target> <project>`; no new dependencies are needed.

## Path Conventions

Nx monorepo (see plan.md): `apps/api`, `apps/worker`, `apps/web`, `packages/shared`, `packages/db`, `packages/ai`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Make the extraction contract change safe before building on it

- [x] T001 Find every use of the old extraction contract with `grep -rn "extractedDocumentSchema\|ExtractedDocument\b" packages apps --include='*.ts'` (ignore `dist/`) and make sure each one is handled by T006, T016, T017, T019 or T021; the known list is in the Notes section at the bottom of this file

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared schemas and pure checks, the migration and entities, repositories, the API module skeleton and the web results shell that ALL stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Shared schemas and pure logic

- [x] T002 [P] Create `packages/shared/src/lib/documents.ts` with the document type enum `documentTypes` = `bank_statement`, `payroll`, `invoice`, `receipt`, `sales_report`, `other`, `documentTypeSchema`, `consistencySchema` (`ok` | `inconsistent` | `unchecked`) and the per-type detail schemas of data-model.md: bank statement (`accountIdentifier` string or null, `openingBalanceMinor` and `closingBalanceMinor` integers that may be negative, `totalDepositsMinor` integer >= 0, `totalWithdrawalsMinor` integer >= 0, `totalFeesMinor` integer >= 0 default 0), payroll (`grossTotalMinor`, `deductionsTotalMinor`, `netTotalMinor` integers >= 0, `employerTotalCostMinor` integer >= 0 or null, `employeeCount` integer >= 0), commercial for invoice and receipt (`counterparty` string or null, `subtotalMinor` integer >= 0 or null, `taxMinor` integer >= 0 or null, `totalMinor` integer >= 0, `paymentStatus` `paid` | `pending` | `unknown`), sales report (`totalSalesMinor` integer >= 0, `unitsSold` number >= 0 or null, `transactionCount` integer >= 0 or null); export from `packages/shared/src/index.ts`
- [x] T003 Add to `packages/shared/src/lib/documents.ts` the LLM extraction output contract that replaces `extractedDocumentSchema`: `extractionOutputSchema` = `{ documents: [...] }` where each item has `type`, `typeConfidence` (0..1), optional `periodStart`, `periodEnd`, `issueDate` (`z.iso.date()`), optional `currency` (3 letters), exactly one detail block matching `type` (decimal amounts in major units like the existing transactions; payroll includes `employees[]` with `name`, `gross`, `deductions`, `net`; `other` has no block), and `transactions` (the existing `extractedTransactionSchema`); reject a detail block that does not match `type`; also add `employeeKey(name)` that lower-cases, strips accents and punctuation and collapses spaces
- [x] T004 [P] Create `packages/shared/src/lib/consistency.ts` with pure checks returning `{ state: 'ok' | 'inconsistent' | 'unchecked', notes: string[] }` and never including employee names in notes: `checkBankStatement` (opening + deposits - withdrawals - fees = closing), `checkPayroll` (per employee and in total gross - deductions = net; employer cost not below gross when stated), `checkCommercial` (subtotal + tax = total when all three exist), `checkSalesReport` (sum of listed day or product totals equals the total when listed); tolerance is the larger of 0.01 and 1% of the reference amount; `other` is `unchecked`
- [x] T005 [P] Write tests in `packages/shared/src/lib/documents.spec.ts` and `packages/shared/src/lib/consistency.spec.ts`: valid and invalid detail blocks (negative deposits, missing total, wrong block for the type), the extraction output schema (several documents, `other` without block, bad dates, confidence outside 0..1), `employeeKey` (accents, case, punctuation, spaces), and each consistency check at, just inside and just outside the tolerance, with notes free of names
- [x] T006 Replace the old `extractedDocumentSchema` in `packages/shared/src/lib/records.ts` (keep `extractedTransactionSchema` and `extractedLineItemSchema`), update `packages/shared/src/lib/records.spec.ts`, and add to `businessFileSchema` in `packages/shared/src/lib/files.ts` the fields `documentType` (nullable), `documentTypeConfidence` (0..1 or null) and `documentTypeManual` (boolean); update `packages/shared/src/lib/files.spec.ts`

### Database

- [x] T007 [P] Create the entities `packages/db/src/lib/entities/extracted-document.entity.ts` and `packages/db/src/lib/entities/payroll-line.entity.ts` exactly per data-model.md: `extracted_documents` (`file_id` FK `business_files` ON DELETE CASCADE indexed, `ordinal` integer, `type` enum `document_type`, `type_confidence` numeric(3,2), `period_start` and `period_end` date nullable, `issue_date` date nullable, `currency` char(3), `consistency` enum `ok` | `inconsistent` | `unchecked`, `consistency_notes` text nullable, `details` jsonb; indexes `(owner_id, type, period_end)` and `(file_id)`) and `payroll_lines` (`document_id` FK ON DELETE CASCADE indexed, `employee_name` text max 200 chars, `employee_key` text indexed with `(owner_id, employee_key)`, `gross_minor`, `deductions_minor`, `net_minor` bigint >= 0); register both in `packages/db/src/lib/entities/index.ts`
- [x] T008 Edit `packages/db/src/lib/entities/business-file.entity.ts` to add `document_type` (enum `document_type`, nullable: null means "Not classified"), `document_type_confidence` (numeric(3,2), nullable) and `document_type_manual` (boolean, default false), and `packages/db/src/lib/entities/transaction.entity.ts` to add `document_id` (uuid, nullable, FK to `extracted_documents`, ON DELETE SET NULL, indexed)
- [x] T009 Write the migration `packages/db/src/lib/migrations/1761000000000-document-types.ts` (hand-written SQL, register it in `packages/db/src/lib/migrations/index.ts`): enum types `document_type` and `document_consistency`, the new columns of T008, the two tables of T007 with their foreign keys and indexes, and a `down` that undoes all of it; apply with `pnpm db:migrate` and confirm existing rows keep `document_type` null
- [x] T010 [P] Create `packages/db/src/lib/repositories/documents.ts` exporting `documentsRepository(db, ownerId)` with: `replaceForFile(fileId, documents)` (deletes the file's documents and their payroll lines, inserts the new ones and returns their ids by ordinal), `listByType(type, { from, to })` (statements, payroll and sales reports by `period_end`, invoices and receipts by `issue_date`, inclusive, owner filtered), `findById(id)`, and `payrollLines(documentId)`; export it from `packages/db/src/lib/repositories/index.ts` and expose `readonly documents` in `apps/api/src/app/database/repositories.service.ts` and `apps/worker/src/app/database/repositories.service.ts`
- [x] T011 Extend `packages/db/src/lib/repositories/records.ts`: `TransactionData` gets optional `documentId`, `replaceExtracted` stores it, and a record kept because it was confirmed keeps `document_id = null`; extend `packages/db/src/lib/repositories/files.ts` so `FileUpdate` accepts `documentType`, `documentTypeConfidence`, `documentTypeManual` and `list` accepts `documentType` (`unclassified` selects files with a null type)
- [x] T012 [P] Write integration tests in `packages/db/src/lib/repositories/documents.spec.ts`: `replaceForFile` replaces documents and cascades payroll lines, ordinals map to ids, `listByType` period rules (statement included when its period ends inside the range, invoice by issue date, inclusive ends), owner isolation, deleting a file cascades, deleting a document sets `transactions.document_id` to null, and a confirmed record survives a document replacement

### API and web skeleton

- [x] T013 Create the API skeleton `apps/api/src/app/documents/documents.module.ts`, `documents.service.ts` and `documents.controller.ts` (`@ApiTags('documents')`, `@Controller('documents')`, no routes yet), add the tag `documents` to `apps/api/src/openapi/build-document.ts`, register `DocumentsModule` in `apps/api/src/app/app.module.ts`
- [x] T014 [P] Create the results shell: `apps/web/src/app/(app)/results/page.tsx` with five tab buttons (Resultados y pérdidas, Estados de cuenta, Nóminas, Facturas y recibos, Ventas), the period picker of the dashboard (`components/dashboard/period-picker.tsx`) with the last 30 days by default, a refresh button, and an empty slot per tab; add the "Resultados" link to `apps/web/src/app/components/sidebar.tsx`
- [x] T015 [P] Add to `apps/web/src/app/lib/format.ts`: `documentTypeLabels` (Estado de cuenta, Nómina, Factura, Recibo, Reporte de ventas, Otro, Sin clasificar) and a helper that formats an ISO period

**Checkpoint**: Foundation ready - user story work can begin

---

## Phase 3: User Story 1 - Each document is recognized by type and keeps its own data (Priority: P1) 🎯 MVP

**Goal**: Documents are classified in the same model call, type-specific data and consistency are stored, the owner sees and corrects the type, and older files can be re-analyzed with a cost warning.

**Independent Test**: Upload one document of each type, see the right type and data on each file; change a wrong type and see it re-read; re-analyze an older file (quickstart scenarios 1 to 3).

### Tests for User Story 1

- [x] T016 [P] [US1] Update the extraction fixtures and add cases in `packages/ai/src/lib/extraction/structure.spec.ts`, `extract-file.spec.ts` and `confidence.spec.ts` to the multi-document contract: classification is returned per document, a mixed file yields several documents, `other` carries no detail block, a forced type appears in the prompt, an inconsistent document (opening + deposits - withdrawals - fees != closing, gross - deductions != net) makes the outcome `needs_review` with a note that has no names, and invalid output is retried once as before
- [x] T017 [P] [US1] Update `apps/worker/src/app/extraction/extraction.service.spec.ts` to the new contract and add cases: documents and payroll lines are persisted, transactions are linked to their document, the file gets `document_type` and its confidence, a manual type is never overridden by an automatic run (the type is forced instead), a payroll document creates one `staff` expense for the employer total cost (or the gross total when none is stated), a bank statement creates no transactions, and a re-run keeps confirmed records
- [x] T018 [P] [US1] Integration tests in `apps/api/src/app/files/files.type.spec.ts` using `createTestApp`: `PATCH /api/files/{id}/type` sets the type and the manual flag and enqueues the file (202; 404 unknown; 409 while processing), `POST /api/files/{id}/reanalyze` (202; 404; 409 when waiting or processing), `GET /api/files/reanalyze/estimate?scope=unclassified` (file count, estimated cost, limit and remaining budget), `POST /api/files/reanalyze` enqueues only unclassified files, and `GET /api/files?documentType=` including `unclassified`

### Implementation for User Story 1

- [x] T019 [US1] Update `packages/ai/src/lib/extraction/structure.ts`: the system prompt defines each document type and the fields to return per type (statement balances and totals, payroll employees, invoice/receipt fields, sales report totals, "other"), tells the model to return no transactions for bank statements, one transaction per receipt/invoice/day of a sales report, and to split a file into one document per logical document; `structureContent` and `structureText` validate with `extractionOutputSchema` and accept an optional `forcedType` that adds "this document is a <type>" to the prompt; chunked text merges documents of the same type and period
- [x] T020 [US1] Add `packages/ai/src/lib/extraction/documents-to-records.ts` turning each extracted document into stored shapes: details in minor units (decimals x 100 rounded, like `toMinorUnits`), payroll lines with `employeeKey`, the payroll `staff` expense (amount = employer total cost when stated, otherwise gross total; date = period end; counterparty null; confidence = type confidence), and the ordinary records of the document with its ordinal; update `packages/ai/src/lib/extraction/money.ts` and `types.ts` (`ExtractFileResult` gains `documents[]` with `type`, `typeConfidence`, `period`, `currency`, `details`, `payrollLines`, `consistency`, `notes`, `records`; `records` stays the flat list for compatibility)
- [x] T021 [US1] Update `packages/ai/src/lib/extraction/confidence.ts` and `extract-file.ts`: run the consistency checks of T004 on every document, an `inconsistent` document or a type confidence below `recordMinConfidence` adds an issue and the outcome becomes `needs_review`; `extractFile(input, deps, { forcedType })` passes the forced type to the structuring step and tier escalation keeps working
- [x] T022 [US1] Persist in `apps/worker/src/app/extraction/extraction.service.ts`: after extraction call `documents.replaceForFile`, then `records.replaceExtracted` with each record's `documentId`; save payroll lines; update the file with `documentType` (type of the first document with the most records), `documentTypeConfidence`, and leave `documentTypeManual` untouched; when the file has `documentTypeManual = true` pass its type as `forcedType`; log only ids and counts (never names or amounts)
- [x] T023 [P] [US1] Update `apps/api/src/app/files/files.mapper.ts` and the file DTOs in `apps/api/src/app/dto.ts` to return `documentType`, `documentTypeConfidence` and `documentTypeManual`, and add the `documentType` query parameter (a document type or `unclassified`) to `filesQuerySchema` in `packages/shared/src/lib/files.ts` and to `GET /api/files` in `apps/api/src/app/files/files.controller.ts` with `@ApiQuery`
- [x] T024 [US1] Implement in `apps/api/src/app/files/files.service.ts` and `files.controller.ts`: `PATCH /api/files/:id/type` (zod body `{ documentType }`; sets type, manual flag true, status `received`, enqueues; 409 while `processing`), `POST /api/files/:id/reanalyze` (any finished file; 409 when `received`, `processing` or `queued_limit`), `GET /api/files/reanalyze/estimate` (count of files without a type; estimated cost = count x this month's average cost per file, or a default per file from the price table when there is no history; also `limitMicroUsd` and `remainingMicroUsd`) and `POST /api/files/reanalyze` (scope `unclassified`, enqueues each file through the normal queue); all with `@ApiOperation`, `@ApiResponse` and `@ZodResponse` where there is a body, and declare the static routes before `:id`
- [x] T025 [P] [US1] Web: show the type in `apps/web/src/app/components/files-table.tsx` (chip with the label or "Sin clasificar", and a type filter control) and in `apps/web/src/app/components/file-detail.tsx` (chip, confidence, a select to correct the type with a confirmation text "Se volverá a leer el archivo", and a panel with the type-specific data and consistency notes); add `updateFileType`, `reanalyzeFile`, `getReanalyzeEstimate`, `reanalyzeAll` to `apps/web/src/app/lib/files-api.ts`
- [x] T026 [US1] Web: add a "Re-analizar" button to unclassified files and a banner on `apps/web/src/app/(app)/files/page.tsx` ("N archivos sin clasificar") with a dialog component `apps/web/src/app/components/reanalyze-dialog.tsx` that fetches the estimate and shows the file count, the estimated cost and the remaining budget before confirming, with a warning that the monthly limit may leave some files waiting
- [x] T027 [P] [US1] Web tests in `apps/web/specs/files-types.spec.tsx`: the chip shows the label or "Sin clasificar", correcting the type calls the API, the dialog shows the estimate and only starts after confirming

**Checkpoint**: US1 delivers classified documents with their own data (MVP)

---

## Phase 4: User Story 2 - Bank statement metrics (Priority: P1)

**Goal**: Per-statement balances and flows, a balance-over-time chart, deposits versus withdrawals, and continuity gaps.

**Independent Test**: With consecutive statements, figures equal the documents, a missing month and a balance mismatch are flagged (quickstart scenario 4).

### Tests for User Story 2

- [x] T028 [P] [US2] Unit tests in `packages/shared/src/lib/results.spec.ts` for `buildBankStatementsView`: groups by currency and normalized account (statements without identifier grouped by currency), orders by period start, `netChangeMinor` = closing - opening, `flows` per month, a balance gap when opening differs from the previous closing beyond the tolerance, a missing period when the previous end plus one day is before the next start, unordered and duplicate-period input, and negative balances
- [x] T029 [P] [US2] Integration tests in `apps/api/src/app/documents/bank-statements.spec.ts`: `GET /api/documents/bank-statements?from&to` returns the figures of seeded statements, applies the period-end rule, reports gaps, marks an inconsistent statement, never mixes currencies, and returns 400 for bad dates
- [x] T030 [P] [US2] Web tests in `apps/web/specs/bank-statements.spec.tsx`: figures render, gaps are listed with both amounts, the empty state explains and links to `/upload`, and a failing request shows an error with a working "Reintentar"

### Implementation for User Story 2

- [x] T031 [US2] Add to `packages/shared/src/lib/results.ts` the zod response schema `bankStatementsViewSchema` of data-model.md and the pure `buildBankStatementsView(documents)` implementing T028 (gaps carry the statement ids and the two amounts or the missing date range), exported from `packages/shared/src/index.ts`
- [x] T032 [US2] Implement `GET /api/documents/bank-statements` in `apps/api/src/app/documents/documents.controller.ts` and `documents.service.ts`: query `documentsRepository.listByType('bank_statement', period)`, parse each `details` with the shared schema (skip and log the id of any row that does not parse), build the view per currency, with `@ApiQuery` for `from` and `to` and `@ZodResponse({ type: [BankStatementsViewDto] })`; add the DTO to `apps/api/src/app/dto.ts`
- [x] T033 [US2] Web: add `getBankStatements` to `apps/web/src/app/lib/files-api.ts` and `apps/web/src/app/components/results/bank-statements-tab.tsx` using `useSection`: a table of statements (period, opening, closing, deposits, withdrawals, fees, net change, consistency chip), the balance-over-time `SeriesLineChart` and a deposits-versus-withdrawals `GroupedBarChart`, a list of gaps with both amounts, an empty state, and "Requiere revisión" for inconsistent statements; wire it into the results page

**Checkpoint**: US1 + US2 working

---

## Phase 5: User Story 3 - Payroll metrics (Priority: P1)

**Goal**: Per-period payroll totals, per-employee table and history, consistent with the staff expense elsewhere.

**Independent Test**: Totals and rows equal the documents and the payroll total cost equals the staff expense of the dashboard for the same range (quickstart scenario 5).

### Tests for User Story 3

- [x] T034 [P] [US3] Unit tests in `packages/shared/src/lib/results.spec.ts` for `buildPayrollView` and `buildEmployeeHistory`: per period employees, gross, net, deductions, total cost (employer cost, or gross when not stated), per currency, ordering, and a history that groups name variants only when `employeeKey` is equal
- [x] T035 [P] [US3] Integration tests in `apps/api/src/app/documents/payroll.spec.ts`: `GET /api/documents/payroll`, `GET /api/documents/payroll/{documentId}` (lines; 404 for a non-payroll), `GET /api/documents/payroll/employees/{key}` (history; 404 unknown), and the consistency requirement: the sum of `totalCostMinor` for a range equals the `staff` expense total of `GET /api/records/totals` for the same range; also assert that no API log line contains an employee name
- [x] T036 [P] [US3] Web tests in `apps/web/specs/payroll.spec.tsx`: period totals render, selecting a period lists employees, selecting an employee shows their history, an inconsistent payroll is marked for review, and the empty state links to `/upload`

### Implementation for User Story 3

- [x] T037 [US3] Add to `packages/shared/src/lib/results.ts` the schemas `payrollViewSchema`, `payrollLineSchema`, `employeeHistorySchema` and the pure `buildPayrollView`, `buildEmployeeHistory` of T034
- [x] T038 [US3] Add to `packages/db/src/lib/repositories/documents.ts` `employeeHistory(employeeKey)` (lines joined to their payroll documents ordered by period) and implement in `apps/api/src/app/documents/` the endpoints `GET /api/documents/payroll`, `GET /api/documents/payroll/:documentId` and `GET /api/documents/payroll/employees/:key` (declare the static `employees` route before `:documentId`), with DTOs, `@ApiOperation`, `@ApiNotFoundResponse` and `@ZodResponse`
- [x] T039 [US3] Web: add `getPayroll`, `getPayrollLines`, `getEmployeeHistory` to `apps/web/src/app/lib/files-api.ts` and `apps/web/src/app/components/results/payroll-tab.tsx`: per-period table (employees, gross, net, deductions, total cost, consistency), a `GroupedBarChart` of gross, net and total cost per period, an employee table for the selected period, an employee history panel, empty state; wire it into the results page

**Checkpoint**: Payroll visible and consistent with staff cost

---

## Phase 6: User Story 4 - Losses are highlighted (Priority: P1)

**Goal**: Periods where expenses exceed income are highlighted with amounts, main categories, cumulative result and summary figures.

**Independent Test**: Exactly the losing periods are flagged with the right amounts, and week/month switching recalculates (quickstart scenario 6).

### Tests for User Story 4

- [x] T040 [P] [US4] Unit tests in `packages/shared/src/lib/results.spec.ts` for `analyzeResults`: a period with expenses above income is a loss, equal amounts are not, profitable periods are not flagged, `netMinor` and `cumulativeNetMinor`, `losingPeriods` and `largestLossMinor`, top expense categories of a period ordered by amount, unconfirmed amount per period, currencies never mixed, empty input, and income-only or expense-only periods
- [x] T041 [P] [US4] Integration tests in `apps/api/src/app/records/results.spec.ts`: seed records over several weeks and months and assert that feeding `GET /api/records/totals` rows to `analyzeResults` flags exactly the known losing periods for both `groupBy=week` and `groupBy=month`, excluding files in review and merged duplicates
- [x] T042 [P] [US4] Web tests in `apps/web/specs/results-losses.spec.tsx`: loss periods are highlighted and profit periods are not, selecting a loss shows its categories, the summary shows net result, number of losing periods and largest loss, switching week/month refetches, and "no losses" shows a message instead of alerts

### Implementation for User Story 4

- [x] T043 [US4] Add to `packages/shared/src/lib/results.ts` the pure `analyzeResults(rows: TotalsRow[])` returning per currency `{ currency, periods: [{ bucketStart, incomeMinor, expensesMinor, netMinor, isLoss, topExpenseCategories, cumulativeNetMinor, unconfirmedMinor }], losingPeriods, largestLossMinor, totalNetMinor }` and its zod types
- [x] T044 [P] [US4] Add `NetBarChart` to `apps/web/src/app/components/charts.tsx`: bars above and below a zero line (profit in the success color, loss in the danger color), formatted axis, `<title>` per bar, `aria-label` and the same hidden data table fallback as the other charts
- [x] T045 [US4] Web: create `apps/web/src/app/components/results/losses-tab.tsx` (the default tab): week/month toggle, `getTotals` for the period, `analyzeResults`, summary figures (income, expenses, net result, losing periods, largest loss), the `NetBarChart`, a list of losing periods that opens the category breakdown of the selected one, labels for unconfirmed amounts and a currency switcher when needed, empty states; wire it into the results page as the first tab

**Checkpoint**: Losses visible (the four P1 stories are complete)

---

## Phase 7: User Story 5 - Invoices, receipts and sales reports (Priority: P2)

**Goal**: Document-specific metrics for invoices and receipts and for sales reports.

**Independent Test**: Totals, taxes, paid/pending, top counterparties, units, average ticket and best products equal the documents (quickstart scenario 7).

### Tests for User Story 5

- [x] T046 [P] [US5] Unit tests in `packages/shared/src/lib/results.spec.ts` for `buildCommercialView` (totals, taxes treated as 0 when absent, paid versus pending versus unknown, top counterparties grouped by normalized name, per kind and per currency) and `buildSalesView` (total sales, units, average ticket null without a transaction count, best products, series by day or week)
- [x] T047 [P] [US5] Integration tests in `apps/api/src/app/documents/commercial-sales.spec.ts` for `GET /api/documents/commercial` (period by issue date) and `GET /api/documents/sales` (best products from line items, series from sales transactions of the period), plus 400 for bad dates and owner isolation
- [x] T048 [P] [US5] Web tests in `apps/web/specs/commercial-sales.spec.tsx`: figures, top counterparties, paid versus pending, best products, empty states, and "Otro" documents listed for classification

### Implementation for User Story 5

- [x] T049 [US5] Add to `packages/shared/src/lib/results.ts` the schemas `commercialViewSchema` and `salesViewSchema` and the pure `buildCommercialView`, `buildSalesView` of T046
- [x] T050 [US5] Implement `GET /api/documents/commercial` and `GET /api/documents/sales` in `apps/api/src/app/documents/` (sales: documents of type `sales_report` by period end, best products and series from the line items and transactions linked to those documents), with DTOs and Swagger decorators, and add a query to `packages/db/src/lib/repositories/documents.ts` for the sales series and best products
- [x] T051 [P] [US5] Web: `getCommercial`, `getSales` in `apps/web/src/app/lib/files-api.ts`; `apps/web/src/app/components/results/commercial-tab.tsx` (invoice/receipt switch, totals, taxes, paid versus pending, top counterparties with `HorizontalBars`) and `sales-tab.tsx` (total sales, units, average ticket, best products, `SeriesLineChart` of sales over time), each with empty states; wire both into the results page and add a small "Otros documentos" list (files of type `other`) with a link to correct their type

**Checkpoint**: All document types have their view

---

## Phase 8: User Story 6 - Explore from any figure to its source documents (Priority: P3)

**Goal**: Period and type filters everywhere, and the documents and records behind any figure.

**Independent Test**: Select a loss period and a statement balance and see the documents and records behind it, adding up to the figure (quickstart scenario 8).

### Tests for User Story 6

- [x] T052 [P] [US6] Tests for the new record filters: `recordsQuerySchema` accepts `documentType` and `documentId` in `packages/shared/src/lib/records.spec.ts`; integration tests in `apps/api/src/app/records/records.filters.spec.ts` that `GET /api/records?documentType=payroll` returns only records of that type (using `coalesce(document.type, file.document_type)`), `documentId` returns the records of one document, and the sum of the listed amounts equals the corresponding figure of the view
- [x] T053 [P] [US6] Web tests in `apps/web/specs/source-drawer.spec.tsx`: selecting a bar or row opens the drawer with the records and file links, the listed amounts add up to the figure, and changing the period or type filter updates every tab

### Implementation for User Story 6

- [x] T054 [US6] Add `documentType` and `documentId` to `recordsQuerySchema` in `packages/shared/src/lib/records.ts`, apply them in `applyFilters` of `packages/db/src/lib/repositories/records.ts` (left join to `extracted_documents`, type = `coalesce(document.type, file.document_type)`), document them with `@ApiQuery` in `apps/api/src/app/records/records.controller.ts`
- [x] T055 [US6] Web: create `apps/web/src/app/components/results/source-drawer.tsx` (a panel listing the records for a filter with date, amount, category, counterparty and a link to the file, with the total at the bottom) and open it from the loss periods, statement rows, payroll periods, counterparties and best products of the tabs
- [x] T056 [US6] Web: add a document-type filter next to the period picker in `apps/web/src/app/(app)/results/page.tsx` that narrows the loss tab and the drawer; each tab keeps using its own type; changing either filter refreshes every tab together _(Implemented as a document-type filter inside the source panel, not next to the period picker.)_

**Checkpoint**: All user stories are independently functional

---

## Phase 9: Polish & Cross-Cutting Concerns

- [x] T057 [P] Regenerate the API spec with `pnpm openapi`, confirm `pnpm nx run api:openapi-check` passes, and compare `apps/api/openapi/openapi.yaml` with `specs/003-document-type-metrics/contracts/documents-api.openapi.yaml` (every path and the new query parameters present)
- [x] T058 [P] Add a short note to `infra/README.md` that this feature adds a migration applied by `pnpm db:migrate`/`pnpm start`, and that older files appear as "Sin clasificar" until re-analyzed
- [x] T059 [P] Privacy check: run an extraction of a payroll fixture through `ExtractionService` with a captured logger and assert no log line (nor any error message stored as `failureReason` or consistency note) contains an employee name; fix any leak found (FR-019)
- [x] T060 [P] Check the five tabs at 360 px wide and in dark mode by reading the layout classes (no fixed widths beyond their card, tables scroll inside their card, every chart has its text alternative) and fix findings; note in the task that it was not checked in a real browser
- [ ] T061 Measure SC-005 with about 1,000 seeded documents over 5 years (seed through the repositories, not by uploading; remove afterwards): time each view's database queries, record the results in `specs/003-document-type-metrics/quickstart.md`, and add an index in a new migration only if a view exceeds 3 s _(Not run: needs a seeded local stack; pending.)_
- [ ] T062 Extraction accuracy check (SC-001, SC-002): when an `ANTHROPIC_API_KEY` is available, run 5 real documents per type through the pipeline and record how many types and key figures matched; otherwise record that the live check was not run and rely on the fixtures _(Not run: no readable `ANTHROPIC_API_KEY`; pending.)_
- [ ] T063 Run every scenario of `specs/003-document-type-metrics/quickstart.md` against the local stack and note which could not run (for example live extraction without a key) _(Not run end to end in a browser; covered by the automated tests; pending.)_
- [x] T064 Run `billy-verify` (format, lint, test, typecheck, build on affected projects), fix failures, and include `pnpm nx run api:openapi-check`; run `typecheck` before `build` or delete `apps/<app>/dist` between them (see `infra/README.md`)
- [x] T065 Run the `billy-boundary-reviewer` and `billy-infra-reviewer` checklists on the diff (inline if agents are not spawned): `apps/web` imports only `@org/shared`, `ai` and `db` import only `shared`, no new env var, compose or port

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup; BLOCKS all stories. Order: T002 -> T003 -> T006; T004 can run beside T003; T007/T008 -> T009 (migration) -> T010/T011 -> T012; T013-T015 are independent of the database tasks
- **US1 (P1)**: after Foundational. It is the foundation of US2-US6 because they read the documents it stores
- **US2, US3, US5 (and US4's data)**: after US1 for real data; their pure shared builders and views can be built and unit-tested right after Foundational with seeded rows
- **US4 (P1)**: after Foundational (it uses the existing totals, not the new tables); can be developed in parallel with US1
- **US6 (P3)**: after the tabs it links from exist (US2-US5)
- **Polish**: after the desired stories

### Within Each Story

Tests -> shared pure logic and schemas -> db queries -> api endpoints -> web. Tasks that edit the same file run in order: `packages/shared/src/lib/documents.ts` (T002, T003), `packages/shared/src/lib/results.ts` (T031, T037, T043, T049), `apps/api/src/app/documents/documents.controller.ts`/`documents.service.ts` (T013, T032, T038, T050), `packages/db/src/lib/repositories/documents.ts` (T010, T038, T050), `apps/web/src/app/lib/files-api.ts` (T025, T033, T039, T051), `apps/web/src/app/(app)/results/page.tsx` (T014, T033, T039, T045, T051, T056) and `apps/worker/src/app/extraction/extraction.service.ts` (T017, T022).

### Parallel Opportunities

- Foundational: T002+T004 together, then T005; T007 beside T013-T015
- US1: T016, T017, T018 and T027 test tasks together; T023 and T025 beside backend work
- US2: T028-T030 together; US3: T034-T036 together; US4: T040-T042 together; US5: T046-T048 together
- US4 can start as soon as Foundational is done, in parallel with US1
- Different stories can proceed in parallel after Foundational, except for the shared files listed above

### Parallel Example: User Story 2

```bash
Task: "Unit tests for buildBankStatementsView in packages/shared/src/lib/results.spec.ts"
Task: "Integration tests in apps/api/src/app/documents/bank-statements.spec.ts"
Task: "Web tests in apps/web/specs/bank-statements.spec.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup, Phase 2 Foundational, Phase 3 US1
2. **STOP and VALIDATE**: quickstart scenarios 1 to 3: files show their type and type-specific data, type correction and re-analysis work
3. Demo: this alone already tells the owner what each document is and keeps its detailed data

### Incremental Delivery

1. Foundation + US1 -> classified documents with their own data (MVP)
2. - US4 -> losses highlighted (independent of US1's data, quick win)
3. - US2 -> bank statement metrics
4. - US3 -> payroll metrics
5. - US5 -> invoices, receipts and sales reports
6. - US6 -> drill-down and filters
7. Polish -> OpenAPI, privacy, accessibility, timings, verification

---

## Notes

- [P] tasks touch different files and have no dependency on incomplete tasks
- Product decision to confirm (plan research R3): bank statement movements are not stored as transactions, so statements show in their own view but not in the general expense and income totals
- Changing `extractedDocumentSchema` breaks every existing extraction fixture at once; T001 lists them and T006/T016/T017 update them together
- Very long documents are split into 40,000-character parts; type-specific totals printed at the end may be lost, which the consistency check turns into a review (plan risk)
- Known uses of the old extraction contract (T001): `packages/shared/src/lib/records.ts` and `records.spec.ts` (T006), `packages/ai/src/lib/extraction/structure.ts` (T019), `confidence.ts` and `confidence.spec.ts` (T016, T021), `extract-file.ts` (T021); the fixtures in `structure.spec.ts`, `extract-file.spec.ts` and `apps/worker/src/app/extraction/extraction.service.spec.ts` (T016, T017)
- Commit per task or logical group with Conventional Commits (for example `feat(db): add document type tables`)
