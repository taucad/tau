#!/usr/bin/env bash
#
# Assemble unpublished root/platform GeoSpec native tarballs from existing builds.
#
# Uses the NAPI architecture policy's metadata-only preparation recipe. The
# source manifest and workspace lock remain unchanged; no package is published.
#
# Required env vars: none.
# Optional env vars: none. Node24 must be first on PATH for pnpm.
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

pnpm --dir "$PACKAGE_ROOT" pack --out "$ASSEMBLY_ROOT/source-pack.tgz"
tar -xzf "$ASSEMBLY_ROOT/source-pack.tgz" -C "$STAGED_ROOT" --strip-components=1
pnpm --dir "$PACKAGE_ROOT" exec napi create-npm-dirs --cwd "$STAGED_ROOT" --npm-dir npm

node --input-type=module - "$PACKAGE_ROOT" "$STAGED_ROOT" <<'JS'
import { copyFileSync, cpSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [source, stage] = process.argv.slice(2);
for (const directory of readdirSync(join(stage, 'npm'))) {
  const target = join(stage, 'npm', directory);
  const manifest = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
  copyFileSync(join(source, 'bindings/node/generated', manifest.main), join(target, manifest.main));
  copyFileSync(join(source, 'LICENSE'), join(target, 'LICENSE'));
  copyFileSync(join(source, 'NOTICE'), join(target, 'NOTICE'));
  cpSync(join(source, 'licenses'), join(target, 'licenses'), { recursive: true });
  manifest.files = [...new Set([...(manifest.files ?? ['*.node']), 'NOTICE', 'licenses'])];
  writeFileSync(join(target, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}
JS

pnpm --dir "$PACKAGE_ROOT" exec napi pre-publish --cwd "$STAGED_ROOT" --npm-dir npm --skip-optional-publish -t npm --no-gh-release --root-publisher pnpm
pnpm --dir "$STAGED_ROOT" pack --out "$ASSEMBLY_ROOT/tarballs/root.tgz"
for target in "$STAGED_ROOT"/npm/*; do
  pnpm --dir "$target" pack --out "$ASSEMBLY_ROOT/tarballs/$(basename "$target").tgz"
done
printf 'ASSEMBLY_ROOT=%s\n' "$ASSEMBLY_ROOT"
