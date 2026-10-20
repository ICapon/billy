# Research: Document Type Metrics and Losses

No `NEEDS CLARIFICATION` items remain from the spec. Decisions below resolve the technical unknowns.

## R1. Classify and extract in the same model call

- **Decision**: The existing structuring call (cheap text model, vision on escalation) now returns `{ documents: [...] }`. Each item has `type`, `typeConfidence`, `period`, `currency`, type-specific `details`, and its `transactions`. The system prompt defines each type and its fields; the file's overall type is the type of its first document with the most records.
- **Rationale**: Keeps the "one call per reading attempt" cost profile (FR-020) and the existing tiering. Mixed files (a PDF with receipts and an invoice) become several documents in one answer (spec edge case).
- **Alternatives**: A first call to classify and a second to extract (about double the calls and latency); a classifier from filenames or keywords (unreliable).
- **Risk**: A bigger output contract. Mitigated with fake-LLM fixtures per type; inputs over 40,000 characters are split into parts, so type-specific totals printed at the end of a very long document may be missing: those files fail the consistency check and go to review.

## R2. Storage shape: documents table with JSON details, relational payroll lines

- **Decision**: A new `extracted_documents` table (one row per logical document: file id, type, type confidence, manual flag, period start/end, currency, consistency state and notes, and `details` as JSON validated by the shared zod schema of that type) and a `payroll_lines` table (one row per employee: normalized employee key, name, gross, deductions, net). Transactions get a nullable `document_id` (set null on delete) so figures can be traced back and filtered by type.
- **Rationale**: Bank statement, invoice and sales report details are read per document or summed over a few hundred rows, which JSON handles with one table and no migration per type. Payroll needs per-employee history and aggregation, so it gets real rows. The JSON is always parsed with the shared schema, so the zod contract stays the single source of truth.
- **Alternatives**: One table per type (more migrations, entities and repositories for little gain now); JSON for payroll lines too (awkward employee history queries).

## R3. What is stored as transactions for each type

- **Decision**: _Bank statements_: only the summary (opening/closing balance, deposits, withdrawals, fees) is stored; the individual movements are not turned into transactions. _Payroll_: one expense transaction in category `staff`, amount = employer total cost when stated, otherwise total gross pay. _Invoices/receipts_: as today (one transaction with line items, expense or income by perspective). _Sales reports_: one income transaction per day when the report lists days, otherwise one for the period, with the products as line items.
- **Rationale**: Statement movements pay invoices and payroll that are uploaded as their own documents, so storing them as transactions would double count expenses and flood the records list; reconciliation is out of scope. Payroll as a `staff` expense keeps the general staff total equal to the payroll view (FR-015).
- **Alternatives**: Statement movements as transactions flagged as bank movements and excluded from totals by default (kept as a future option; more data and a new exclusion rule).
- **Needs confirmation**: Owners who only upload bank statements will see balances and cash flow in the statements view but nothing from them in the general expense/income totals. This is the one product decision the plan makes on its own.

## R4. Consistency checks

- **Decision**: Pure functions in `@org/shared`: bank statement (`opening + deposits - withdrawals - fees = closing`), payroll (`gross - deductions = net` for each line and for the totals, and employer cost not below gross when stated), commercial (`subtotal + tax = total` when all three exist), sales report (sum of day or product totals equals the total when listed). Tolerance: the larger of 0.01 and 1% of the reference amount, the same rule already used for line items. A failed check stores `inconsistent` plus readable notes, and the file goes to `needs_review`.
- **Rationale**: Cheap, deterministic and independent of the model; directly serves SC-008.

## R5. Manual type correction

- **Decision**: `PATCH /api/files/:id/type` sets the type and a manual flag and re-enqueues the file with that type forced: the prompt states "this document is a <type>" and classification is skipped. Re-reading replaces the file's documents and unconfirmed records; confirmed records stay (existing behavior of `replaceExtracted`).
- **Rationale**: Reuses the whole pipeline and cost guard; the flag stops later automatic runs from overriding the owner's choice.

## R6. Re-analysis of older files

- **Decision**: Files with no `document_type` are "Not classified". `POST /api/files/:id/reanalyze` works on any finished file. `GET /api/files/reanalyze/estimate` returns how many files would be re-analyzed and an estimated cost (count x the month's average cost per file, or a per-tier default price when there is no history); `POST /api/files/reanalyze` (scope `unclassified`) enqueues them. Everything goes through the normal queue, so the monthly limit still applies: files over the limit wait as "En cola (límite alcanzado)".
- **Rationale**: Matches the spec's manual re-analysis and the cost-control principle; the estimate is honest about being an estimate.

## R7. Loss analysis from existing totals

- **Decision**: A pure `analyzeResults(rows, groupBy)` in `@org/shared` takes the rows of `/records/totals` and returns, per currency, each period with income, expenses, net, a loss flag, its top expense categories, plus the cumulative net, the number of losing periods and the largest loss. No new SQL; week/month switching just changes `groupBy`.
- **Rationale**: Same rows as the rest of the app, so inclusion rules and unconfirmed labeling are identical (FR-014); pure function is easy to test (SC-003).

## R8. Bank statement continuity

- **Decision**: Group statements by normalized account identifier (statements without identifier are grouped by currency) and order them by period start. Flag a _balance gap_ when a statement's opening balance differs from the previous closing balance beyond the tolerance, and a _missing period_ when the previous period end plus one day is before the next period start. Pure function in `@org/shared`.
- **Rationale**: Matches the spec scenarios without needing bank connections.

## R9. Payroll identity

- **Decision**: Employees are keyed by the same normalization used for counterparties (lower case, no accents or punctuation, collapsed spaces); history is by key. Variants beyond that are not merged (out of scope).
- **Rationale**: Predictable and testable; avoids wrong merges of different people.

## R10. Period rules per view

- **Decision**: Bank statements and payroll are included when their _period end_ falls inside the selected range; invoices and receipts by _issue date_; sales reports by _period end_. Records follow `occurred_on` as today. Every view says which rule it uses.
- **Rationale**: One simple rule per type; avoids partial-period surprises.

## R11. API shape

- **Decision**: One read endpoint per view under `/api/documents/` (`bank-statements`, `payroll`, `payroll/employees/{key}`, `commercial`, `sales`), each returning ready-to-chart data validated by shared zod schemas; the loss view reuses `/records/totals`. Drill-down uses `GET /api/records` with new `documentType` and `documentId` filters and `GET /api/files` with `documentType`.
- **Rationale**: Same pattern as the dashboard endpoints; each tab loads and fails independently.

## R12. Web structure

- **Decision**: A `/results` page with tabs, each tab a self-contained client section (the section shell and `useSection` hook from the dashboard are reused), a shared period and type filter, and a drill-down drawer listing the records and files behind a figure. The files list and file detail show a type chip, allow correcting the type, and show "Not classified" with re-analyze actions and the cost warning.
- **Rationale**: Reuses proven pieces; keeps failures isolated per tab.

## R13. Charts

- **Decision**: Extend `components/charts.tsx` with `NetBarChart` (bars above/below a zero line, losses in the danger color, with the same accessible table fallback); other views reuse `SeriesLineChart` and `GroupedBarChart`.
- **Rationale**: No new dependency; consistent look.

## R14. Privacy

- **Decision**: Employee names appear only in API responses to the owner and in the UI; logs and error messages keep ids and counts only (the worker already logs ids). Zod error text sent back to the model does not include field values.
- **Rationale**: FR-019.
