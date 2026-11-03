#!/usr/bin/env bash
# Run native-process-core:test:shell-conformance inside a disposable stock Linux guest (LNX-U, LNX-U26, LNX-D).
# The guest keeps its shipped AppArmor policy and kernel.apparmor_restrict_unprivileged_userns value; the sandbox
# reaches user namespaces only through the Tau-scoped bwrap profile the real APT selector installs.
# Required env: TAU_VM_DISTRO (ubuntu, ubuntu2604 or debian), RUNNER_TEMP (disposable CI directory).
# Usage: TAU_VM_DISTRO=ubuntu bash packages/core/native-process/scripts/shell-conformance-vm.sh
# Exit codes: 0 every row passed; 1 a row failed or an operation failed; 3 missing host prerequisite.
set -euo pipefail
umask 077
: "${TAU_VM_DISTRO:?set TAU_VM_DISTRO}"
: "${RUNNER_TEMP:?disposable hosted runner required}"
[[ "${GITHUB_ACTIONS:-}" == true && "$(uname -m)" == x86_64 ]] || exit 3
REPO_ROOT="$(git rev-parse --show-toplevel)"
# The same dated, checksum-pinned images as apps/desktop/scripts/hosted-linux-vm.sh.
case "$TAU_VM_DISTRO" in
  ubuntu)
    row=LNX-U
    url=https://cloud-images.ubuntu.com/releases/noble/release-20261017/ubuntu-24.04-server-cloudimg-amd64.img
    digest=04e8f2461a16a44e78a370284471f29616cdd9baf1893df25807b71f985b6c94
    algorithm=sha256sum ;;
  ubuntu2604)
    row=LNX-U26
    url=https://cloud-images.ubuntu.com/releases/resolute/release-20261016/ubuntu-26.04-server-cloudimg-amd64.img
    digest=5645d0318ad21f643ebb1ac4567514620e9893380b07b0201fda163baa5b7eb5
    algorithm=sha256sum ;;
  debian)
    row=LNX-D
    url=https://cloud.debian.org/images/cloud/trixie/20261021-2638/debian-13-generic-amd64-20261021-2638.qcow2
    digest=70ef6adc1c16155f8d575731b37d0f976d1c60b6144ac3f57914a3f4b30b202b69584d5d143aa39da0f0fe81df9e5b698909c0d94c7d91c6f6c4bb6581ead5f0
    algorithm=sha512sum ;;
  *) printf 'Unknown distro\n' >&2; exit 1 ;;
esac
work="$(mktemp -d "$RUNNER_TEMP/tau-shell-vm.XXXXXX")"
output="$REPO_ROOT/out/test-results/shell-conformance/$row"
mkdir -p "$output"
qemu_pid=''
ready=false
cleanup() {
  local exit_code=$?
  # Even a setup/test failure must retain the app identities and any completed trace/JSON receipts.
  if [[ "$ready" == true ]]; then
    timeout --kill-after=10s 90s ssh "${ssh_options[@]}" tau@127.0.0.1 \
      'cd ~/tau; paths=(out/test-results/shell-application); for path in out/test-results/desktop-shell out/test-results/desktop-e2e; do if [[ -d "$path" ]]; then paths+=("$path"); fi; done; tar -czf - "${paths[@]}"' \
      > "$output/application-evidence.tar.gz" || exit_code=1
  fi
  if [[ -f "$work/serial.log" ]]; then cp "$work/serial.log" "$output/serial.log"; fi
  if [[ -n "$qemu_pid" ]]; then
    kill "$qemu_pid" 2>/dev/null || true
    wait "$qemu_pid" 2>/dev/null || true
  fi
  sudo setfacl -x "u:$(id -un)" /dev/kvm || true
  rm -rf -- "$work"
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 1' INT TERM
# The runner image's package lists usually already name these packages, so install from them first; a mirror that
# stalls `apt-get update` then cannot fail the row. Only a failed install refreshes the lists, with two bounded tries.
packages=(qemu-system-x86 qemu-utils cloud-image-utils acl)
install_packages() {
  sudo timeout --kill-after=30s 600s apt-get install -y --no-install-recommends \
    -o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 "${packages[@]}"
}
refresh_lists() {
  sudo timeout --kill-after=30s 300s apt-get \
    -o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 \
    -o APT::Update::Error-Mode=any update
}
if ! install_packages; then
  refresh_lists || refresh_lists
  install_packages
fi
sudo setfacl -m "u:$(id -un):rw" /dev/kvm
curl --fail --location --proto '=https' --proto-redir '=https' --retry 3 "$url" -o "$work/base.qcow2"
printf '%s  %s\n' "$digest" "$work/base.qcow2" | "$algorithm" --check
printf '%s\n%s %s\n' "$url" "$algorithm" "$digest" > "$output/image.txt"
qemu-img create -f qcow2 -F qcow2 -b "$work/base.qcow2" "$work/guest.qcow2" 64G
ssh-keygen -q -t ed25519 -N '' -f "$work/client"
ssh-keygen -q -t ed25519 -N '' -f "$work/host"
printf '[127.0.0.1]:2222 %s\n' "$(cat "$work/host.pub")" > "$work/known_hosts"
cat > "$work/user-data" <<CONFIG
#cloud-config
users:
  - name: tau
    groups: [sudo]
    shell: /bin/bash
    sudo: ALL=(ALL) NOPASSWD:ALL
    lock_passwd: true
    ssh_authorized_keys:
      - $(cat "$work/client.pub")
ssh_pwauth: false
disable_root: true
ssh_keys:
  ed25519_private: |
$(sed 's/^/    /' "$work/host")
  ed25519_public: $(cat "$work/host.pub")
CONFIG
printf 'instance-id: tau-shell-%s\nlocal-hostname: tau-shell\n' "$TAU_VM_DISTRO" > "$work/meta-data"
cloud-localds "$work/seed.img" "$work/user-data" "$work/meta-data"
qemu-system-x86_64 -enable-kvm -cpu host -smp 4 -m 8192 -display none -no-reboot \
  -drive "file=$work/guest.qcow2,format=qcow2,if=virtio" \
  -drive "file=$work/seed.img,format=raw,if=virtio,readonly=on" \
  -netdev user,id=net0,hostfwd=tcp:127.0.0.1:2222-:22 -device virtio-net-pci,netdev=net0 \
  -serial "file:$work/serial.log" > "$output/qemu.log" 2>&1 &
qemu_pid=$!
ssh_options=(-i "$work/client" -p 2222 -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$work/known_hosts")
ready=false
for _attempt in $(seq 1 90); do
  kill -0 "$qemu_pid"
  if ssh "${ssh_options[@]}" tau@127.0.0.1 true 2>/dev/null; then ready=true; break; fi
  sleep 5
done
[[ "$ready" == true ]]
ssh "${ssh_options[@]}" tau@127.0.0.1 'sudo cloud-init status --wait' > "$output/cloud-init-status.txt"
# The real APT selector pair: it copies the distro bwrap to /opt/tau-staging/sandbox/bwrap and loads its profile.
# dpkg-deb refuses control directories the 077 umask above would create.
(umask 022 && cd "$REPO_ROOT" && node --import @oxc-node/core/register apps/desktop/scripts/hosted-linux-bwrap-fixture.mts "$work/bwrap-fixture")
# The unpackaged production Electron build resolves the production channel's Tau-owned bwrap
# (`linuxInstallation('production').bwrap`), so the application tier needs the same real producer's production pair.
mkdir -p "$work/bwrap-app/app/resources/branding" "$work/bwrap-fixture-production"
printf 'fixture icon' > "$work/bwrap-app/app/resources/branding/icon.png"
printf '#!/bin/sh\nexit 0\n' > "$work/bwrap-app/app/Tau"
chmod 755 "$work/bwrap-app/app/Tau"
cat > "$work/bwrap-app/build.mts" <<PRODUCER
import { buildLinuxAptPackages } from '$REPO_ROOT/apps/desktop/scripts/linux-apt-package.mts';
const files = await buildLinuxAptPackages({
  appDirectory: process.argv[2]!,
  outputDirectory: process.argv[3]!,
  tag: 'desktop@0.1.0',
  sourceCommit: 'f'.repeat(40),
  maintainer: 'Tau VM proof <proof@example.invalid>',
});
console.log(files.join('\\n'));
PRODUCER
(umask 022 && cd "$REPO_ROOT" && node --import @oxc-node/core/register "$work/bwrap-app/build.mts" "$work/bwrap-app/app" "$work/bwrap-fixture-production")
ssh "${ssh_options[@]}" tau@127.0.0.1 'mkdir -m 700 ~/bwrap-fixture ~/bwrap-fixture-production ~/node ~/tau'
for fixture in bwrap-fixture bwrap-fixture-production; do
  for deb in "$work/$fixture"/*.deb; do
    # shellcheck disable=SC2029 # Producer-controlled artifact name, expanded on the host by design.
    ssh "${ssh_options[@]}" tau@127.0.0.1 "cat > ~/$fixture/$(basename "$deb")" < "$deb"
  done
done
# The verified Node from setup-nx, and the checked-out tracked sources; dependencies install fresh in the guest.
node_root="$(dirname "$(dirname "$(command -v node)")")"
tar -C "$node_root" -cf - . | ssh "${ssh_options[@]}" tau@127.0.0.1 'tar -xf - -C ~/node'
(cd "$REPO_ROOT" && git ls-files -z | tar --null -T - -cf -) | ssh "${ssh_options[@]}" tau@127.0.0.1 'tar -xf - -C ~/tau'
# Bind the exact host build to this source identity and verify every copied byte before any application test.
(cd "$REPO_ROOT" && test -s apps/desktop/dist/main/index.js && test -s apps/ui/desktop/build/client/index.html && \
  find apps/desktop/dist apps/ui/desktop/build -type f -print0 | sort -z | xargs -0 sha256sum) \
  > "$output/application-build.sha256"
(cd "$REPO_ROOT" && tar -cf - apps/desktop/dist apps/ui/desktop/build) | \
  ssh "${ssh_options[@]}" tau@127.0.0.1 'tar -xf - -C ~/tau'
ssh "${ssh_options[@]}" tau@127.0.0.1 'cat > ~/tau/application-build.sha256' < "$output/application-build.sha256"
# Only identity values for the receipt cross into the guest, each constrained to its shape first.
[[ "${GITHUB_SHA:-}" =~ ^[a-f0-9]{40}$ && "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ && "${GITHUB_REPOSITORY:-}" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]
status=0
# shellcheck disable=SC2029 # Shape-checked identity values, expanded on the host by design.
ssh "${ssh_options[@]}" tau@127.0.0.1 \
  "GITHUB_SHA=$GITHUB_SHA GITHUB_RUN_ID=$GITHUB_RUN_ID GITHUB_REPOSITORY=$GITHUB_REPOSITORY GITHUB_SERVER_URL=https://github.com TAU_SHELL_CONFORMANCE_ROW=$row bash -s -- $TAU_VM_DISTRO" \
  < "$REPO_ROOT/packages/core/native-process/scripts/shell-conformance-guest.sh" | tee "$output/guest.txt" || status=$?
ssh "${ssh_options[@]}" tau@127.0.0.1 'cat ~/shell-conformance-receipt.json' > "$output/receipt.json" || true
ssh "${ssh_options[@]}" tau@127.0.0.1 'cat ~/shell-service-conformance-receipt.json' > "$output/service-receipt.json" || true
ssh "${ssh_options[@]}" tau@127.0.0.1 'cat ~/terminal-conformance-receipt.json' > "$output/terminal-receipt.json" || true
ssh "${ssh_options[@]}" tau@127.0.0.1 'cat ~/shell-qualification-receipt.json' > "$output/qualification-receipt.json" || true
printf '%s\n' "$status" > "$output/exit-code.txt"
exit "$status"
