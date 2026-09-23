#!/usr/bin/env bash
#
# Assemble unpublished root/platform GeoSpec native tarballs from existing builds.
#
# Uses the NAPI architecture policy's metadata-only preparation recipe. The
# source manifest and workspace lock remain unchanged; no package is published.
#
# Required env vars:
#   GEOSPEC_PRODUCER_RECEIPT  Selected native producer identity proof.
#   GEOSPEC_MIXED_RECEIPT    Successful mixed build receipt.
#   GEOSPEC_MIXED_COMMANDS   Mixed compile/link command receipt.
#   GEOSPEC_MIXED_INPUTS     Exact mixed build input manifest.
# Optional env vars:
#   GEOSPEC_DELIVERY_CACHE  Prepared source cache used by delivery materials.
#   GEOSPEC_OCCT_PREFIX     Qualified OCCT prefix inventoried by the relink kit.
# A supported Node 24/26 and the workspace-selected pnpm must be on PATH.
# Usage: pnpm nx run geospec-engine-native:assemble-package
# Exit codes: 0 success; 1 missing build output or assembly failure.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
PACKAGE_ROOT="$REPO_ROOT/packages/geospec-engine-native"
ASSEMBLY_CACHE="$REPO_ROOT/node_modules/.cache/geospec-engine-native"
mkdir -p "$ASSEMBLY_CACHE"
ASSEMBLY_ROOT="$(mktemp -d "$ASSEMBLY_CACHE/assembly-XXXXXX")"
STAGED_ROOT="$ASSEMBLY_ROOT/root"
mkdir -p "$STAGED_ROOT" "$ASSEMBLY_ROOT/tarballs"

NODE_BINARY="$PACKAGE_ROOT/bindings/node/generated/geospec-engine-native.darwin-arm64.node"
NODE_INSTALL_NAME="$(otool -D "$NODE_BINARY" | tail -n +2)"
if [[ "$NODE_INSTALL_NAME" != '@rpath/geospec-engine-native.node' ]]; then
  printf 'Unexpected Node binary install name: %s\n' "$NODE_INSTALL_NAME" >&2
  exit 1
fi

python3 -B "$PACKAGE_ROOT/scripts/generate-delivery-materials.py" \
  --cohort node \
  --output "$ASSEMBLY_ROOT/licenses" \
  --relink-output "$ASSEMBLY_ROOT/source-relink" \
  --relink-archive "$ASSEMBLY_ROOT/tarballs/geospec-engine-native-source-relink.tar.gz"

python3 -B - "$ASSEMBLY_ROOT/source-relink/receipts/mixed-producer-recipe.json" <<'PY'
import json
import os
from pathlib import Path
import sys

receipt = json.loads(Path(os.environ['GEOSPEC_MIXED_RECEIPT']).read_text())
recipe = json.loads(Path(sys.argv[1]).read_text())
expected = receipt['buildEnvironment']
if (recipe['recordedEnvironment'].get('CARGO_ENCODED_RUSTFLAGS') != expected['CARGO_ENCODED_RUSTFLAGS']
        or recipe['recordedEnvironment'].get('CXXFLAGS_wasm32_unknown_emscripten') !=
        expected['CXXFLAGS_wasm32_unknown_emscripten']
        or recipe['recordedEnvironment'].get('GEOSPEC_WASM_SIMD_PROFILE') !=
        expected['GEOSPEC_WASM_SIMD_PROFILE']
        or 'occt-mixed-simd128' not in recipe['rebuildMixedPrefix']):
    raise SystemExit('Mixed relink recipe does not reconstruct the selected SIMD producer')
PY

pnpm --dir "$PACKAGE_ROOT" pack --out "$ASSEMBLY_ROOT/source-pack.tgz"
tar -xzf "$ASSEMBLY_ROOT/source-pack.tgz" -C "$STAGED_ROOT" --strip-components=1
rm -rf "$STAGED_ROOT/licenses"
cp -R "$ASSEMBLY_ROOT/licenses" "$STAGED_ROOT/licenses"
pnpm --dir "$PACKAGE_ROOT" exec napi create-npm-dirs --cwd "$STAGED_ROOT" --npm-dir npm

node --input-type=module - "$PACKAGE_ROOT" "$STAGED_ROOT" <<'JS'
import { copyFileSync, cpSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
const [source, stage] = process.argv.slice(2);
for (const directory of readdirSync(join(stage, 'npm'))) {
  const target = join(stage, 'npm', directory);
  const manifest = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
  copyFileSync(join(source, 'bindings/node/generated', manifest.main), join(target, manifest.main));
  copyFileSync(join(source, 'LICENSE'), join(target, 'LICENSE'));
  copyFileSync(join(source, 'NOTICE'), join(target, 'NOTICE'));
  cpSync(join(stage, 'licenses'), join(target, 'licenses'), { recursive: true });
  const licenses = readdirSync(join(stage, 'licenses'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(stage, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
  manifest.files = [...new Set([...(manifest.files ?? [manifest.main]), 'NOTICE', ...licenses])];
  writeFileSync(join(target, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}
JS

pnpm --dir "$PACKAGE_ROOT" exec napi pre-publish --cwd "$STAGED_ROOT" --npm-dir npm --skip-optional-publish -t npm --no-gh-release --root-publisher pnpm
pnpm --dir "$STAGED_ROOT" pack --out "$ASSEMBLY_ROOT/tarballs/root.tgz"
for target in "$STAGED_ROOT"/npm/*; do
  pnpm --dir "$target" pack --out "$ASSEMBLY_ROOT/tarballs/$(basename "$target").tgz"
done
printf 'ASSEMBLY_ROOT=%s\n' "$ASSEMBLY_ROOT"
