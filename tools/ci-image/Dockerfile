# syntax=docker/dockerfile:1
#
# The prebuilt Linux CI job image (`ghcr.io/taucad/tau-ci`, Brain research
# ci-structural-decomposition-blueprint.md, ST-4). It holds what `.github/actions/setup-nx` and
# `.github/actions/setup-linux-sandbox` otherwise fetch in every job: the pinned Node.js, pnpm at the
# root manifest's `packageManager` version, a pnpm store filled for `pnpm-lock.yaml` (with the
# side effects of the dependency builds it allows, so a job's install neither downloads nor builds),
# and the sandbox tools. It holds no `node_modules`, no `.npmrc` and no secret: every job still runs
# `pnpm install --frozen-lockfile`, so a stale image can only make an install slower, never change
# what is tested.
#
# Build from the repository root (`.github/workflows/ci-image.yml`):
#   docker build -f tools/ci-image/Dockerfile .
# `Dockerfile.dockerignore` limits the context to the lockfile, the workspace manifests, the pnpm
# hooks and patches.
#
# The Node.js version is `setup-nx`'s default `node-version`; `scripts/src/ci-image-workflow.test.ts`
# fails when they differ. Base images are pinned by index digest.

ARG NODE_IMAGE=node:24.20.0-trixie-slim@sha256:50c3b2f6988dfc307b86e5301d69611af31f4789bdf232863b07d3b02fe55ae0
ARG UV_IMAGE=ghcr.io/astral-sh/uv:0.13.9@sha256:d3b601f0c7b118bc1753febf7c41cc80981df678445e0254284eecf84db79a7d

FROM ${UV_IMAGE} AS uv

FROM ${NODE_IMAGE} AS base
# What a job step needs that the slim image lacks: `actions/checkout` needs git (and `git lfs`, which
# `setup-nx` requires), `actions/cache` tar and zstd, the plan and lanes jq, and the dependency builds
# the workspace allows (node-pty compiles from source on Linux) python3, make and g++. bubblewrap,
# socat, ripgrep and uv are `setup-linux-sandbox`'s packages.
RUN apt-get update \
  && apt-get upgrade -y --no-install-recommends \
  && apt-get install -y --no-install-recommends \
    bubblewrap ca-certificates curl g++ git git-lfs gnupg jq make openssh-client procps python3 \
    ripgrep socat tar unzip xz-utils zstd \
  && git lfs install --system --skip-repo \
  && rm -rf /var/lib/apt/lists/*
COPY --from=uv /uv /uvx /usr/local/bin/
# Outside $HOME, which a job container mounts from the runner (`/github/home`).
ENV COREPACK_HOME=/opt/corepack \
  COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  pnpm_config_store_dir=/opt/pnpm-store

FROM base AS store
WORKDIR /tmp/workspace
COPY . .
# `corepack prepare` reads the root manifest's `packageManager`. The install runs the dependency
# builds `allowBuilds` permits, so the store also keeps their side effects (Electron's binary,
# node-pty, sharp); husky's `prepare` has no repository here and is skipped.
RUN corepack enable \
  && corepack install \
  && HUSKY=0 CI=true pnpm install --frozen-lockfile \
  && pnpm store path

FROM base
ARG CI_IMAGE_TAG
RUN corepack enable
COPY --from=store /opt/corepack /opt/corepack
COPY --from=store /opt/pnpm-store /opt/pnpm-store
# The key the store was filled for (`tools/ci-image/image-key.sh key`), so a job can tell whether the
# image matches its lockfile.
ENV TAU_CI_IMAGE_TAG=${CI_IMAGE_TAG}
LABEL org.opencontainers.image.source="https://github.com/taucad/tau" \
  org.opencontainers.image.description="Tau Linux CI job image: Node.js, pnpm, a pnpm store for one lockfile, sandbox tools" \
  dev.taucad.ci-image.tag=${CI_IMAGE_TAG}
