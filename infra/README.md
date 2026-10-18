# Infra

Infrastructure config per environment.

| Folder | Purpose |
|---|---|
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

| Command | What it does |
|---|---|
| `pnpm start` | Build all images with Nx, then start infra + services and wait for health |
| `pnpm stop` | Stop everything (data is kept) |
| `pnpm reset` | Stop, delete volumes (data), then start fresh |
| `pnpm logs` | Follow logs of all containers |
| `pnpm infra:up` / `infra:down` | Only Postgres/Redis/S3, to run apps on the host with `nx serve` |

`.env` is created from `.env.example` on first run. Host ports are configurable there
(defaults: Postgres 5442, Redis 6379, S3 9100, API 3000, Web 3001).

### Note on S3

MinIO no longer publishes pullable community images, so local S3 is SeaweedFS. The app only
talks the S3 API (`S3_ENDPOINT`, keys, bucket), so staging/prod can use R2 or S3 unchanged.
