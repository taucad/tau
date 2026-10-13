#!/usr/bin/env bash
#
# Setup script for Tau's single Claude Code cloud environment, `tau`, which serves every session
# shape: Tau alone, Tau with Tau Brain, or any other set of taucad repositories.
#
# Why: see docs/handbooks/cloud/operate/agent-environments.md and ruling Q10 (amended 2026-10-13)
# in docs/research/cloud-software-factory-blueprint.md. The environment's setup script runs once per
# cached snapshot (rebuilt about every seven days), not once per session, and a session with several
# repositories loads no repository hooks. So this script provisions only what does not depend on the
# session: a user-level SessionStart hook that runs scripts/agent-env.sh in each checkout that ships
# it, plus a best-effort warm-up of any checkout already present. It never fails the session start.
#
# Usage (the environment's Setup script field):
#   curl -fsSL https://raw.githubusercontent.com/taucad/tau/main/scripts/cloud-env-setup.sh | bash || true
#
# Exit codes:
#   0  Always; a non-zero setup script stops the session from starting

set -euo pipefail

claude_dir="$HOME/.claude"
log_file="$HOME/.cache/tau/cloud-env-setup.log"
mkdir -p "$claude_dir" "$(dirname "$log_file")"

# Runs scripts/agent-env.sh in every session checkout that ships it. A single-repository session's
# own checkout is $CLAUDE_PROJECT_DIR, whose committed hook already runs it, so it is skipped here.
cat >"$claude_dir/tau-session-start.sh" <<'EOF'
#!/usr/bin/env bash
for checkout in /home/user/*/; do
  checkout="${checkout%/}"
  [[ "$checkout" == "${CLAUDE_PROJECT_DIR:-}" || ! -f "$checkout/scripts/agent-env.sh" ]] && continue
  (cd "$checkout" && bash scripts/agent-env.sh) || echo "[tau-session-start] agent-env failed in $checkout"
done
exit 0
EOF

hook='{"hooks":{"SessionStart":[{"matcher":"startup|resume","hooks":[{"type":"command","command":"bash ~/.claude/tau-session-start.sh","timeout":1200}]}]}}'
settings="$claude_dir/settings.json"
if [[ -s "$settings" ]] && command -v jq >/dev/null; then
  jq --argjson hook "$hook" '.hooks.SessionStart = ((.hooks.SessionStart // []) + $hook.hooks.SessionStart | unique)' \
    "$settings" >"$settings.tmp" && mv "$settings.tmp" "$settings"
else
  printf '%s\n' "$hook" >"$settings"
fi

# Record what the setup run saw, so a probe can tell whether checkouts exist before launch.
{
  date -u +%Y-%m-%dT%H:%M:%SZ
  echo "pwd=$PWD"
  ls -1 /home/user 2>&1 || true
} >"$log_file"

# Warm-up: Node, pnpm, dependencies and NX_NO_CLOUD land in the snapshot when a checkout is present.
for checkout in /home/user/*/; do
  [[ -f "${checkout}scripts/agent-env.sh" ]] || continue
  (cd "$checkout" && bash scripts/agent-env.sh setup) >>"$log_file" 2>&1 || echo "warm-up failed in $checkout" >>"$log_file"
done

echo "✓ tau cloud environment: SessionStart hook installed ($settings); log $log_file"
exit 0
