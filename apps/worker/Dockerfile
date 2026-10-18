# Build context: apps/worker. Run `pnpm nx docker:build worker` (it builds + prunes first).
FROM node:24-alpine
ENV NODE_ENV=production
ARG PNPM_VERSION=10.0.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

# dist/ holds the bundle, a pruned package.json + pnpm-lock.yaml and workspace_modules
COPY dist/ ./
RUN pnpm install --prod --frozen-lockfile

USER node
CMD ["node", "main.js"]
