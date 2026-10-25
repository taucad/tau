# syntax=docker/dockerfile:1.20

# Multi-stage Fly.io image for the Tau NestJS API.
#
# Stages: base -> deps -> build -> pruned -> runtime-base -> mirror | maintenance | storage | runtime
#   base         : node:24-slim with pnpm pinned via `npm i -g` (no Corepack).
#   deps         : workspace skeleton only (lockfile, pnpmfile + every workspace package.json
#                  + patches); cache key independent of source edits.
#   build        : full source + `pnpm nx build api`; reuses deps layer cache.
#   pruned       : `pnpm deploy --prod` to materialise a self-contained app dir.
#   runtime-base : minimal `node:24-slim` with the pinned git (no git-lfs), running as
#                  non-root `nestjs` (uid 1001). Exposes nothing.
#   mirror       : the private `tau-mirror` app (W13 DM1, the B2 second copy), built with
#                  `--target mirror`; runs `mirror-command.js worker`, metrics on 9464 only,
#                  no health check.
#   maintenance  : the private `tau-maintenance` app (north star DC4), built with
#                  `--target maintenance`; runs `maintenance-command.js`, no port, no
#                  health check (`app/maintenance-app.test.ts`).
#   storage      : the private `tau-storage` app (north star DC1), built with
#                  `--target storage`; runs `storage-worker.js` on 3100, asserts the
#                  pinned `git --version` at build and has no git-lfs
#                  (`app/storage-app.test.ts`).
#   runtime      : the API, which adds the pinned git-lfs. The last stage, so a build
#                  without `--target` is the API.
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

ARG NODE_VERSION=24.19.0
ARG PNPM_VERSION=10.30.3
# Pinned (charter W8): see the runtime-base stage.
ARG GIT_VERSION=1:2.39.5-0+deb12u3
ARG GIT_LFS_VERSION=3.3.0-1+deb12u1

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
COPY tools/pnpm/ ./tools/pnpm/
# `--parents` (BuildKit syntax 1.20+) preserves directory tree so each
# workspace package.json lands at its real path. Matches pnpm-workspace.yaml
# globs apps/*, libs/*, packages/*, packages/plugins/*, packages/core/*, and
# tools/*. Nested workspace placements need explicit patterns because
# `*/*/package.json` is only two levels deep, and `scripts/` is one level deep.
COPY --parents scripts/package.json */*/package.json apps/libs/*/package.json apps/react-e2e/apps/*/package.json packages/plugins/*/package.json packages/core/*/package.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline

# ── Build ─────────────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
# The deps stage installed from the frozen lockfile moments ago. pnpm's
# pre-run dependency check would otherwise re-run a full install here and
# exhaust the builder's 2 GB Node heap, so it only warns, as CI does.
ENV pnpm_config_verify_deps_before_run=warn
# Nx's native PTY runner intermittently segfaults; CI turns it off the same way
# in .github/actions/setup-nx.
ENV NX_NATIVE_COMMAND_RUNNER=false
# The script builds the API's dependencies, then the API targets, and refuses an API
# runtime dependency on the GeoSpec engine; its header says why.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    --mount=type=cache,id=nx,target=/app/.nx/cache \
    --mount=type=secret,id=nx_cloud_token,env=NX_CLOUD_ACCESS_TOKEN \
    node apps/api/scripts/build-image.mts

# Upload maps from the exact built image before pruning. The token is available
# only to this BuildKit step, never as an ARG, ENV or runtime image file.
# Deployment builds opt in; local and PR smoke builds need no hosted credential.
# The native Sentry CLI uses the OS trust store, absent from node:slim.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*
ARG SENTRY_UPLOAD_ENABLED=false
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
    if [ "$SENTRY_UPLOAD_ENABLED" = true ]; then \
      test -n "$SENTRY_AUTH_TOKEN" && \
      scripts/node_modules/.bin/sentry-cli sourcemaps inject apps/api/dist && \
      scripts/node_modules/.bin/sentry-cli sourcemaps upload --validate --wait --org taucad --project tau-api apps/api/dist; \
    fi

# ── Prune to production deploy tree ───────────────────────────────────────
FROM build AS pruned
# Peer auto-install is off because the legacy deploy resolves every workspace
# package's peers from the registry, and `@taucad/camera` (a type-only peer of
# `@taucad/workbench`) is not published; the API's runtime dependencies are all
# declared directly.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --config.auto-install-peers=false --filter=@taucad/api --prod deploy /pruned --legacy

# ── Runtime base (shared by the API and the private apps) ─────────────────
FROM node:${NODE_VERSION}-slim AS runtime-base
WORKDIR /app

# The Tau Hosted Remote is git's own binaries behind HTTP (charter D15):
# `git upload-pack|receive-pack --stateless-rpc` serve a lease hydrated from the
# object store. Since DC1 that runs in tau-storage, the `storage` target below.
#
# Pinned (charter W8), because git decides the bytes of every pack this service
# writes: an unpinned `apt-get install` means a rebuild of an unchanged commit can
# ship a different git. The versions are the bookworm candidates of the
# `node:24-slim` base. When Debian rolls a point release the old version leaves the
# index and this build fails loudly — bump the ARGs at the top, which is the
# intended maintenance, rather than dropping the pin.
ARG GIT_VERSION
RUN apt-get update && \
    apt-get install -y --no-install-recommends "git=${GIT_VERSION}" && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user before COPY so --chown can write directly into the
# layer instead of doubling its size with a follow-up `chown -R`.
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs --home /app --shell /usr/sbin/nologin nestjs

# No `/data`: the repositories volume is gone (charter S3). A lease is a temporary
# working copy under `os.tmpdir()`, which on this image is the rootfs's own `/tmp`
# — world-writable, so the non-root user needs nothing prepared here.
COPY --from=pruned --chown=nestjs:nodejs /pruned /app
USER nestjs

ENV NODE_ENV="production"

# ── Mirror: the private `tau-mirror` copier (W13 DM1) ─────────────────────
# Same tree as the API, a different entry: copies R2's repositories to the B2
# second copy under Object Lock. It serves no request: the only listener is the
# OpenTelemetry Prometheus exporter on 9464, scraped over Fly's private network
# (`[[metrics]]` in `apps/mirror/fly.*.toml`), so there is no HEALTHCHECK.
FROM runtime-base AS mirror
ENV OTEL_SERVICE_NAME="tau-mirror"
EXPOSE 9464
CMD ["node", "/app/dist/mirror-command.js", "worker"]

# ── Maintenance: the private singleton `tau-maintenance` (DC4) ────────────
# Same tree as the API, a different entry: purge, retire-lfs, blob collection,
# project-deletion recovery and operator restore. `retire-lfs` hydrates a lease,
# so it keeps the pinned git above. No EXPOSE and no HEALTHCHECK: the
# command opens no listener, and Fly's `[processes]` entry in
# `apps/maintenance/fly.*.toml` names the subcommand (`worker`).
FROM runtime-base AS maintenance
CMD ["node", "/app/dist/maintenance-command.js", "worker"]

# ── Storage: the private `tau-storage` app (DC1) ──────────────────────────
# The only process that runs a repository `git` child or writes under `repos/`.
# No git-lfs (review FR16): LFS objects never enter a git engine, they are
# presigned to the object store by the API. The build fails unless the installed
# git is exactly the pinned Debian package and git-lfs is absent.
FROM runtime-base AS storage
ARG GIT_VERSION
RUN test "$(dpkg-query -W -f='${Version}' git)" = "${GIT_VERSION}" && \
    upstream="${GIT_VERSION#*:}" && \
    test "$(git --version)" = "git version ${upstream%%-*}" && \
    ! command -v git-lfs
ENV PORT="3100" \
    OTEL_SERVICE_NAME="tau-storage"
EXPOSE 3100 9464
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "/app/dist/storage-worker.js"]

# ── Runtime: the API ──────────────────────────────────────────────────────
FROM runtime-base AS runtime
LABEL fly_launch_runtime="NestJS"

# git-lfs stays on the API until DC3 moves its readiness probe and the
# publication materializer's reads to tau-storage
# (`git-toolchain-health.indicator.ts`). Pinned like git.
ARG GIT_LFS_VERSION
USER root
RUN apt-get update && \
    apt-get install -y --no-install-recommends "git-lfs=${GIT_LFS_VERSION}" && \
    rm -rf /var/lib/apt/lists/*
USER nestjs

ENV PORT="3000"
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
