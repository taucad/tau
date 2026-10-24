#!/usr/bin/env bash
# KVM acceleration preflight for the Win11 VM lane (Spike W2).
#
# A genuine Win11 unattended install + in-guest pnpm install cannot complete inside the CI job budget
# under QEMU's TCG software emulation; it needs hardware acceleration via /dev/kvm. GitHub-hosted
# ubuntu-24.04 Linux runners expose /dev/kvm (nested virtualization / KVM is enabled on Linux hosted
# runners), but self-hosted or future images may not. A missing /dev/kvm is a RECORDED BLOCKER — the
# lane fails here by name, it is never skipped and never reported green (desktop-spike testing rule 6:
# an unavailable prerequisite is not a pass). This is a valid documented spike outcome.
set -euo pipefail

echo "::group::KVM preflight"
ok=true
if [[ -e /dev/kvm ]]; then
  echo "device: /dev/kvm present"
  ls -l /dev/kvm || true
  # The runner user must be able to open it read-write.
  if [[ -r /dev/kvm && -w /dev/kvm ]]; then
    echo "access: /dev/kvm is readable+writable by $(id -un)"
  else
    echo "access: /dev/kvm exists but is NOT r/w by $(id -un) — BLOCKER"
    ok=false
  fi
else
  echo "device: /dev/kvm ABSENT — no hardware virtualization — BLOCKER"
  ok=false
fi
echo "cpu virt flags: $(grep -oE '(vmx|svm)' /proc/cpuinfo | sort -u | tr '\n' ' ' || true)"
echo "::endgroup::"

if [[ "$ok" != true ]]; then
  echo "KVM acceleration unavailable on this runner. Recording a sandbox-unavailable blocker." >&2
  echo "kvm=absent" >> "${GITHUB_OUTPUT:-/dev/null}"
  # Fail the row: a Win11 guest cannot be stood up without acceleration here.
  exit 1
fi
echo "kvm=present" >> "${GITHUB_OUTPUT:-/dev/null}"
