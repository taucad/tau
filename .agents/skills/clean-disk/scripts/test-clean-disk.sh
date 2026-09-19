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

printf '✓ clean-disk checks passed\n'
