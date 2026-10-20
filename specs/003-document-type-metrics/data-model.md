# Data Model: Document Type Metrics and Losses

All new rows carry `owner_id` (the single fixed owner), `created_at` and `updated_at` like the existing tables. Money is integer minor units plus an ISO currency code. One TypeORM migration creates everything below (hand-written, no `synchronize`).

## Document types

`bank_statement`, `payroll`, `invoice`, `receipt`, `sales_report`, `other` (enum `document_type`).

## Changes to existing tables

| Table            | Change                                                                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `business_files` | `document_type` (enum `document_type`, **nullable**: null means "Not classified", used by files analyzed before this feature), `document_type_confidence` (numeric(3,2), nullable), `document_type_manual` (boolean, default false: the owner chose the type) |
| `transactions`   | `document_id` (uuid, nullable, FK to `extracted_documents`, **ON DELETE SET NULL**, indexed)                                                                                                                                                                  |

The type shown for a record is `coalesce(document.type, file.document_type)`.

## extracted_documents

One row per logical document found in a file (a file can hold several).

| Field                    | Type                                       | Rules                                                                                                    |
| ------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| id                       | uuid pk                                    |                                                                                                          |
| file_id                  | uuid                                       | FK `business_files`, ON DELETE CASCADE, indexed                                                          |
| ordinal                  | integer                                    | position inside the file, starting at 0                                                                  |
| type                     | enum `document_type`                       | not null                                                                                                 |
| type_confidence          | numeric(3,2)                               | 0..1                                                                                                     |
| period_start, period_end | date, nullable                             | UTC dates; `period_end` drives period inclusion for statements, payroll and sales reports (research R10) |
| issue_date               | date, nullable                             | invoices and receipts                                                                                    |
| currency                 | char(3)                                    | upper case ISO code, falls back to the business currency                                                 |
| consistency              | enum `ok` \| `inconsistent` \| `unchecked` | `unchecked` for `other`                                                                                  |
| consistency_notes        | text, nullable                             | readable reasons, never contains employee names                                                          |
| details                  | jsonb                                      | validated with the shared schema of the type (below); `{}` for `other`                                   |

Indexes: `(owner_id, type, period_end)`, `(file_id)`.

## details by type (zod schemas in `packages/shared/src/lib/documents.ts`)

**bank_statement**: `accountIdentifier` (string or null), `openingBalanceMinor` (integer, may be negative), `closingBalanceMinor` (integer, may be negative), `totalDepositsMinor` (integer >= 0), `totalWithdrawalsMinor` (integer >= 0), `totalFeesMinor` (integer >= 0, default 0).

**payroll**: `grossTotalMinor`, `deductionsTotalMinor`, `netTotalMinor` (integers >= 0), `employerTotalCostMinor` (integer >= 0 or null), `employeeCount` (integer >= 0). The individual employees are rows of `payroll_lines`.

**invoice / receipt**: `counterparty` (string or null), `subtotalMinor` (integer >= 0 or null), `taxMinor` (integer >= 0 or null), `totalMinor` (integer >= 0), `paymentStatus` (`paid` \| `pending` \| `unknown`).

**sales_report**: `totalSalesMinor` (integer >= 0), `unitsSold` (number >= 0 or null), `transactionCount` (integer >= 0 or null).

## payroll_lines

| Field                                    | Type    | Rules                                                                                                         |
| ---------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| id                                       | uuid pk |                                                                                                               |
| document_id                              | uuid    | FK `extracted_documents`, ON DELETE CASCADE, indexed                                                          |
| employee_name                            | text    | as printed on the document, max 200 chars                                                                     |
| employee_key                             | text    | normalized (lower case, no accents or punctuation, collapsed spaces); indexed with `(owner_id, employee_key)` |
| gross_minor, deductions_minor, net_minor | bigint  | >= 0                                                                                                          |

## Extraction output contract (replaces `extractedDocumentSchema`)

```
{ documents: [ {
    type, typeConfidence (0..1),
    periodStart?, periodEnd?, issueDate?, currency?,
    bankStatement? | payroll? (with employees[]) | commercial? | salesReport?,   // matches `type`
    transactions: ExtractedTransaction[]                                           // as today
} ] }
```

Rules: the detail block must match `type`; `other` has no detail block; amounts in the output are decimals in major units and converted to minor units in code, like transactions today.

## View models (responses of `/api/documents/*`, shared zod schemas)

- **BankStatementsView**: `statements[]` (`documentId`, `fileId`, `accountIdentifier`, `periodStart`, `periodEnd`, opening, closing, deposits, withdrawals, fees, `netChangeMinor`, `consistency`, `notes`), `balanceSeries[]` (`date`, `balanceMinor`, `accountIdentifier`), `flows[]` (per month: deposits, withdrawals), `gaps[]` (`kind`: `balance` \| `missing_period`, `accountIdentifier`, `after` and `before` statement ids, the two amounts or dates). Grouped per currency.
- **PayrollView**: `periods[]` (`documentId`, `fileId`, `periodStart`, `periodEnd`, `employees`, `grossMinor`, `netMinor`, `deductionsMinor`, `totalCostMinor`, `consistency`), per currency; `GET payroll/{documentId}` returns the lines; `GET payroll/employees/{key}` returns `{ employeeName, history[] }`.
- **CommercialView**: `documents` count, `totalMinor`, `taxMinor`, `paidMinor`, `pendingMinor`, `topCounterparties[]`, per currency and per kind (`invoice` / `receipt`).
- **SalesView**: `totalSalesMinor`, `unitsSold`, `averageTicketMinor` (null when no transaction count), `bestProducts[]`, `series[]` (day or week), per currency.
- **ResultsAnalysis** (computed from `/records/totals` rows by `analyzeResults`): per currency `periods[]` (`bucketStart`, `incomeMinor`, `expensesMinor`, `netMinor`, `isLoss`, `topExpenseCategories[]`, `cumulativeNetMinor`, `unconfirmedMinor`), `losingPeriods`, `largestLossMinor`, `totalNetMinor`.

## State transitions

- **File type**: `null` (not classified) -> a type (automatic, confidence set) -> a type with `document_type_manual = true` (owner correction; automatic runs no longer change it, they only re-read for that type). Changing the type re-enqueues the file.
- **Document consistency**: `unchecked` -> `ok` or `inconsistent` on every extraction run; an `inconsistent` document puts its file in `needs_review` (existing flow); confirming the file's records completes it as today.
- **Re-analysis**: replaces the file's `extracted_documents` (and their payroll lines) and its unconfirmed records; confirmed records are kept with `document_id` set to null.
