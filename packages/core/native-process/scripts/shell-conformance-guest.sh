#!/usr/bin/env bash
# Inside a stock guest: install the real APT selector's profiled bwrap, then run the shell conformance targets as an
# unprivileged user against it. Called over SSH by shell-conformance-vm.sh with the distro as its argument.
# Required files: ~/bwrap-fixture/*.deb, ~/node, ~/tau (tracked sources). Exit: the conformance target's status.
set -euo pipefail
umask 022
export PATH="$HOME/node/bin:$PATH"
[[ "$(id -un)" == tau && "$(id -u)" != 0 ]]
source /etc/os-release
[[ "$ID" == "$1" ]]
case "$ID:$VERSION_ID" in ubuntu:24.04|debian:13) ;; *) exit 1 ;; esac
printf 'Guest: %s (%s)\n' "$PRETTY_NAME" "$(uname -r)"
before="$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || printf 'absent')"
printf 'apparmor_restrict_unprivileged_userns: %s\n' "$before"
sudo env DEBIAN_FRONTEND=noninteractive apt-get update -qq
# Runtime prerequisites (bubblewrap, socat, ripgrep) and the toolchain node-pty builds from source with.
# `fuse3` carries the setuid `fusermount3` the Linux projection transport mounts through. The projection is
# unactivated, so no row here mounts one; the dependency is declared so activation needs no guest change.
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  apparmor bubblewrap socat ripgrep fuse3 curl git ca-certificates build-essential python3 util-linux
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  "$HOME"/bwrap-fixture/tau-staging-runtime-*_amd64.deb "$HOME"/bwrap-fixture/tau-staging_*_amd64.deb
sudo grep -Fx 'tau-staging-bwrap (unconfined)' /sys/kernel/security/apparmor/profiles
bwrap=/opt/tau-staging/sandbox/bwrap
cd "$HOME/tau"
corepack enable --install-directory "$HOME/node/bin"
pnpm install --frozen-lockfile
status=0
NX_NO_CLOUD=true NX_DAEMON=false TAU_SHELL_CONFORMANCE_BWRAP="$bwrap" \
  TAU_SHELL_CONFORMANCE_RECEIPT="$HOME/shell-conformance-receipt.json" \
  pnpm nx run native-process-core:test:shell-conformance --skip-nx-cache || status=$?
# The host shell service's rows over the same provider and bwrap (H01-H06), with their own receipt.
NX_NO_CLOUD=true NX_DAEMON=false TAU_SHELL_CONFORMANCE_BWRAP="$bwrap" \
  TAU_SHELL_CONFORMANCE_RECEIPT="$HOME/shell-service-conformance-receipt.json" \
  pnpm nx run host:test:shell-conformance --skip-nx-cache || status=$?
# The desktop Terminal's rows through the services host's terminal concern (W5), with their own receipt.
NX_NO_CLOUD=true NX_DAEMON=false TAU_SHELL_CONFORMANCE_BWRAP="$bwrap" \
  TAU_SHELL_CONFORMANCE_RECEIPT="$HOME/terminal-conformance-receipt.json" \
  pnpm nx run desktop:test:terminal-conformance --skip-nx-cache || status=$?
# The run never relaxed the stock policy.
[[ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || printf 'absent')" == "$before" ]]
exit "$status"
