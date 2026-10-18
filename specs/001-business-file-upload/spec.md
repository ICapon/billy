# Feature Specification: Business File Upload & Ingestion

**Feature Branch**: `001-business-file-upload`

**Created**: 2026-10-18

**Status**: Draft

**Input**: User description: "Need the file-upload flow. Files are stored so they can be analyzed by the AI workflow (agents, RAG, etc.). Read files in whatever way suits best — OCR or directly with the LLM — considering cost. The files feed business analysis: weekly expenses, weekly income, expense breakdown by week and by month, purchased products list, sold products list, staff expense breakdown, and date filters."

## Clarifications

### Session 2026-10-18

- Q: Should this feature include user login and per-user data separation, or a single fixed business owner for now? → A: No login yet; one fixed business owner, with every file and record tied to that owner so login can be added later.
- Q: Should totals include records the owner has not confirmed yet? → A: All extracted records count except those from files in "Needs review"; totals also report how much of the amount is unconfirmed.
- Q: How should the same transaction appearing in two files be handled? → A: Flag likely duplicates (same date, amount and counterparty) and ask the owner to keep both or merge them.
- Q: When a file is deleted, what happens to its records and the totals? → A: Everything is removed (file, content, records) after confirmation; totals update immediately and there is no undo.
- Q: What happens to files uploaded after the processing cost limit is reached? → A: They are stored and marked "Queued (limit reached)", then processed when the limit is raised or resets.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Upload business documents (Priority: P1)

A business owner uploads one or more documents (receipts, invoices, sales reports, payroll sheets, spreadsheets, photos of tickets) from the dashboard. Each file is stored safely and shown in a list with its processing status, so the owner knows it has been received and will be analyzed.

**Why this priority**: Without reliably stored files nothing else can happen. This alone delivers a usable document vault and the foundation for every analysis.

**Independent Test**: Upload a mix of valid files and confirm each appears in the file list with a status, can be re-opened/downloaded, and survives a page reload.

**Acceptance Scenarios**:

1. **Given** the owner is on the upload screen, **When** they select several supported files and confirm, **Then** every file is stored and listed with name, size, upload date and status "Received".
2. **Given** a file is uploading, **When** the upload progresses, **Then** the owner sees per-file progress and can continue using the app.
3. **Given** the owner selects an unsupported or oversized file, **When** they confirm, **Then** that file is rejected with a clear reason while the valid files still upload.
4. **Given** the same file was already uploaded, **When** the owner uploads it again, **Then** the system warns about the duplicate and lets the owner skip or keep both.

---

### User Story 2 - Automatic data extraction from files (Priority: P1)

After upload, the system reads each file and extracts the business data it contains: dates, amounts, whether it is an expense or an income, category (including staff costs), counterparty, and line items with product, quantity and price (labelled as purchase or sale). The owner sees the extracted result and its status (processing, completed, needs review, failed).

**Why this priority**: Extracted, structured data is what makes the files useful for all the planned analyses. Stored-only files give no insight.

**Independent Test**: Upload a clear receipt, a scanned/photographed ticket, and a spreadsheet; confirm each yields structured records visible to the owner and linked to the source file.

**Acceptance Scenarios**:

1. **Given** a file with readable text, **When** processing completes, **Then** the extracted records (date, amount, type, category, line items) are available and linked to the source file.
2. **Given** a scanned or photographed document, **When** processing runs, **Then** its content is still extracted, using the least costly reading method that achieves acceptable quality.
3. **Given** extraction cannot reach acceptable confidence, **When** processing finishes, **Then** the file is marked "Needs review" instead of silently producing wrong data.
4. **Given** processing fails, **When** the owner views the file, **Then** they see a failure status with a reason and can retry.

---

### User Story 3 - Review and correct extracted data (Priority: P2)

The owner opens a file, compares the extracted records against the original, and corrects or confirms them (e.g., fix a wrong amount, change category from "supplies" to "staff"). Confirmed values override extracted ones and are reported separately from unconfirmed data in analyses.

**Why this priority**: Automatic extraction will sometimes be wrong; financial analysis is only useful if the owner can trust and fix the numbers.

**Independent Test**: Edit one extracted amount and category on a file, reload, and verify the correction persists and is marked as user-confirmed.

**Acceptance Scenarios**:

1. **Given** a file with extracted records, **When** the owner edits a field and saves, **Then** the corrected value replaces the extracted one and the record is flagged as confirmed.
2. **Given** a file marked "Needs review", **When** the owner confirms or corrects all its records, **Then** its status changes to "Completed".

---

### User Story 4 - Data ready for business analysis and date filtering (Priority: P2)

The confirmed and extracted records are organized so the downstream analysis can answer: weekly expenses, weekly income, expense breakdown by week and by month, purchased products, sold products, and staff expense breakdown — all filterable by date range. This feature guarantees the data (with reliable dates, type and category) is available for those views.

**Why this priority**: It is the purpose of the upload flow, but the dashboards themselves can be delivered incrementally once data exists.

**Independent Test**: With a set of processed files covering several weeks, query the records for a date range and confirm totals by type (expense/income), by category and by product match the source documents.

**Acceptance Scenarios**:

1. **Given** processed files spanning several weeks, **When** records are requested for a date range, **Then** only records within that range are returned, grouped consistently by week or month.
2. **Given** records of both types, **When** totals are computed, **Then** expenses and incomes are never mixed and staff costs are separable from other expenses.
3. **Given** line items from purchases and sales, **When** product lists are requested, **Then** purchased and sold products are listed separately with quantities and amounts.

---

### User Story 5 - Cost visibility and control for file reading (Priority: P3)

The system chooses the cheapest adequate method to read each file (e.g., direct text/table parsing for digital files, text recognition for clean scans, full AI reading only when needed) and records the cost of each file's processing. The owner or operator can see total processing cost over time.

**Why this priority**: Cost is an explicit concern, but the feature works without a dashboard for it; cost recording and method selection are the essential parts.

**Independent Test**: Process a digital spreadsheet, a clean scan and a poor-quality photo; confirm each used a different reading method as appropriate and each has a recorded cost.

**Acceptance Scenarios**:

1. **Given** a digital file with machine-readable content, **When** processed, **Then** it is read without AI vision and its cost is recorded as the lowest tier.
2. **Given** a low-quality image that the cheaper method reads poorly, **When** processed, **Then** the system escalates to a more capable method and records the higher cost.
3. **Given** a configured processing cost limit, **When** the limit is reached, **Then** further automatic processing pauses, the owner is told why, and newly uploaded files are stored as "Queued (limit reached)" until the limit is raised or resets.

---

### Edge Cases

- Very large files or very many files in a single upload (batch limits and partial success).
- Corrupted, password-protected or empty files.
- Files in languages other than the business's primary language (Spanish is expected, English may appear).
- Multi-page documents containing several receipts, or one receipt spread across pages.
- Documents with no dates, ambiguous dates (day/month order) or dates outside any reasonable range.
- Documents with multiple currencies or missing currency.
- Same transaction appearing in two files (e.g., invoice and bank statement): flagged as a likely duplicate for the owner to keep both or merge; it is never merged silently.
- Upload interrupted by a network loss; user closes the page mid-processing.
- Extraction that confidently returns wrong values (hence the review step).
- Sensitive personal data (payroll files with employee names and salaries) being exposed to the wrong audience.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Users MUST be able to upload one or more files in a single action, with per-file progress and outcome.
- **FR-002**: System MUST accept common business document formats (PDF, images such as JPG/PNG/HEIC, spreadsheets CSV/XLSX, and plain text) and reject others with a clear reason.
- **FR-003**: System MUST enforce a maximum file size and maximum files per batch, and report violations per file without blocking valid files.
- **FR-004**: System MUST durably store the original file unchanged and keep it retrievable by the owner.
- **FR-005**: System MUST detect duplicate uploads and let the user skip or keep both.
- **FR-006**: System MUST show each file's lifecycle status: Received, Queued (limit reached), Processing, Completed, Needs review, Failed.
- **FR-007**: System MUST process uploaded files asynchronously so the user is not blocked while extraction runs.
- **FR-008**: System MUST extract structured records from each file: date, amount, currency, type (expense or income), category, counterparty, and line items (product, quantity, unit price, total).
- **FR-009**: System MUST classify each record as expense or income, and each expense as staff-related or not, plus product line items as purchase or sale.
- **FR-010**: System MUST select the least costly reading method that meets a minimum quality bar, escalating to costlier methods only when needed.
- **FR-011**: System MUST record the reading method used and the processing cost per file.
- **FR-012**: System MUST attach a confidence indicator to extracted records and route low-confidence results to "Needs review".
- **FR-013**: Users MUST be able to view, edit, confirm and delete extracted records, with each record linked to its source file.
- **FR-014**: System MUST distinguish extracted values from user-confirmed values and treat confirmed values as authoritative.
- **FR-015**: System MUST allow failed files to be retried and MUST NOT lose the original on failure.
- **FR-016**: System MUST make records queryable by date range, type, category and product so downstream analyses (weekly expenses/income, weekly and monthly expense breakdown, purchased and sold product lists, staff expenses) can be built on them. Totals MUST include confirmed records and unconfirmed records, excluding records from files in "Needs review", and MUST report the unconfirmed portion of each total separately.
- **FR-017**: System MUST make the stored content of files searchable/retrievable by the AI analysis workflow (including semantic retrieval) in addition to structured records.
- **FR-018**: System MUST support an optional processing cost limit that pauses automatic processing and notifies the owner when reached. Files uploaded while the limit is reached MUST still be stored, be marked "Queued (limit reached)", and be processed automatically once the limit is raised or resets.
- **FR-019**: System MUST associate every file and derived record with a single fixed business owner (no login in this feature) so that per-user access control can be added later without data migration. Files and extracted data (including payroll information) MUST NOT be reachable through any unauthenticated public link.
- **FR-020**: Users MUST be able to delete a file, and doing so MUST also remove its stored content and derived records after confirmation. Totals MUST update immediately and the deletion is permanent (no undo or trash).
- **FR-021**: System MUST flag likely duplicate records across files (same date, amount and counterparty) and let the owner keep both or merge them; records flagged and not yet resolved MUST be visibly marked, and a merge MUST count the transaction once in totals.

### Key Entities

- **Business File**: An uploaded original document. Attributes: name, type, size, upload date, owner (the fixed business owner), status, content fingerprint (for duplicate detection), reading method used, processing cost.
- **Extraction Result**: The outcome of reading a file. Attributes: file link, method, confidence, status, errors, timestamps.
- **Transaction Record**: A financial event extracted from a file. Attributes: date, amount, currency, type (expense/income), category, staff-related flag, counterparty, confirmation state, duplicate-flag state, source file.
- **Line Item**: A product entry within a transaction. Attributes: product name, quantity, unit price, total, direction (purchase/sale).
- **Document Content Index**: The searchable representation of a file's content used by the AI analysis workflow, linked to the source file.
- **Processing Cost Entry**: Cost recorded per processing run, used for totals and limits.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A user can upload a batch of 10 typical documents and see them all stored and listed in under 1 minute on a normal connection.
- **SC-002**: 95% of uploaded valid files reach "Completed" or "Needs review" within 2 minutes of upload (none stuck in "Processing").
- **SC-003**: For clear digital and scanned documents, at least 90% of extracted amounts and dates match the source document without manual correction.
- **SC-004**: 100% of files that cannot be read with acceptable confidence are flagged for review rather than silently accepted.
- **SC-005**: At least 60% of files are processed by the lowest-cost reading methods, and the average processing cost per file is visible to the operator.
- **SC-006**: For a given date range, totals produced from the records (expenses, income, staff expenses) match the sum of the included records' values with zero discrepancy, and the unconfirmed portion is reported separately and accurately.
- **SC-007**: A user can correct an extracted record in under 30 seconds and the correction is reflected in subsequent totals.
- **SC-008**: 100% of files and records are tied to the business owner, and none is reachable via a public, guessable link (0 exposures in testing).

## Assumptions

- The specific analysis dashboards/charts (weekly expenses, income, breakdowns, product lists, staff breakdown, date filters UI) are delivered as follow-up features; this feature delivers the upload, storage, extraction, review and queryable data they depend on.
- Primary users are business owners/managers; v1 has a single fixed business owner and no login (accounts and per-user access are a later feature).
- Expected document language is primarily Spanish, with English supported; default currency is the business's configured currency.
- Weeks follow a Monday–Sunday definition unless the business configures otherwise.
- Sensible defaults apply for limits (e.g., 20 MB per file, 20 files per batch) and may be tuned later.
- Original files are retained until the owner deletes them.
- Reading-method selection and cost thresholds are implementation decisions to be defined at planning time.
