#!/usr/bin/env bash
#
# Keep Tau's Graphify monorepo slice list consistent.
#
# This helper owns only the canonical slice list and merge/check flow. It does
# not run Graphify extraction, choose LLM backends, derive slices from Nx, or
# call claude-cli. If a code slice is still too large, subdivide it with Nx
# project roots.
#
# TODO: Add a verified root-files-only slice once Graphify has a clean first-
# class way to scan root files without re-scanning the whole monorepo.
#
# Required env vars:
#   None
# Optional env vars:
#   GRAPHIFY_SLICES_ROOT  Repository root to inspect (default: git root)
#
# Usage:
#   scripts/graphify-slices.sh list
#   scripts/graphify-slices.sh missing
#   scripts/graphify-slices.sh merge
#
# Exit codes:
#   0  Success
#   1  Validation failure (bad args, missing slice graphs)
#   3  Missing dependency

set -euo pipefail

SLICES=(
  "apps"
  "packages"
  "docs"
  "libs"
  "kernels"
  "examples"
  "scripts"
  "tools"
)

usage() {
  printf '%s\n' "Usage: scripts/graphify-slices.sh [list|missing|merge]"
}

repo_root() {
  if [[ -n "${GRAPHIFY_SLICES_ROOT:-}" ]]; then
    (cd "$GRAPHIFY_SLICES_ROOT" && pwd)
    return
  fi

  git rev-parse --show-toplevel
}

graph_path_for() {
  local slice="$1"
  printf '%s/graphify-out/graph.json\n' "$slice"
}

print_root_notice() {
  printf '%s\n' "NOTE: Root-level files are not covered by this slice merge."
  printf '%s\n' "      Build/query coverage comes from the canonical slice graphs only."
}

list_named_slices() {
  local title="$1"
  shift
  local slice

  printf '%s\n' "$title"
  for slice in "$@"; do
    printf '  %-10s %s\n' "$slice" "$(graph_path_for "$slice")"
  done
  print_root_notice
}

missing_slices() {
  local root="$1"
  shift
  local missing=0
  local slice

  for slice in "$@"; do
    if [[ ! -f "$root/$(graph_path_for "$slice")" ]]; then
      printf '%s\n' "MISSING: $(graph_path_for "$slice")"
      printf '%s\n' "  Build: cd $slice && invoke the existing graphify skill on ."
      missing=1
    fi
  done

  if [[ "$missing" -eq 0 ]]; then
    printf '%s\n' "All requested slice graphs are present."
  fi

  print_root_notice
  return "$missing"
}

merge_slices() {
  local root="$1"
  shift
  local missing=0
  local slice
  local graph_args=()

  for slice in "$@"; do
    if [[ ! -f "$root/$(graph_path_for "$slice")" ]]; then
      printf '%s\n' "MISSING: $(graph_path_for "$slice")" >&2
      missing=1
    else
      graph_args+=("$(graph_path_for "$slice")")
    fi
  done

  if [[ "$missing" -ne 0 ]]; then
    printf '%s\n' "ERROR: Build missing slice graphs before merging." >&2
    printf '%s\n' "Run: scripts/graphify-slices.sh missing" >&2
    return 1
  fi

  command -v graphify >/dev/null || {
    printf '%s\n' "ERROR: graphify CLI required" >&2
    return 3
  }

  (
    cd "$root"
    graphify merge-graphs "${graph_args[@]}" --out graphify-out/graph.json
    export GRAPHIFY_VIZ_NODE_LIMIT="${GRAPHIFY_VIZ_NODE_LIMIT:-100000}"
    printf '%s\n' "NOTE: Using GRAPHIFY_VIZ_NODE_LIMIT=$GRAPHIFY_VIZ_NODE_LIMIT so Tau's merged graph emits graph.html."
    graphify cluster-only . --graph graphify-out/graph.json --no-label
    graphify reflect --if-stale --graph graphify-out/graph.json
  )
}

main() {
  local command="${1:-}"
  local root

  if [[ -z "$command" ]]; then
    usage >&2
    return 1
  fi

  root="$(repo_root)"

  case "$command" in
    list)
      list_named_slices "Tau Graphify canonical slices:" "${SLICES[@]}"
      ;;
    missing)
      missing_slices "$root" "${SLICES[@]}"
      ;;
    merge)
      merge_slices "$root" "${SLICES[@]}"
      ;;
    *)
      usage >&2
      return 1
      ;;
  esac
}

main "$@"
