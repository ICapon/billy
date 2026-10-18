# Infra

Infrastructure config per environment.

| Folder   | Purpose                      |
| -------- | ---------------------------- |
| `local/` | Docker Compose for local dev |

`staging/` and `prod/` will be added here when needed.

## Local

```
infra/local/
├── compose.infra.yml      # Postgres (pgvector), Redis, S3 (SeaweedFS)
├── compose.services.yml   # api, worker, web (images built by Nx)
├── postgres/init.sql      # CREATE EXTENSION vector
└── s3/s3.json             # local S3 credentials
```

The two compose files are kept separate: infra can run alone while you use `nx serve`
on the host, and the services file layers on top of it.

Service images are Nx targets (`@nx/docker`): `pnpm nx docker:build <project>` builds the
app (and prunes its lockfile) and then the image. Images are tagged `apps-api`,
`apps-worker`, `apps-web`.

### Commands (repo root)

| Command                        | What it does                                                                                                                                                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm start`                   | Build all images with Nx, start infra + services, apply database migrations, then keep watching: code changes are rebuilt on the host and synced into the containers (Docker Compose `develop.watch`). Ctrl+C stops the watchers; containers keep running |
| `pnpm watch`                   | Re-attach only the watchers (no image build, no compose up, no migrations) when the stack is already up, e.g. after Ctrl+C |
| `pnpm start:detached`          | Same as `start` without the watch (still applies migrations)                                                                                                                                                                                              |
| `pnpm stop`                    | Stop everything (data is kept)                                                                                                                                                                                                                            |
| `pnpm reset`                   | Stop, delete volumes (data), then start fresh                                                                                                                                                                                                             |
| `pnpm logs`                    | Follow logs of all containers                                                                                                                                                                                                                             |
| `pnpm infra:up` / `infra:down` | Only Postgres/Redis/S3, to run apps on the host with `nx serve`. Run `pnpm db:migrate` after `infra:up` on a fresh database                                                                                                                               |
| `pnpm db:migrate`              | Apply pending TypeORM migrations to `DATABASE_URL` (`pnpm nx run db:migrate-revert` undoes the last one, `pnpm nx run db:migration-create --name=add-something` scaffolds a new one)                                                                      |
| `pnpm openapi`                 | Regenerate `apps/api/openapi/openapi.{json,yaml}` from the controllers (no database needed). `pnpm nx run api:openapi-check` fails when the committed files are stale                                                                                     |

`.env` is created from `.env.example` on first run. Host ports are configurable there
(defaults: Postgres 5442, Redis 6379, S3 9100, API 3000, Web 3001).

### Note on S3

MinIO no longer publishes pullable community images, so local S3 is SeaweedFS. The app only
talks the S3 API (`S3_ENDPOINT`, keys, bucket), so staging/prod can use R2 or S3 unchanged.

### File ingestion (upload, extraction, search index)

Uploaded files go to the S3 bucket (`S3_BUCKET`), their metadata and extracted records to
Postgres, and processing runs in the `worker` through the `file-extraction` BullMQ queue.
Reading is cost-aware: direct parsing (CSV/XLSX/PDF text layer) first, local OCR second, Claude
vision only when needed (see `specs/001-business-file-upload/research.md`).

Variables (all in `.env.example`, passed to `api` and `worker` by `compose.services.yml`):

| Variable                                                                          | Purpose                                                                                                                                                                                           |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAX_FILE_SIZE_MB`, `MAX_FILES_PER_BATCH`                                         | Upload limits (20 MB, 20 files)                                                                                                                                                                   |
| `BUSINESS_OWNER_ID`, `BUSINESS_WEEK_START`, `BUSINESS_CURRENCY`                   | Single business owner (no login yet), week start (`monday`/`sunday`) and the currency used when a document shows none                                                                             |
| `ANTHROPIC_API_KEY`, `EXTRACTION_MODEL`, `VISION_MODEL`                           | Structuring (cheap text model) and vision escalation. Without a key files fail with a clear message                                                                                               |
| `OCR_MIN_CONFIDENCE`, `RECORD_MIN_CONFIDENCE`                                     | Thresholds that escalate to a stronger reader / send a file to review                                                                                                                             |
| `PROCESSING_COST_LIMIT_USD`                                                       | Optional monthly limit; empty = off. Over the limit new files wait as "En cola (límite alcanzado)" and resume when the limit is raised or the month changes                                       |
| `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`, `VOYAGE_API_KEY` | Embeddings for the document search index (pgvector). The column is 1024-dimensional: changing the dimension needs a migration and re-embedding. Without a key files are processed but not indexed |

Things to know when changing the stack:

- **Worker image**: OCR (`tesseract.js` with bundled Spanish/English data), PDF rendering
  (`unpdf` + `@napi-rs/canvas`), spreadsheets (`exceljs`) and HEIC conversion are installed in
  the image from the generated `package.json`; `apps/api` and `apps/worker` webpack configs
  externalize every bare import and bundle only `@org/*` sources. Native binaries need the
  image platform (`node:24-alpine`/musl is covered by the prebuilt packages).
- **Migrations are not automatic in containers**: `pnpm start`/`start:detached` apply them from
  the host after the stack is healthy; run `pnpm db:migrate` yourself in other flows.
- **Integration tests** (`api`, `worker`, `db`) use the local Postgres/S3 from `pnpm infra:up`
  with a unique owner per suite and clean up after themselves. If the database is not
  reachable they print a `SKIPPED` warning instead of failing.
- **API docs**: with the API running outside production, Swagger UI is at `/api/docs`.
- **Typecheck vs build**: webpack `clean`s each app's `dist/`, where `tsc --build` keeps its
  declarations. If `typecheck` reports `TS6305` right after a `build`, delete `apps/<app>/dist`
  and run it again (run `typecheck` before `build` in scripts).
