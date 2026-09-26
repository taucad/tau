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
#   GEOSPEC_MT_ASSET_RECEIPT        Explicit per-permit MT product asset receipt.
#   GEOSPEC_MT_QUALIFICATION_RECEIPT  Independent Node/browser/pthread parity qualification.
# A supported Node 24/26 and the workspace-selected pnpm must be on PATH.
# Usage: pnpm nx run geospec-engine-native:assemble-package
# Exit codes: 0 success; 1 missing build output or assembly failure.

set -euo pipefail

stage_mt_assets() {
  if [[ -z "${GEOSPEC_MT_ASSET_RECEIPT:-}" && -z "${GEOSPEC_MT_QUALIFICATION_RECEIPT:-}" ]]; then
    return
  fi
  if [[ -z "${GEOSPEC_MT_ASSET_RECEIPT:-}" || -z "${GEOSPEC_MT_QUALIFICATION_RECEIPT:-}" ]]; then
    printf 'MT packaging requires both asset and qualification receipts.\n' >&2
    exit 1
  fi
  node --input-type=module - "$GEOSPEC_MT_ASSET_RECEIPT" "$GEOSPEC_MT_QUALIFICATION_RECEIPT" "$1" <<'JS'
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

const [assetPath, qualificationPath, stage] = process.argv.slice(2);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const requireMatch = (condition, message) => {
  if (!condition) throw new Error(`MT package closure: ${message}`);
};
requireMatch(basename(assetPath) === 'geospec_engine_native.mt.json', 'asset receipt filename');
const product = realpathSync(dirname(assetPath));
requireMatch(!realpathSync(qualificationPath).startsWith(`${product}/`), 'qualification must be independent of the build product');
const assetBytes = readFileSync(assetPath);
const asset = JSON.parse(assetBytes);
const qualification = JSON.parse(readFileSync(qualificationPath));
requireMatch(asset.schema === 'geospec-mixed-mt-assets-v1', 'asset receipt schema');
requireMatch(Number.isSafeInteger(asset.permits) && asset.permits > 0 && asset.permits <= 4_294_967_295, 'permits');
requireMatch(
  qualification.schema === 'geospec-mt-qualification-v1' &&
    qualification.verdict === 'passed' &&
    qualification.permits === asset.permits &&
    qualification.assetReceiptSha256 === sha256(assetBytes) &&
    qualification.checks?.nodePthreads === true &&
    qualification.checks?.browserPthreads === true &&
    qualification.checks?.stParity === true,
  'independent qualification receipt',
);
const assets = [
  ['buildReceipt', 'build-receipt.json'],
  ['glue', 'geospec_engine_native.mjs'],
  ['wasm', 'geospec_engine_native.wasm'],
];
const verified = new Map();
for (const [field, filename] of assets) {
  const declared = asset[field];
  requireMatch(
    declared?.file === filename &&
      Number.isSafeInteger(declared.bytes) &&
      declared.bytes > 0 &&
      /^[0-9a-f]{64}$/.test(declared.sha256),
    `${field} declaration`,
  );
  const source = resolve(product, filename);
  requireMatch(realpathSync(source) === source, `${field} must be a regular product file`);
  const bytes = readFileSync(source);
  requireMatch(bytes.length === declared.bytes && sha256(bytes) === declared.sha256, `${field} bytes`);
  verified.set(filename, bytes);
}
requireMatch(
  JSON.stringify(asset.worker) === JSON.stringify(asset.glue),
  'pthread worker must be the verified main ES module',
);
const build = JSON.parse(verified.get('build-receipt.json'));
requireMatch(
    build.schema === 'geospec-mixed-build-receipt-mt-v1' &&
    build.variant === 'mt' &&
    isAbsolute(build.output) &&
    build.mtSettings?.executionPermits === asset.permits &&
    /^[0-9a-f]{40}$/.test(build.sourceRevision) &&
    build.sourceRevision === qualification.sourceRevision &&
    qualification.buildReceiptSha256 === asset.buildReceipt.sha256,
  'qualified build identity',
);
for (const [field, filename] of assets.slice(1)) {
  const declared = asset[field];
  requireMatch(
    build.artifacts?.some(
      (entry) =>
        entry.path === join(build.output, filename) &&
        entry.bytes === declared.bytes &&
        entry.sha256 === declared.sha256,
    ),
    `${field} build artifact`,
  );
}
const target = join(stage, 'dist/bindings/mt-wasm', `permits-${asset.permits}`);
mkdirSync(target, { recursive: true });
for (const [, filename] of assets) copyFileSync(join(product, filename), join(target, filename));
copyFileSync(assetPath, join(target, 'geospec_engine_native.mt.json'));
copyFileSync(qualificationPath, join(target, 'qualification.json'));
const manifestPath = join(stage, 'package.json');
const manifest = JSON.parse(readFileSync(manifestPath));
const exportName = `./mt-assets/permits-${asset.permits}/*`;
const exportTarget = `./dist/bindings/mt-wasm/permits-${asset.permits}/*`;
requireMatch(manifest.exports?.[exportName] === undefined, 'MT export already exists');
manifest.exports[exportName] = exportTarget;
manifest.publishConfig.exports[exportName] = exportTarget;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
JS
}

if [[ "${1:-}" == '--stage-mt-assets' ]]; then
  stage_mt_assets "${2:?Supply package staging root}"
  exit 0
fi

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
stage_mt_assets "$STAGED_ROOT"
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
