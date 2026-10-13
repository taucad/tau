#!/usr/bin/env bash
#
# Clone a prepared Build123d Python tree and reinstall numpy and scipy for one macOS wheel tier.
#
# Why: spike S5 (charter D17, Q30) compares the floor wheels (numpy macosx_11_0, scipy macosx_12_0,
# OpenBLAS) with the macosx_14_0 Accelerate wheels. It uses the producer's own tool (uv) and the
# producer's hash-pinned lock, selecting the tier with uv's target platform and
# MACOSX_DEPLOYMENT_TARGET; the tree is an APFS clone, so the producer's tree stays untouched.
#
# Required env vars: none.
#
# Usage:
#   scripts/spikes/native-deps/wheel-tier-variant.sh <source-tree> <dest-tree> <deployment-target> <tags-json-out>
#   (deployment target 12.0 selects the floor tier, 14.0 the Accelerate tier)
#
# Exit codes:
#   0  Success
#   1  Validation failure (bad args)
#   3  Missing dependency
set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo "usage: wheel-tier-variant.sh <source-tree> <dest-tree> <deployment-target> <tags-json-out>" >&2
  exit 1
fi
command -v uv >/dev/null || { echo "ERROR: uv required" >&2; exit 3; }
REPO_ROOT="$(git rev-parse --show-toplevel)"
SOURCE="$1"
DEST="$2"
TARGET="$3"
TAGS_OUT="$4"

rm -rf "$DEST"
/bin/cp -c -R "$SOURCE" "$DEST"
MACOSX_DEPLOYMENT_TARGET="$TARGET" uv pip install --python "$DEST/bin/python3" --require-hashes --no-deps \
  --python-platform aarch64-apple-darwin --reinstall-package numpy --reinstall-package scipy \
  -r "$REPO_ROOT/packages/plugins/build123d/python/requirements.lock"

# Record the installed wheel tags as data (read from WHEEL files; nothing is executed).
{
  printf '{"deploymentTarget":"%s","wheels":{' "$TARGET"
  first=1
  for dist in "$DEST"/lib/python3.13/site-packages/{numpy,scipy,scikit_learn}-*.dist-info; do
    name="$(basename "$dist" .dist-info)"
    tags="$(grep '^Tag: ' "$dist/WHEEL" | sed 's/^Tag: //' | paste -sd, -)"
    [[ $first -eq 1 ]] || printf ','
    first=0
    printf '"%s":"%s"' "$name" "$tags"
  done
  printf '}}\n'
} > "$TAGS_OUT"
cat "$TAGS_OUT"
