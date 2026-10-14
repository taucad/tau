#!/usr/bin/env bash
#
# Open this worktree's verified native Chromium browser review build.
#
# See docs/research/artifacts/desktop-browser/local-native.md for build and test evidence.
# Uses a separate profile and config; never opens an installed Tau by name.
#
# Required env vars:
#   HOME  macOS home directory (normally provided by the login shell).
# Optional env vars:
#   None. The app, receipt and profile are bound to this worktree.
#
# Usage:
#   /absolute/path/to/tau/apps/desktop/scripts/open-browser-review.sh
#
# Exit codes:
#   0  Launch request accepted by macOS
#   1  Unsupported host, arguments, missing build or changed build receipt
#   2  macOS launch failed
#   3  Missing command-line dependency

set -euo pipefail

: "${HOME:?set HOME}"
[[ $# -eq 0 && "$(uname -s)" == Darwin ]] || {
  printf '%s\n' 'ERROR: run on macOS without arguments.' >&2
  exit 1
}
for dependency in git shasum open; do
  command -v "$dependency" >/dev/null || {
    printf 'ERROR: %s is required.\n' "$dependency" >&2
    exit 3
  }
done

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$script_directory" rev-parse --show-toplevel)"
package_root="$REPO_ROOT/out/artifacts/desktop-browser-review"
app_path="$package_root/Tau-darwin-arm64/Tau.app"
receipt="$package_root/browser-review.sha256"
revision_file="$package_root/browser-review-revision.txt"
[[ -x "$app_path/Contents/MacOS/Tau" && -f "$receipt" && -f "$revision_file" ]] || {
  printf 'ERROR: verified browser review build is missing from %s.\n' "$package_root" >&2
  printf '%s\n' 'See docs/research/artifacts/desktop-browser/local-native.md.' >&2
  exit 1
}
(cd "$package_root" && shasum -a 256 --check --status "$receipt") || {
  printf '%s\n' 'ERROR: build contents changed since verification; rebuild and verify before launching.' >&2
  exit 1
}

worktree_id="$(printf '%s' "$REPO_ROOT" | shasum -a 256 | cut -c 1-12)"
profile_path="$HOME/Library/Application Support/Tau Browser Review/$worktree_id-overlays"
mkdir -p "$profile_path"
printf '→ Source revision: %s\n' "$(cat "$revision_file")"
printf '→ Build: %s\n' "$app_path"
printf '→ Isolated profile: %s\n' "$profile_path"
/usr/bin/open -n "$app_path" \
  --env "TAU_CONFIG_DIR=$profile_path/config" \
  --env 'TAU_DESKTOP_UPDATES=off' \
  --args "--user-data-dir=$profile_path" || exit 2
printf '%s\n' '✓ Opened the verified browser review build.'
