#!/usr/bin/env bash
# In-guest orchestrator for the Linux stock-VM lane (Spike W2). Runs INSIDE a stock Ubuntu 24.04 guest.
#
# It settles the three lane questions with real receipts, invoking the EXISTING, UNMODIFIED harness
# packages/core/native-process/spikes/shell/fs-net-probe.mts by path (never edited), and leaving the
# kernel.apparmor_restrict_unprivileged_userns sysctl at its shipped value THROUGHOUT:
#
#   PHASE A  LNX-VM-NOPROFILE  Tau's bundled bwrap at an /opt/Tau path with NO AppArmor profile.
#                              Expect: loopback bring-up fails (RTM_NEWADDR EPERM) → sandbox-unavailable.
#   PHASE B  LNX-VM-PROFILE    Install the Tau-scoped AppArmor profile for that exact path via
#                              apparmor_parser (the .deb postinst pattern), sysctl untouched.
#                              Expect: loopback succeeds → real S0/S1 verdicts.
#   PHASE C  LNX-VM-APPIMAGE   The SAME bwrap at an AppImage-style mount path, NO profile, NO install
#                              step (AppImages run no postinst). Expect: blocked, exactly like Phase A.
#
# Every phase also captures a DIRECT bwrap loopback repro (the exact error string) independent of the
# harness, so the mechanism is provable from the receipts alone. All receipts + a DONE sentinel land on
# the read-write 9p drop share; the host pulls them. A failure anywhere writes a blocker receipt and the
# sentinel — the host never waits past its deadline on a silent hang.
set -uo pipefail

DROP="${TAU_DROP:?TAU_DROP is required}"
REPO="${TAU_REPO:?TAU_REPO is required}"
SHELL_DIR="$REPO/packages/core/native-process/spikes/shell"
LANE_DIR="$SHELL_DIR/linux-vm"
PROBE="$SHELL_DIR/fs-net-probe.mts"

# Tau's bundled bwrap install path (electron-builder default prefix /opt/${productName}); the stock
# /usr/bin/bwrap AppArmor profile does NOT attach here, which is exactly Tau's shipping situation.
BUNDLE_DIR="/opt/Tau/resources/sandbox"
BUNDLE_BWRAP="$BUNDLE_DIR/bwrap"
# AppImage mounts its squashfs read-only under /tmp/.mount_<rand>; no install step ever runs.
APPIMAGE_DIR="/tmp/.mount_TauAAAA/resources/sandbox"
APPIMAGE_BWRAP="$APPIMAGE_DIR/bwrap"

# Must match the repo's Node (package.json engines >=24; runner uses 24.20.0). Node 24 strips .mts
# types natively; Node 22 cannot run `node fs-net-probe.mts` (ERR_UNKNOWN_FILE_EXTENSION).
NODE_VERSION="v24.20.0"

# The AppArmor unprivileged-userns restriction only strips caps from UNPRIVILEGED user namespaces; root
# bypasses it entirely. cloud-init runcmd runs as root, so the sandbox + the direct bwrap repro MUST be
# run as a non-root user or Phase A/C would spuriously succeed. `tau` is that unprivileged user.
TAU_USER="tau"

mkdir -p "$DROP"
log() { echo "[guest] $*"; }
finish() { echo "$1" > "$DROP/DONE"; sync; exit "${2:-0}"; }
blocker() { log "BLOCKER: $1"; echo "{\"status\":\"blocker\",\"reason\":\"$1\"}" > "$DROP/blocker.json"; finish "FAIL $1" 1; }

# ── Context: prove the stock security posture (sysctl value is load-bearing and NEVER changed) ──────
log "recording guest security context"
SYSCTL_PATH=/proc/sys/kernel/apparmor_restrict_unprivileged_userns
sysctl_val="$(cat "$SYSCTL_PATH" 2>/dev/null || echo absent)"
aa_enabled="$(aa-enabled 2>&1 || echo unknown)"
{
  echo "{"
  echo "  \"apparmor_restrict_unprivileged_userns\": \"$sysctl_val\","
  echo "  \"apparmor_restrict_sysctl_left_untouched\": true,"
  echo "  \"aa_enabled\": \"$aa_enabled\","
  echo "  \"distro\": \"$(. /etc/os-release; echo "$PRETTY_NAME")\","
  echo "  \"kernel\": \"$(uname -r)\","
  echo "  \"distro_bwrap\": \"$(/usr/bin/bwrap --version 2>/dev/null || echo absent)\""
  echo "}"
} > "$DROP/context.json"
log "apparmor_restrict_unprivileged_userns=$sysctl_val  aa_enabled=$aa_enabled"
if [[ "$sysctl_val" != "1" ]]; then
  log "WARNING: sysctl is not the expected stock 1 — results below are recorded with this caveat."
fi
# Baseline AppArmor state for the distro bwrap (which the UNMODIFIED harness actually execs — see the
# supervisor note below). Proves whether /usr/bin/bwrap carries a stock userns-granting profile here.
{
  echo "=== /etc/apparmor.d (bwrap-related) ==="; ls -la /etc/apparmor.d 2>&1 | grep -iE 'bwrap|userns' || echo "(none)"
  echo "=== aa-status (bwrap) ==="; aa-status 2>&1 | grep -i bwrap || echo "(no bwrap profile loaded)"
} > "$DROP/aa-baseline.txt" 2>&1

# ── Provision: bubblewrap + socat (stock apt) and a pinned Node for `node *.mts` ────────────────────
log "apt install bubblewrap socat"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq || blocker "apt-get update failed"
# ripgrep is a hard SandboxManager.initialize dependency (SRT uses `rg` for filesystem masking); without
# it the sandbox refuses to start with "ripgrep (rg) not found" — mirrors spike-w1-shell.yml's install.
apt-get install -y -qq bubblewrap socat ripgrep ca-certificates curl xz-utils apparmor apparmor-utils >/dev/null \
  || blocker "apt install failed"

if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(process.versions.node.split(".")[0]>=24?0:1)' 2>/dev/null; then
  log "installing pinned Node $NODE_VERSION (trust-on-publish via SHASUMS256.txt)"
  tb="node-${NODE_VERSION}-linux-x64.tar.xz"
  base="https://nodejs.org/dist/${NODE_VERSION}"
  curl -fsSL --retry 3 -o "/tmp/$tb" "$base/$tb" || blocker "node download failed"
  curl -fsSL --retry 3 -o /tmp/node-sums "$base/SHASUMS256.txt" || blocker "node SHASUMS download failed"
  want="$(grep "  $tb\$" /tmp/node-sums | cut -d' ' -f1)"
  have="$(sha256sum "/tmp/$tb" | cut -d' ' -f1)"
  [[ -n "$want" && "$want" == "$have" ]] || blocker "node digest mismatch (want=$want have=$have)"
  mkdir -p /opt/node && tar -xJf "/tmp/$tb" -C /opt/node --strip-components=1 || blocker "node extract failed"
  export PATH="/opt/node/bin:$PATH"
fi
log "node $(node --version)  bwrap(distro) $(/usr/bin/bwrap --version)"

# Create the unprivileged user and give it the paths it needs. Reads of the 9p repo/node_modules and
# /opt/node are world-readable (git/tar perms); the 9p drop + fixture temp must be writable by it.
id "$TAU_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$TAU_USER"
chmod 0777 "$DROP" 2>/dev/null || true
# Run a command as the unprivileged user with an explicit, clean environment.
as_tau() { runuser -u "$TAU_USER" -- "$@"; }

# Minimal, real-shape bwrap invocation whose ONLY privileged step is loopback bring-up in the new
# netns. Under stripped userns caps it prints `bwrap: loopback: Failed RTM_NEWADDR: Operation not
# permitted`; with the grant it exits 0. Writes <tag>.txt + echoes the exit code.
direct_loopback_repro() {
  local bwrap="$1" tag="$2"
  log "direct loopback repro via $bwrap (as $TAU_USER)"
  as_tau "$bwrap" --unshare-user --unshare-net --ro-bind / / --proc /proc --dev /dev -- /bin/true \
    > "$DROP/$tag.txt" 2>&1
  local rc=$?
  echo "exit=$rc" >> "$DROP/$tag.txt"
  log "  $tag exit=$rc :: $(grep -i 'loopback\|RTM_NEWADDR\|perm' "$DROP/$tag.txt" | head -1)"
  return $rc
}

# Run the UNMODIFIED harness with `bwrap` on PATH resolving to $1 (sandbox-runtime resolves bwrap via
# PATH). Receipts land at $DROP/<row>/s0.json,s1.json. Returns the harness exit code.
run_harness() {
  local bwrap_dir="$1" row="$2"
  log "harness row=$row  bwrap_dir=$bwrap_dir"
  # Run as the unprivileged user (see TAU_USER note). RUNNER_TEMP is placed UNDER the user's home
  # (/home/tau), exactly like a hosted runner's RUNNER_TEMP (/home/runner/work/_temp): fixtureRoot's
  # out-of-root "outside" dir then lands under /home, which IS in the harness's posixDeniedRoots, so the
  # read mask denies it — matching the hosted LNX-U row. (/var/tmp is NOT a denied root, which would
  # spuriously let the out-of-root read succeed and misreport the filesystem mask.)
  local rt="/home/$TAU_USER/rt"
  as_tau env \
    PATH="$bwrap_dir:/opt/node/bin:/usr/bin:/bin" \
    HOME="/home/$TAU_USER" \
    RUNNER_TEMP="$rt" \
    TAU_SPIKE_ROW="$row" TAU_SPIKE_OUT="$DROP" \
    node "$PROBE" > "$DROP/$row.console.log" 2>&1
  local rc=$?
  log "  harness row=$row exit=$rc"
  return $rc
}

phase_json() {
  # phase_json <row> <expected> <observed-loopback-exit> <observed-status> <verdict>
  python3 -I - "$DROP/$1.phase.json" "$@" <<'PY'
import json, sys
out, row, expected, loop_exit, status, verdict = sys.argv[1:7]
json.dump({"row": row, "expected": expected, "loopback_direct_exit": loop_exit,
           "harness_status": status, "verdict": verdict}, open(out, "w"), indent=2)
PY
}

harness_status() { # read status from the harness s0.json (ok vs sandbox-unavailable)
  python3 -I - "$DROP/$1/s0.json" <<'PY' 2>/dev/null || echo "no-receipt"
import json,sys
try: print(json.load(open(sys.argv[1])).get("status","ok"))
except Exception: print("no-receipt")
PY
}

# ── PHASE A — confirm the finding: bundled bwrap, NO profile, stock sysctl ─────────────────────────
log "=== PHASE A (LNX-VM-NOPROFILE) ==="
mkdir -p "$BUNDLE_DIR"
cp /usr/bin/bwrap "$BUNDLE_BWRAP"; chmod 0755 "$BUNDLE_BWRAP"
# Ensure no stale profile from a prior run is attached to the bundled path.
apparmor_parser -R "$LANE_DIR/apparmor/tau-bwrap" 2>/dev/null || true
direct_loopback_repro "$BUNDLE_BWRAP" "A-loopback-noprofile"; a_loop=$?
run_harness "$BUNDLE_DIR" "LNX-VM-NOPROFILE"; a_h=$?
a_status="$(harness_status LNX-VM-NOPROFILE)"
# Expectation: loopback repro fails (nonzero) AND harness records sandbox-unavailable.
if [[ $a_loop -ne 0 && "$a_status" == "sandbox-unavailable" ]]; then a_verdict="confirmed-blocked"; else a_verdict="unexpected"; fi
phase_json LNX-VM-NOPROFILE "loopback RTM_NEWADDR EPERM; sandbox-unavailable (sysctl=$sysctl_val, no profile)" "$a_loop" "$a_status" "$a_verdict"

# ── PHASE B — install the Tau-scoped profile (postinst pattern), sysctl UNCHANGED ──────────────────
log "=== PHASE B (LNX-VM-PROFILE) ==="
# (1) Load the SHIPPED, production-faithful profile for Tau's BUNDLED bwrap path. This is the exact
# command a .deb postinst runs; it drives the direct loopback repro below.
apparmor_parser -r -W "$LANE_DIR/apparmor/tau-bwrap" 2>&1 | tee "$DROP/apparmor_parser.log" || blocker "apparmor_parser failed to load tau-bwrap"

# (2) SPIKE-ONLY shim for the distro bwrap path. The spike reuses the UNMODIFIED supervisor.mts, which
# spawns the sandbox with a hardcoded `env PATH=/usr/bin:/bin`, so SRT always resolves `bwrap` to
# /usr/bin/bwrap regardless of where Tau's bundled copy lives. To obtain the FULL-sandbox S0/S1 receipt
# for goal 2, we must therefore also grant userns to the path the harness actually execs. In PRODUCTION
# this profile is unnecessary: Tau points SRT at its bundled bwrap and the shipped tau-bwrap profile
# (bundled path) applies. We do NOT touch any stock /usr/bin/bwrap profile on real systems — this shim
# exists only inside the disposable spike VM. Named distinctly so it never collides with a distro profile.
SPIKE_PROFILE=/tmp/tau-bwrap-spike-usrbin
cat > "$SPIKE_PROFILE" <<'AA'
abi <abi/4.0>,
include <tunables/global>
profile tau-bwrap-spike-usrbin /usr/bin/bwrap flags=(unconfined) {
  userns,
}
AA
apparmor_parser -r -W "$SPIKE_PROFILE" 2>&1 | tee -a "$DROP/apparmor_parser.log" || log "WARN: spike /usr/bin/bwrap profile load reported an issue (see apparmor_parser.log)"

# Re-assert the sysctl was not touched by either profile install.
echo "post-install sysctl apparmor_restrict_unprivileged_userns=$(cat "$SYSCTL_PATH" 2>/dev/null || echo absent)" >> "$DROP/apparmor_parser.log"
aa-status 2>/dev/null | grep -iE 'tau-bwrap' >> "$DROP/apparmor_parser.log" || true

direct_loopback_repro "$BUNDLE_BWRAP" "B-loopback-profile"; b_loop=$?
run_harness "$BUNDLE_DIR" "LNX-VM-PROFILE"; b_h=$?
b_status="$(harness_status LNX-VM-PROFILE)"
# Expectation: loopback repro succeeds (zero) AND harness produced real verdicts (status ok).
if [[ $b_loop -eq 0 && "$b_status" == "ok" ]]; then b_verdict="launches-with-sysctl-1"; else b_verdict="unexpected"; fi
phase_json LNX-VM-PROFILE "loopback succeeds; real S0/S1 (sysctl still $(cat "$SYSCTL_PATH" 2>/dev/null))" "$b_loop" "$b_status" "$b_verdict"

# ── S2 — interactive PTY under the PROFILED bwrap (profile STILL loaded, sysctl UNTOUCHED) ──────────
# With the tau-bwrap profile loaded (Phase B context) and the sysctl at its shipped value, launch a
# REAL interactive bash inside the SAME profiled bwrap invocation shape the harness uses, plus
# --new-session (blueprint A24 job control), over a guest-allocated PTY. Run AS $TAU_USER (root bypasses
# the userns restriction, so a root shell would be a false pass). The driver writes s2.json with a
# per-check pass/fail map next to s0/s1. Fail-closed: a missing pty / non-interactive shell is a typed
# failure, never a false pass. This ADDS S2; it does not alter Phase A/B/C or the s0/s1 receipts.
log "=== S2 (LNX-VM-PROFILE-S2 interactive PTY, profile loaded, sysctl=$(cat "$SYSCTL_PATH" 2>/dev/null)) ==="
as_tau env \
  PATH="$BUNDLE_DIR:/opt/node/bin:/usr/bin:/bin" \
  HOME="/home/$TAU_USER" \
  LC_ALL=C.UTF-8 LANG=C.UTF-8 \
  python3 -I "$LANE_DIR/pty-probe.py" "$BUNDLE_BWRAP" "$DROP/s2.json" \
  > "$DROP/s2.console.log" 2>&1
s2_rc=$?
s2_verdict="$(python3 -I - "$DROP/s2.json" <<'PY' 2>/dev/null || echo no-receipt
import json, sys
try: print(json.load(open(sys.argv[1])).get("verdict", "no-receipt"))
except Exception: print("no-receipt")
PY
)"
log "  S2 driver exit=$s2_rc  verdict=$s2_verdict"

# Unload both profiles so Phase C starts from the stock (unprofiled) posture.
apparmor_parser -R "$LANE_DIR/apparmor/tau-bwrap" 2>/dev/null || true
apparmor_parser -R "$SPIKE_PROFILE" 2>/dev/null || true

# ── PHASE C — AppImage: no .deb, no postinst, no profile ─────────────────────────────────────
log "=== PHASE C (LNX-VM-APPIMAGE) ==="
mkdir -p "$APPIMAGE_DIR"
cp /usr/bin/bwrap "$APPIMAGE_BWRAP"; chmod 0755 "$APPIMAGE_BWRAP"
# No apparmor_parser here: an AppImage cannot run a postinst. The bundled-path profile from Phase B
# does NOT attach to this different AppImage path, so the restriction still applies.
direct_loopback_repro "$APPIMAGE_BWRAP" "C-loopback-appimage"; c_loop=$?
run_harness "$APPIMAGE_DIR" "LNX-VM-APPIMAGE"; c_h=$?
c_status="$(harness_status LNX-VM-APPIMAGE)"
if [[ $c_loop -ne 0 && "$c_status" == "sandbox-unavailable" ]]; then c_verdict="blocked-no-profile-path"; else c_verdict="unexpected"; fi
phase_json LNX-VM-APPIMAGE "blocked (no install-time profile for the AppImage mount path)" "$c_loop" "$c_status" "$c_verdict"

log "phases complete: A=$a_verdict B=$b_verdict C=$c_verdict S2=$s2_verdict"
finish "DONE A=$a_verdict B=$b_verdict C=$c_verdict S2=$s2_verdict" 0
