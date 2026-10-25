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
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json packages/domain/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @pokero/api db:generate \
 && pnpm --filter @pokero/api build

# --- Runtime ----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json packages/domain/
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter @pokero/api...
COPY --from=builder /app/apps/api/dist ./apps/api/dist
WORKDIR /app/apps/api
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
