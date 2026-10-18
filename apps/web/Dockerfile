# Build context: apps/web. Run `pnpm nx docker:build web` (it builds first).
FROM node:24-alpine
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app

# Next standalone output is traced from the workspace root, so the app lives in apps/web
COPY .next/standalone ./
COPY .next/static ./apps/web/.next/static
COPY public ./apps/web/public

USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
