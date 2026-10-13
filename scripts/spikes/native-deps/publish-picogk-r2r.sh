#!/usr/bin/env bash
#
# Republish the PicoGK worker with PublishReadyToRun=true beside the IL-only tree that
# desktop:prepare-picogk-dotnet produced, and measure both Tau layers (raw and gzip).
#
# Why: spike S2 (charter Q79, D22) compares ReadyToRun with today's IL-only Tau layer. It reuses
# the producer's pinned SDK, NuGet cache and patched PicoGK source under out/cache/picogk; it
# changes no product source. The Tau layer is every file the Microsoft runtime pack does not supply.
#
# Required env vars: none.
#
# Usage:
#   scripts/spikes/native-deps/publish-picogk-r2r.sh <il-tree> <r2r-tree-out> <layer-json-out>
#
# Exit codes:
#   0  Success
#   1  Validation failure (bad args, missing producer state)
#   3  Missing dependency
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: publish-picogk-r2r.sh <il-tree> <r2r-tree-out> <layer-json-out>" >&2
  exit 1
fi
command -v node >/dev/null || { echo "ERROR: node required" >&2; exit 3; }
REPO_ROOT="$(git rev-parse --show-toplevel)"
IL_TREE="$(cd "$1" && pwd)"
R2R_TREE="$2"
LAYER_JSON="$3"
CACHE="$REPO_ROOT/out/cache/picogk"
DOTNET_ROOT="$CACHE/dotnet-10.0.400-darwin-arm64"
PICOGK_PROJECT="$(ls -d "$CACHE"/PicoGK-*/PicoGK.csproj | head -1)"
WORKER_PROJECT="$REPO_ROOT/packages/plugins/picogk/dotnet/Tau.PicoGK.Worker/Tau.PicoGK.Worker.csproj"
RUNTIME_PACK="$CACHE/nuget-packages/microsoft.netcore.app.runtime.osx-arm64/10.0.11/runtimes/osx-arm64"
[[ -x "$DOTNET_ROOT/dotnet" && -f "$PICOGK_PROJECT" && -d "$RUNTIME_PACK" ]] || {
  echo "ERROR: run desktop:prepare-picogk-dotnet first ($DOTNET_ROOT, $PICOGK_PROJECT, $RUNTIME_PACK)" >&2
  exit 1
}
export DOTNET_ROOT DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_MULTILEVEL_LOOKUP=0 DOTNET_NOLOGO=1
export NUGET_PACKAGES="$CACHE/nuget-packages"
PUBLISH_OUT="$(mktemp -d)"

printf '%s\n' "→ restore and publish with PublishReadyToRun=true"
"$DOTNET_ROOT/dotnet" restore "$WORKER_PROJECT" --runtime osx-arm64 --locked-mode \
  "-p:PicoGKProject=$PICOGK_PROJECT" -p:RestorePackagesWithLockFile=true -p:NuGetLockFilePath=packages.lock.json \
  -p:PublishReadyToRun=true
"$DOTNET_ROOT/dotnet" publish "$WORKER_PROJECT" --configuration Release --runtime osx-arm64 --self-contained true \
  --no-restore --output "$PUBLISH_OUT" "-p:PicoGKProject=$PICOGK_PROJECT" -p:PublishReadyToRun=true
find "$PUBLISH_OUT" \( -name '*.pdb' -o -name '*.xml' \) -delete

rm -rf "$R2R_TREE"
cp -R "$IL_TREE" "$R2R_TREE"
cp -R "$PUBLISH_OUT"/. "$R2R_TREE"/

printf '%s\n' "→ rehash the runtime manifest of the ReadyToRun tree"
node --input-type=module - "$R2R_TREE" "$IL_TREE" "$RUNTIME_PACK" "$LAYER_JSON" <<'NODE'
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const [r2rTree, ilTree, runtimePack, layerJson] = process.argv.slice(2);
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const filesUnder = (root) => {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else files.push(relative(root, path));
    }
  };
  visit(root);
  return files.sort();
};
const manifestPath = join(r2rTree, 'tau-runtime-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const known = new Set(manifest.resourceFiles.map(({ path }) => path));
manifest.workerSha256 = sha(join(r2rTree, manifest.workerPath));
manifest.resourceFiles = manifest.resourceFiles.map((file) => ({ ...file, sha256: sha(join(r2rTree, file.path)) }));
for (const path of filesUnder(r2rTree)) {
  if (path !== manifest.workerPath && path !== 'tau-runtime-manifest.json' && !known.has(path)) {
    manifest.resourceFiles.push({ path, sha256: sha(join(r2rTree, path)), label: `PicoGK runtime ${path}` });
  }
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`);

const runtimeNames = new Set([
  ...readdirSync(join(runtimePack, 'lib/net10.0')),
  ...readdirSync(join(runtimePack, 'native')),
]);
const layer = (tree) => {
  const files = filesUnder(tree).filter((path) => path.includes('/') || !runtimeNames.has(path));
  const rawBytes = files.reduce((sum, path) => sum + statSync(join(tree, path)).size, 0);
  const gzipBytes = execFileSync('/bin/sh', ['-c', 'tar -cf - -T - | gzip -9 | wc -c'], {
    cwd: tree,
    input: `${files.join('\n')}\n`,
    maxBuffer: 1024 * 1024,
  });
  const changed = files.filter((path) => {
    try {
      return sha(join(tree, path)) !== sha(join(ilTree, path));
    } catch {
      return true;
    }
  });
  return { files: files.length, rawBytes, gzipBytes: Number(String(gzipBytes).trim()), changedFromIl: changed.length };
};
const totals = (tree) => filesUnder(tree).reduce((sum, path) => sum + statSync(join(tree, path)).size, 0);
writeFileSync(
  layerJson,
  `${JSON.stringify({ il: { treeBytes: totals(ilTree), layer: layer(ilTree) }, r2r: { treeBytes: totals(r2rTree), layer: layer(r2rTree) }, runtimePackFiles: runtimeNames.size }, undefined, 2)}\n`,
);
NODE
rm -rf "$PUBLISH_OUT"
printf '%s\n' "✓ ReadyToRun tree at $R2R_TREE"
