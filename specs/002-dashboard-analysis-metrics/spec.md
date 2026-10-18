# Feature Specification: Dashboard Analysis Metrics

**Feature Branch**: `002-dashboard-analysis-metrics`

**Created**: 2026-10-18

**Status**: Draft

**Input**: User description: "I want to show on the dashboard the metrics we are getting from the documents the user analyzes. Add the relevant information from the analyses to the dashboard."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - See how my document analysis is going (Priority: P1)

The owner opens the dashboard and sees real figures about the documents they have uploaded and analyzed: how many files were received, how many finished successfully, how many need attention or failed, how long analysis typically takes, and how activity evolved over time. The demonstration numbers shown today are replaced by these real ones.

**Why this priority**: The dashboard is the first screen the owner sees. Showing invented numbers is misleading, and the activity of the analysis is the most direct "metric we are getting" from their documents.

**Independent Test**: Upload a mix of files (some succeed, one fails, one needs review), open the dashboard and verify every figure equals what the files list shows for the same period.

**Acceptance Scenarios**:

1. **Given** the owner has uploaded files in the selected period, **When** they open the dashboard, **Then** they see the number of files received, completed, in review, failed and still in progress, and these numbers match the files list.
2. **Given** analyses finished at different times, **When** the dashboard loads, **Then** it shows the average analysis time and a success rate (completed over finished files).
3. **Given** uploads happened over several days or weeks, **When** the dashboard loads, **Then** a chart shows uploads and finished analyses over time for the selected period.
4. **Given** the owner has uploaded no files, **When** they open the dashboard, **Then** they see an empty state that explains the dashboard fills in as documents are analyzed and links to the upload screen, with no fake data.
5. **Given** a file is still being analyzed, **When** the owner keeps the dashboard open, **Then** the figures update on their own as files finish, without reloading the page.

---

### User Story 2 - See my business numbers from the analyzed documents (Priority: P1)

The owner sees a summary of the business money found in their documents for the selected period: total expenses, total income, the difference between them, how much of the expenses goes to staff, expenses by category, and how these evolve week by week. The amounts that are not yet confirmed are clearly shown as such.

**Why this priority**: Extracting financial data is the reason documents are analyzed. Seeing the result at a glance is the core value of the dashboard for a business owner.

**Independent Test**: With processed files covering several weeks, check that the dashboard totals for expenses, income and staff equal the totals of the analysis screen for the same dates, and that a file waiting for review is excluded.

**Acceptance Scenarios**:

1. **Given** processed files with expenses and income, **When** the dashboard loads, **Then** it shows total expenses, total income and their difference for the period, in the business currency.
2. **Given** records classified as staff costs, **When** the dashboard loads, **Then** it shows the staff total and its share of all expenses.
3. **Given** records in several categories, **When** the dashboard loads, **Then** it shows the expense breakdown by category, largest first.
4. **Given** records over several weeks, **When** the dashboard loads, **Then** a chart compares expenses and income per week.
5. **Given** some amounts are not confirmed by the owner, **When** the dashboard loads, **Then** the unconfirmed portion is shown separately and the dashboard says it is included in the totals.
6. **Given** files in review or merged duplicate records, **When** the dashboard loads, **Then** they are excluded from the totals, consistently with the analysis screen.

---

### User Story 3 - Know what needs my attention (Priority: P2)

The owner sees, without searching, the items that need action: files waiting for review, files that failed, files waiting because the analysis budget was reached, possible duplicate records, and the amount still unconfirmed. Each item shows its count and takes them to the place where they can act.

**Why this priority**: Numbers are only trustworthy once pending reviews are resolved. Surfacing them turns the dashboard into a to-do entry point.

**Independent Test**: Create one file of each pending kind, open the dashboard, and confirm each counter is right and each link lands on the matching list or review screen; resolve one and see the counter drop.

**Acceptance Scenarios**:

1. **Given** files in review, failed or waiting for budget, **When** the dashboard loads, **Then** each group appears with its count and a link to the filtered files list.
2. **Given** possible duplicate records, **When** the dashboard loads, **Then** their count appears with a link to resolve them.
3. **Given** nothing needs attention, **When** the dashboard loads, **Then** a short "all clear" message appears instead of empty counters.
4. **Given** the owner resolves an item, **When** they return to the dashboard, **Then** the counters reflect it.

---

### User Story 4 - See the most relevant products (Priority: P2)

The owner sees the products bought and sold most in the period, with quantities and amounts, taken from the line items of the analyzed documents.

**Why this priority**: Product lists are part of the business analysis this product promises, and give quick insight into what drives purchases and sales.

**Independent Test**: With documents containing purchased and sold items, check the top lists match the product tables of the analysis screen.

**Acceptance Scenarios**:

1. **Given** purchase line items, **When** the dashboard loads, **Then** the top purchased products appear with quantity and total.
2. **Given** sale line items, **When** the dashboard loads, **Then** the top sold products appear with quantity and total.
3. **Given** no line items, **When** the dashboard loads, **Then** these lists show a short explanation instead of empty tables.

---

### User Story 5 - Understand analysis cost and reading method (Priority: P3)

The owner sees how much analysis cost this month, the limit if one is set, the average cost per file, and the share of files read with the free methods (direct reading or text recognition) versus the paid AI method.

**Why this priority**: Cost control is an explicit concern of the product, but the dashboard is useful without it.

**Independent Test**: Process files with different reading methods and compare the shown cost, average and share with the costs summary of the files screen.

**Acceptance Scenarios**:

1. **Given** analyses with recorded cost, **When** the dashboard loads, **Then** it shows the month cost, the limit (if any) and the average cost per file.
2. **Given** files read with different methods, **When** the dashboard loads, **Then** it shows the share of each method.
3. **Given** the limit was reached, **When** the dashboard loads, **Then** a visible warning explains that new files wait until the limit is raised or the month changes.

---

### User Story 6 - Choose the period I want to look at (Priority: P3)

The owner can change the period of the dashboard (for example last 7 days, last 30 days, last 90 days, this month or a custom range) and every section responds to it.

**Why this priority**: Different questions need different time frames, but a sensible default already makes the dashboard useful.

**Independent Test**: Change the period and verify all sections change together and equal the same period on the other screens.

**Acceptance Scenarios**:

1. **Given** the dashboard is open, **When** the owner selects another period, **Then** all sections update to that period.
2. **Given** the owner enters an invalid range (start after end), **When** they apply it, **Then** they see a clear message and the previous data stays.
3. **Given** the owner returns later, **When** they open the dashboard, **Then** it uses the default period (last 30 days).

---

### Edge Cases

- No documents analyzed yet, or none in the selected period (empty states, no division by zero in rates and averages).
- Files analyzed in several currencies (totals are never mixed across currencies).
- A very large number of files or records in the period (the dashboard stays fast).
- A section fails to load (the rest of the dashboard still shows, with a retry for the failed part).
- Data changes while the dashboard is open (new files finish, the owner confirms records elsewhere).
- Weeks that straddle the start or end of the selected period (partial first and last weeks are clearly labeled).
- Amounts of zero or negative corrections do not break percentages.
- The project selector in the sidebar: figures belong to the single business (see Assumptions).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The dashboard MUST show only real data from the owner's analyzed documents; the demonstration figures MUST be removed.
- **FR-002**: The dashboard MUST show counts of files by state (received, in progress, completed, in review, failed, waiting for budget) for the selected period.
- **FR-003**: The dashboard MUST show the average analysis time and the success rate (completed over finished files) for the selected period.
- **FR-004**: The dashboard MUST show uploads and finished analyses over time for the selected period.
- **FR-005**: The dashboard MUST show total expenses, total income and their difference for the selected period, per currency.
- **FR-006**: The dashboard MUST show the staff expense total and its share of total expenses.
- **FR-007**: The dashboard MUST show the expense breakdown by category and expenses versus income per week.
- **FR-008**: Financial figures MUST follow the same rules as the analysis screen (exclude files in review and merged duplicates, include unconfirmed amounts) and MUST show the unconfirmed portion separately.
- **FR-009**: The dashboard MUST show counters for files in review, failed files, files waiting for budget, possible duplicate records and the unconfirmed amount, each linking to where the owner can act.
- **FR-010**: The dashboard MUST show the top purchased and top sold products with quantity and total.
- **FR-011**: The dashboard MUST show the month analysis cost, the limit when set, the average cost per file, the share of files per reading method, and a warning when the limit is reached.
- **FR-012**: The dashboard MUST let the owner choose the period (presets and a custom range), validate it, apply it to every section and default to the last 30 days.
- **FR-013**: The dashboard MUST show a helpful empty state when there is no data and MUST NOT show invented numbers.
- **FR-014**: The dashboard MUST refresh by itself while files are still being analyzed and MUST let the owner refresh it manually.
- **FR-015**: A failure in one section MUST NOT prevent the others from showing, and the failed section MUST offer a retry.
- **FR-016**: The dashboard MUST remain usable on narrow (phone) screens and MUST label every figure with its unit and period.
- **FR-017**: Every figure on the dashboard MUST equal the figure the owner finds for the same period on the files and analysis screens.

### Key Entities

- **Dashboard Period**: The date range every section uses; has a start, an end and a preset name.
- **Activity Summary**: Counts of files by state, success rate, average analysis time and a time series of uploads and finished analyses.
- **Financial Summary**: Per currency, totals of expenses, income, difference, staff expenses, unconfirmed portion, category breakdown and weekly series.
- **Attention Items**: Counts of files in review, failed, waiting for budget, possible duplicates and the unconfirmed amount.
- **Product Highlights**: Top purchased and top sold products with quantity and total.
- **Cost Summary**: Month cost, optional limit, average per file and share per reading method (already available from the previous feature).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: The dashboard shows complete figures in under 3 seconds for an owner with up to 1,000 analyzed files in the period.
- **SC-002**: For any period, 100% of the dashboard figures equal the corresponding figures on the files and analysis screens (zero discrepancies in testing).
- **SC-003**: With no analyzed documents, 0 invented figures appear and the owner sees a way to upload their first file.
- **SC-004**: An owner can reach the list of files needing attention from the dashboard in one click.
- **SC-005**: After a file finishes analysis, the dashboard figures reflect it within 10 seconds without the owner reloading.
- **SC-006**: Changing the period updates the whole dashboard in under 2 seconds.
- **SC-007**: In a usability check, 4 out of 5 owners can answer "how much did I spend and earn this month and what needs my review?" from the dashboard alone, in under 1 minute.
- **SC-008**: The dashboard is fully usable on a 360 px wide screen with no horizontal scrolling of the page.

## Assumptions

- The dashboard covers the single business of this version (one fixed owner, no login). The project selector in the sidebar does not filter the figures yet, and the dashboard stops presenting itself as a per-project demonstration.
- Metrics are computed from data already collected by the file upload and analysis feature: files, statuses, reading methods, costs, transactions and line items. No new documents or fields are required from the owner.
- The default period is the last 30 days; presets are last 7, 30 and 90 days, this month and a custom range.
- The business currency is the one configured for the business; if documents use other currencies, each currency is shown separately and never added together.
- Weeks follow the business week-start setting already in use by the analysis screen.
- "Finished" files are those that reached completed, in review or failed; "analysis time" is measured from the start to the end of processing.
- Export, scheduled reports, alerts by email, comparisons with previous periods and target setting are out of scope for this version.
- The analysis screen (`/records`) and files screen remain available; the dashboard links to them for detail.
