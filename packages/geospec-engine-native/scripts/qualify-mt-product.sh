#!/usr/bin/env bash
#
# Build (unless supplied), stage and qualify one MT WASM product end to end.
#
# Push-button: one fresh output directory; writes the published-shape ST package, the MT build log and
# one geospec-mt-qualification-v1 receipt per Node runtime. Never writes into either product.
# Verifier only: `--verify <qualify-mt-product.mjs arguments>` runs the independent verifier on pinned inputs.
#
# Required env vars (push-button):
#   GEOSPEC_MIXED_INPUTS       Verified mixed input manifest that also built the installed ST product.
#   GEOSPEC_MIXED_MT_PERMITS   Caller-inclusive permit cap to build (unused with GEOSPEC_MT_ASSET_RECEIPT).
# Optional env vars:
#   GEOSPEC_MT_ASSET_RECEIPT   Existing product geospec_engine_native.mt.json to qualify instead of building.
#   GEOSPEC_NODE26             Node 26 executable; the product is qualified under it as well.
# Usage: packages/geospec-engine-native/scripts/qualify-mt-product.sh /absolute/fresh/output-dir
# Exit codes: 0 every run qualified; 1 build, staging or qualification refusal (evidence is kept).

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
verifier="${script_dir}/../bindings/browser-conformance/qualify-mt-product.mjs"
if [[ "${1:-}" == '--verify' ]]; then
  shift
  exec node "$verifier" "$@"
fi

output="${1:?Supply a fresh absolute output directory}"
[[ "$output" == /* && ! -e "$output" ]] || { printf 'Output must be a fresh absolute path.\n' >&2; exit 1; }
: "${GEOSPEC_MIXED_INPUTS:?Set GEOSPEC_MIXED_INPUTS to the shared ST/MT mixed input manifest}"
package_root="$(cd -- "${script_dir}/.." && pwd)"
repo_root="$(cd -- "${package_root}/../.." && pwd)"
mkdir -p "$output"
sha() { shasum -a 256 "$1" | cut -d' ' -f1; }

receipt="${GEOSPEC_MT_ASSET_RECEIPT:-}"
if [[ -z "$receipt" ]]; then
  : "${GEOSPEC_MIXED_MT_PERMITS:?Set GEOSPEC_MIXED_MT_PERMITS or GEOSPEC_MT_ASSET_RECEIPT}"
  GEOSPEC_MIXED_VARIANT=mt node "${script_dir}/build-mixed-wasm.mts" | tee "$output/build-mt.stdout"
  # The build prints its artifact list last; the asset receipt sits beside them.
  product="$(node -e 'const a=JSON.parse(require("fs").readFileSync(0,"utf8").trim().split("\n").pop());process.stdout.write(require("path").dirname(a[0].path))' <"$output/build-mt.stdout")"
  receipt="$product/geospec_engine_native.mt.json"
fi

# The ST build receipt beside the installed ST product proves both come from one manifest.
st_cache="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).cache)' "$GEOSPEC_MIXED_INPUTS")"
st_build_receipt="$(ls -t "$st_cache"/attempt-*/build-receipt.json | head -1)"

# Published shape: the package's own tsdown build, then pnpm's publishConfig projection.
(cd "$package_root" && "$repo_root/node_modules/.bin/tsdown") >"$output/tsdown.log"
pnpm --dir "$package_root" pack --out "$output/st.tgz" >"$output/pack.log"
mkdir "$output/st-package"
tar -xzf "$output/st.tgz" -C "$output/st-package" --strip-components=1
st="$output/st-package/dist"

status=0
for runtime in node ${GEOSPEC_NODE26:+"$GEOSPEC_NODE26"}; do
  major="$("$runtime" -p 'process.versions.node.split(".")[0]')"
  "$runtime" "$verifier" \
    --mt-receipt "$receipt" --mt-receipt-sha256 "$(sha "$receipt")" \
    --st-package "$output/st-package" \
    --st-module-sha256 "$(sha "$st/wasm.mjs")" \
    --st-glue-sha256 "$(sha "$st/bindings/mixed-wasm/geospec_engine_native.mjs")" \
    --st-wasm-sha256 "$(sha "$st/bindings/mixed-wasm/geospec_engine_native.wasm")" \
    --st-build-receipt "$st_build_receipt" \
    --output "$output/qualification-node${major}.json" || status=1
done
exit "$status"
