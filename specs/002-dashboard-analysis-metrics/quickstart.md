# Quickstart: Validating the Dashboard Analysis Metrics

## Prerequisites

- Feature 001 running: `pnpm start:detached` (or `pnpm infra:up`, `pnpm db:migrate` and `nx serve api` / `nx dev web`).
- Some data. With a real `ANTHROPIC_API_KEY` upload a few receipts, a sales CSV and a payroll sheet. Without a key, seed records directly (the integration tests do this with the repositories) or use the test fixtures; the dashboard only needs rows in the database.
- Open `http://localhost:3001/dashboard`.

## Scenarios

1. **Empty state (US1, FR-013)** – With no files, the dashboard shows no figures, explains it fills in as documents are analyzed and links to `/upload`. No demo numbers anywhere.
2. **Activity matches the files list (US1, SC-002)** – Upload files so that some complete, one fails and one needs review. The counters (received/in progress/completed/in review/failed), success rate and average time match `/files` for the same dates. The chart shows uploads and finished analyses per day.
3. **Live refresh (US1, SC-005)** – Keep the dashboard open while a file is processing; its counters change within 10 s without reloading. With the tab hidden, no requests are made (check the network panel).
4. **Finance equals the analysis screen (US2, SC-002)** – Totals for expenses, income, net, staff and the category breakdown equal `/records` for the same period and week/month grouping. A file in review and a merged duplicate are excluded; the unconfirmed amount is shown separately.
5. **Attention (US3, SC-004)** – With one file in review, one failed, one waiting for budget and one pending duplicate pair, each counter is right and its link opens the matching list (`/files?status=needs_review`, `/files?status=failed`, `/files?status=queued_limit`, `/files#duplicados`). Resolve one and return: the counter drops. With nothing pending, an "all clear" message appears.
6. **Products (US4)** – Top 5 purchased and sold products match the tables of `/records`; with no line items a short explanation appears.
7. **Cost (US5)** – Month cost, limit, average per file and the share per reading method match `/files`. Set `PROCESSING_COST_LIMIT_USD` very low and restart the worker: the warning banner appears.
8. **Period (US6, SC-006)** – Switch to 7, 90 days, this month and a custom range: every period-based section updates together in under 2 s. Enter a start after the end: a clear message appears and the previous data stays. Reload: the default is the last 30 days.
9. **Failure isolation (FR-015)** – Stop the API for the finance request only (for example block `/backend/records/totals` in the browser dev tools): that section shows an error with a retry button while the others still render.
10. **Phone width (SC-008)** – At 360 px wide there is no horizontal page scroll; tables scroll inside their card.

## Automated checks

`pnpm nx run-many -t lint test typecheck build -p shared db api web` (or `billy-verify`), then `pnpm openapi` so `pnpm nx run api:openapi-check` stays green. Integration tests need the local infra (`pnpm infra:up`, `pnpm db:migrate`).

API reference: [contracts/dashboard-api.openapi.yaml](./contracts/dashboard-api.openapi.yaml). Response shapes: [data-model.md](./data-model.md).

## Measured results (T040, T041)

Measured on the local machine with 1,000 files, 3,000 records and 3,000 line items for one owner (seeded with SQL, removed afterwards):

| Query                             | Time   |
| --------------------------------- | ------ |
| Activity, 30 days (day buckets)   | 6 ms   |
| Activity, 90 days (week buckets)  | 2 ms   |
| Attention counters                | 2 ms   |
| Totals by week, 90 days           | 5 ms   |
| Top 5 purchased products, 90 days | 157 ms |

These are database times; the page makes five requests in parallel, so SC-001 (3 s) and SC-006 (2 s) have a wide margin. SC-005 (10 s) is met by design: sections poll every 10 s while files are in progress.

HTTP smoke test on the rebuilt stack: the activity counts equal the files list for the same dates, a new upload shows up in the series, invalid dates return 400, and `/dashboard` and `/files?status=failed` respond 200. Not verified in a browser: chart rendering, the 360 px layout and dark mode (scenarios 8 to 10 need a human look).
