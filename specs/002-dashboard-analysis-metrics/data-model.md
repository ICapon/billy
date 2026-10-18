# Data Model: Dashboard Analysis Metrics

**No database change.** The dashboard only reads tables created by feature 001 (`business_files`, `extraction_runs`, `transactions`, `line_items`, `duplicate_candidates`, `cost_entries`). The structures below are response shapes (zod schemas in `packages/shared/src/lib/dashboard.ts`).

## Dashboard Period (client state and query params)

| Field  | Type                                               | Rules                                    |
| ------ | -------------------------------------------------- | ---------------------------------------- |
| from   | ISO date `YYYY-MM-DD`                              | required, UTC, inclusive                 |
| to     | ISO date                                           | required, inclusive, `from <= to`        |
| preset | enum `7d` \| `30d` \| `90d` \| `month` \| `custom` | default `30d`; computed by a pure helper |

## Activity Summary — `GET /api/dashboard/activity?from&to`

| Field              | Type                 | Rules                                                                                                                               |
| ------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| from, to           | ISO date             | echo of the period                                                                                                                  |
| bucket             | enum `day` \| `week` | `day` when the period is at most 31 days                                                                                            |
| counts             | object               | `received`, `processing`, `queuedLimit`, `completed`, `needsReview`, `failed`: non-negative integers (files uploaded in the period) |
| total              | integer              | sum of the counts                                                                                                                   |
| finished           | integer              | completed + needsReview + failed                                                                                                    |
| successRate        | number 0..1 \| null  | completed / finished; null when finished is 0                                                                                       |
| avgAnalysisSeconds | number \| null       | mean per-file run duration; null when no file has runs                                                                              |
| series             | array                | one item per bucket in the period (zero-filled): `bucketStart` (date), `uploaded` (integer), `finished` (integer)                   |
| byMethod           | object               | files per reading method in the period: `digital`, `ocr`, `vision` (integers)                                                       |

**Invariants**: `total == sum(counts)`; `sum(series.uploaded) == total`; `sum(series.finished) <= finished` (a finished file outside the period by last update is not double counted); the counts equal the files list filtered by the same dates.

## Attention Items — `GET /api/dashboard/attention`

| Field             | Type    | Rules                                                                                                                                                           |
| ----------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| needsReview       | integer | files in `needs_review` (all time)                                                                                                                              |
| failed            | integer | files in `failed`                                                                                                                                               |
| queuedLimit       | integer | files in `queued_limit`                                                                                                                                         |
| pendingDuplicates | integer | pending duplicate pairs                                                                                                                                         |
| unconfirmed       | array   | per currency: `currency` (ISO), `amountMinor` (integer): unconfirmed amount under the same exclusions as totals (no `needs_review` files, no merged duplicates) |

## Financial Summary — computed client-side by `summarizeFinance(rows: TotalsRow[])`

Input: the rows of `/records/totals?groupBy=week` (existing `TotalsRow`). Output, one entry per currency:

| Field                      | Type                | Rules                                                               |
| -------------------------- | ------------------- | ------------------------------------------------------------------- |
| currency                   | ISO code            | never mixed across currencies                                       |
| expensesMinor, incomeMinor | integer             | sums of kind `expense` / `income`                                   |
| netMinor                   | integer             | income - expenses (may be negative)                                 |
| staffMinor                 | integer             | sum of expense rows with category `staff`                           |
| staffShare                 | number 0..1 \| null | staff / expenses; null when expenses are 0                          |
| unconfirmedMinor           | integer             | sum of `unconfirmedMinor` of all rows                               |
| byCategory                 | array               | expense categories `{ category, totalMinor, share }`, largest first |
| weekly                     | array               | `{ bucketStart, expensesMinor, incomeMinor }` ordered by week       |

## Product Highlights

Existing `ProductRow` from `/records/products`, now requested with `limit=5` per direction.

## Cost Summary

Existing `CostSummary` from `/costs/summary` (current month); the page derives the share per reading method from `byTier`.
