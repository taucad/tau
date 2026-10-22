#!/usr/bin/env bash
# Prove disposable full Linux guests on standard hosted x64 CI; never emit release receipts.
# See desktop-release-signing-pipeline/linux-remote-qualification-2026-10-22.md.
# Required env: TAU_VM_DISTRO (ubuntu or debian), RUNNER_TEMP (disposable CI directory).
# Optional env: none. Usage: TAU_VM_DISTRO=ubuntu pnpm nx run desktop:hosted-linux-vm-proof
# Exit codes: 0 proof passed; 1 failed assertion/external operation; 3 missing host prerequisite.
set -euo pipefail
: "${TAU_VM_DISTRO:?set TAU_VM_DISTRO}"
: "${RUNNER_TEMP:?disposable hosted runner required}"
[[ "${GITHUB_ACTIONS:-}" == true && "$(uname -m)" == x86_64 ]] || exit 3
REPO_ROOT="$(git rev-parse --show-toplevel)"
case "$TAU_VM_DISTRO" in
  ubuntu)
    url=https://cloud-images.ubuntu.com/releases/noble/release-20261017/ubuntu-24.04-server-cloudimg-amd64.img
    digest=04e8f2461a16a44e78a370284471f29616cdd9baf1893df25807b71f985b6c94
    algorithm=sha256sum ;;
  debian)
    url=https://cloud.debian.org/images/cloud/trixie/20261021-2638/debian-13-generic-amd64-20261021-2638.qcow2
    digest=70ef6adc1c16155f8d575731b37d0f976d1c60b6144ac3f57914a3f4b30b202b69584d5d143aa39da0f0fe81df9e5b698909c0d94c7d91c6f6c4bb6581ead5f0
    algorithm=sha512sum ;;
  *) printf 'Unknown distro\n' >&2; exit 1 ;;
esac
# Pins came from the official dated checksum manifests over authenticated HTTPS.
# No claim of a detached Debian image signature or consumer-desktop equivalence.
work="$(mktemp -d "$RUNNER_TEMP/tau-vm.XXXXXX")"
output="$REPO_ROOT/out/test-results/hosted-linux-vm/$TAU_VM_DISTRO"
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
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends qemu-system-x86 qemu-utils cloud-image-utils acl
# Only this disposable host user receives access. QEMU and the guest tests stay unprivileged.
sudo setfacl -m "u:$(id -un):rw" /dev/kvm
curl --fail --location --proto '=https' --proto-redir '=https' --retry 3 "$url" -o "$work/base.qcow2"
printf '%s  %s\n' "$digest" "$work/base.qcow2" | "$algorithm" --check
printf '%s\n%s %s\n' "$url" "$algorithm" "$digest" > "$output/image.txt"
qemu-img create -f qcow2 -F qcow2 -b "$work/base.qcow2" "$work/guest.qcow2" 24G
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
printf 'instance-id: tau-proof-%s\nlocal-hostname: tau-proof\n' "$TAU_VM_DISTRO" > "$work/meta-data"
cloud-localds "$work/seed.img" "$work/user-data" "$work/meta-data"
qemu-system-x86_64 -enable-kvm -cpu host -smp 2 -m 4096 -display none -no-reboot \
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
# Distro is constrained to two literals above, intentionally passed to the guest.
# shellcheck disable=SC2029
ssh "${ssh_options[@]}" tau@127.0.0.1 "bash -s -- $TAU_VM_DISTRO" \
  < "$REPO_ROOT/apps/desktop/scripts/hosted-linux-vm-guest.sh" | tee "$output/guest-proof.txt"
ssh "${ssh_options[@]}" tau@127.0.0.1 'cat /tmp/tau-desktop.xwd' > "$output/desktop.xwd"
ssh "${ssh_options[@]}" tau@127.0.0.1 'cat /proc/sys/kernel/random/boot_id' > "$output/guest-boot-id.txt"
[[ "$(cat "$output/guest-boot-id.txt")" != "$(cat /proc/sys/kernel/random/boot_id)" ]]
printf 'Full guest infrastructure proof passed; signed Tau qualification remains unexecuted.\n' | tee "$output/result.txt"
