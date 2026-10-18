# Infra

Infrastructure config per environment.

| Folder | Purpose |
|---|---|
| `local/` | Docker Compose for local dev (Postgres + pgvector, Redis, MinIO) |

`staging/` and `prod/` will be added here when needed.

## Local

From the repo root:

```sh
cp .env.example .env
pnpm infra:up      # start services
pnpm infra:down    # stop services
pnpm infra:logs    # follow logs
```

Data lives in named Docker volumes; `pnpm infra:reset` removes them.
