# Research: Dashboard Analysis Metrics

No `NEEDS CLARIFICATION` items remain from the spec. Decisions below resolve the technical unknowns.

## R1. One endpoint per section, not a single "dashboard" payload

- **Decision**: Reuse `/records/totals`, `/records/products` and `/costs/summary`, and add only `GET /api/dashboard/activity` and `GET /api/dashboard/attention`. Each section on the page requests its own data.
- **Rationale**: FR-015 requires a failing section not to take the others down, which a single payload cannot give. It also keeps the numbers identical to the screens that already exist (FR-017).
- **Alternatives**: One `/dashboard` aggregate (a single failure blanks the page and duplicates logic); server-side rendering of the whole page (loses auto-refresh and per-section retry).

## R2. Finance comes from the weekly totals rows, summarized by a pure shared function

- **Decision**: The page calls `/records/totals?groupBy=week` once for the period and passes the rows to `summarizeFinance(rows)` in `@org/shared`, which returns per currency: expenses, income, net, staff total and share, unconfirmed part, category breakdown (largest first) and a weekly expense/income series.
- **Rationale**: The totals endpoint already applies the agreed rules (exclude `needs_review` files and merged duplicates, include unconfirmed amounts, split confirmed/unconfirmed). Reusing it makes the dashboard equal to the analysis screen by construction (SC-002, FR-008), and a pure function is trivial to test. Row volume is small (weeks x kinds x categories).
- **Alternatives**: A new SQL aggregate for the dashboard (a second place where the rules could drift); computing in the browser without a shared function (untested, duplicated).

## R3. Activity definitions

- **Decision**: Files are counted by `uploaded_at` inside the period. Status groups: _in progress_ = received + processing, _waiting_ = queued_limit, _finished_ = completed + needs_review + failed. Success rate = completed / finished (null when nothing finished, never a division by zero). Average analysis time = mean of per-file total run duration (`extraction_runs.finished_at - started_at`, summed per file) over finished files that have runs; failed files that never produced a run are excluded from the average and counted in the status counts. The time series has two lines: uploads by `uploaded_at` and finished analyses by the file's last status update (`business_files.updated_at`) for finished files in the period. Bucket = day when the period is up to 31 days, week otherwise, returned in the response so the chart labels itself.
- **Rationale**: Uses only data that exists, with indexes already in place (`owner_id, uploaded_at`). Counting finished analyses by last status change is simple and matches what the owner perceives as "when it finished".
- **Alternatives**: A dedicated event table (more data to maintain for little gain now); using only runs for the series (misses failed files without runs).
- **Risk**: A later edit that completes a review also bumps `updated_at`, so "finished" can shift to the review-completion date. Acceptable and documented.

## R4. Attention items are global, not period-based

- **Decision**: `GET /api/dashboard/attention` returns counts of files in `needs_review`, `failed` and `queued_limit`, the number of pending duplicate pairs, and the unconfirmed amount per currency (same exclusions as totals), regardless of the dashboard period.
- **Rationale**: Pending work does not disappear because it is older than 30 days; hiding it would be misleading.
- **Alternatives**: Applying the period (an old failed file would silently vanish from the to-do list).

## R5. Live refresh

- **Decision**: The page polls every 10 s while the activity section reports files in progress or waiting, pauses while the tab is hidden, and offers a manual "Actualizar" button that refreshes every section. No server push.
- **Rationale**: Meets SC-005 (10 s) with the same polling approach the files screen already uses; no new infrastructure.
- **Alternatives**: Server-sent events or WebSockets (more moving parts for a 10 s target).

## R6. Period handling

- **Decision**: Period state lives in the dashboard component: presets last 7/30/90 days and this month, plus a custom range validated client-side (start <= end, both required). Dates are UTC `YYYY-MM-DD`, computed by a pure helper in `@org/shared`. The default is last 30 days on every visit (no persistence), as the spec states.
- **Rationale**: Matches spec User Story 6 and the date convention of `/records`.
- **Alternatives**: Persisting the choice in the URL or localStorage (not requested; the spec explicitly wants the default on return).

## R7. Charts

- **Decision**: Keep hand-written SVG and extend `components/charts.tsx` with a grouped bar chart and a two-series line chart that take real data, formatted axes, and an `aria-label` plus a visually hidden data table as fallback; remove the "demo" wording and the seeded demo generator.
- **Rationale**: Adds no dependency (constitution II) and the existing demo charts already follow the app's tokens and dark mode.
- **Alternatives**: A charting library (new dependency, larger bundle) for four simple charts.

## R8. Project selector

- **Decision**: The dashboard no longer depends on the selected project. Data belongs to the single business of v1; the page title becomes "Dashboard" with a business-level subtitle. The selector component stays untouched.
- **Rationale**: Data is not stored per project, so filtering by project would be false precision. Spec assumption.
- **Alternatives**: Tagging files with a project (a data-model change that belongs to a future multi-business feature).

## R9. Products

- **Decision**: `GET /api/records/products` gains an optional `limit` (1-100, default no limit) applied after ordering by total descending; the dashboard asks for 5 purchased and 5 sold.
- **Rationale**: Keeps the existing endpoint backward compatible and moves the cut-off to SQL.

## R10. Performance and time

- **Decision**: Every query filters by `owner_id` plus a date range on indexed columns; the dashboard issues five independent requests in parallel. Dates are UTC, like the rest of the app.
- **Rationale**: Keeps SC-001 and SC-006 comfortable at the expected scale without caching.
