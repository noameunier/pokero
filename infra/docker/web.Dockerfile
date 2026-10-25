# syntax=docker/dockerfile:1

# --- Base -------------------------------------------------------------------
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN npm install -g pnpm@12.15.0
WORKDIR /app

# --- Build ------------------------------------------------------------------
FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json packages/domain/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @pokero/web build

# --- Runtime ----------------------------------------------------------------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080
WORKDIR /app
COPY --from=builder /app/apps/web/dist ./dist
COPY --from=builder /app/apps/web/server.mjs ./server.mjs
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
