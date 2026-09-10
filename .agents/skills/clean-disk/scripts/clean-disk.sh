#!/usr/bin/env bash
#
# Audits or deletes a fixed allowlist of reproducible developer caches.
#
# Optional env vars:
#   CLEAN_DISK_HOME  Home directory to inspect (default: current user's home).
#
# Usage:
#   .agents/skills/clean-disk/scripts/clean-disk.sh [dry|delete]
#
# Exit codes:
#   0  Success
#   1  Invalid input or unsafe path
#   3  Missing dependency

set -euo pipefail

MODE="${1:-dry}"
CLEAN_DISK_HOME="${CLEAN_DISK_HOME:-${HOME}}"

[[ $# -le 1 && ( "$MODE" == dry || "$MODE" == delete ) ]] || {
  printf 'ERROR: usage: %s [dry|delete]\n' "$0" >&2
  exit 1
}
[[ "$CLEAN_DISK_HOME" == /* && "$CLEAN_DISK_HOME" != / && -d "$CLEAN_DISK_HOME" && ! -L "$CLEAN_DISK_HOME" ]] || {
  printf 'ERROR: CLEAN_DISK_HOME must be an absolute, non-symlink directory other than /\n' >&2
  exit 1
}

for command_name in awk df du realpath; do
  command -v "$command_name" >/dev/null || {
    printf 'ERROR: %s is required\n' "$command_name" >&2
    exit 3
  }
done
if [[ "$MODE" == delete ]]; then
  for command_name in lsof rm; do
    command -v "$command_name" >/dev/null || {
      printf 'ERROR: %s is required for delete mode\n' "$command_name" >&2
      exit 3
    }
  done
fi

CLEAN_DISK_HOME="$(realpath "$CLEAN_DISK_HOME")"
DATA_VOLUME=/System/Volumes/Data
[[ -d "$DATA_VOLUME" ]] || DATA_VOLUME=/

CANDIDATES=(
  "$CLEAN_DISK_HOME/.npm/_cacache"
  "$CLEAN_DISK_HOME/.npm/_npx"
  "$CLEAN_DISK_HOME/.cache/uv"
  "$CLEAN_DISK_HOME/.cache/puppeteer"
  "$CLEAN_DISK_HOME/.cache/node"
  "$CLEAN_DISK_HOME/.cache/codex-runtimes"
  "$CLEAN_DISK_HOME/Library/Caches/Homebrew"
  "$CLEAN_DISK_HOME/Library/Caches/ms-playwright"
  "$CLEAN_DISK_HOME/Library/Caches/pnpm"
  "$CLEAN_DISK_HOME/Library/Caches/ccache"
  "$CLEAN_DISK_HOME/Library/Caches/Yarn"
  "$CLEAN_DISK_HOME/Library/Caches/electron"
  "$CLEAN_DISK_HOME/Library/Caches/typescript"
  "$CLEAN_DISK_HOME/Library/Caches/node-gyp"
  "$CLEAN_DISK_HOME/Library/Caches/pip"
  "$CLEAN_DISK_HOME/Library/Caches/.wasm-pack"
)

available_kib() {
  df -Pk "$DATA_VOLUME" | awk 'NR == 2 { print $4 }'
}

before_kib="$(available_kib)"
recoverable_kib=0
printf 'MODE\t%s\n' "$MODE"
printf 'VOLUME_AVAILABLE_BEFORE_KIB\t%s\n' "$before_kib"

open_files=''
if [[ "$MODE" == delete ]]; then
  open_files="$(lsof -Fn 2>/dev/null | sed -n 's/^n//p' || true)"
fi

for candidate in "${CANDIDATES[@]}"; do
  [[ -e "$candidate" ]] || continue
  [[ ! -L "$candidate" ]] || {
    printf 'SKIP_SYMLINK\t%s\n' "$candidate"
    continue
  }
  resolved="$(realpath "$candidate")"
  case "$resolved" in
    "$CLEAN_DISK_HOME/.npm/"*|"$CLEAN_DISK_HOME/.cache/"*|"$CLEAN_DISK_HOME/Library/Caches/"*) ;;
    *)
      printf 'ERROR: candidate escaped cache roots: %s\n' "$candidate" >&2
      exit 1
      ;;
  esac

  size_kib="$(du -sk "$resolved" 2>/dev/null | awk '{ print $1 }')"
  recoverable_kib=$((recoverable_kib + size_kib))
  printf 'CANDIDATE\t%s\t%s\n' "$size_kib" "$resolved"

  [[ "$MODE" == delete ]] || continue
  if awk -v prefix="$resolved/" 'index($0, prefix) == 1 { found=1; exit } END { exit !found }' <<<"$open_files"; then
    printf 'SKIP_OPEN\t%s\n' "$resolved"
    continue
  fi
  rm -rf -- "$resolved"
  printf 'DELETED\t%s\n' "$resolved"
done

after_kib="$(available_kib)"
printf 'RECOVERABLE_KIB\t%s\n' "$recoverable_kib"
printf 'VOLUME_AVAILABLE_AFTER_KIB\t%s\n' "$after_kib"
printf 'VOLUME_CHANGE_DURING_RUN_KIB\t%s\n' "$((after_kib - before_kib))"
if [[ "$MODE" == delete ]]; then
  printf 'RECLAIMED_KIB\t%s\n' "$((after_kib - before_kib))"
else
  printf 'RECLAIMED_KIB\t0\n'
fi
