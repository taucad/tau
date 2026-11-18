#!/usr/bin/env bash
#
# Purpose: prove a built CI job image before it is pinned (`ci-image.yml`): the tag it carries is this
#          checkout's key, Node.js is `setup-nx`'s version, pnpm is the root manifest's, the sandbox and
#          job tools are present, no npm configuration or token is baked in, and a frozen install of
#          this checkout runs offline from its store, in the workspace mount a job container uses.
# Usage:   tools/ci-image/smoke.sh <image reference>
# Environment: none. Needs Docker. The install writes `node_modules` into a scratch copy of the
#          lockfile's workspace manifests, never into this checkout.
# Exit codes: 0 the image passed; 1 a check failed; 2 usage.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  echo "Usage: $0 <image reference>" >&2
  exit 2
fi
image="$1"
key="$(tools/ci-image/image-key.sh key)"
node_version="${key#*-node}"
node_version="${node_version%-linux-*}"
pnpm_version="$(jq -r '.packageManager' package.json)"
pnpm_version="${pnpm_version#pnpm@}"
pnpm_version="${pnpm_version%%+*}"

echo "Checking $image for $key (Node.js $node_version, pnpm $pnpm_version)"
docker run --rm --network none \
  -e EXPECTED_TAG="$key" -e EXPECTED_NODE="v$node_version" -e EXPECTED_PNPM="$pnpm_version" \
  "$image" bash -euo pipefail -c '
    fail() { echo "::error title=CI image::$1" >&2; exit 1; }
    [ "$TAU_CI_IMAGE_TAG" = "$EXPECTED_TAG" ] || fail "tag $TAU_CI_IMAGE_TAG, expected $EXPECTED_TAG"
    [ "$(node --version)" = "$EXPECTED_NODE" ] || fail "Node.js $(node --version), expected $EXPECTED_NODE"
    [ "$(cd /tmp && pnpm --version)" = "$EXPECTED_PNPM" ] || fail "pnpm $(cd /tmp && pnpm --version), expected $EXPECTED_PNPM"
    for tool in git jq tar zstd xz unzip curl python3 make g++ bwrap socat rg uv perl; do
      command -v "$tool" > /dev/null || fail "$tool is missing"
    done
    git lfs version > /dev/null || fail "git lfs is missing"
    [ -n "$(ls -A /opt/pnpm-store 2> /dev/null)" ] || fail "the pnpm store is empty"
    for rc in /root/.npmrc /etc/npmrc /usr/local/etc/npmrc /root/.config/pnpm/rc; do
      [ ! -e "$rc" ] || fail "$rc is in the image"
    done
    if grep -rIlsE "_authToken|_auth=|NPM_TOKEN|NODE_AUTH_TOKEN|GITHUB_TOKEN" /root /etc /usr/local/etc /opt/corepack 2> /dev/null | head -1 | grep -q .; then
      fail "a registry credential setting is in the image"
    fi
    echo "Image contents: ok"
  '

# A copy of what the install reads, mounted where a job container mounts its workspace.
workspace="$(mktemp -d)"
trap 'docker run --rm -v "$workspace:/w" "$image" rm -rf /w/tau > /dev/null 2>&1 || true; rm -rf "$workspace"' EXIT
mkdir -p "$workspace/tau"
git ls-files -z -- package.json pnpm-lock.yaml pnpm-workspace.yaml tools/pnpm '*package.json' \
  | xargs -0 cp --parents -t "$workspace/tau"
echo "Frozen install offline from the image's store"
start=$(date +%s)
docker run --rm --network none -e CI=true -e HUSKY=0 -v "$workspace/tau:/__w/tau/tau" -w /__w/tau/tau "$image" \
  pnpm install --frozen-lockfile --offline --reporter=append-only > "$workspace/install.log" 2>&1 \
  || { tail -40 "$workspace/install.log"; echo "::error title=CI image::the frozen install failed offline" >&2; exit 1; }
tail -3 "$workspace/install.log"
echo "Frozen install offline: ok in $(($(date +%s) - start)) s"
