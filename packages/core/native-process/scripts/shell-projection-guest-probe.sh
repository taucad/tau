#!/usr/bin/env bash
# THROWAWAY DIAGNOSTIC. Not a conformance row, not a gate, and nothing in the product calls it.
#
# Inside a stock Ubuntu 24.04 or Debian 13 guest, with AppArmor and kernel.apparmor_restrict_unprivileged_userns
# exactly as the distro ships them, answer one question: can the ordinary unprivileged user mount the Tau FUSE
# projection bridge, and can the distro's own `bwrap` then bind that mountpoint into its mount namespace so a
# sandboxed shell reads through it?
#
# It observes; it never relaxes. It does not write the sysctl, unload a profile, or install an AppArmor exception,
# and it asserts the sysctl is unchanged before it exits. Every outcome is reported as a pass or a failure; there
# is no skip and no inferred result.
#
# Called over SSH by shell-projection-probe-vm.sh with the distro id as its argument.
# Required files: ~/node (a Node 24 tree), ~/tau/packages/core/native-process/{native,scripts} (tracked sources).
# Exit: 0 the unprivileged mount AND the bwrap bind both worked; 1 either did not, or the environment was not stock.
set -uo pipefail
umask 022
export PATH="$HOME/node/bin:$PATH"
export DEBIAN_FRONTEND=noninteractive
LIBFUSE_VERSION=3.17.2
# SHA-256 of https://github.com/libfuse/libfuse/releases/download/fuse-3.17.2/fuse-3.17.2.tar.gz, the same pinned
# release the LNX-P transport row builds. The bridge build script independently pins each header's digest.
LIBFUSE_SHA256=3d932431ad94e86179e5265cddde1d67aa3bb2fb09a5bd35c641f86f2b5ed06f

fail() { printf 'PROBE-ERROR: %s\n' "$1" >&2; exit 1; }
rule() { printf '\n== %s ==\n' "$1"; }

set -e
[[ "$(id -un)" == tau && "$(id -u)" != 0 ]] || fail 'The probe must run as the unprivileged guest user tau.'
# shellcheck disable=SC1091 # Provided by the guest image.
source /etc/os-release
[[ "$ID" == "${1:-}" ]] || fail "Guest is $ID, expected ${1:-}."
case "$ID:$VERSION_ID" in ubuntu:24.04 | debian:13) ;; *) fail "Unexpected guest $ID:$VERSION_ID." ;; esac
set +e

rule 'Environment as shipped'
printf 'DISTRO: %s\n' "$PRETTY_NAME"
printf 'DISTRO-ID: %s %s\n' "$ID" "$VERSION_ID"
printf 'KERNEL: %s\n' "$(uname -r)"
userns_sysctl_path=/proc/sys/kernel/apparmor_restrict_unprivileged_userns
userns_before="$(cat "$userns_sysctl_path" 2>/dev/null || printf 'absent')"
printf 'APPARMOR-RESTRICT-UNPRIVILEGED-USERNS: %s\n' "$userns_before"
printf 'UNPRIVILEGED-USERNS-CLONE: %s\n' \
  "$(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null || printf 'absent')"
printf 'APPARMOR-ENABLED: %s\n' "$(cat /sys/module/apparmor/parameters/enabled 2>/dev/null || printf 'absent')"

rule 'Install the distro packages the probe needs'
# fuse3 brings the distro's own setuid fusermount3 under the distro's own policy: the helper the question is about.
# bubblewrap is the distro's own bwrap, unprofiled by Tau. meson/ninja/gcc build the pinned libfuse the bridge links.
sudo apt-get update -qq || fail 'apt-get update failed.'
sudo apt-get install -y --no-install-recommends \
  apparmor apparmor-utils fuse3 bubblewrap meson ninja-build pkg-config build-essential curl ca-certificates \
  binutils || fail 'apt-get install failed.'

rule 'The mount helper and the device, as shipped'
fusermount_path="$(command -v fusermount3 || true)"
if [[ -z "$fusermount_path" ]]; then
  printf 'FUSERMOUNT3-PRESENT: no\nFUSERMOUNT3-SETUID: n/a\n'
else
  printf 'FUSERMOUNT3-PRESENT: yes (%s)\n' "$fusermount_path"
  printf 'FUSERMOUNT3-MODE: %s\n' "$(stat -c '%A %U:%G %a' "$fusermount_path")"
  if [[ -u "$fusermount_path" ]]; then printf 'FUSERMOUNT3-SETUID: yes\n'; else printf 'FUSERMOUNT3-SETUID: no\n'; fi
  printf 'FUSERMOUNT3-VERSION: %s\n' "$("$fusermount_path" --version 2>&1 | tr '\n' ' ')"
fi
if [[ -e /dev/fuse ]]; then
  printf 'DEV-FUSE: %s\n' "$(stat -c '%A %U:%G' /dev/fuse)"
else
  printf 'DEV-FUSE: absent\n'
fi
# Can the unprivileged user open the device at all? A refusal here is a different cause from a refused mount.
if (exec 3</dev/fuse) 2>/dev/null; then
  printf 'DEV-FUSE-OPENABLE-UNPRIVILEGED: yes\n'
else
  printf 'DEV-FUSE-OPENABLE-UNPRIVILEGED: no (%s)\n' "$( (exec 3</dev/fuse) 2>&1 || true)"
fi
printf 'BWRAP-PATH: %s\n' "$(command -v bwrap || printf 'absent')"
printf 'BWRAP-VERSION: %s\n' "$(bwrap --version 2>&1 | tr '\n' ' ' || printf 'unavailable')"
if [[ -e /usr/bin/bwrap ]]; then printf 'BWRAP-MODE: %s\n' "$(stat -c '%A %U:%G' /usr/bin/bwrap)"; fi
rule 'Loaded AppArmor profiles mentioning bwrap, fuse or unshare'
sudo grep -E 'bwrap|fuse|unshare|userns' /sys/kernel/security/apparmor/profiles 2>/dev/null ||
  printf '(no matching loaded profile)\n'

rule 'Build the pinned libfuse 3.17.2 from source'
work="$HOME/libfuse-work"
rm -rf "$work"
mkdir -p "$work/headers"
curl -fsSL --retry 3 --proto '=https' --proto-redir '=https' \
  -o "$work/fuse.tar.gz" \
  "https://github.com/libfuse/libfuse/releases/download/fuse-${LIBFUSE_VERSION}/fuse-${LIBFUSE_VERSION}.tar.gz" ||
  fail 'Could not download the pinned libfuse release.'
printf '%s  %s\n' "$LIBFUSE_SHA256" "$work/fuse.tar.gz" | sha256sum --check --strict ||
  fail 'The libfuse download does not match its pinned SHA-256.'
tar -xzf "$work/fuse.tar.gz" -C "$work" || fail 'Could not unpack libfuse.'
# -Dutils=true builds the helper, but nothing is installed here: attempt 1 must use the distro's own fusermount3.
meson setup "$work/build" "$work/fuse-${LIBFUSE_VERSION}" --prefix=/usr/local --buildtype=release \
  -Dexamples=false -Dtests=false -Dutils=true >"$work/meson.log" 2>&1 ||
  { tail -40 "$work/meson.log"; fail 'meson setup failed.'; }
ninja -C "$work/build" >"$work/ninja.log" 2>&1 || { tail -40 "$work/ninja.log"; fail 'ninja failed.'; }
library="$(readlink -f "$work/build/lib/libfuse3.so.4")"
cp "$work/fuse-${LIBFUSE_VERSION}/include/"{fuse_lowlevel.h,fuse_common.h,fuse_opt.h,fuse_log.h} "$work/headers/"
cp "$work/build/libfuse_config.h" "$work/headers/"
printf 'LIBFUSE-BUILT: %s\n' "$library"

rule 'Build the projection bridge with its own build script'
package="$HOME/tau/packages/core/native-process"
node_headers="$HOME/node/include/node"
[[ -f "$node_headers/node_api.h" ]] || fail "No Node headers at $node_headers."
# Debian 13 ships glibc 2.41, so its own build legitimately exceeds the script's 2.39 default baseline. The baseline
# is a distribution-portability check, not a containment one; the probe states the value it used.
glibc_baseline=2.39
if [[ "$ID" == debian ]]; then glibc_baseline=2.41; fi
printf 'GLIBC-BASELINE-USED: %s\n' "$glibc_baseline"
# Node 24 strips the types natively, so the real build script runs with no dependency installation at all.
node "$package/scripts/build-shell-projection.mts" \
  --node-headers "$node_headers" \
  --fuse-headers "$work/headers" \
  --fuse-library "$library" \
  --fuse-sha256 "$(sha256sum "$library" | cut -d' ' -f1)" \
  --glibc-baseline "$glibc_baseline" || fail 'The projection bridge build was refused.'
bridge="$package/dist/native/linux-x64/shell-projection.node"
[[ -f "$bridge" ]] || fail 'The build script reported success but left no bridge.'
printf 'BRIDGE: %s\n' "$bridge"

# One mount attempt. $1 names the attempt for the log. Sets mount_status, and leaves its log at $probe_log.
mountpoint_dir="$HOME/projection-mnt"
sandbox_view="$HOME/sandbox-view"
plain_dir="$HOME/plain-dir"
probe_log="$HOME/probe.log"
attempt_mount() {
  local label="$1"
  rule "Unprivileged mount attempt: $label"
  printf 'MOUNT-ATTEMPT: %s\n' "$label"
  printf 'MOUNT-HELPER-RESOLVED: %s\n' "$(command -v fusermount3 || printf 'absent')"
  rm -rf "$mountpoint_dir"
  mkdir -p "$mountpoint_dir" "$sandbox_view" "$plain_dir"
  printf 'plain-control-ok\n' >"$plain_dir/control.txt"
  : >"$probe_log"
  setsid node "$package/scripts/shell-projection-guest-probe.mjs" "$bridge" "$mountpoint_dir" \
    >"$probe_log" 2>&1 &
  probe_pid=$!
  mount_status=1
  local waited=0
  while ((waited < 60)); do
    if grep -q '^PROBE-MOUNTED' "$probe_log"; then
      mount_status=0
      break
    fi
    if ! kill -0 "$probe_pid" 2>/dev/null; then
      wait "$probe_pid"
      mount_status=$?
      [[ "$mount_status" == 0 ]] && mount_status=1
      break
    fi
    sleep 1
    waited=$((waited + 1))
  done
  printf 'MOUNT-EXIT-STATUS: %s\n' "$mount_status"
  printf 'MOUNT-OUTPUT-BEGIN\n'
  cat "$probe_log"
  printf 'MOUNT-OUTPUT-END\n'
  if [[ "$mount_status" != 0 ]]; then
    printf 'MOUNT-RESULT: FAIL (the unprivileged user could not mount the bridge)\n'
    kill "$probe_pid" 2>/dev/null
    return 1
  fi
  printf 'MOUNT-RESULT: PASS (the unprivileged user mounted the bridge)\n'
  printf 'MOUNT-TABLE-ROW: %s\n' "$(grep -F "$mountpoint_dir" /proc/self/mounts || printf 'none')"
  return 0
}

stop_probe() {
  if [[ -n "${probe_pid:-}" ]] && kill -0 "$probe_pid" 2>/dev/null; then
    kill "$probe_pid" 2>/dev/null
    local waited=0
    while kill -0 "$probe_pid" 2>/dev/null && ((waited < 20)); do
      sleep 1
      waited=$((waited + 1))
    done
    kill -9 "$probe_pid" 2>/dev/null
  fi
  fusermount3 -u "$mountpoint_dir" 2>/dev/null
}

attempt_mount 'distro fusermount3, policy as shipped'
mount_outcome=$?
mount_helper='distro'
if ((mount_outcome != 0)); then
  # The distro helper may simply be an older libfuse than the pinned library. Installing the pinned helper
  # separates "this policy refuses the mount" from "this helper is the wrong version"; it relaxes no policy.
  rule 'Retry with the pinned 3.17.2 helper to separate policy from helper version'
  sudo install -o root -g root -m 4755 "$work/build/util/fusermount3" /usr/local/bin/fusermount3 ||
    fail 'Could not install the pinned helper for the second attempt.'
  hash -r
  attempt_mount 'pinned 3.17.2 fusermount3, policy as shipped'
  mount_outcome=$?
  mount_helper='pinned'
fi
printf 'MOUNT-HELPER-THAT-WORKED: %s\n' "$([[ $mount_outcome == 0 ]] && printf '%s' "$mount_helper" || printf 'none')"

direct_status=1
bwrap_control_status=1
bwrap_status=1
bwrap_full_status=1
if ((mount_outcome == 0)); then
  rule 'Read the mount directly, outside any sandbox'
  direct_output="$(cat "$mountpoint_dir/probe.txt" 2>&1)"
  direct_status=$?
  printf 'DIRECT-READ-EXIT-STATUS: %s\nDIRECT-READ-OUTPUT: %s\n' "$direct_status" "$direct_output"
  printf 'DIRECT-LISTING: %s\n' "$(ls -la "$mountpoint_dir" 2>&1 | tr '\n' '|')"

  rule 'bwrap control: bind an ordinary directory (does bwrap run under this policy at all?)'
  control_output="$(bwrap --ro-bind / / --bind "$plain_dir" "$sandbox_view" \
    -- cat "$sandbox_view/control.txt" 2>&1)"
  bwrap_control_status=$?
  printf 'BWRAP-CONTROL-EXIT-STATUS: %s\nBWRAP-CONTROL-OUTPUT: %s\n' "$bwrap_control_status" "$control_output"

  rule 'bwrap bind of the projection mount, and a read through it'
  bwrap_output="$(bwrap --ro-bind / / --bind "$mountpoint_dir" "$sandbox_view" \
    -- cat "$sandbox_view/probe.txt" 2>&1)"
  bwrap_status=$?
  printf 'BWRAP-BIND-EXIT-STATUS: %s\nBWRAP-BIND-OUTPUT: %s\n' "$bwrap_status" "$bwrap_output"

  rule 'bwrap bind again with the full set of namespace unshares'
  bwrap_full_output="$(bwrap --ro-bind / / --bind "$mountpoint_dir" "$sandbox_view" \
    --unshare-user --unshare-pid --unshare-ipc --unshare-uts --unshare-cgroup --die-with-parent \
    --proc /proc --dev /dev -- cat "$sandbox_view/probe.txt" 2>&1)"
  bwrap_full_status=$?
  printf 'BWRAP-FULL-EXIT-STATUS: %s\nBWRAP-FULL-OUTPUT: %s\n' "$bwrap_full_status" "$bwrap_full_output"
fi

rule 'Tear down'
stop_probe
printf 'MOUNT-SURVIVED-TEARDOWN: %s\n' \
  "$(grep -qF "$mountpoint_dir" /proc/self/mounts && printf 'yes (leaked)' || printf 'no')"
printf 'PROBE-LOG-TAIL-BEGIN\n'
tail -20 "$probe_log" 2>/dev/null
printf 'PROBE-LOG-TAIL-END\n'

userns_after="$(cat "$userns_sysctl_path" 2>/dev/null || printf 'absent')"
printf 'APPARMOR-RESTRICT-UNPRIVILEGED-USERNS-AFTER: %s\n' "$userns_after"
[[ "$userns_after" == "$userns_before" ]] ||
  fail 'The probe changed the stock userns policy; its result cannot be trusted.'

rule 'Verdict'
verdict_status=0
report() {
  if [[ "$2" == 0 ]]; then
    printf 'VERDICT-%s: PASS\n' "$1"
  else
    printf 'VERDICT-%s: FAIL (exit %s)\n' "$1" "$2"
    verdict_status=1
  fi
}
report UNPRIVILEGED-MOUNT "$mount_outcome"
report DIRECT-READ "$direct_status"
report BWRAP-RUNS-AT-ALL "$bwrap_control_status"
report BWRAP-BINDS-THE-PROJECTION "$bwrap_status"
report BWRAP-BINDS-UNDER-FULL-UNSHARE "$bwrap_full_status"
if ((verdict_status == 0)); then
  printf 'VERDICT: ANSWERABLE-YES — the unprivileged user mounted the bridge and bwrap bound it for a sandboxed read.\n'
else
  printf 'VERDICT: ANSWERABLE-NO — see the FAIL lines above. This is a real negative, not a skip.\n'
fi
exit "$verdict_status"
