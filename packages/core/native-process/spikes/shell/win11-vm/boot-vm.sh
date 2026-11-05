#!/usr/bin/env bash
# Boot the Windows 11 VM, let it self-provision and run the harness as a standard user, then collect
# the receipts (Spike W2). Host-side driver for the lane.
#
# Topology:
#   * QEMU q35 + KVM acceleration (preflight already proved /dev/kvm).
#   * OVMF secure-boot firmware with Microsoft keys enrolled (OVMF_*_4M.ms) → Win11 Secure Boot check.
#   * swtpm software TPM 2.0 → Win11 TPM check. (Both satisfy stock Win11 WITHOUT a registry bypass.)
#   * slirp user-net with an SMB share (\\10.0.2.4\qemu) pointing at a staging dir that holds
#     provision.ps1, a bind-mount of the repo, and the `drop` receipt directory.
#   * Two CDs: the operator Win11 ISO (boot) and the autounattend seed ISO.
#
# Fail-closed: a guest that never writes the DONE sentinel within the deadline is a FAILURE (the VM is
# killed and no green is reported) — never a skip. Every receipt the guest writes lands in $DROP via
# the SMB share and is uploaded as the row's artifact.
set -euo pipefail

DROP="${DROP:?DROP is required}"
REPO="${REPO:?REPO (checkout path) is required}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

iso="$DROP/win11.iso"
seed="$DROP/seed.iso"
[[ -f "$iso"  ]] || { echo "Win11 ISO missing at $iso" >&2; exit 1; }
[[ -f "$seed" ]] || { echo "seed ISO missing at $seed" >&2; exit 1; }

# ── Staging dir exposed over SMB. `drop` is bind-mounted to $DROP so guest writes appear in the
#    artifact path directly; `repo` is a bind mount of the checkout (samba will not follow a symlink
#    that points outside the share, so a bind mount is used instead). ───────────────────────────────
stage="$(mktemp -d)"
mkdir -p "$stage/repo" "$stage/drop"
cp "$here/provision.ps1" "$stage/provision.ps1"
sudo mount --bind "$REPO" "$stage/repo"
sudo mount --bind "$DROP" "$stage/drop"
cleanup() {
  [[ -n "${qemu_pid:-}" ]] && kill "$qemu_pid" 2>/dev/null || true
  [[ -n "${swtpm_pid:-}" ]] && kill "$swtpm_pid" 2>/dev/null || true
  sudo umount "$stage/repo" 2>/dev/null || true
  sudo umount "$stage/drop" 2>/dev/null || true
}
trap cleanup EXIT

# ── Disks + firmware ───────────────────────────────────────────────────────────────────────────────
sysdisk="$DROP/win11.qcow2"
qemu-img create -f qcow2 "$sysdisk" 64G

ovmf_code="$(ls /usr/share/OVMF/OVMF_CODE_4M.secboot.fd 2>/dev/null || ls /usr/share/OVMF/OVMF_CODE.secboot.fd 2>/dev/null || true)"
ovmf_vars_src="$(ls /usr/share/OVMF/OVMF_VARS_4M.ms.fd 2>/dev/null || ls /usr/share/OVMF/OVMF_VARS_4M.fd 2>/dev/null || ls /usr/share/OVMF/OVMF_VARS.fd 2>/dev/null || true)"
[[ -n "$ovmf_code" && -n "$ovmf_vars_src" ]] || { echo "OVMF firmware not found" >&2; exit 1; }
ovmf_vars="$DROP/OVMF_VARS.fd"
cp "$ovmf_vars_src" "$ovmf_vars"
echo "firmware: code=$ovmf_code vars=$ovmf_vars_src"

# ── Software TPM 2.0 ─────────────────────────────────────────────────────────────────────────────
tpmdir="$(mktemp -d)"
swtpm socket --tpmstate "dir=$tpmdir" --ctrl "type=unixio,path=$tpmdir/swtpm-sock" --tpm2 --daemon
swtpm_pid="$(pgrep -n swtpm || true)"

# ── Boot ─────────────────────────────────────────────────────────────────────────────────────────
# smbserver=10.0.2.4 is slirp's default SMB host; smb=<dir> exposes it as \\10.0.2.4\qemu.
echo "::group::QEMU boot"
qemu-system-x86_64 \
  -name tau-win11-spike \
  -machine q35,smm=on,accel=kvm \
  -cpu host,hv_relaxed,hv_spinlocks=0x1fff,hv_vapic,hv_time \
  -smp 4 -m 8192 \
  -global driver=cfi.pflash01,property=secure,value=on \
  -drive if=pflash,format=raw,unit=0,file="$ovmf_code",readonly=on \
  -drive if=pflash,format=raw,unit=1,file="$ovmf_vars" \
  -chardev "socket,id=chrtpm,path=$tpmdir/swtpm-sock" \
  -tpmdev emulator,id=tpm0,chardev=chrtpm \
  -device tpm-tis,tpmdev=tpm0 \
  -drive file="$sysdisk",if=virtio,format=qcow2 \
  -drive file="$iso",media=cdrom,index=0 \
  -drive file="$seed",media=cdrom,index=1 \
  -netdev "user,id=n0,smb=$stage" \
  -device e1000,netdev=n0 \
  -vga std -display none \
  -daemonize -pidfile "$DROP/qemu.pid"
qemu_pid="$(cat "$DROP/qemu.pid")"
echo "qemu pid $qemu_pid"
echo "::endgroup::"

# ── Wait for the guest DONE sentinel (install + provision + harness). Fail-closed on timeout. ──────
deadline=$(( $(date +%s) + 105*60 ))   # 105 min inner budget (< job timeout 120)
echo "waiting for guest DONE sentinel (deadline: 105 min)..."
while :; do
  if [[ -f "$DROP/DONE" ]]; then echo "guest signalled DONE"; break; fi
  if ! kill -0 "$qemu_pid" 2>/dev/null; then echo "QEMU exited before DONE" >&2; break; fi
  if [[ $(date +%s) -ge $deadline ]]; then echo "TIMEOUT waiting for guest DONE" >&2; break; fi
  # Surface provisioning progress as it streams to the share.
  [[ -f "$DROP/provision.log" ]] && tail -n 2 "$DROP/provision.log" 2>/dev/null || true
  sleep 30
done

# Give the guest a moment to finish flushing and power off on its own; then force teardown.
sleep 20
kill "$qemu_pid" 2>/dev/null || true

# ── Verdict ────────────────────────────────────────────────────────────────────────────────────────
if [[ ! -f "$DROP/DONE" ]]; then
  echo "No DONE sentinel — the VM did not complete the harness. Recording a run-incomplete blocker." >&2
  cat > "$DROP/WIN11/s0.json" <<JSON
{ "spike": "S0", "status": "vm-run-incomplete", "row": "WIN11", "verdict": "fail",
  "reason": "The Win11 VM did not reach the DONE sentinel within the deadline (install/provision/harness did not complete). See provision.log / pnpm-install.log in this artifact." }
JSON
  cp "$DROP/WIN11/s0.json" "$DROP/WIN11/s1.json"; sed -i 's/"S0"/"S1"/' "$DROP/WIN11/s1.json"
  exit 1
fi

if [[ ! -f "$DROP/WIN11/s0.json" || ! -f "$DROP/WIN11/s1.json" ]]; then
  echo "DONE present but receipts missing — treating as failure." >&2
  exit 1
fi
echo "Receipts collected:"; ls -l "$DROP/WIN11/"
# Exit code reflects the harness verdict so a failing boundary fails the job.
python3 -I - "$DROP/WIN11/s0.json" "$DROP/WIN11/s1.json" <<'PY'
import json, sys
bad = False
for p in sys.argv[1:]:
    with open(p) as f: d = json.load(f)
    v = d.get("verdict"); print(p, "verdict:", v, "status:", d.get("status","ok"))
    if v != "pass": bad = True
sys.exit(1 if bad else 0)
PY
