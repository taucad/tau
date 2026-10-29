#!/usr/bin/env bash
# Fetches the KCL samples and Zoo's per-sample snapshots (physical properties, rendered images) from modeling-app.
# Usage: fetch-samples.sh <destDir> [commit]
set -euo pipefail
dest=$1; commit=${2:-b3ae0aca}
mkdir -p "$dest"
if [ ! -d "$dest/modeling-app/.git" ]; then
  git clone --filter=blob:none --no-checkout https://github.com/KittyCAD/modeling-app.git "$dest/modeling-app"
fi
cd "$dest/modeling-app"
git sparse-checkout set public/kcl-samples rust/kcl-lib/tests/kcl_samples
git checkout --quiet "$commit"
echo "samples:   $dest/modeling-app/public/kcl-samples"
echo "snapshots: $dest/modeling-app/rust/kcl-lib/tests/kcl_samples"
