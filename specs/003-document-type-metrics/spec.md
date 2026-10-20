# Feature Specification: Document Type Metrics and Losses

**Feature Branch**: `003-document-type-metrics`

**Created**: 2026-10-18

**Status**: Draft

**Input**: User description: "The user can see the extracted and analyzed data of everything they upload as charts and metrics: totals, losses, and the relevant data of each document type (bank statements, payroll, receipts, invoices, sales reports, etc.). A general dashboard with expenses/income, activity and products already exists; this must go further by showing, per document type, the metrics specific to that document (for example in bank statements: opening and closing balance, deposits, withdrawals, fees; in payroll: employees, gross and net pay, deductions, total cost per period) and highlighting losses (periods where expenses exceed income)."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Each document is recognized by type and keeps its own data (Priority: P1)

When a document is analyzed, the system recognizes what kind of document it is (bank statement, payroll, invoice, receipt, sales report or other) and extracts the data that matters for that kind, not only dates and amounts. The owner sees the type of every file, can correct it if it is wrong, and can re-analyze older files so they also get their type-specific data.

**Why this priority**: Every metric in the rest of this feature depends on knowing the type of each document and having its specific data. Without it, nothing type-specific can be shown.

**Independent Test**: Upload one document of each type, check that each file shows the right type and the type-specific data on its detail screen, change one wrong type and confirm the data is re-read for the new type.

**Acceptance Scenarios**:

1. **Given** a newly analyzed document, **When** analysis finishes, **Then** the file shows a type (bank statement, payroll, invoice, receipt, sales report or other) and the data specific to that type, next to the general records.
2. **Given** a document of unclear type, **When** analysis finishes, **Then** it is marked as "Other" with a low-confidence indicator and still contributes its general records.
3. **Given** a file with the wrong type, **When** the owner changes the type, **Then** the file is read again for the new type and the previous type-specific data is replaced, keeping anything the owner had confirmed.
4. **Given** files analyzed before this feature, **When** the owner opens the files list, **Then** they appear as "Not classified" with a clear action to re-analyze one file or all of them, showing before starting that re-analysis may use paid analysis.
5. **Given** the owner re-analyzes a file, **When** it finishes, **Then** its type and type-specific data appear and its confirmed records are preserved.

---

### User Story 2 - Bank statement metrics (Priority: P1)

The owner sees, for bank statements, the opening and closing balance of each statement, the total deposits, total withdrawals and fees, the net change, and how the balance evolved over the period. Gaps in continuity between consecutive statements are flagged.

**Why this priority**: Bank statements are named explicitly by the owner and answer the most basic question: how much money came in, went out and what is left.

**Independent Test**: With two or three consecutive bank statements, verify the displayed balances, deposits, withdrawals and fees equal the figures printed on the documents, and that a missing month is flagged.

**Acceptance Scenarios**:

1. **Given** analyzed bank statements, **When** the owner opens the bank statements view, **Then** each statement shows its period, opening balance, closing balance, total deposits, total withdrawals, fees and net change.
2. **Given** several statements of the same account, **When** the view loads, **Then** a chart shows the balance over time and deposits versus withdrawals per period.
3. **Given** the closing balance of one statement differs from the opening balance of the next one for the same account, **When** the view loads, **Then** the gap is flagged with both amounts.
4. **Given** a statement whose totals do not reconcile with its own movements, **When** the view loads, **Then** it is marked for review instead of being presented as reliable.
5. **Given** no bank statements, **When** the owner opens the view, **Then** a short explanation and a link to upload one are shown.

---

### User Story 3 - Payroll metrics (Priority: P1)

The owner sees, for payroll documents, per pay period: number of employees, total gross pay, total net pay, total deductions and the total cost of the payroll to the business, plus a per-employee breakdown and how these totals evolve over time.

**Why this priority**: Payroll is named explicitly and is usually the largest, most sensitive expense of a small business.

**Independent Test**: With payroll documents of two periods, verify the totals and the per-employee rows equal the documents, and that the payroll total appears consistently as staff cost elsewhere.

**Acceptance Scenarios**:

1. **Given** analyzed payroll documents, **When** the owner opens the payroll view, **Then** each period shows employees, gross pay, net pay, deductions and total cost.
2. **Given** a period, **When** the owner selects it, **Then** a table lists each employee with gross pay, deductions and net pay.
3. **Given** several periods, **When** the view loads, **Then** a chart shows total cost, gross and net pay per period.
4. **Given** an employee appears in several periods, **When** the owner selects that employee, **Then** their pay history is shown.
5. **Given** a payroll document with gross, deductions and net that do not add up, **When** the view loads, **Then** it is marked for review.
6. **Given** payroll totals, **When** the owner compares with the general dashboard, **Then** the staff expense total matches for the same period.

---

### User Story 4 - Losses are highlighted (Priority: P1)

The owner sees clearly the periods where expenses were greater than income (a loss), how large each loss was, the cumulative result over time, and the biggest expense categories in the losing periods.

**Why this priority**: Spotting losses is the first thing a business owner wants from financial data, and it is named explicitly in the request.

**Independent Test**: With documents spanning months where some months have more expenses than income, verify exactly those periods are flagged, with the right amounts, and that periods with profit are not.

**Acceptance Scenarios**:

1. **Given** weekly and monthly totals, **When** the owner opens the results view, **Then** every period with expenses greater than income is highlighted with the loss amount, and profitable periods are shown as profit.
2. **Given** the highlighted losses, **When** the owner selects one, **Then** the main expense categories of that period are shown.
3. **Given** the selected range, **When** the view loads, **Then** it shows total income, total expenses, the net result, the number of losing periods and the largest loss.
4. **Given** the owner switches between weekly and monthly grouping, **When** the view reloads, **Then** losses are recalculated for that grouping.
5. **Given** a range with no losses, **When** the view loads, **Then** it says so instead of showing empty alerts.
6. **Given** amounts not yet confirmed or files in review, **When** the view loads, **Then** the same inclusion rules as the rest of the analysis apply and unconfirmed amounts are labeled.

---

### User Story 5 - Invoices, receipts and sales reports (Priority: P2)

The owner sees metrics specific to invoices and receipts (total invoiced or spent, taxes when present, top suppliers and customers, pending versus paid when stated) and to sales reports (total sales, units sold, average ticket, best-selling products and best days).

**Why this priority**: These are the most common documents, but the general dashboard already covers their totals; this adds the document-specific insight.

**Independent Test**: With invoices and a sales report, verify totals, taxes, top counterparties, units, average ticket and best sellers equal the documents.

**Acceptance Scenarios**:

1. **Given** analyzed invoices and receipts, **When** the owner opens that view, **Then** it shows the total amount, total taxes (when the documents state them), the number of documents and the top suppliers or customers with their totals.
2. **Given** invoices that state a paid or pending status, **When** the view loads, **Then** paid and pending amounts are shown separately.
3. **Given** analyzed sales reports, **When** the owner opens that view, **Then** it shows total sales, units sold, average ticket, best-selling products and a chart of sales by day or week.
4. **Given** documents of type "Other", **When** the owner opens the views, **Then** they contribute only to the general totals and are listed so the owner can classify them.

---

### User Story 6 - Explore from any figure to its source documents (Priority: P3)

The owner can filter every view by period and document type, and select any figure, chart bar or row to see the documents and records behind it.

**Why this priority**: Trust in the numbers depends on being able to see where they come from, but the views are useful without it.

**Independent Test**: Select a loss period and a bank statement balance and confirm the listed documents and records add up to the figure.

**Acceptance Scenarios**:

1. **Given** any chart bar or table row, **When** the owner selects it, **Then** the documents and records that make it up are listed with links to each file.
2. **Given** the period and type filters, **When** the owner changes them, **Then** all figures on the view update together.
3. **Given** a figure, **When** the owner adds up the listed records, **Then** the sum equals the figure.

---

### Edge Cases

- Documents that mix several types in one file (for example a PDF with receipts and an invoice) are split by record, each with its own type.
- A bank statement covering more than one month, or two accounts in the same document.
- Statements uploaded out of order, with missing months, or the same statement uploaded twice (duplicate detection still applies).
- Negative balances (overdraft), zero-amount movements, reversals and refunds.
- Payroll with partial periods, bonuses, employees who join or leave, or the same employee name spelled differently across documents.
- Documents in different currencies; figures are never added across currencies.
- Totals printed on the document that disagree with the sum of its own lines.
- Unreadable or low-quality documents, and types the system cannot recognize.
- A re-analysis that changes the type of a file with records the owner already confirmed.
- Very large histories (years of statements and payroll).
- Sensitive data: employee names and salaries are visible to the owner only, and are never written to logs.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST classify each analyzed document as bank statement, payroll, invoice, receipt, sales report or other, with a confidence indicator, and show the type on the files list and file detail.
- **FR-002**: The owner MUST be able to correct a document's type; the file is then re-read for that type and the previous type-specific data is replaced while confirmed records are kept.
- **FR-003**: The system MUST extract, for bank statements: account identifier (when shown), statement period, opening balance, closing balance, total deposits, total withdrawals and total fees.
- **FR-004**: The system MUST extract, for payroll: pay period, employees (name or identifier), gross pay, deductions, net pay per employee, and the employer's total cost when stated.
- **FR-005**: The system MUST extract, for invoices and receipts: counterparty, issue date, subtotal, taxes, total, and paid or pending status when stated.
- **FR-006**: The system MUST extract, for sales reports: report period, total sales, units sold, number of transactions when stated, and sales by product.
- **FR-007**: The system MUST check each document's own consistency (for example opening balance plus deposits minus withdrawals equals closing balance; gross minus deductions equals net) and mark inconsistent documents for review.
- **FR-008**: Files analyzed before this feature MUST show as "Not classified" and offer re-analysis of one file or of all of them, warning before a bulk re-analysis that it can use paid analysis and respecting the monthly cost limit.
- **FR-009**: The system MUST provide a bank statements view with per-statement figures, a balance-over-time chart, deposits versus withdrawals per period, and a flag for continuity gaps between consecutive statements of the same account.
- **FR-010**: The system MUST provide a payroll view with per-period totals (employees, gross, net, deductions, total cost), a per-employee table for the selected period, an employee pay history and a chart of totals over time.
- **FR-011**: The system MUST provide an invoices-and-receipts view with total amount, taxes, document count, top counterparties and paid versus pending amounts.
- **FR-012**: The system MUST provide a sales reports view with total sales, units, average ticket, best-selling products and sales over time.
- **FR-013**: The system MUST provide a results view that highlights every period (week or month, selectable) where expenses exceed income, with the loss amount, the net result over the range, the number of losing periods, the largest loss and the main expense categories of a selected losing period.
- **FR-014**: All figures MUST follow the inclusion rules already used by the analysis screen (files in review and merged duplicates excluded, unconfirmed amounts included but labeled) and MUST never mix currencies.
- **FR-015**: Staff cost shown in the payroll view MUST be consistent with the staff expense total of the general dashboard and analysis screen for the same period.
- **FR-016**: Every view MUST support period and document-type filters and MUST let the owner open the documents and records behind any figure, chart bar or row.
- **FR-017**: Every view MUST show a helpful empty state when there is no data of its type, linking to the upload screen, and MUST never show invented numbers.
- **FR-018**: Charts MUST have an accessible text alternative with the same numbers and MUST be usable on narrow screens.
- **FR-019**: Employee names and pay data MUST be shown only inside the owner's own views and MUST NOT appear in logs, error messages or unauthenticated links.
- **FR-020**: The system MUST record the cost of classification and type-specific extraction like any other analysis, and re-analysis MUST respect the monthly cost limit.

### Key Entities

- **Document Type**: One of bank statement, payroll, invoice, receipt, sales report, other, with a confidence indicator and an indication of whether the owner set it manually.
- **Bank Statement Data**: Per statement: account identifier, period, opening balance, closing balance, total deposits, total withdrawals, total fees, currency, consistency state.
- **Payroll Data**: Per document: pay period, currency, employer total cost, consistency state; with a line per employee: name or identifier, gross pay, deductions, net pay.
- **Invoice/Receipt Data**: Per document: counterparty, issue date, subtotal, taxes, total, paid or pending status.
- **Sales Report Data**: Per document: report period, total sales, units sold, transaction count, sales per product.
- **Result Period**: A week or month with income, expenses, net result and a loss flag, derived from the confirmed and unconfirmed records.
- **Source Link**: The connection from any figure to the documents and records it is made of.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: For clearly readable documents, at least 90% are assigned the correct type automatically.
- **SC-002**: For clearly readable bank statements, at least 90% show opening balance, closing balance, deposits and withdrawals that match the document exactly; for clearly readable payroll, at least 90% show gross, net and deductions totals that match.
- **SC-003**: 100% of periods where expenses exceed income are flagged as losses and 0 profitable periods are flagged (verified against known data).
- **SC-004**: Every figure equals the sum of the records listed behind it, and the staff cost of the payroll view equals the staff expense of the general dashboard for the same period (0 discrepancies in testing).
- **SC-005**: Every view shows its figures in under 3 seconds for an owner with up to 1,000 analyzed documents and 5 years of history.
- **SC-006**: An owner can correct a document's type in under 30 seconds and see the corrected data once the re-reading finishes.
- **SC-007**: In a usability check, 4 out of 5 owners can answer "was I at a loss last month, and how much did payroll cost me?" in under 1 minute.
- **SC-008**: 100% of documents that fail their own consistency check are flagged for review instead of being presented as reliable.
- **SC-009**: Re-analyzing all older files shows an estimated cost warning before starting and never exceeds the configured monthly limit.
- **SC-010**: All views are fully usable on a 360 px wide screen without horizontal scrolling of the page.

## Assumptions

- This feature builds on the upload, analysis, review, duplicate and dashboard features already delivered; it adds document classification, type-specific data and new views, and does not change how files are uploaded.
- There is a single business owner and no login yet; employee names and salaries are therefore visible to that owner only, and per-user access control is a later feature.
- The supported types are bank statement, payroll, invoice, receipt, sales report and "Other"; other types (tax filings, contracts, purchase orders) are out of scope and fall under "Other" with general records only.
- Re-analysis of older files is manual (per file or "all", with a cost warning) rather than automatic, to avoid unexpected spending.
- Weeks and months follow the business week-start and UTC date conventions already used by the analysis screen.
- Employees are identified by the name or identifier printed on the document; merging variants of the same name is out of scope except for obvious case and accent differences.
- A loss means that, for a chosen period, total expenses are greater than total income; profit-and-loss accounting concepts such as depreciation, accruals or taxes owed are out of scope.
- Reconciling bank statement movements against invoices and receipts, forecasting, budgets, exports and scheduled reports are out of scope for this version.
- Reading quality depends on the document; documents below the confidence threshold are sent to review as in the existing flow.
