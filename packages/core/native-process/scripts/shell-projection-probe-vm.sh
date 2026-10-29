#!/usr/bin/env bash
# THROWAWAY DIAGNOSTIC. Not a conformance row and not a gate. It adds no assertion to any existing row.
#
# Boot the same dated, checksum-pinned stock Ubuntu 24.04 / Debian 13 cloud image the LNX-U and LNX-D rows use,
# then run shell-projection-guest-probe.sh inside it to find out whether an unprivileged user can mount the Tau
# FUSE projection bridge there and whether the distro's bwrap can bind that mountpoint into its mount namespace.
# The guest keeps its shipped AppArmor policy and kernel.apparmor_restrict_unprivileged_userns untouched.
#
# Unlike shell-conformance-vm.sh this carries in only Node and the two files the bridge build needs: no bwrap
# fixture packages, no repository checkout and no pnpm install, because the probe answers a mount question only.
#
# Required env: TAU_VM_DISTRO (ubuntu or debian), RUNNER_TEMP (disposable CI directory).
# Exit codes: 0 the mount and the bwrap bind both worked; 1 either did not, or an operation failed;
#             3 missing host prerequisite.
set -euo pipefail
umask 077
: "${TAU_VM_DISTRO:?set TAU_VM_DISTRO}"
: "${RUNNER_TEMP:?disposable hosted runner required}"
[[ "${GITHUB_ACTIONS:-}" == true && "$(uname -m)" == x86_64 ]] || exit 3
REPO_ROOT="$(git rev-parse --show-toplevel)"
# The same images, URLs and digests as shell-conformance-vm.sh; this probe must see the same guests as the rows.
case "$TAU_VM_DISTRO" in
  ubuntu)
    row=LNX-U-PROBE
    url=https://cloud-images.ubuntu.com/releases/noble/release-20261017/ubuntu-24.04-server-cloudimg-amd64.img
    digest=04e8f2461a16a44e78a370284471f29616cdd9baf1893df25807b71f985b6c94
    algorithm=sha256sum ;;
  debian)
    row=LNX-D-PROBE
    url=https://cloud.debian.org/images/cloud/trixie/20261021-2638/debian-13-generic-amd64-20261021-2638.qcow2
    digest=70ef6adc1c16155f8d575731b37d0f976d1c60b6144ac3f57914a3f4b30b202b69584d5d143aa39da0f0fe81df9e5b698909c0d94c7d91c6f6c4bb6581ead5f0
    algorithm=sha512sum ;;
  *) printf 'Unknown distro\n' >&2; exit 1 ;;
esac
work="$(mktemp -d "$RUNNER_TEMP/tau-projection-probe.XXXXXX")"
output="$REPO_ROOT/out/test-results/shell-projection-probe/$row"
mkdir -p "$output"
qemu_pid=''
cleanup() {
  if [[ -n "$qemu_pid" ]]; then
    kill "$qemu_pid" 2>/dev/null || true
    wait "$qemu_pid" 2>/dev/null || true
  fi
  sudo setfacl -x "u:$(id -un)" /dev/kvm || true
  rm -rf -- "$work"
}
trap cleanup EXIT
trap 'exit 1' INT TERM
sudo timeout --kill-after=30s 300s apt-get \
  -o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 \
  -o APT::Update::Error-Mode=any update
sudo apt-get install -y --no-install-recommends qemu-system-x86 qemu-utils cloud-image-utils acl
sudo setfacl -m "u:$(id -un):rw" /dev/kvm
curl --fail --location --proto '=https' --proto-redir '=https' --retry 3 "$url" -o "$work/base.qcow2"
printf '%s  %s\n' "$digest" "$work/base.qcow2" | "$algorithm" --check
printf '%s\n%s %s\n' "$url" "$algorithm" "$digest" > "$output/image.txt"
qemu-img create -f qcow2 -F qcow2 -b "$work/base.qcow2" "$work/guest.qcow2" 32G
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
printf 'instance-id: tau-projection-probe-%s\nlocal-hostname: tau-projection-probe\n' "$TAU_VM_DISTRO" \
  > "$work/meta-data"
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
# The verified Node from setup-nx (its include/node headers build the bridge), and only the two tracked files the
# build needs. Nothing else from the repository crosses into the guest.
ssh "${ssh_options[@]}" tau@127.0.0.1 'mkdir -m 700 ~/node ~/tau'
node_root="$(dirname "$(dirname "$(command -v node)")")"
tar -C "$node_root" -cf - . | ssh "${ssh_options[@]}" tau@127.0.0.1 'tar -xf - -C ~/node'
(cd "$REPO_ROOT" && tar -cf - \
  packages/core/native-process/native/shell-projection-fuse.c \
  packages/core/native-process/scripts/build-shell-projection.mts \
  packages/core/native-process/scripts/shell-projection-guest-probe.mjs) |
  ssh "${ssh_options[@]}" tau@127.0.0.1 'tar -xf - -C ~/tau'
status=0
# shellcheck disable=SC2029 # The distro id is this script's own validated argument, expanded on the host by design.
ssh "${ssh_options[@]}" tau@127.0.0.1 "bash -s -- $TAU_VM_DISTRO" \
  < "$REPO_ROOT/packages/core/native-process/scripts/shell-projection-guest-probe.sh" 2>&1 |
  tee "$output/probe.txt" || status=$?
printf '%s\n' "$status" > "$output/exit-code.txt"
printf '\n==== %s probe exit status: %s ====\n' "$row" "$status"
exit "$status"
