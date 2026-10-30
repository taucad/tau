#!/usr/bin/env bash
# Builds the offline engine's own libcascade: only the bindings libcascade-kcl.yml lists, plus the TauOffline native
# helpers in tau-offline.cpp. Needs Docker; a link takes 10 to 15 minutes on four cores.
#
# Usage: libcascade/build.sh [outDir]   (from packages/plugins/zoo; default src/offline/wasm, the checked-in build)
# Try a build elsewhere first with: OFFLINE_LIBCASCADE=<outDir>/libcascade_kcl.js npx tsx scripts/offline/run-sample.mts ...
# After changing which `oc.*` members the engine calls, run `python3 libcascade/symbols.py` first.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
out=${1:-$here/../src/offline/wasm}
image=${LIBCASCADE_IMAGE:-ghcr.io/taucad/opencascade.js:single-threaded}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cp "$here/libcascade-kcl.yml" "$here/tau-offline.cpp" "$work/"
docker run --rm -v "$work:/src" "$image" link libcascade-kcl.yml
mkdir -p "$out"
cp "$work"/libcascade_kcl.{js,wasm,d.ts} "$out/"
ls -l "$out"
