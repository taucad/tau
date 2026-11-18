#!/usr/bin/env bash
#
# Purpose: print the CI job image's lookup key or its recipe fingerprint (Brain research
#          ci-structural-decomposition-blueprint.md, ST-4).
# Usage:   tools/ci-image/image-key.sh key|recipe
#   key     `lock-<lockfile sha256, 16 hex>-node<version>-linux-<arch>`: the image tag, and the entry of
#           `tools/ci-image/image.lock.json` a job looks up. The Node.js version is `setup-nx`'s
#           default `node-version`, which the image's base must match.
#   recipe  16 hex digits over the key and every other input of the image (the Dockerfile and its
#           context rules, the workspace settings, the pnpm hooks and patches, and the root
#           manifest's `packageManager`): `ci-image.yml` rebuilds a key only when this changes, or
#           on its weekly schedule for operating-system patches.
# Environment:
#   CI_IMAGE_ARCH  architecture name to use instead of the machine's (`x64`, `arm64`).
# Exit codes: 0 printed; 1 an input is missing or unreadable; 2 usage.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# SHA-256 of standard input, hex; macOS has `shasum` where Linux has `sha256sum`.
sha256() {
  if command -v sha256sum > /dev/null; then sha256sum; else shasum -a 256; fi | cut -d' ' -f1
}
sha() { sha256 | cut -c1-16; }

node_version() {
  # The `default:` of the `node-version:` input, the first `default:` after it.
  awk '
    /^  node-version:/ { inside = 1; next }
    inside && /^  [a-z]/ { exit }
    inside && /^    default:/ { gsub(/^    default:[ ]*|['"'"'"]/, ""); print; exit }
  ' .github/actions/setup-nx/action.yml
}

arch() {
  if [ -n "${CI_IMAGE_ARCH:-}" ]; then
    echo "$CI_IMAGE_ARCH"
    return
  fi
  case "$(uname -m)" in
    x86_64 | amd64) echo x64 ;;
    aarch64 | arm64) echo arm64 ;;
    *) echo "Unknown machine $(uname -m)" >&2; exit 1 ;;
  esac
}

key() {
  local node
  node="$(node_version)"
  if [ -z "$node" ]; then
    echo "No default node-version in .github/actions/setup-nx/action.yml" >&2
    exit 1
  fi
  echo "lock-$(sha < pnpm-lock.yaml)-node${node}-linux-$(arch)"
}

recipe() {
  local package_manager
  package_manager="$(jq -r '.packageManager // empty' package.json)"
  if [ -z "$package_manager" ]; then
    echo "No packageManager in package.json" >&2
    exit 1
  fi
  {
    key
    echo "$package_manager"
    for file in tools/ci-image/Dockerfile tools/ci-image/Dockerfile.dockerignore pnpm-workspace.yaml \
      $(find tools/pnpm -type f | LC_ALL=C sort); do
      echo "$file $(sha256 < "$file")"
    done
  } | sha
}

case "${1:-}" in
  key) key ;;
  recipe) recipe ;;
  *) echo "Usage: $0 key|recipe" >&2; exit 2 ;;
esac
