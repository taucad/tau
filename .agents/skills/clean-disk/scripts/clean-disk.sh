#!/usr/bin/env bash
#
# Audits or deletes a fixed allowlist of reproducible developer caches.
#
# Optional env vars:
#   CLEAN_DISK_HOME  Home directory to inspect (default: current user's home).
#   CLEAN_DISK_REPO  Git repository whose registered worktree caches to inspect (optional).
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

# Workspace caches are opt-in so isolated-home checks never touch real worktrees.
WORKSPACE_CANDIDATES=()
if [[ -n "${CLEAN_DISK_REPO:-}" ]]; then
  command -v git >/dev/null || exit 3
  [[ "$CLEAN_DISK_REPO" == /* && ! -L "$CLEAN_DISK_REPO" ]] || exit 1
  while IFS= read -r -d '' field; do
    case "$field" in
      "worktree "*)
        tree="${field#worktree }"
        [[ -d "$tree" && ! -L "$tree" ]] || continue
        WORKSPACE_CANDIDATES+=("$tree/.nx/cache" "$tree/node_modules/.vite")
        ;;
    esac
  done < <(git -C "$CLEAN_DISK_REPO" worktree list --porcelain -z)
fi
CANDIDATES+=(${WORKSPACE_CANDIDATES[@]+"${WORKSPACE_CANDIDATES[@]}"})


for candidate in "${CANDIDATES[@]}"; do
  [[ -e "$candidate" ]] || continue
  [[ ! -L "$candidate" ]] || {
    printf 'SKIP_SYMLINK\t%s\n' "$candidate"
    continue
  }
  resolved="$(realpath "$candidate")"
  workspace=false
  for path in ${WORKSPACE_CANDIDATES[@]+"${WORKSPACE_CANDIDATES[@]}"}; do
    [[ "$candidate" != "$path" ]] || workspace=true
  done
  if [[ "$workspace" == true ]]; then
    [[ "$resolved" == "$candidate" ]] || { printf 'SKIP_SYMLINK_PARENT\t%s\n' "$candidate"; continue; }
    case "$candidate" in
      */.nx/cache) tree="${candidate%/.nx/cache}"; parent="$tree/.nx" ;;
      */node_modules/.vite) tree="${candidate%/node_modules/.vite}"; parent="$tree/node_modules" ;;
    esac
    # A local instruction boundary needs agent review before automatic deletion.
    [[ ! -f "$parent/AGENTS.md" && ! -f "$candidate/AGENTS.md" ]] || { printf 'SKIP_INSTRUCTIONS\t%s\n' "$candidate"; continue; }
    if ! tracked="$(git -C "$tree" ls-files -- "$candidate")"; then
      printf 'SKIP_INSPECTION_FAILED\t%s\n' "$candidate"; continue
    fi
    [[ -z "$tracked" ]] || { printf 'SKIP_TRACKED\t%s\n' "$candidate"; continue; }
  else
  case "$resolved" in
    "$CLEAN_DISK_HOME/.npm/"*|"$CLEAN_DISK_HOME/.cache/"*|"$CLEAN_DISK_HOME/Library/Caches/"*) ;;
    *)
      printf 'ERROR: candidate escaped cache roots: %s\n' "$candidate" >&2
      exit 1
      ;;
  esac
  fi

  size_kib="$(du -sk "$resolved" 2>/dev/null | awk '{ print $1 }')"
  recoverable_kib=$((recoverable_kib + size_kib))
  printf 'CANDIDATE\t%s\t%s\n' "$size_kib" "$resolved"

  [[ "$MODE" == delete ]] || continue
  # Recheck immediately before each removal and fail closed on inspection errors.
  if ! open_files="$(lsof -Fn 2>/dev/null)"; then
    printf 'SKIP_INSPECTION_FAILED\t%s\n' "$resolved"
    continue
  fi
  open_files="$(sed -n 's/^n//p' <<<"$open_files")"
  if [[ "$workspace" == true ]]; then
    if ! processes="$(ps -axo args=)"; then
      printf 'SKIP_INSPECTION_FAILED\t%s\n' "$resolved"; continue
    fi
    if awk '/node|pnpm|npm|cargo|rustc|cmake|ninja/ && !/daemon\/server\/start.js/ { found=1 } END { exit !found }' <<<"$processes"; then
      printf 'SKIP_ACTIVE_BUILD\t%s\n' "$resolved"; continue
    fi
  fi
  [[ -d "$candidate" && ! -L "$candidate" && "$(realpath "$candidate")" == "$resolved" ]] || { printf 'SKIP_CHANGED\t%s\n' "$candidate"; continue; }
  if awk -v exact="$resolved" -v prefix="$resolved/" '$0 == exact || index($0, prefix) == 1 { found=1; exit } END { exit !found }' <<<"$open_files"; then
    printf 'SKIP_OPEN\t%s\n' "$resolved"
    continue
  fi
  rm -rf -- "$resolved"
  [[ ! -e "$resolved" ]] || { printf 'ERROR: deletion incomplete: %s\n' "$resolved" >&2; exit 1; }
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
