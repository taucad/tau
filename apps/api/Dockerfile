# syntax=docker/dockerfile:1.20

# Multi-stage Fly.io image for the Tau NestJS API.
#
# Stages: base -> deps -> build -> pruned -> runtime
#   base    : node:24-slim with pnpm pinned via `npm i -g` (no Corepack).
#   deps    : workspace skeleton only (lockfile + every workspace package.json
#             + patches + tarballs); cache key independent of source edits.
#   build   : full source + `pnpm nx build api`; reuses deps layer cache.
#   pruned  : `pnpm deploy --prod` to materialise a self-contained app dir.
#   runtime : minimal `node:24-slim` running as non-root `nestjs` (uid 1001).
#
# Build choices (see also docs/research/api-docker-build-optimization.md):
#   - `pnpm fetch` removed: split deps/build stages already bound the
#     cache key to lockfile + package.jsons; a separate fetch layer adds noise.
#   - No NODE_OPTIONS=--import otel.js: app/main.ts already side-effect imports
#     #telemetry/otel.js; doubling it would double-init the SDK.
#   - Runtime base stays on `node:24-slim`: @pyroscope/nodejs
#     is a node-gyp native addon with unverified musl support; alpine swap
#     should be smoke-tested in staging first.
#   - `--filter=@taucad/api...` reverted: Nx's project-graph plugins
#     (`@nx/vite/plugin`, `@nx/vitest`) load every workspace `vite.config.ts`
#     at startup to build the graph, including `apps/ui/vite.config.ts` which
#     imports `@taucad/vite`. A filtered install resolves the graph to a
#     missing-module error before `nx build api` can even start. Full install
#     is required; the cold-cache cost is ~70s (network-bound, same as filtered).

ARG NODE_VERSION=24.3.0
ARG PNPM_VERSION=10.30.3

# ── Base ──────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    PNPM_STORE_DIR="/pnpm/store"
RUN npm install -g pnpm@${PNPM_VERSION} && pnpm config set store-dir /pnpm/store
WORKDIR /app

# ── Deps: workspace skeleton only (cache key = lockfile + package.jsons) ──
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY patches/ ./patches/
# tarballs/ is ~27 MB of lockfile-referenced .tgz files after .dockerignore
# strips experiments/comparisons/package/active subdirectories.
COPY tarballs/ ./tarballs/
# `--parents` (BuildKit syntax 1.20+) preserves directory tree so each
# workspace package.json lands at its real path. Matches pnpm-workspace.yaml
# globs apps/*, libs/*, packages/*, packages/kernels/*, tools/*. (`scripts/` is one
# level deep and intentionally dockerignored — pnpm tolerates it.)
COPY --parents */*/package.json packages/kernels/*/package.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline

# ── Build ─────────────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    --mount=type=cache,id=nx,target=/app/.nx/cache \
    --mount=type=secret,id=nx_cloud_token,env=NX_CLOUD_ACCESS_TOKEN \
    pnpm nx build api

# ── Prune to production deploy tree ───────────────────────────────────────
FROM build AS pruned
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter=@taucad/api --prod deploy /pruned --legacy

# ── Runtime ───────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS runtime
LABEL fly_launch_runtime="NestJS"
WORKDIR /app

# Create non-root user before COPY so --chown can write directly into the
# layer instead of doubling its size with a follow-up `chown -R`.
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs --home /app --shell /usr/sbin/nologin nestjs
COPY --from=pruned --chown=nestjs:nodejs /pruned /app
USER nestjs

ENV NODE_ENV="production" \
    PORT="3000"
EXPOSE 3000 9464

# Backstops Fly.io's [[http_service.checks]] for local `docker run` use and
# `docker ps` health status. Honours $PORT so `docker run -e PORT=4000` keeps
# the check accurate; fly.prod.toml sets internal_port=3000 (the ENV default
# above), so the deployed Machine sees the same port. Uses Node's built-in
# fetch (Node >=18). $PORT is interpolated by `node -e` itself, not the shell,
# so it stays correct even under exec-form CMD.
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "/app/dist/main.js"]
