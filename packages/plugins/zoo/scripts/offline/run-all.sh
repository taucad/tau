#!/usr/bin/env bash
# Runs every KCL sample through the offline engine, four at a time.
# Usage: run-all.sh <samplesDir> <outDir> <snapshotsDir> [jobs] [filter]
set -euo pipefail
samples=$1; out=$2; snaps=$3; jobs=${4:-4}; filter=${5:-}
here=$(cd "$(dirname "$0")" && pwd)
pkg=$(cd "$here/../.." && pwd)
mkdir -p "$out"
cd "$pkg"
ls "$samples" | grep -v -e README -e screenshots -e '\.' | grep -E "${filter:-.}" | \
  xargs -P "$jobs" -I{} sh -c "timeout 600 npx tsx --require ../../../tools/cjs-wasm-compat.cjs scripts/offline/run-sample.mts '$samples/{}' '$out/{}' '$snaps/{}' > '$out/{}.log' 2>&1 || echo '{\"name\":\"{}\",\"ok\":false,\"failure\":\"timeout or crash\"}' >> '$out/{}.log'; tail -1 '$out/{}.log' | cut -c1-400"
