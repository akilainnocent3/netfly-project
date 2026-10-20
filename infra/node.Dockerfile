# syntax=docker/dockerfile:1
# Shared image for the two Next.js apps (pnpm workspace).
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/client/package.json apps/client/
COPY apps/admin/package.json apps/admin/
COPY packages/api-client/package.json packages/api-client/
COPY packages/ui/package.json packages/ui/
COPY e2e/package.json e2e/
RUN pnpm install --frozen-lockfile

FROM deps AS dev
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

FROM deps AS build
ARG APP
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @netfly/${APP} build

FROM node:22-alpine AS prod
ARG APP
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S netfly && adduser -S netfly -G netfly
COPY --from=build --chown=netfly:netfly /repo/apps/${APP}/.next/standalone ./
COPY --from=build --chown=netfly:netfly /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
USER netfly
ENV APP_DIR=apps/${APP}
CMD ["sh", "-c", "node $APP_DIR/server.js"]
