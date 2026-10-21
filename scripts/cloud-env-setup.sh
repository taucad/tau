#!/usr/bin/env bash
#
# Prepare Tau for Claude Code cloud or Codex cloud using one environment command.
#
# See docs/handbooks/cloud/operate/agent-environments.md. Claude needs a user-level
# SessionStart hook because multi-repository sessions do not load repository hooks.
# Codex prepares its selected checkouts directly and persists proxy/Nx/pnpm settings.
# Both hosts reuse scripts/agent-env.sh for Node, dependencies and optional Brain.
#
# Required env vars: none.
# Optional env vars:
#   TAU_CLOUD_AGENT       claude or codex; otherwise detect cloud host markers,
#                         then the exclusive /home/user or /workspace layout
#   TAU_CLOUD_WORKSPACE   Checkout parent or a Tau checkout (host default below)
#   TAU_CLOUD_USER_HOME   Hook/profile destination (default: $HOME)
#   XDG_CACHE_HOME        Cache parent (Codex: <workspace>/.cache; Claude: ~/.cache)
#
# Usage (unchanged on both hosts; supports execution on stdin):
#   curl -fsSL https://raw.githubusercontent.com/taucad/tau/main/scripts/cloud-env-setup.sh | bash || true
# For validation, enable pipefail and omit || true to retain setup failures.
#
# Exit codes:
#   0  Setup succeeded, no Tau selected, or a Claude best-effort warm-up failed
#   1  Invalid arguments, agent selection or workspace
#   2  Codex bootstrap or Claude hook installation failed

set -euo pipefail

detect_agent() {
  local claude=false codex=false
  case "${TAU_CLOUD_AGENT:-}" in
    claude | codex) printf '%s\n' "$TAU_CLOUD_AGENT"; return ;;
    "") ;;
    *) printf 'ERROR: TAU_CLOUD_AGENT must be claude or codex\n' >&2; return 1 ;;
  esac
  [[ "${CLAUDE_CODE_REMOTE:-}" == true ]] && claude=true
  if [[ "${CODEX_CI:-}" == 1 || "${CODEX_CI:-}" == true || -n "${CODEX_ENVIRONMENT_ID:-}" ]]; then
    codex=true
  fi
  if [[ "$claude" == true && "$codex" == false ]]; then printf 'claude\n'; return; fi
  if [[ "$codex" == true && "$claude" == false ]]; then printf 'codex\n'; return; fi
  # Setup can run before session markers or checkouts exist. Keep Claude's
  # pre-launch hook installation working in its otherwise empty image.
  if [[ "$claude" == false && "$codex" == false ]]; then
    if [[ -d /home/user && ! -d /workspace ]]; then printf 'claude\n'; return; fi
    if [[ -d /workspace && ! -d /home/user ]]; then printf 'codex\n'; return; fi
  fi
  printf 'ERROR: cloud agent is ambiguous; set TAU_CLOUD_AGENT=claude or codex\n' >&2
  return 1
}

discover_checkouts() {
  local candidate root
  for candidate in "$workspace" "$workspace"/*/; do
    candidate="${candidate%/}"
    [[ -f "$candidate/scripts/agent-env.sh" ]] || continue
    root=$(git -C "$candidate" rev-parse --show-toplevel 2>/dev/null) || continue
    [[ "$(cd "$root" && pwd -P)" == "$(cd "$candidate" && pwd -P)" ]] || continue
    printf '%s\0' "$root"
  done
}

persist_shell_line() {
  local line="$1" rc
  for rc in "$user_home/.bashrc" "$user_home/.profile"; do
    touch "$rc" || return
    grep -qxF "$line" "$rc" || { printf '%s\n' "$line" >>"$rc" || return; }
  done
}

configure_codex() {
  local setting line
  export NODE_USE_ENV_PROXY=1 NX_NO_CLOUD=true NX_DAEMON=false NX_NATIVE_COMMAND_RUNNER=false
  export PNPM_CONFIG_STORE_DIR="$XDG_CACHE_HOME/pnpm/store"
  for setting in NODE_USE_ENV_PROXY NX_NO_CLOUD NX_DAEMON NX_NATIVE_COMMAND_RUNNER XDG_CACHE_HOME PNPM_CONFIG_STORE_DIR; do
    printf -v line 'export %s=%q # tau codex cloud' "$setting" "${!setting}"
    persist_shell_line "$line" || return
  done
}

prepare_codex_checkout() {
  local REPO_ROOT="$1" version pnpm_dir line
  cd "$REPO_ROOT" || return
  version=$(node -p 'JSON.parse(require("node:fs").readFileSync("package.json", "utf8")).packageManager') || return
  [[ "$version" =~ ^pnpm@([0-9]+\.[0-9]+\.[0-9]+)$ ]] || {
    printf 'ERROR: expected an exact pnpm pin, got %s\n' "$version" >&2
    return 1
  }
  version="${BASH_REMATCH[1]}"
  pnpm_dir="$log_dir/pnpm/$version"
  if [[ ! -x "$pnpm_dir/node_modules/.bin/pnpm" ]]; then
    npm install --prefix "$pnpm_dir" --cache "$XDG_CACHE_HOME/npm" --no-audit --no-fund "pnpm@$version" || return
  fi
  # Corepack activation alone does not displace Codex's image fallback.
  export PATH="$pnpm_dir/node_modules/.bin:$PATH"
  [[ "$(pnpm --version)" == "$version" ]] || return 1
  printf -v line 'export PATH=%q:$PATH # tau codex pnpm' "$pnpm_dir/node_modules/.bin"
  persist_shell_line "$line" || return
  bash scripts/agent-env.sh setup
}

setup_codex() {
  local checkout found=0 failed=0
  while IFS= read -r -d '' checkout; do
    if [[ "$found" -eq 0 ]]; then configure_codex || return 2; fi
    found=$((found + 1))
    printf '[codex-cloud] → preparing %s\n' "$checkout"
    if (prepare_codex_checkout "$checkout") 2>&1 | tee -a "$log_file"; then
      printf '[codex-cloud] ✓ prepared %s\n' "$checkout"
    else
      printf '[codex-cloud] ERROR: setup failed in %s (log: %s)\n' "$checkout" "$log_file" >&2
      failed=1
    fi
  done < <(discover_checkouts)
  if [[ "$found" -eq 0 ]]; then
    printf '[codex-cloud] No Tau bootstrap found under %s; nothing to install.\n' "$workspace"
  fi
  [[ "$failed" -eq 0 ]] || return 2
}

install_claude_hook() {
  local claude_dir="$user_home/.claude" settings hook_command hook temporary
  mkdir -p "$claude_dir" || return
  settings="$claude_dir/settings.json"
  hook_command='bash ~/.claude/tau-session-start.sh'
  if [[ "$user_home" != "$HOME" ]]; then
    printf -v hook_command 'bash %q' "$claude_dir/tau-session-start.sh"
  fi
  # Do not replace an existing settings file when jq is absent or JSON is invalid.
  command -v jq >/dev/null || { printf 'ERROR: jq is required to preserve Claude settings\n' >&2; return 2; }
  hook=$(jq -cn --arg command "$hook_command" \
    '{matcher:"startup|resume",hooks:[{type:"command",command:$command,timeout:1200}]}') || return
  temporary=$(mktemp "$claude_dir/settings.json.XXXXXX") || return
  if ! jq --argjson hook "$hook" \
    '.hooks.SessionStart = ((.hooks.SessionStart // []) + [$hook] | unique)' \
    <(if [[ -s "$settings" ]]; then cat "$settings"; else printf '{}\n'; fi) >"$temporary"; then
    rm -f "$temporary"
    return 2
  fi
  {
    printf '#!/usr/bin/env bash\n'
    printf 'workspace=%q\n' "$workspace"
    cat <<'HOOK'
for checkout in "$workspace" "$workspace"/*/; do
  checkout="${checkout%/}"
  # Compare directory identity so symlinked workspace paths do not run the hook twice.
  [[ "$checkout" -ef "${CLAUDE_PROJECT_DIR:-}" || ! -f "$checkout/scripts/agent-env.sh" ]] && continue
  (cd "$checkout" && bash scripts/agent-env.sh) || printf '[tau-session-start] agent-env failed in %s\n' "$checkout" >&2
done
exit 0
HOOK
  } >"$claude_dir/tau-session-start.sh" || { rm -f "$temporary"; return 2; }
  mv "$temporary" "$settings" || return
  printf '✓ tau cloud environment: SessionStart hook installed (%s); log %s\n' "$settings" "$log_file"
}

setup_claude() {
  local checkout
  install_claude_hook || return 2
  # Warm the cached snapshot, but preserve Claude's nonblocking startup contract.
  while IFS= read -r -d '' checkout; do
    if ! (cd "$checkout" && bash scripts/agent-env.sh setup) >>"$log_file" 2>&1; then
      printf 'warm-up failed in %s (log: %s)\n' "$checkout" "$log_file" >&2
    fi
  done < <(discover_checkouts)
}

main() {
  [[ $# -eq 0 ]] || { printf 'ERROR: configure cloud setup with TAU_CLOUD_* variables, not arguments\n' >&2; return 1; }
  local agent workspace user_home log_dir log_file
  agent=$(detect_agent) || return
  user_home="${TAU_CLOUD_USER_HOME:-$HOME}"
  if [[ "$agent" == claude ]]; then
    workspace="${TAU_CLOUD_WORKSPACE:-/home/user}"
    export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$user_home/.cache}"
    log_file="$XDG_CACHE_HOME/tau/cloud-env-setup.log"
  else
    workspace="${TAU_CLOUD_WORKSPACE:-/workspace}"
    export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$workspace/.cache}"
    log_file="$XDG_CACHE_HOME/tau/cloud-env-setup-codex.log"
  fi
  [[ -d "$workspace" ]] || { printf 'ERROR: workspace does not exist: %s\n' "$workspace" >&2; return 1; }
  workspace="$(cd "$workspace" && pwd -P)"
  log_dir="$XDG_CACHE_HOME/tau"
  mkdir -p "$log_dir" "$user_home"
  printf '[cloud-env] %s %s workspace=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$agent" "$workspace" >>"$log_file"
  case "$agent" in
    claude) setup_claude ;;
    codex) setup_codex ;;
  esac
}

main "$@"
