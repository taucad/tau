#!/usr/bin/env bash
# Purpose: Spike S12 (native-dependency-resolution charter, W18/Q51). Measure the serve UI build
#   as a gzip layer (pass <= 150 MB) and prove `tau serve --ui` serves it unchanged from a
#   digest-named store directory (<store>/closures/sha256/<hex>/client).
# Why: decides whether W18 needs a serve-UI trimming package before the UI ships as a layer.
# Environment: run from anywhere after `pnpm nx run ui:build:serve`; needs tar, gzip, sha256sum,
#   pnpm. Writes only under <out-dir>, <store-dir> and one generated test file it removes on exit.
# Usage: scripts/spikes/native-deps/linux/s12/measure-and-serve.sh <out-dir> <store-dir>
# Exit codes: 0 measured and both test runs green, 1 a test failed, 2 usage or missing build.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd)"
if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <out-dir> <store-dir>" >&2
  exit 2
fi
out="$(mkdir -p "$1" && cd "$1" && pwd)"
store="$(mkdir -p "$2" && cd "$2" && pwd)"
build="$REPO_ROOT/apps/ui/serve/build"
if [[ ! -f "$build/client/index.html" ]]; then
  echo "Missing $build/client/index.html; run pnpm nx run ui:build:serve first." >&2
  exit 2
fi
cd "$REPO_ROOT"

# 1. Measure. Deterministic tar so the digest is a property of the bytes, not of the checkout time.
layer="$out/serve-ui-client.tar.gz"
tar --sort=name --mtime='@0' --owner=0 --group=0 --numeric-owner -C "$build" -cf - client | gzip -9n >"$layer"
digest="$(sha256sum "$layer" | cut -d' ' -f1)"
{
  echo "layer_bytes=$(stat -c %s "$layer")"
  echo "layer_sha256=$digest"
  echo "unpacked_bytes=$(du -sb "$build/client" | cut -f1)"
  echo "files=$(find "$build/client" -type f | wc -l)"
  echo "wasm_files=$(find "$build/client" -type f -name '*.wasm' | wc -l)"
  echo "wasm_unpacked_bytes=$(find "$build/client" -type f -name '*.wasm' -printf '%s\n' | awk '{s+=$1} END {print s+0}')"
  echo "wasm_gzip_bytes=$(cd "$build" && find client -type f -name '*.wasm' -print0 | sort -z | tar --null --sort=name --mtime='@0' --owner=0 --group=0 --numeric-owner -T - -cf - | gzip -9n | wc -c)"
  echo "map_unpacked_bytes=$(find "$build/client" -type f -name '*.map' -printf '%s\n' | awk '{s+=$1} END {print s+0}')"
  echo "limit_bytes=157286400 (150 MiB); 150000000 (150 MB)"
} | tee "$out/measure.txt"
# Without source maps: the build emits hidden maps (`--sourcemapClient hidden`) that no page requests.
nomaps_bytes="$(tar --sort=name --mtime='@0' --owner=0 --group=0 --numeric-owner --exclude='*.map' -C "$build" -cf - client | gzip -9n | wc -c)"
echo "layer_without_maps_bytes=$nomaps_bytes" | tee -a "$out/measure.txt"
# Listings go through files: `sort | head` under pipefail fails on sort's broken pipe.
find "$build/client" -type f -printf '%s %P\n' | sort -rn >"$out/files-by-size.txt"
echo "largest files:" | tee -a "$out/measure.txt"
sed -n '1,15p' "$out/files-by-size.txt" | tee -a "$out/measure.txt"
echo "by extension (unpacked bytes, files):" | tee -a "$out/measure.txt"
awk '{n = split($2, parts, "."); ext = (n > 1) ? parts[n] : "(none)"; size[ext] += $1; count[ext] += 1} END {for (k in size) print size[k], count[k], k}' "$out/files-by-size.txt" | sort -rn >"$out/by-extension.txt"
sed -n '1,12p' "$out/by-extension.txt" | tee -a "$out/measure.txt"

# 2. Unpack the layer into a digest-named store directory (the W18 placement), as the host would.
target="$store/closures/sha256/$digest"
mkdir -p "$target"
tar -xzf "$layer" -C "$target"
echo "store_ui_root=$target/client" | tee -a "$out/measure.txt"

# 3. The serve-build gate, unchanged, against the in-tree build.
status=0
pnpm exec vitest run --dir apps/ui-e2e apps/ui-e2e/src/support/serve-ui-build.test.ts --environment=node 2>&1 | tee "$out/serve-ui-build.in-tree.txt" || status=1

# 4. The same test with only its UI root swapped to the store path; the in-tree build is moved
#    aside so nothing can fall back to it.
generated="apps/ui-e2e/src/support/serve-ui-build.s12-store.test.ts"
trap 'rm -f "$REPO_ROOT/$generated"; [[ -d "$build/client.s12-moved" ]] && mv "$build/client.s12-moved" "$build/client"' EXIT
sed "s|^const uiRoot = resolvePath(repoRoot, 'apps/ui/serve/build/client');\$|const uiRoot = process.env['S12_UI_ROOT'] ?? '';|" \
  apps/ui-e2e/src/support/serve-ui-build.test.ts >"$generated"
changed="$(diff apps/ui-e2e/src/support/serve-ui-build.test.ts "$generated" | grep -c '^>' || true)"
if [[ "$changed" != "1" ]]; then
  echo "Expected exactly one changed line in the store variant, got $changed" >&2
  exit 1
fi
mv "$build/client" "$build/client.s12-moved"
S12_UI_ROOT="$target/client" pnpm exec vitest run --dir apps/ui-e2e "$generated" --environment=node 2>&1 | tee "$out/serve-ui-build.store.txt" || status=1
exit "$status"
