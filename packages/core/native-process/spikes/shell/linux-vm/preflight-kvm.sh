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
DROP="${DROP:-}"
[[ -n "$DROP" ]] && mkdir -p "$DROP"

echo "::group::KVM preflight"
accel="tcg"
access="n/a"
if [[ -e /dev/kvm ]]; then
  echo "device: /dev/kvm present"
  ls -l /dev/kvm || true
  if [[ ! -r /dev/kvm || ! -w /dev/kvm ]]; then
    # Hosted ubuntu-24.04 ships /dev/kvm as `crw-rw---- root kvm` but does NOT put the runner user in
    # the kvm group, so it is not r/w. This is a HOST device permission, not any guest-security knob —
    # grant the runner access (passwordless sudo on hosted runners). We never touch the guest's
    # AppArmor/userns posture. If sudo is unavailable, we fall back to TCG.
    echo "access: /dev/kvm not r/w by $(id -un) — attempting to grant access (host device perm)"
    sudo chmod 0666 /dev/kvm 2>/dev/null || sudo usermod -aG kvm "$(id -un)" 2>/dev/null || true
  fi
  if [[ -r /dev/kvm && -w /dev/kvm ]]; then
    echo "access: /dev/kvm is readable+writable by $(id -un) — hardware acceleration available"
    accel="kvm"; access="rw"
  else
    echo "access: /dev/kvm still NOT r/w by $(id -un) — falling back to TCG"
    access="no-rw"
  fi
else
  echo "device: /dev/kvm ABSENT — no hardware virtualization on this runner — falling back to TCG"
  access="absent"
fi
virt="$(grep -oE '(vmx|svm)' /proc/cpuinfo | sort -u | tr '\n' ' ' || true)"
echo "cpu virt flags: ${virt}"
echo "selected accelerator: ${accel}"
echo "::endgroup::"

echo "accel=${accel}" >> "${GITHUB_OUTPUT:-/dev/null}"
echo "kvm=$([[ "$accel" == kvm ]] && echo present || echo absent)" >> "${GITHUB_OUTPUT:-/dev/null}"

# Always leave a receipt so the KVM verdict survives even on the blocker path.
if [[ -n "$DROP" ]]; then
  printf '{"accel":"%s","dev_kvm_access":"%s","cpu_virt_flags":"%s","allow_tcg":"%s"}\n' \
    "$accel" "$access" "$virt" "$ALLOW_TCG" > "$DROP/kvm.json"
fi

if [[ "$accel" != "kvm" && "$ALLOW_TCG" != "true" ]]; then
  echo "KVM unavailable and TCG disallowed (allow_tcg=false). Recording a kvm-unavailable BLOCKER." >&2
  exit 1
fi
