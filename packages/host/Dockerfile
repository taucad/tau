# syntax=docker/dockerfile:1.20

# Multi-stage image for launcher 3: `tau serve` running as a cloud agent host.
#
# Stages mirror apps/api/Dockerfile deliberately — same base, same cache split,
# same prune — because they solve the same problem in the same workspace:
#   base    : node:24-slim with pnpm pinned via `npm i -g` (no Corepack).
#   deps    : workspace skeleton only (lockfile + every workspace package.json
#             + patches); cache key independent of source edits.
#   build   : full source + `pnpm nx build cli` (with its workspace deps).
#   pruned  : `pnpm deploy --prod` to materialise a self-contained app dir.
#   runtime : minimal `node:24-slim` running as non-root `tau` (uid 1001).
#
# Build choices:
#   - The install is unfiltered for the reason recorded at apps/api/Dockerfile
#     :21-26: Nx's project-graph plugins load every workspace `vite.config.ts`
#     at startup, so a `--filter` install resolves the graph to a missing-module
#     error before any build can start.
#   - `cli:build-deps` runs first because `pnpm deploy --prod` materialises each
#     workspace dependency from its `files` field (`dist`), which only exists
#     once that package has been built.
#   - The image carries no ACP adapters' CLIs: `claude-agent-acp`/`codex-acp`
#     resolve as `@taucad/cli` dependencies but the entrypoint starts the daemon
#     with `--no-external-agents`, so nothing spawns them. Dropping them from the
#     image means making them optional peers of `@taucad/cli` — a package change,
#     not a Dockerfile one.
#   - No pairing happens here. A cloud host is provisioned by the API, which
#     mints the device credential and passes it in as `TAU_HOST_CREDENTIAL`;
#     the entrypoint writes it to `$TAU_CONFIG_DIR/host.json`, exactly the file
#     `tau serve` would have written after a user-code pairing.

# Node 26, not the API image's 24.3.0: tsdown's config loader trips a Node bug
# fixed in 24.11.1 ("Failed to load the config file due to a known Node.js bug"),
# which every workspace package's build hits. The workspace's own answer to this
# is the same one — package builds run under 26.7.0 while tests and the daemon
# run under 24.10.0 — and one version across build and runtime keeps a single
# native ABI in the pruned tree.
ARG NODE_VERSION=26.7.0
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
COPY --parents */*/package.json apps/libs/*/package.json apps/react-e2e/apps/*/package.json packages/plugins/*/package.json packages/core/*/package.json ./
# The workspace pins two dependencies to local paths under `repos/`, which the
# root `.dockerignore` excludes (it is 86 GB of external checkouts). The install
# cannot resolve the lockfile without them, so `Dockerfile.dockerignore` beside
# this file re-includes exactly these paths and they are copied here.
COPY --parents repos/nanoraster/tests/out/candidate-0df0c5d/*.tgz ./
COPY --parents repos/openrscad/packages/npm-native/package.json repos/openrscad/packages/npm-native/dist repos/openrscad/packages/npm-native/src ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline

# ── Build ─────────────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    --mount=type=cache,id=nx,target=/app/.nx/cache \
    pnpm nx run cli:build-deps && pnpm nx build cli

# ── Prune to production deploy tree ───────────────────────────────────────
FROM build AS pruned
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter=@taucad/cli --prod deploy /pruned --legacy

# ── Runtime ───────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS runtime
LABEL org.opencontainers.image.title="Tau Host"
LABEL org.opencontainers.image.description="Launcher 3: tau serve as a cloud agent host"
WORKDIR /app

RUN groupadd --system --gid 1001 tau && \
    useradd --system --uid 1001 --gid tau --home /app --shell /usr/sbin/nologin tau
COPY --from=pruned --chown=tau:tau /pruned /app
COPY --chown=tau:tau packages/host/docker-entrypoint.sh /usr/local/bin/tau-host-entrypoint
RUN chmod 0755 /usr/local/bin/tau-host-entrypoint && \
    mkdir -p /workspace /config && chown tau:tau /workspace /config && chmod 0700 /config
USER tau

# `TAU_HOST_AGENT_PORT` is what turns the agent capability on (`tau serve`
# offers it only when a port — or a UI directory — is configured); `0` asks for
# an ephemeral loopback port, which is all a relayed host ever needs.
ENV NODE_ENV="production" \
    TAU_CONFIG_DIR="/config" \
    TAU_HOST_WORKSPACE="/workspace" \
    TAU_HOST_AGENT_PORT="0"
VOLUME ["/workspace"]

ENTRYPOINT ["/usr/local/bin/tau-host-entrypoint"]
