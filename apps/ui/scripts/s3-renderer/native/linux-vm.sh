#!/usr/bin/env bash
# S3 renderer rows in a stock Ubuntu 24.04 cloud-image VM (LNX-VM), following apps/desktop/scripts/hosted-linux-vm.sh:
# pinned image, KVM, loopback SSH with ephemeral keys, no credentials in the guest. The checkout (with its
# node_modules and the harness already built on the host) and Node are shared over 9p at the same paths, and the
# guest user has the host user's uid so its writes land as the runner's files.
# Required env: RUNNER_TEMP, DROP (results directory, inside the checkout); optional S3_SETS (row labels, default all).
# Usage: bash linux-vm.sh
# Exit codes: 0 guest run finished (rows record their own outcome); 1 VM or guest setup failed; 3 not a hosted x64 runner.
set -euo pipefail
umask 077
: "${RUNNER_TEMP:?disposable hosted runner required}"
: "${DROP:?set DROP}"
[[ "${GITHUB_ACTIONS:-}" == true && "$(uname -m)" == x86_64 ]] || exit 3
[[ "${S3_SETS:-all}" =~ ^[a-z0-9,-]+$ ]] || { echo "S3_SETS must be lowercase set names separated by commas" >&2; exit 1; }
REPO_ROOT="$(git rev-parse --show-toplevel)"
NODE_ROOT="$(dirname "$(dirname "$(command -v node)")")"
# Same pin as hosted-linux-vm.sh (official dated SHA256SUMS over authenticated HTTPS).
url=https://cloud-images.ubuntu.com/releases/noble/release-20261017/ubuntu-24.04-server-cloudimg-amd64.img
digest=04e8f2461a16a44e78a370284471f29616cdd9baf1893df25807b71f985b6c94
work="$(mktemp -d "$RUNNER_TEMP/s3-vm.XXXXXX")"
mkdir -p "$DROP"
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
sudo timeout --kill-after=30s 300s apt-get -o Acquire::Retries=3 -o APT::Update::Error-Mode=any update
sudo timeout 600s apt-get install -y --no-install-recommends qemu-system-x86 qemu-utils cloud-image-utils acl
sudo setfacl -m "u:$(id -un):rw" /dev/kvm
curl --fail --location --proto '=https' --proto-redir '=https' --retry 3 "$url" -o "$work/base.qcow2"
printf '%s  %s\n' "$digest" "$work/base.qcow2" | sha256sum --check
printf '%s\nsha256 %s\n' "$url" "$digest" > "$DROP/image.txt"
qemu-img create -f qcow2 -F qcow2 -b "$work/base.qcow2" "$work/guest.qcow2" 24G
ssh-keygen -q -t ed25519 -N '' -f "$work/client"
ssh-keygen -q -t ed25519 -N '' -f "$work/host"
printf '[127.0.0.1]:2222 %s\n' "$(cat "$work/host.pub")" > "$work/known_hosts"
cat > "$work/user-data" <<CONFIG
#cloud-config
users:
  - name: tau
    uid: $(id -u)
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
printf 'instance-id: tau-s3-vm\nlocal-hostname: tau-s3-vm\n' > "$work/meta-data"
cloud-localds "$work/seed.img" "$work/user-data" "$work/meta-data"
qemu-system-x86_64 -enable-kvm -cpu host -smp 3 -m 8192 -display none -no-reboot \
  -drive "file=$work/guest.qcow2,format=qcow2,if=virtio" \
  -drive "file=$work/seed.img,format=raw,if=virtio,readonly=on" \
  -virtfs "local,path=$REPO_ROOT,mount_tag=taurepo,security_model=none" \
  -virtfs "local,path=$NODE_ROOT,mount_tag=taunode,security_model=none,readonly=on" \
  -netdev user,id=net0,hostfwd=tcp:127.0.0.1:2222-:22 -device virtio-net-pci,netdev=net0 \
  -serial "file:$work/serial.log" > "$DROP/qemu.log" 2>&1 &
qemu_pid=$!
ssh_options=(-i "$work/client" -p 2222 -o BatchMode=yes -o ConnectTimeout=5 -o ServerAliveInterval=30 -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$work/known_hosts")
ready=false
for _attempt in $(seq 1 90); do
  kill -0 "$qemu_pid"
  if ssh "${ssh_options[@]}" tau@127.0.0.1 true 2>/dev/null; then ready=true; break; fi
  sleep 5
done
[[ "$ready" == true ]]
timeout 600 ssh "${ssh_options[@]}" tau@127.0.0.1 'sudo cloud-init status --wait' > "$DROP/cloud-init-status.txt"
ssh "${ssh_options[@]}" tau@127.0.0.1 'cat /proc/sys/kernel/random/boot_id' > "$DROP/guest-boot-id.txt"
[[ "$(cat "$DROP/guest-boot-id.txt")" != "$(cat /proc/sys/kernel/random/boot_id)" ]]
# Paths are workspace/toolcache paths without spaces, passed to the guest on purpose.
# shellcheck disable=SC2029
timeout 7200 ssh "${ssh_options[@]}" tau@127.0.0.1 \
  "bash -s -- '$REPO_ROOT' '$NODE_ROOT' '$DROP' '${S3_SETS:-all}'" < "$REPO_ROOT/apps/ui/scripts/s3-renderer/native/linux-vm-guest.sh" \
  2>&1 | tee "$DROP/guest.log"
