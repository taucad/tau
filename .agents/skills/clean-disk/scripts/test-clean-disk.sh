#!/usr/bin/env bash
#
# Checks clean-disk dry and delete behavior in an isolated temporary home.
#
# Required env vars: none.
# Optional env vars: none.
#
# Usage:
#   .agents/skills/clean-disk/scripts/test-clean-disk.sh
#
# Exit codes:
#   0  Success
#   1  Check failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf -- "$TEST_ROOT"' EXIT

mkdir -p "$TEST_ROOT/.npm/_cacache" "$TEST_ROOT/Documents"
printf 'cache\n' >"$TEST_ROOT/.npm/_cacache/item"
printf 'keep\n' >"$TEST_ROOT/Documents/keep"

dry_output="$(CLEAN_DISK_HOME="$TEST_ROOT" "$SCRIPT_DIR/clean-disk.sh" dry)"
grep -q $'^MODE\tdry$' <<<"$dry_output"
grep -q $'^RECLAIMED_KIB\t0$' <<<"$dry_output"
[[ -f "$TEST_ROOT/.npm/_cacache/item" ]]

CLEAN_DISK_HOME="$TEST_ROOT" "$SCRIPT_DIR/clean-disk.sh" delete >/dev/null
[[ ! -e "$TEST_ROOT/.npm/_cacache" ]]
[[ -f "$TEST_ROOT/Documents/keep" ]]

# Registered worktree discovery must include only the two named caches.
git init -q "$TEST_ROOT/repo"
mkdir -p "$TEST_ROOT/repo/.nx/cache" "$TEST_ROOT/repo/.nx/workspace-data" "$TEST_ROOT/repo/node_modules/.vite" "$TEST_ROOT/repo/node_modules/keep"
printf 'cache\n' >"$TEST_ROOT/repo/.nx/cache/item"
printf 'keep\n' >"$TEST_ROOT/repo/.nx/workspace-data/item"
workspace_output="$(CLEAN_DISK_HOME="$TEST_ROOT" CLEAN_DISK_REPO="$TEST_ROOT/repo" "$SCRIPT_DIR/clean-disk.sh" dry)"
grep -q "$TEST_ROOT/repo/.nx/cache" <<<"$workspace_output"
grep -q "$TEST_ROOT/repo/node_modules/.vite" <<<"$workspace_output"
[[ "$workspace_output" != *workspace-data* && "$workspace_output" != *node_modules/keep* ]]
# Tracked cache content and symlink parents must never become deletion candidates.
git -C "$TEST_ROOT/repo" add .nx/cache/item
protected_output="$(CLEAN_DISK_HOME="$TEST_ROOT" CLEAN_DISK_REPO="$TEST_ROOT/repo" "$SCRIPT_DIR/clean-disk.sh" dry)"
grep -q $'SKIP_TRACKED\t' <<<"$protected_output"
rm -rf "$TEST_ROOT/repo/node_modules"
mkdir "$TEST_ROOT/dependencies" "$TEST_ROOT/dependencies/.vite"
ln -s "$TEST_ROOT/dependencies" "$TEST_ROOT/repo/node_modules"
protected_output="$(CLEAN_DISK_HOME="$TEST_ROOT" CLEAN_DISK_REPO="$TEST_ROOT/repo" "$SCRIPT_DIR/clean-disk.sh" dry)"
grep -q $'SKIP_SYMLINK_PARENT\t' <<<"$protected_output"

printf '✓ clean-disk checks passed\n'
