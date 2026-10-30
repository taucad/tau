#!/usr/bin/env bash
# Install the built APT pair on the stock guest and run the sandbox bwrap through its installed path.
# Required files: ~/bwrap-fixture/*.deb from hosted-linux-bwrap-fixture.mts. Called over SSH by hosted-linux-vm.sh.
# Optional env: none. Usage: bash hosted-linux-bwrap-guest.sh
# Exit codes: 0 profile attached, unprivileged netns launched and remove/reinstall clean; 1 otherwise.
set -euo pipefail
[[ "$(id -un)" == tau && "$(id -u)" != 0 ]]
restriction() { cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || printf 'absent\n'; }
probe=(--unshare-user --unshare-net --ro-bind / / true)
before="$(restriction)"
printf 'apparmor_restrict_unprivileged_userns before install: %s\n' "$before"
runtime=("$HOME"/bwrap-fixture/tau-staging-runtime-*_amd64.deb)
selector=("$HOME"/bwrap-fixture/tau-staging_*_amd64.deb)
[[ ${#runtime[@]} == 1 && ${#selector[@]} == 1 && -f "${runtime[0]}" && -f "${selector[0]}" ]]
# Real distribution dependencies, including the stock bubblewrap the selector copies.
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${runtime[0]}" "${selector[0]}"
sudo grep -Fx 'tau-staging-bwrap (unconfined)' /sys/kernel/security/apparmor/profiles
cmp /usr/bin/bwrap /opt/tau-staging/sandbox/bwrap
/opt/tau-staging/sandbox/bwrap "${probe[@]}"
printf 'PASS: unprivileged bwrap --unshare-user --unshare-net through /opt/tau-staging/sandbox/bwrap\n'
helper=/opt/tau-staging/releases/1.0.1/resources/app.asar.unpacked/node_modules/@anthropic-ai/sandbox-runtime/vendor/seccomp/x64/apply-seccomp
[[ -x "$helper" ]]
java_agent=/opt/tau-staging/releases/1.0.1/resources/app.asar.unpacked/node_modules/@anthropic-ai/sandbox-runtime/vendor/java-proxy-agent/srt-proxy-agent.jar
[[ -r "$java_agent" ]]
# Match sandbox-runtime's secure namespace setup: a fresh procfs for nested userns maps,
# isolated PIDs, and no retained capabilities. The read-only root is still read-only.
helper_sandbox=(--unshare-net --ro-bind / / --unshare-pid --unshare-user --cap-drop ALL --proc /proc)
/opt/tau-staging/sandbox/bwrap "${helper_sandbox[@]}" --ro-bind "$java_agent" "$java_agent" "$helper" /usr/bin/test -r "$java_agent"
printf 'PASS: ASAR-unpacked Java proxy agent bind-mount is readable\n'
/opt/tau-staging/sandbox/bwrap "${helper_sandbox[@]}" "$helper" /usr/bin/python3 -c '
import errno, socket
try:
    socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
except OSError as error:
    assert error.errno == errno.EPERM, error
else:
    raise AssertionError("packaged seccomp helper allowed an AF_UNIX socket")
'
printf 'PASS: ASAR-unpacked installed helper executes and refuses AF_UNIX sockets\n'

# Negative control: identical bytes at an unprofiled path stay restricted under the stock policy.
control="$(mktemp -d "$HOME/bwrap-control.XXXXXX")"
cp /opt/tau-staging/sandbox/bwrap "$control/bwrap"
if [[ "$before" == 1 ]]; then
  if "$control/bwrap" "${probe[@]}" 2> "$control/stderr"; then
    printf 'Unprofiled bwrap copy launched; the stock restriction is not in force\n' >&2
    exit 1
  fi
  grep -F 'RTM_NEWADDR' "$control/stderr"
  printf 'PASS: the same bytes at an unprofiled path are refused\n'
fi
rm -rf -- "$control"
sudo env DEBIAN_FRONTEND=noninteractive apt-get remove -y tau-staging
if sudo grep -F 'tau-staging-bwrap' /sys/kernel/security/apparmor/profiles; then
  printf 'Removed package left its profile loaded\n' >&2
  exit 1
fi
[[ ! -e /opt/tau-staging/sandbox && ! -e /etc/apparmor.d/tau-staging-bwrap ]]
[[ -z "$(sudo find /var/cache/apparmor -name tau-staging-bwrap)" ]]
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${selector[0]}"
/opt/tau-staging/sandbox/bwrap "${probe[@]}"
[[ "$(restriction)" == "$before" ]]
printf 'PASS: remove unloads only the Tau profile, reinstall restores it, sysctl unchanged (%s)\n' "$before"
# Leave the guest as found for the later tooling harness: purge both fixture packages.
sudo env DEBIAN_FRONTEND=noninteractive apt-get purge -y tau-staging tau-staging-runtime-1.0.1
[[ ! -e /opt/tau-staging/sandbox && ! -e /etc/apparmor.d/tau-staging-bwrap ]]
if sudo grep -F 'tau-staging-bwrap' /sys/kernel/security/apparmor/profiles; then exit 1; fi
# Purge leaves the non-AppImage selector's `current` link (dangling) and so its parent directory; the later
# tooling harness refuses a guest that already has /opt/tau-staging, so remove exactly those leftovers.
sudo find /opt/tau-staging -mindepth 1 -printf 'leftover after purge: %p (%y)\n' 2>/dev/null || true
if [[ -L /opt/tau-staging/current && ! -e /opt/tau-staging/current ]]; then sudo rm /opt/tau-staging/current; fi
if [[ -d /opt/tau-staging ]]; then sudo rmdir /opt/tau-staging; fi
[[ ! -e /opt/tau-staging ]]
