#!/usr/bin/env bash
#
# Release the @taucad/opencascade.js Docker image to GHCR.
#
# Cuts an annotated git tag on the taucad/opencascade.js fork (at
# repos/opencascade.js), pushes it to origin, then watches the docker.yml
# workflow that builds + publishes multi-arch images to
# ghcr.io/taucad/opencascade.js. CI builds linux/amd64 and linux/arm64 on
# native runners (no QEMU) and merges them into a single manifest list — see
# repos/opencascade.js/.github/workflows/docker.yml.
#
# Required arguments:
#   $1   Tag (e.g. v3.0.0-beta.d3056ef). Must start with 'v'.
#
# Optional env vars:
#   OCJS_RELEASE_BRANCH   Default: occt-v8-emscripten-5
#   OCJS_REPO_SLUG        Default: taucad/opencascade.js
#   OCJS_WORKFLOW         Default: docker.yml
#
# Usage:
#   ./scripts/release-ocjs-image.sh v3.0.0-beta.d3056ef
#
# Exit codes:
#   0  Tag pushed and CI run completed successfully.
#   1  Validation failed (bad tag, wrong branch, dirty tree, missing repo dir).
#   2  Git push or `gh run watch` failed.
#   3  Missing dependency (gh, git).

set -euo pipefail

TAG="${1:?usage: release-ocjs-image.sh v<version>}"
[[ "$TAG" =~ ^v[0-9] ]] || {
  echo "ERROR: tag must start with 'v' followed by a digit (got: $TAG)" >&2
  exit 1
}

BRANCH="${OCJS_RELEASE_BRANCH:-occt-v8-emscripten-5}"
SLUG="${OCJS_REPO_SLUG:-taucad/opencascade.js}"
WORKFLOW="${OCJS_WORKFLOW:-docker.yml}"

command -v gh >/dev/null  || { echo "ERROR: gh CLI required (https://cli.github.com/)" >&2; exit 3; }
command -v git >/dev/null || { echo "ERROR: git required" >&2; exit 3; }

REPO_ROOT="$(git rev-parse --show-toplevel)"
OCJS_DIR="${REPO_ROOT}/repos/opencascade.js"
[[ -d "$OCJS_DIR" ]] || { echo "ERROR: $OCJS_DIR not found (run from tau monorepo with repos cloned)" >&2; exit 1; }

cd "$OCJS_DIR"

CURRENT="$(git symbolic-ref --short HEAD)"
[[ "$CURRENT" == "$BRANCH" ]] || {
  echo "ERROR: on branch '$CURRENT' inside $OCJS_DIR, expected '$BRANCH'" >&2
  echo "  override with OCJS_RELEASE_BRANCH=<branch> if intentional" >&2
  exit 1
}

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: working tree in $OCJS_DIR is dirty; commit or stash before tagging" >&2
  exit 1
fi

if git rev-parse --verify --quiet "refs/tags/$TAG" >/dev/null; then
  echo "ERROR: tag '$TAG' already exists locally; delete or pick a new version" >&2
  exit 1
fi

echo "→ Tagging $TAG on $SLUG@$CURRENT"
git tag -a "$TAG" -m "release: $TAG"

echo "→ Pushing tag to origin"
git push origin "$TAG" || { echo "ERROR: git push failed" >&2; exit 2; }

echo "→ Waiting briefly for GitHub to register the workflow run"
sleep 5

echo "→ Locating the workflow run triggered by $TAG"
RUN_ID="$(gh run list \
  --repo "$SLUG" \
  --workflow "$WORKFLOW" \
  --event push \
  --limit 5 \
  --json databaseId,headBranch \
  --jq ".[] | select(.headBranch == \"$TAG\") | .databaseId" \
  | head -n1)"

if [[ -z "$RUN_ID" ]]; then
  echo "ERROR: no '$WORKFLOW' run found for tag '$TAG' on $SLUG" >&2
  echo "  check https://github.com/$SLUG/actions and re-run with OCJS_WORKFLOW if needed" >&2
  exit 2
fi

echo "→ Watching run $RUN_ID (https://github.com/$SLUG/actions/runs/$RUN_ID)"
gh run watch --repo "$SLUG" --exit-status "$RUN_ID" || {
  echo "ERROR: CI run $RUN_ID failed" >&2
  exit 2
}

echo "✓ Published. Verify with:"
echo "  docker pull ghcr.io/taucad/opencascade.js:${TAG#v}"
echo "  docker buildx imagetools inspect ghcr.io/taucad/opencascade.js:${TAG#v}"
