#!/usr/bin/env bash
#
# Bootstrap an agent host for Tau: Node and pnpm, dependencies, and the optional Tau Brain mount
# at repos/tau-brain that docs/{research,reference,handbooks,incidents} link into.
#
# Why: one committed recipe for every host (local checkouts and worktrees, Claude Code and Codex
# cloud, GitHub Actions); see docs/research/cloud-software-factory-blueprint.md (Component 1, D1–D12).
# Brain is mounted blobless, single-branch, sparse (no research/artifacts/<subject>/ trees and no
# cursor exports) and pointer-only for LFS; each checkout gets its own Brain working tree.
#
# Optional env vars:
#   TAU_AGENT_ENV_DEPS  1 installs dependencies on a local host too (default: cloud and CI only)
#   TAU_BRAIN_STORE     local Brain clone to add worktrees from (default: the main checkout's
#                       repos/tau-brain)
#   TAU_BRAIN_TOKEN     fine-grained token for taucad/tau-brain where the host has no Git credential,
#                       passed through an in-process credential helper and never written to disk
#   TAU_BRAIN_SPARSE    extra subjects or paths to materialise, space separated (see `widen`)
#   TAU_BRAIN_URL       Brain clone URL (default: https://github.com/taucad/tau-brain.git)
#
# Usage:
#   scripts/agent-env.sh                     # session start: toolchain, dependencies, Brain mount
#   scripts/agent-env.sh setup               # environment setup script (cloud, as root, before launch):
#                                            # the above, plus Node and NX_NO_CLOUD in ~/.bashrc and ~/.profile
#   scripts/agent-env.sh brain               # Brain mount only
#   scripts/agent-env.sh widen <subject|path>...   # materialise research/artifacts/<subject> or a path
#   scripts/agent-env.sh fetch <path>...     # download LFS objects, or restore an evidence.json bundle
#   scripts/agent-env.sh commit -m <message> -- <path>...   # commit Brain paths and push them to main
#
# Exit codes:
#   0  Success, including "Brain is not reachable from this host" (Brain is optional)
#   1  Validation failure (bad arguments, wrong state, rebase conflict)
#   2  Network / external failure
#   3  Missing dependency

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The checkout the session runs in, which for a worktree session can differ from the checkout
# whose settings invoked this script; fall back to the script's own checkout.
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$REPO_ROOT" && -f "$REPO_ROOT/scripts/agent-env.sh" ]] || REPO_ROOT="$(cd "$script_dir/.." && pwd)"
BRAIN_DIR="$REPO_ROOT/repos/tau-brain"
BRAIN_URL="${TAU_BRAIN_URL:-https://github.com/taucad/tau-brain.git}"
started=$(date +%s)

log() { printf '[agent-env] %s\n' "$*"; }
fail() { printf '[agent-env] ERROR: %s\n' "$*" >&2; exit "${2:-1}"; }
# Claude Code cloud sessions; Codex and other hosts run `setup` explicitly from their environment.
is_cloud() { [[ "${CLAUDE_CODE_REMOTE:-}" == "true" ]]; }

# Exports a setting for this run and for what follows it: the session's later commands through
# CLAUDE_ENV_FILE (set for SessionStart hooks), or the login shells of a cloud image in setup mode.
persist() {
  export "$1=$2"
  local line="export $1=\"$2\""
  [[ "$1" == PATH ]] && line="export PATH=\"${2%%:*}:\$PATH\""
  [[ -n "${CLAUDE_ENV_FILE:-}" ]] && printf '%s\n' "$line" >>"$CLAUDE_ENV_FILE"
  if [[ "${MODE:-}" == setup ]]; then
    local rc
    for rc in "$HOME/.bashrc" "$HOME/.profile"; do
      touch "$rc"
      grep -qxF "$line # tau agent-env" "$rc" || printf '%s # tau agent-env\n' "$line" >>"$rc"
    done
  fi
  return 0
}

# --- toolchain -----------------------------------------------------------------------------------

# Node from package.json#engines. Cloud images put an older Node first on PATH and refuse
# `pnpm env use`, so use /opt/node<N> when the image has it, else a checksummed nodejs.org build
# (the version CI pins in .github/actions/setup-nx) cached under ~/.cache/tau/node.
ensure_node() {
  local want cur
  want=$(sed -n 's/.*"node": *">=\([0-9]*\).*/\1/p' "$REPO_ROOT/package.json")
  cur=$(node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/')
  [[ -z "$want" || "${cur:-0}" -ge "$want" ]] && return 0
  local version os arch name home bin
  version=$(sed -n "s/^ *default: '\(${want}\.[0-9.]*\)'.*/\1/p" "$REPO_ROOT/.github/actions/setup-nx/action.yml" | head -1)
  version="${version:-${want}.20.0}"
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  case "$(uname -m)" in x86_64) arch=x64 ;; aarch64 | arm64) arch=arm64 ;; *) log "no Node $want build for $(uname -m); staying on $(node -v 2>/dev/null)"; return 0 ;; esac
  name="node-v$version-$os-$arch"
  home="${XDG_CACHE_HOME:-$HOME/.cache}/tau/node"
  if [[ -x "/opt/node$want/bin/node" ]]; then
    bin="/opt/node$want/bin"
  elif [[ -x "$home/$name/bin/node" ]]; then
    bin="$home/$name/bin"
  else
    command -v curl >/dev/null || { log "curl missing; staying on Node $cur"; return 0; }
    log "→ Node $cur on PATH, engines want >=$want: installing $name"
    mkdir -p "$home"
    local sums
    if ! sums=$(curl -fsSL "https://nodejs.org/dist/v$version/SHASUMS256.txt") ||
      ! curl -fsSL -o "$home/$name.tar.xz" "https://nodejs.org/dist/v$version/$name.tar.xz" ||
      ! (cd "$home" && printf '%s\n' "$sums" | grep " $name.tar.xz\$" | { sha256sum -c --quiet - 2>/dev/null || shasum -a 256 -c -s -; }) ||
      ! tar -xJf "$home/$name.tar.xz" -C "$home"; then
      rm -f "$home/$name.tar.xz"
      log "Node $version unavailable; staying on Node $cur"
      return 0
    fi
    rm -f "$home/$name.tar.xz"
    bin="$home/$name/bin"
  fi
  persist PATH "$bin:$PATH"
  log "✓ Node $(node -v) from $bin"
}

# pnpm pinned by package.json#packageManager, through corepack.
ensure_pnpm() {
  local want
  want=$(sed -n 's/.*"packageManager": *"pnpm@\([^"]*\)".*/\1/p' "$REPO_ROOT/package.json")
  [[ "$( (cd "$REPO_ROOT" && pnpm -v) 2>/dev/null)" == "$want" ]] && return 0
  # A developer machine keeps its own pnpm install; only provisioned hosts get corepack shims.
  if [[ "${MODE:-}" != setup && -z "${CI:-}" ]] && ! is_cloud; then
    log "pnpm $want wanted; run corepack enable (or install pnpm@$want)"
    return 0
  fi
  corepack enable >/dev/null 2>&1 || true
  COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack prepare "pnpm@$want" --activate >/dev/null 2>&1 ||
    npm install -g "pnpm@$want" >/dev/null 2>&1 || { log "could not activate pnpm@$want"; return 0; }
  log "✓ pnpm $want"
}

# --- dependencies --------------------------------------------------------------------------------

ensure_deps() {
  if [[ "$REPO_ROOT/node_modules/.modules.yaml" -nt "$REPO_ROOT/pnpm-lock.yaml" ]]; then return 0; fi
  if [[ "${MODE:-}" != setup && "${TAU_AGENT_ENV_DEPS:-}" != 1 && -z "${CI:-}" ]] && ! is_cloud; then
    log "dependencies not installed or older than pnpm-lock.yaml; run pnpm install (or TAU_AGENT_ENV_DEPS=1)"
    return 0
  fi
  log "→ pnpm install --frozen-lockfile"
  (cd "$REPO_ROOT" && pnpm install --frozen-lockfile --prefer-offline) || fail "pnpm install failed" 2
}

# --- Tau Brain -----------------------------------------------------------------------------------

# git with an in-process credential helper when TAU_BRAIN_TOKEN is set; the token never reaches disk.
brain_git() {
  if [[ -n "${TAU_BRAIN_TOKEN:-}" ]]; then
    # shellcheck disable=SC2016 # expanded by the helper's shell, so the token never enters argv
    GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=credential.helper \
      GIT_CONFIG_VALUE_0='!f() { echo username=x-access-token; echo "password=$TAU_BRAIN_TOKEN"; }; f' git "$@"
  else
    git "$@"
  fi
}

# Sparse pattern for a subject name (research/artifacts/<subject>) or a Brain path. Non-cone
# checkouts need the anchored /** form: a bare directory pattern is overridden by the default
# exclusion and materialises nothing.
widen_pattern() {
  local target="${1#/}"
  target="${target%/}"
  [[ "$target" == */* ]] || target="research/artifacts/$target"
  printf '/%s/**\n' "$target"
}

default_patterns() {
  printf '%s\n' '/*' '!/research/artifacts/*/**' '!/research/cursor-plans/**' '!/research/cursor-history/**'
  local extra
  for extra in ${TAU_BRAIN_SPARSE:-}; do widen_pattern "$extra"; done
}

# The local Brain clone new worktrees share objects with.
brain_store() {
  local candidate common
  common=$(git -C "$REPO_ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)
  for candidate in "${TAU_BRAIN_STORE:-}" "${common:+$(dirname "$common")/repos/tau-brain}"; do
    [[ -n "$candidate" && -e "$candidate/.git" ]] || continue
    candidate=$(cd "$candidate" && pwd -P)
    [[ "$candidate" == "$(cd "$BRAIN_DIR" 2>/dev/null && pwd -P)" ]] && continue
    printf '%s\n' "$candidate"
    return 0
  done
  return 1
}

# Fast-forward an agent-owned (detached, clean) mount to origin/main, at most every ten minutes.
refresh_brain() {
  git -C "$BRAIN_DIR" symbolic-ref -q HEAD >/dev/null && return 0
  [[ -n "$(git -C "$BRAIN_DIR" status --porcelain --untracked-files=no 2>/dev/null)" ]] && return 0
  local stamp
  stamp="$(git -C "$BRAIN_DIR" rev-parse --path-format=absolute --git-path FETCH_HEAD)"
  [[ -n "$(find "$stamp" -mmin -10 2>/dev/null)" ]] && return 0
  if brain_git -C "$BRAIN_DIR" fetch -q origin main 2>/dev/null; then
    GIT_LFS_SKIP_SMUDGE=1 git -C "$BRAIN_DIR" checkout -q --detach origin/main 2>/dev/null &&
      log "Brain at $(git -C "$BRAIN_DIR" rev-parse --short HEAD)"
  fi
  return 0
}

ensure_brain() {
  local sibling store
  sibling="$(cd "$REPO_ROOT/.." && pwd)/tau-brain"
  if [[ -L "$BRAIN_DIR" && ! -e "$BRAIN_DIR" ]]; then
    rm "$BRAIN_DIR" # a dangling link from an earlier session; the mount below replaces it
  fi
  if [[ ! -e "$BRAIN_DIR" && -e "$sibling/.git" ]]; then
    # Cloud sessions that attach Brain as a second source clone it beside Tau.
    mkdir -p "$REPO_ROOT/repos"
    ln -s "$sibling" "$BRAIN_DIR"
    log "✓ Brain linked from $sibling"
  fi
  if [[ -e "$BRAIN_DIR/.git" ]]; then
    refresh_brain
    return 0
  fi
  if [[ -e "$BRAIN_DIR" ]]; then
    log "repos/tau-brain exists but is not a Git checkout; left alone"
    return 0
  fi
  mkdir -p "$REPO_ROOT/repos"
  if store=$(brain_store); then
    log "→ Brain worktree from $store"
    brain_git -C "$store" fetch -q origin main 2>/dev/null || log "fetch failed; using the store's last origin/main"
    git -C "$store" worktree add -q --no-checkout --detach "$BRAIN_DIR" origin/main
  elif brain_git ls-remote -q --exit-code "$BRAIN_URL" main >/dev/null 2>&1; then
    log "→ Brain blobless clone"
    GIT_LFS_SKIP_SMUDGE=1 brain_git clone -q --filter=blob:none --no-checkout --single-branch -b main "$BRAIN_URL" "$BRAIN_DIR" ||
      fail "Brain clone failed" 2
  else
    log "Brain is not reachable from this host; docs/{research,reference,handbooks,incidents} stay unavailable (public work does not need them)"
    return 0
  fi
  local patterns=() pattern
  while IFS= read -r pattern; do patterns+=("$pattern"); done < <(default_patterns)
  git -C "$BRAIN_DIR" sparse-checkout set --no-cone "${patterns[@]}"
  GIT_LFS_SKIP_SMUDGE=1 brain_git -C "$BRAIN_DIR" reset -q --hard
  git -C "$BRAIN_DIR" checkout -q --detach
  log "✓ Brain mounted at $(git -C "$BRAIN_DIR" rev-parse --short HEAD) (sparse; widen with scripts/agent-env.sh widen <subject>)"
}

require_brain() {
  [[ -e "$BRAIN_DIR/.git" ]] || fail "Brain is not mounted; run scripts/agent-env.sh brain"
}

widen() {
  require_brain
  [[ $# -gt 0 ]] || fail "usage: scripts/agent-env.sh widen <subject|path>..."
  local target patterns=()
  for target in "$@"; do patterns+=("$(widen_pattern "$target")"); done
  GIT_LFS_SKIP_SMUDGE=1 brain_git -C "$BRAIN_DIR" sparse-checkout add "${patterns[@]}" || fail "widen failed" 2
  log "✓ widened ${patterns[*]}"
}

# LFS objects stay pointers (.lfsconfig fetchexclude); fetch the ones a task opens. An evidence.json
# manifest restores its bundle into the disposable out/research tree instead of the Brain checkout.
fetch() {
  require_brain
  [[ $# -gt 0 ]] || fail "usage: scripts/agent-env.sh fetch <path>..."
  if [[ "${CLAUDE_CODE_REMOTE:-}" == true && -z "${TAU_BRAIN_TOKEN:-}" ]]; then
    fail "the Claude Code cloud GitHub proxy does not serve LFS objects; set TAU_BRAIN_TOKEN in the environment" 2
  fi
  local target
  for target in "$@"; do
    target="${target#docs/}"
    if [[ "$target" == */evidence.json ]]; then
      fetch_bundle "$target"
    else
      brain_git -C "$BRAIN_DIR" lfs pull --include="$target" --exclude="" || fail "LFS fetch failed for $target" 2
      log "✓ $target"
    fi
  done
}

fetch_bundle() {
  local manifest="$BRAIN_DIR/$1" dir bundle sha out
  [[ -f "$manifest" ]] || fail "$1 not found (widen its subject first)"
  command -v zstd >/dev/null || fail "zstd is required to restore bundles" 3
  dir=$(dirname "$1")
  bundle=$(sed -n 's/.*"bundle": *"\([^"]*\)".*/\1/p' "$manifest")
  sha=$(sed -n 's/.*"sha256": *"\([0-9a-f]*\)".*/\1/p' "$manifest" | head -1)
  [[ -n "$bundle" && -n "$sha" ]] || fail "$1 has no bundle or sha256"
  brain_git -C "$BRAIN_DIR" lfs pull --include="$dir/$bundle" --exclude="" || fail "LFS fetch failed for $dir/$bundle" 2
  (cd "$BRAIN_DIR/$dir" && printf '%s  %s\n' "$sha" "$bundle" | { sha256sum -c --quiet - 2>/dev/null || shasum -a 256 -c -s -; }) ||
    fail "$dir/$bundle does not match its manifest"
  out="$REPO_ROOT/out/research/${dir#research/artifacts/}"
  mkdir -p "$out"
  zstd -dcq "$BRAIN_DIR/$dir/$bundle" | tar -xf - -C "$out"
  log "✓ restored $dir/$bundle into ${out#"$REPO_ROOT"/}"
}

# Commit Brain paths and land them on main: commit by path, rebase onto origin/main, push, retry
# on a lost race. Refused on any branch but main, and when HEAD carries commits that are not this
# commit's, because pushing HEAD:main would publish them.
commit() {
  require_brain
  local message="" paths=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -m) message="${2:-}"; shift 2 ;;
      --) shift; paths=("$@"); break ;;
      *) fail "usage: scripts/agent-env.sh commit -m <message> -- <path>..." ;;
    esac
  done
  [[ -n "$message" && ${#paths[@]} -gt 0 ]] || fail "usage: scripts/agent-env.sh commit -m <message> -- <path>..."
  local branch
  branch=$(git -C "$BRAIN_DIR" branch --show-current)
  if [[ -n "$branch" && "$branch" != main ]]; then
    fail "repos/tau-brain is on $branch; commit from your own mount (scripts/agent-env.sh brain in a Tau worktree)"
  fi
  brain_git -C "$BRAIN_DIR" fetch -q origin main || fail "fetch failed" 2
  if [[ -n "$(git -C "$BRAIN_DIR" rev-list -1 origin/main..HEAD)" ]]; then
    fail "repos/tau-brain has commits that are not on origin/main; push or drop them first"
  fi
  local relative=() path
  for path in "${paths[@]}"; do relative+=("${path#docs/}"); done
  for path in "${relative[@]}"; do
    # A path already removed from disk and index (git rm) has nothing left to add.
    if [[ -e "$BRAIN_DIR/$path" ]] || git -C "$BRAIN_DIR" ls-files --error-unmatch -- "$path" >/dev/null 2>&1; then
      git -C "$BRAIN_DIR" add -A --sparse -- "$path"
    fi
  done
  git -C "$BRAIN_DIR" commit -q -m "$message" -- "${relative[@]}" || fail "nothing to commit for ${relative[*]}"
  local attempt
  for attempt in 1 2 3 4 5; do
    brain_git -C "$BRAIN_DIR" fetch -q origin main || fail "fetch failed" 2
    if ! git -C "$BRAIN_DIR" rebase -q --autostash origin/main; then
      git -C "$BRAIN_DIR" rebase --abort 2>/dev/null || true
      fail "rebase onto origin/main conflicts; resolve in repos/tau-brain and rerun"
    fi
    if GIT_LFS_SKIP_SMUDGE=1 brain_git -C "$BRAIN_DIR" push -q origin HEAD:refs/heads/main; then
      log "✓ $(git -C "$BRAIN_DIR" log --oneline -1) on main (attempt $attempt)"
      return 0
    fi
    sleep $((attempt * 2))
  done
  fail "push to main rejected five times" 2
}

report() {
  local resolved="" missing="" dir
  for dir in research handbooks reference incidents; do
    if [[ -e "$REPO_ROOT/docs/$dir" ]]; then resolved+=" $dir"; else missing+=" $dir"; fi
  done
  log "docs available:${resolved:- none}${missing:+; unavailable:$missing} ($(($(date +%s) - started)) s)"
}

MODE="${1:-start}"
[[ $# -gt 0 ]] && shift
case "$MODE" in
  start | setup)
    ensure_node
    ensure_pnpm
    if is_cloud || [[ "$MODE" == setup ]]; then persist NX_NO_CLOUD true; fi
    ensure_deps
    ensure_brain
    report
    ;;
  brain) ensure_brain; report ;;
  widen) widen "$@" ;;
  fetch) fetch "$@" ;;
  commit) commit "$@" ;;
  *) fail "unknown command '$MODE' (start, setup, brain, widen, fetch, commit)" ;;
esac
