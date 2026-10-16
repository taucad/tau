# syntax=docker/dockerfile:1.20

# Multi-stage image for launcher 3: `tau serve` running as a cloud agent host.
#
# Stages mirror apps/api/Dockerfile deliberately — same base, same cache split,
# same prune — because they solve the same problem in the same workspace:
#   base    : node:26-slim with pnpm pinned via `npm i -g` (no Corepack).
#   deps    : workspace skeleton only (lockfile + every workspace package.json
#             + patches); cache key independent of source edits.
#   build   : full source + `pnpm nx build cli` (with its workspace deps).
#   pruned  : `pnpm deploy --prod` to materialise a self-contained app dir.
#   runtime : minimal `node:26-slim` running as non-root `tau` (uid 1001).
#   tau-store : empty by default; `scripts/build-native-image.sh` replaces it
#             with a payload store it prepared using the runtime image itself.
#   native  : runtime plus that baked store, so build123d is `ready` with no
#             network (charter D37, W19).
#
# Build choices:
#   - The install is unfiltered for the reason recorded at apps/api/Dockerfile
#     :21-26: Nx's project-graph plugins load every workspace `vite.config.ts`
#     at startup, so a `--filter` install resolves the graph to a missing-module
#     error before any build can start.
#   - `cli:build-deps` runs first because `pnpm deploy --prod` materialises each
#     workspace dependency from its `files` field (`dist`), which only exists
#     once that package has been built.
#   - The deploy injects workspace packages (`inject-workspace-packages`): the
#     `--legacy` deploy re-resolves `workspace:*` versions against npm under
#     pnpm 11 and fails on unpublished ones (ruling X33). A deploy copies the
#     development manifests, whose `exports` point at `./src/*.ts`, so
#     `scripts/apply-publish-config.mts` applies each `publishConfig` as
#     `pnpm pack` would; otherwise Node cannot load `@taucad/build123d`.
#   - Native kernels run inside the bubblewrap sandbox (`bubblewrap`, `socat`,
#     `ripgrep`), and the build123d OCP extension links `libGL.so.1` and
#     `libX11.so.6` (`libgl1`, ruling X6). The sandbox needs a non-root user:
#     its `apply-seccomp` helper maps its own uid into a nested user namespace,
#     and the kernel refuses to map uid 0 there once bubblewrap has dropped
#     CAP_SETFCAP ("write /proc/self/uid_map: Operation not permitted"). The
#     image therefore runs as `tau`; never run it with `--user 0`. The container
#     must also be allowed to create user namespaces; see
#     `scripts/build-native-image.sh` for the `docker run` options.
#   - The image carries no ACP agent CLIs: the build stages the two adapters
#     into the CLI's `dist-acp` without their vendor binaries, and the
#     entrypoint starts the daemon with `--no-external-agents`, so nothing
#     spawns them.
#   - No pairing happens here. A cloud host is provisioned by the API, which
#     mints the device credential and passes it in as `TAU_HOST_CREDENTIAL`;
#     the entrypoint writes it to `$TAU_CONFIG_DIR/host.json`, exactly the file
#     `tau serve` would have written after a user-code pairing.
#   - The host is a device of the owner (charter D21): the runtime carries `git`
#     and `git-lfs`, the entrypoint clones the bound project with the
#     repository-scoped push credential (`TAU_HOST_GIT_CREDENTIAL`), and the
#     daemon's revision tree records and pushes the agent's turns from it.
#     `git lfs install --system` so that clone smudges large files rather than
#     leaving pointers in the working tree.

# Node 26, not the API image's 24.3.0: tsdown's config loader trips a Node bug
# fixed in 24.11.1 ("Failed to load the config file due to a known Node.js bug"),
# which every workspace package's build hits. The workspace's own answer to this
# is the same one — package builds run under 26.7.0 while tests and the daemon
# run under 24.10.0 — and one version across build and runtime keeps a single
# native ABI in the pruned tree.
ARG NODE_VERSION=26.7.0
# The workspace's `packageManager` pin: the deploy below needs pnpm 11.
ARG PNPM_VERSION=11.7.0

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
COPY --parents scripts/package.json */*/package.json apps/libs/*/package.json apps/react-e2e/apps/*/package.json packages/plugins/*/package.json packages/core/*/package.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline

# ── Build ─────────────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
# The root tsconfig references the e2e projects, which the context leaves out.
# `@oxc-node/core` (it runs `cli:stage-acp`) then falls back to a target without
# top-level await; point it at the base tsconfig instead.
ENV OXC_TSCONFIG_PATH=/app/tools/typescript/base.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    --mount=type=cache,id=nx,target=/app/.nx/cache \
    pnpm nx run cli:build-deps && pnpm nx build cli

# ── Prune to production deploy tree ───────────────────────────────────────
FROM build AS pruned
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter=@taucad/cli --prod deploy /pruned --config.inject-workspace-packages=true && \
    node packages/host/scripts/apply-publish-config.mts /pruned && \
    rm -f /pruned/pnpm-lock.yaml /pruned/pnpm-workspace.yaml

# ── Runtime ───────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS runtime
LABEL org.opencontainers.image.title="Tau Host"
LABEL org.opencontainers.image.description="Launcher 3: tau serve as a cloud agent host"
WORKDIR /app

RUN apt-get update && \
    apt-get install --yes --no-install-recommends ca-certificates git git-lfs \
      bubblewrap socat ripgrep libgl1 && \
    rm -rf /var/lib/apt/lists/* && \
    git lfs install --system --skip-repo
RUN groupadd --system --gid 1001 tau && \
    useradd --system --uid 1001 --gid tau --home /app --shell /usr/sbin/nologin tau
COPY --from=pruned --chown=tau:tau /pruned /app
COPY --chown=tau:tau packages/host/docker-entrypoint.sh /usr/local/bin/tau-host-entrypoint
RUN chmod 0755 /usr/local/bin/tau-host-entrypoint && \
    mkdir -p /workspace /config && chown tau:tau /workspace /config && chmod 0700 /config
USER tau

# The agent port and every other `tau serve` flag live in the entrypoint, so the
# script alone is the recipe for a cloud host.
ENV NODE_ENV="production" \
    TAU_CONFIG_DIR="/config" \
    TAU_HOST_WORKSPACE="/workspace"
VOLUME ["/workspace"]

ENTRYPOINT ["/usr/local/bin/tau-host-entrypoint"]

# ── Store: replaced at build time by a prepared payload store ─────────────
# `docker buildx build --build-context tau-store=<dir>` overrides this empty
# stage. Preparing needs the native sandbox (it compiles the closure's Python
# bytecode inside it), which a build step cannot create, so the store is
# prepared by running the `runtime` image and baked here. It must be prepared at
# /config: a store is used at the path it was sealed at.
FROM scratch AS tau-store

# ── Native: runtime + baked store ─────────────────────────────────────────
FROM runtime AS native
COPY --from=tau-store --chown=tau:tau / /config
