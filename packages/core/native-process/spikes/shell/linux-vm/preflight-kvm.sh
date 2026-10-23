#!/usr/bin/env bash
# KVM acceleration preflight for the Linux stock-VM lane (Spike W2).
#
# This lane boots a genuine STOCK Ubuntu 24.04 cloud image to confirm the bwrap/loopback finding under
# AppArmor's unprivileged-userns restriction (left at its stock value). Unlike the Win11 lane, an
# Ubuntu cloud image reaches cloud-init completion in a few minutes even under QEMU's TCG software
# emulation, so a missing /dev/kvm is NOT an automatic blocker here: it degrades to TCG with a longer
# inner deadline. The accelerator actually used is RECORDED in every receipt (identity.accel) so a
# green is never silently a TCG green.
#
# The KVM availability verdict itself is a first-class output of this lane (it tells the program whether
# the VM rows need self-hosted/larger runners). We therefore always print and emit it, and only hard-fail
# when TCG is also disallowed (allow_tcg=false) — a documented blocker, never a skip, never a fake green.
set -euo pipefail

ALLOW_TCG="${ALLOW_TCG:-true}"

echo "::group::KVM preflight"
accel="tcg"
if [[ -e /dev/kvm ]]; then
  echo "device: /dev/kvm present"
  ls -l /dev/kvm || true
  if [[ -r /dev/kvm && -w /dev/kvm ]]; then
    echo "access: /dev/kvm is readable+writable by $(id -un) — hardware acceleration available"
    accel="kvm"
  else
    echo "access: /dev/kvm exists but is NOT r/w by $(id -un) — falling back to TCG"
  fi
else
  echo "device: /dev/kvm ABSENT — no hardware virtualization on this runner — falling back to TCG"
fi
echo "cpu virt flags: $(grep -oE '(vmx|svm)' /proc/cpuinfo | sort -u | tr '\n' ' ' || true)"
echo "selected accelerator: ${accel}"
echo "::endgroup::"

echo "accel=${accel}" >> "${GITHUB_OUTPUT:-/dev/null}"
echo "kvm=$([[ "$accel" == kvm ]] && echo present || echo absent)" >> "${GITHUB_OUTPUT:-/dev/null}"

if [[ "$accel" != "kvm" && "$ALLOW_TCG" != "true" ]]; then
  echo "KVM unavailable and TCG disallowed (allow_tcg=false). Recording a kvm-unavailable BLOCKER." >&2
  exit 1
fi
