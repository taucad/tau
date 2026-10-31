#!/usr/bin/env bash
# Boot the stock Ubuntu 24.04 VM for the Linux lane (Spike W2) and wait for the in-guest orchestrator
# to drop its receipts + DONE sentinel. Shares the repo (read-only) and a receipt drop (read-write)
# over 9p/virtio; uses KVM when available and TCG software emulation otherwise (ACCEL from preflight).
#
# No security relaxation of the guest: cloud-init leaves kernel.apparmor_restrict_unprivileged_userns at
# the image's shipped value. The host only transports files and powers the VM.
set -euo pipefail

DROP="${DROP:?DROP is required}"          # receipt drop (9p rw, host side)
REPO="${REPO:?REPO is required}"          # repo checkout to share (9p ro)
IMAGE="${IMAGE:?IMAGE is required}"       # base cloud image (qcow2/raw)
ACCEL="${ACCEL:-tcg}"                     # kvm | tcg (from preflight-kvm.sh)
SEED="$DROP/seed.iso"

# A cloud image boots fast under KVM; TCG is ~10-20x slower, so give TCG a much longer inner deadline.
if [[ "$ACCEL" == "kvm" ]]; then DEADLINE="${DEADLINE:-900}"; else DEADLINE="${DEADLINE:-4200}"; fi

mkdir -p "$DROP"
# Overlay so the pristine base image is never mutated; grow room for apt + node.
overlay="$DROP/disk.qcow2"
qemu-img create -f qcow2 -b "$IMAGE" -F qcow2 "$overlay" 20G

accel_args=(-machine accel=tcg -cpu max)
if [[ "$ACCEL" == "kvm" ]]; then accel_args=(-enable-kvm -cpu host); fi

echo "::group::Boot VM (accel=$ACCEL, deadline=${DEADLINE}s)"
# 9p shares: taurepo (ro) carries the harness + profile + orchestrator; taudrop (rw) collects receipts.
# User-mode (slirp) networking gives the guest outbound NAT for apt + the pinned Node download.
qemu-system-x86_64 \
  "${accel_args[@]}" \
  -m 4096 -smp 2 \
  -nographic -serial file:"$DROP/serial.log" -monitor none \
  -drive file="$overlay",if=virtio,format=qcow2 \
  -drive file="$SEED",if=virtio,format=raw,media=cdrom \
  -netdev user,id=n0 -device virtio-net-pci,netdev=n0 \
  -virtfs local,path="$REPO",mount_tag=taurepo,security_model=none,readonly=on \
  -virtfs local,path="$DROP",mount_tag=taudrop,security_model=none \
  -no-reboot &
qemu_pid=$!

# Wait for the DONE sentinel on the shared drop (the guest powers off after writing it).
waited=0
while [[ ! -f "$DROP/DONE" ]]; do
  if ! kill -0 "$qemu_pid" 2>/dev/null; then
    wait "$qemu_pid" || true
    [[ -f "$DROP/DONE" ]] && break
    echo "VM exited before DONE sentinel appeared." >&2
    echo "FAIL vm-exited-early" > "$DROP/DONE"
    break
  fi
  if (( waited >= DEADLINE )); then
    echo "Inner deadline ${DEADLINE}s exceeded; killing VM — recording a boot/timeout blocker." >&2
    kill -9 "$qemu_pid" 2>/dev/null || true
    echo "FAIL boot-timeout-${DEADLINE}s" > "$DROP/DONE"
    break
  fi
  sleep 10; waited=$((waited+10))
done
kill -9 "$qemu_pid" 2>/dev/null || true
echo "::endgroup::"

echo "sentinel: $(cat "$DROP/DONE" 2>/dev/null || echo '<none>')"
tail -40 "$DROP/serial.log" 2>/dev/null || true
# A FAIL sentinel is a recorded blocker; fail the step so the row is never a silent green.
grep -q '^DONE' "$DROP/DONE" 2>/dev/null
