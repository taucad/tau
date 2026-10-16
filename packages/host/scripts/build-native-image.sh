#!/usr/bin/env bash
#
# Build the Tau host image with a baked payload store, so its native kernels are
# `ready` without network (charter D37, W19).
#
# Preparing runs the closure's own interpreter inside the native sandbox, which a
# `docker build` step cannot create. So the script builds the `runtime` target,
# prepares the store by running that image against a host directory mounted at
# /config (a store is used at the path it was sealed at), and then builds the
# `native` target with that directory as the `tau-store` build context.
#
# The sandbox needs the container to create user namespaces and mount a fresh
# /proc, which Docker's default seccomp, AppArmor and masked /proc paths refuse.
# TAU_SANDBOX_DOCKER_OPTS holds the options the prepare run uses; run the built
# image with the same ones whenever it evaluates a native kernel. The image's
# user is `tau` (uid 1001): the sandbox refuses to start as root.
#
# Optional env vars:
#   TAU_IMAGE                 Tag of the native image (default: tau-host:native)
#   TAU_KERNELS               Space-separated kernels to prepare (default: build123d)
#   TAU_STORE_DIR             Host directory for the prepared store (default: a new temp dir)
#   TAU_SANDBOX_DOCKER_OPTS   `docker run` options for the sandbox
#                             (default: the three unconfined security options below)
#   TAU_BUILDX_ARGS           Extra `docker buildx build` arguments, e.g. cache flags
#
# Usage:
#   packages/host/scripts/build-native-image.sh
#   docker run --rm --network none $TAU_SANDBOX_DOCKER_OPTS --entrypoint node tau-host:native \
#     /app/dist/bin/tau.mjs prepare --inspect --json
#
# Exit codes:
#   0  Image built
#   1  Build or preparation failed
#   3  Missing dependency

set -euo pipefail

command -v docker >/dev/null || { echo "ERROR: docker is required" >&2; exit 3; }

REPO_ROOT="$(git rev-parse --show-toplevel)"
TAU_IMAGE="${TAU_IMAGE:-tau-host:native}"
TAU_KERNELS="${TAU_KERNELS:-build123d}"
TAU_STORE_DIR="${TAU_STORE_DIR:-$(mktemp -d)}"
TAU_SANDBOX_DOCKER_OPTS="${TAU_SANDBOX_DOCKER_OPTS:---security-opt seccomp=unconfined --security-opt apparmor=unconfined --security-opt systempaths=unconfined}"
TAU_BUILDX_ARGS="${TAU_BUILDX_ARGS:-}"
runtime_image="${TAU_IMAGE}-runtime"

# shellcheck disable=SC2086 # TAU_BUILDX_ARGS and TAU_SANDBOX_DOCKER_OPTS are word lists
{
  printf '→ building the runtime target as %s\n' "$runtime_image"
  docker buildx build $TAU_BUILDX_ARGS --load --file "$REPO_ROOT/packages/host/Dockerfile" \
    --target runtime --tag "$runtime_image" "$REPO_ROOT"

  printf '→ preparing %s into %s\n' "$TAU_KERNELS" "$TAU_STORE_DIR"
  mkdir -p "$TAU_STORE_DIR"
  docker run --rm --user 0 --volume "$TAU_STORE_DIR:/config" --entrypoint chown "$runtime_image" 1001:1001 /config
  for kernel in $TAU_KERNELS; do
    docker run --rm $TAU_SANDBOX_DOCKER_OPTS --volume "$TAU_STORE_DIR:/config" \
      --entrypoint node "$runtime_image" /app/dist/bin/tau.mjs prepare "$kernel" --json
  done

  printf '→ building the native target as %s\n' "$TAU_IMAGE"
  docker buildx build $TAU_BUILDX_ARGS --load --file "$REPO_ROOT/packages/host/Dockerfile" \
    --target native --build-context "tau-store=$TAU_STORE_DIR" --tag "$TAU_IMAGE" "$REPO_ROOT"
}

printf '✓ %s (store prepared in %s)\n' "$TAU_IMAGE" "$TAU_STORE_DIR"
