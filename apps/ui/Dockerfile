# syntax = docker/dockerfile:1

# Reference:
# - https://pnpm.io/docker
# - https://depot.dev/docs/container-builds/how-to-guides/optimal-dockerfiles/node-pnpm-dockerfile
# Adapted for monorepo with reference to:
# - https://pnpm.io/cli/deploy

ARG NODE_VERSION=24.3.0
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="NestJS"
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

FROM base AS build

RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm fetch --frozen-lockfile
COPY package.json ./
COPY . .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
RUN pnpm nx build ui --verbose

FROM build AS pruned

RUN pnpm --filter=@taucad/ui --prod deploy pruned --legacy

FROM base

WORKDIR /app
COPY --from=pruned /app/pruned /app
ENV NODE_ENV="production"
EXPOSE 3000
CMD [ "./node_modules/.bin/react-router-serve", "build/server/index.js" ]
