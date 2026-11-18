#!/usr/bin/env bash
#
# Purpose: name the CI job image a job on this checkout may run in, pinned by digest, or nothing.
#          A job that gets nothing runs the `setup-nx` path on the runner, so a lockfile change whose
#          image is not built or not pinned yet never fails or waits for one.
# Usage:   tools/ci-image/resolve.sh
#          Prints `key=<key>` and `image=<image>@sha256:<digest>`, or `image=` with the reason on
#          stderr; append it to "$GITHUB_OUTPUT" in a workflow step.
# Environment:
#   TAU_CI_IMAGE  `off` resolves no image (the rollback switch; a repository variable in workflows).
# Exit codes: 0 resolved, with or without an image; 1 the lock file is unreadable.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

lock=tools/ci-image/image.lock.json
key="$(tools/ci-image/image-key.sh key)"
echo "key=$key"

if [ "${TAU_CI_IMAGE:-}" = off ]; then
  echo "TAU_CI_IMAGE is off: no CI job image" >&2
  echo "image="
  exit 0
fi

image="$(jq -er '.image' "$lock")"
digest="$(jq -r --arg key "$key" '.digests[$key].digest // empty' "$lock")"
if [ -z "$digest" ]; then
  echo "No CI job image is pinned for $key: the job sets up on the runner" >&2
  echo "image="
elif ! [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "::warning title=CI job image::$lock pins '$digest' for $key, which is not a digest; the job sets up on the runner" >&2
  echo "image="
else
  echo "image=$image@$digest"
fi
