# Quickstart: Validating Document Type Metrics and Losses

## Prerequisites

- Features 001 and 002 running: `pnpm start:detached` (applies migrations, including this feature's), or `pnpm infra:up`, `pnpm db:migrate`, `nx serve api`, `nx serve worker`, `nx dev web`.
- A real `ANTHROPIC_API_KEY` in `.env` for the extraction scenarios (without it files fail with a clear message). The pure logic and the views can be checked without it using the integration test fixtures.
- Sample documents (any bank, any language): two or three consecutive monthly bank statements, one of them with a missing month; two payroll documents of consecutive periods; an invoice with taxes and a paid/pending stamp; a receipt; a sales report with products; one document that is none of these.
- Open `http://localhost:3001/results`.

## Scenarios

1. **Classification (US1)** – Upload one document of each type. Each file shows its type and, on its detail screen, the type-specific data next to the general records. The unrelated document is "Otro" with its general records.
2. **Type correction (US1)** – Change the type of one file. It is read again, the new type's data replaces the old one, and records you had confirmed are still there.
3. **Older files (US1)** – Files uploaded before this migration show "Sin clasificar". "Re-analizar todos" shows the number of files and an estimated cost before starting; with `PROCESSING_COST_LIMIT_USD` very low the extra files wait as "En cola (límite alcanzado)".
4. **Bank statements (US2)** – Balances, deposits, withdrawals and fees equal the printed figures; the balance-over-time chart and deposits-vs-withdrawals chart appear; the missing month is flagged as a missing period, and altering one opening balance in a copy of a statement flags a balance gap. A statement whose totals do not reconcile shows as "Requiere revisión".
5. **Payroll (US3)** – Period totals (employees, gross, net, deductions, total cost) equal the documents; selecting a period lists the employees; selecting an employee shows their history; the staff expense on `/dashboard` and `/records` equals the payroll total cost for the same range.
6. **Losses (US4)** – On the first tab, weeks and months where expenses exceed income are highlighted with the loss amount; profitable periods are not; selecting a loss shows its main expense categories; the summary shows net result, number of losing periods and largest loss; switching week/month recalculates.
7. **Invoices, receipts and sales (US5)** – Totals, taxes, paid vs pending, top counterparties, units, average ticket and best products equal the documents.
8. **Drill-down and filters (US6)** – Select a bar, row or figure: the drawer lists the documents and records behind it and they add up to the figure. Change period and type filters: every figure updates together.
9. **Empty states and privacy** – With no payroll, the payroll tab explains and links to `/upload`. `docker logs billy-local-worker-1` and the API logs contain no employee names.
10. **Phone width** – At 360 px wide there is no horizontal page scroll; tables scroll inside their card.

## Automated checks

`pnpm nx run-many -t lint test typecheck build -p shared db ai api worker web` (or `billy-verify`), then `pnpm openapi` so `pnpm nx run api:openapi-check` stays green. Integration tests need the local infra (`pnpm infra:up`, `pnpm db:migrate`). Extraction tests use recorded fixtures, never the live API.

API reference: [contracts/documents-api.openapi.yaml](./contracts/documents-api.openapi.yaml). Data shapes: [data-model.md](./data-model.md).
