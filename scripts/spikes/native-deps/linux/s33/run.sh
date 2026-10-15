#!/usr/bin/env bash
# Purpose: Spike S33 (native-dependency-resolution charter, Q36): `tau install` (PR 457) against a Verdaccio mirror
#   (uplink with cache: true, then the uplink removed), with the lock's `resolved` rewritten, an emulated registry
#   prefix override and a tampered tarball. Counts every request the CLI makes. Spike code only; nothing ships.
# Usage: scripts/spikes/native-deps/linux/s33/run.sh <work-dir> <evidence-dir>
# Environment: Linux with the Tau workspace installed and Docker (the verdaccio/verdaccio:6 image). Installed packages
#   are data: `tau install` never runs lifecycle scripts and this script never imports them.
# Exit codes: 0 cells ran (verdicts are in the evidence), 1 setup failed, 2 usage.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd)"
GUARD_URL="file://$REPO_ROOT/scripts/spikes/native-deps/linux/fetch-guard.ts"
if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <work-dir> <evidence-dir>" >&2
  exit 2
fi
work="$1"
evidence="$2"
mkdir -p "$work" "$evidence"
MIRROR=http://127.0.0.1:4873
IMAGE=verdaccio/verdaccio:6
offline_proxy=(HTTPS_PROXY=http://127.0.0.1:9 HTTP_PROXY=http://127.0.0.1:9 NO_PROXY=127.0.0.1,localhost NODE_USE_ENV_PROXY=1)

# run_tau <label> <project> [NAME=value ...] -- <tau arguments>
run_tau() {
  local label="$1" project="$2"
  shift 2
  local -a assignments=()
  while [[ "$1" != -- ]]; do
    assignments+=("$1")
    shift
  done
  shift
  local code=0 start
  start=$(date +%s.%N)
  (cd "$REPO_ROOT" && env "${assignments[@]}" TAU_CONFIG_DIR="$work/config-$label" SPIKE_FETCH_LOG="$evidence/$label-fetch.jsonl" \
    NODE_OPTIONS="--import=$GUARD_URL" node --import tsx "$REPO_ROOT/packages/cli/src/bin.ts" "$@" "$project") \
    >"$evidence/$label.out" 2>"$evidence/$label.err" || code=$?
  local npmjs=0 total=0 refused=0
  if [[ -f "$evidence/$label-fetch.jsonl" ]]; then
    total=$(wc -l <"$evidence/$label-fetch.jsonl")
    npmjs=$(grep -c '"origin":"https://registry.npmjs.org"' "$evidence/$label-fetch.jsonl" || true)
    refused=$(grep -c '"permitted":false' "$evidence/$label-fetch.jsonl" || true)
  fi
  local tree=none
  if [[ -d "$project/node_modules" ]]; then
    tree=$(cd "$project" && find node_modules -type f ! -name .tau-install-state.json -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -c1-16)
  fi
  echo "{\"cell\":\"$label\",\"exit\":$code,\"seconds\":$(echo "$(date +%s.%N) - $start" | bc),\"requests\":$total,\"npmjsRequests\":$npmjs,\"refused\":$refused,\"tree\":\"$tree\"}" |
    tee -a "$evidence/cells.jsonl"
}

start_verdaccio() {
  local config="$1"
  shift
  docker rm -f verdaccio >/dev/null 2>&1 || true
  docker run -d --name verdaccio -p 127.0.0.1:4873:4873 "$@" \
    -v "$config:/verdaccio/conf/config.yaml:ro" -v s33-storage:/verdaccio/storage "$IMAGE" >/dev/null
  for _ in $(seq 1 100); do
    curl -fsS -o /dev/null "$MIRROR/-/ping" && return 0
    sleep 0.3
  done
  docker logs verdaccio >&2
  return 1
}

project() {
  rm -rf "$1"
  mkdir -p "$1"
  cat >"$1/package.json" <<'JSON'
{
  "name": "s33-fixture",
  "private": true,
  "dependencies": {
    "@noble/hashes": "^1.8.0",
    "d3-shape": "^3.2.0",
    "is-number": "^7.0.0",
    "simplex-noise": "^4.0.3"
  }
}
JSON
}

# O: the reference lock and tree from the public registry, every request recorded.
project "$work/online"
run_tau online "$work/online" -- install
cp "$work/online/package-lock.json" "$evidence/online-package-lock.json"
online_tree=$(jq -r 'select(.cell=="online") | .tree' "$evidence/cells.jsonl")

# The mirror: Verdaccio proxying npmjs with cache: true, warmed by requesting every locked tarball through it.
cat >"$work/verdaccio-online.yaml" <<'YAML'
storage: /verdaccio/storage
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
    cache: true
packages:
  '@*/*':
    access: $all
    proxy: npmjs
  '**':
    access: $all
    proxy: npmjs
log: { type: stdout, format: pretty, level: http }
YAML
sed -e '/^uplinks:/,/cache: true/d' -e '/proxy: npmjs/d' "$work/verdaccio-online.yaml" >"$work/verdaccio-offline.yaml"
docker pull -q "$IMAGE" >/dev/null
docker image inspect "$IMAGE" --format '{{index .RepoDigests 0}}' | tee "$evidence/verdaccio-image.txt"
docker volume rm s33-storage >/dev/null 2>&1 || true
start_verdaccio "$work/verdaccio-online.yaml"
jq -r '.packages | to_entries[] | select(.key != "") | .value.resolved' "$work/online/package-lock.json" |
  sed "s#^https://registry.npmjs.org#$MIRROR#" >"$work/tarballs.txt"
warmed=0
while read -r url; do
  name=$(jq -r --arg u "${url/$MIRROR/https://registry.npmjs.org}" '.packages | to_entries[] | select(.value.resolved == $u) | .key | sub(".*node_modules/"; "")' "$work/online/package-lock.json" | head -1)
  curl -fsS -o /dev/null "$MIRROR/${name/\//%2f}"
  curl -fsS -o /dev/null "$url" && warmed=$((warmed + 1))
done <"$work/tarballs.txt"
echo "warmed $warmed of $(wc -l <"$work/tarballs.txt") tarballs" | tee "$evidence/warm.txt"

# From here on the mirror has no uplink: whatever it serves comes from its cache.
start_verdaccio "$work/verdaccio-offline.yaml"

# R: the lock's `resolved` rewritten to the mirror; no packument is needed because every locked version satisfies.
project "$work/rewrite"
sed "s#https://registry.npmjs.org/#$MIRROR/#g" "$work/online/package-lock.json" >"$work/rewrite/package-lock.json"
run_tau rewrite "$work/rewrite" "${offline_proxy[@]}" SPIKE_ALLOWED_ORIGINS="$MIRROR" -- install
cp "$work/rewrite/package-lock.json" "$evidence/rewrite-package-lock-after.json"

# F: a fresh resolve (no lock) as the code stands: packuments are fetched from registry.npmjs.org.
project "$work/fresh"
run_tau fresh "$work/fresh" "${offline_proxy[@]}" SPIKE_ALLOWED_ORIGINS="$MIRROR" -- install

# P1: an emulated registry prefix override (the transport maps https://registry.npmjs.org/ to the mirror); Verdaccio
# names its own host in each packument's dist.tarball.
project "$work/prefix-own-host"
run_tau prefix-own-host "$work/prefix-own-host" "${offline_proxy[@]}" SPIKE_ALLOWED_ORIGINS="$MIRROR" \
  SPIKE_REWRITE_FROM=https://registry.npmjs.org/ SPIKE_REWRITE_TO="$MIRROR/" -- install

# P2: the same with Verdaccio's public URL set to the registry prefix, so packuments keep npmjs tarball URLs.
start_verdaccio "$work/verdaccio-offline.yaml" -e VERDACCIO_PUBLIC_URL=https://registry.npmjs.org/
project "$work/prefix-public-url"
run_tau prefix-public-url "$work/prefix-public-url" "${offline_proxy[@]}" SPIKE_ALLOWED_ORIGINS="$MIRROR" \
  SPIKE_REWRITE_FROM=https://registry.npmjs.org/ SPIKE_REWRITE_TO="$MIRROR/" -- install
cp "$work/prefix-public-url/package-lock.json" "$evidence/prefix-public-url-package-lock.json" 2>/dev/null || true

# T: one byte appended to one cached tarball; the rewritten lock must refuse it (SRI).
start_verdaccio "$work/verdaccio-offline.yaml"
target=$(docker exec verdaccio sh -c "find /verdaccio/storage -name 'is-number-*.tgz' | head -1")
docker exec -u root verdaccio sh -c "printf x >> '$target'"
echo "tampered $target" | tee "$evidence/tamper.txt"
project "$work/tampered"
cp "$work/rewrite/package-lock.json" "$work/tampered/package-lock.json"
run_tau tampered "$work/tampered" "${offline_proxy[@]}" SPIKE_ALLOWED_ORIGINS="$MIRROR" -- install

docker logs verdaccio >"$evidence/verdaccio-last.log" 2>&1 || true
docker rm -f verdaccio >/dev/null 2>&1 || true
echo "online tree $online_tree" | tee "$evidence/online-tree.txt"
