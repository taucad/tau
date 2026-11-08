#!/usr/bin/env bash
# Run disposable full Linux guests for infrastructure proof or protected staging qualification.
# See desktop-release-signing-pipeline/linux-remote-qualification-2026-10-22.md.
# Required env: TAU_VM_DISTRO (ubuntu, ubuntu2604 or debian), RUNNER_TEMP (disposable CI directory).
# Optional env: TAU_VM_MODE (proof default, tooling, or qualification with protected staging inputs);
#   TAU_VM_HOST (qemu default: a nested guest on this runner; gcp: a disposable spot T4 host in Google Cloud
#   project TAU_GCP_PROJECT, tried in TAU_GCP_ZONES order, reached over an IAP tunnel; tau-cloud stacks/gcp). Usage: TAU_VM_DISTRO=ubuntu pnpm nx run desktop:hosted-linux-vm-proof
# Exit codes: 0 proof passed; 1 failed assertion/external operation; 3 missing host prerequisite.
set -euo pipefail
umask 077
: "${TAU_VM_DISTRO:?set TAU_VM_DISTRO}"
: "${RUNNER_TEMP:?disposable hosted runner required}"
[[ "${GITHUB_ACTIONS:-}" == true && "$(uname -m)" == x86_64 ]] || exit 3
REPO_ROOT="$(git rev-parse --show-toplevel)"
mode="${TAU_VM_MODE:-proof}"
case "$mode" in
  proof|tooling) ;;
  qualification)
    [[ "${GITHUB_REF:-}" == refs/heads/main && "${GITHUB_EVENT_NAME:-}" == workflow_dispatch &&
       "${GITHUB_REPOSITORY:-}" == taucad/tau && "${TAU_DESKTOP_QUALIFICATION_SCOPE:-}" == linux &&
       "${TAU_QUALIFICATION_CHANNEL:-}" == staging ]] || { printf 'Hosted qualification requires protected Linux staging main dispatch\n' >&2; exit 1; }
    [[ "${GITHUB_SHA:-}" =~ ^[a-f0-9]{40}$ ]]
    [[ "${TAU_QUALIFICATION_ROUTE:-}" == linux-apt || "${TAU_QUALIFICATION_ROUTE:-}" == linux-appimage ]]
    : "${GH_TOKEN:?read-only job token required for existing candidate provenance checks}"
    ;;
  *) printf 'Invalid VM mode\n' >&2; exit 1 ;;
esac
case "$TAU_VM_DISTRO" in
  ubuntu)
    url=https://cloud-images.ubuntu.com/releases/noble/release-20261017/ubuntu-24.04-server-cloudimg-amd64.img
    digest=04e8f2461a16a44e78a370284471f29616cdd9baf1893df25807b71f985b6c94
    algorithm=sha256sum ;;
  ubuntu2604)
    url=https://cloud-images.ubuntu.com/releases/resolute/release-20261016/ubuntu-26.04-server-cloudimg-amd64.img
    digest=5645d0318ad21f643ebb1ac4567514620e9893380b07b0201fda163baa5b7eb5
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
host="${TAU_VM_HOST:-qemu}"
case "$host" in qemu|gcp) ;; *) printf 'Invalid VM host\n' >&2; exit 1 ;; esac
guest_graphics=dummy
if [[ "$host" == gcp ]]; then
  # Stock graphics needs a real GPU, which hosted runners lack: the guest is a disposable Google Cloud T4 host
  # created from the tau-cloud template for its distro, reached only through an IAP tunnel, and deleted on exit.
  # Each template also deletes its host after four hours, so a lost job cannot keep one running.
  : "${TAU_GCP_PROJECT:?set TAU_GCP_PROJECT}" "${TAU_GCP_ZONES:?set TAU_GCP_ZONES}"
  [[ "${TAU_QUALIFICATION_GRAPHICS:-stock}" == stock ]] || { printf 'GCP hosts are for stock graphics only\n' >&2; exit 1; }
  guest_graphics=nvidia
  case "$TAU_VM_DISTRO" in ubuntu) template_distro=ubuntu2404 ;; ubuntu2604) template_distro=ubuntu2604 ;; debian) template_distro=debian13 ;; esac
  template="$(gcloud compute instance-templates list --project "$TAU_GCP_PROJECT" \
    --filter="name~^ci-gpu-${template_distro}-" --sort-by=~creationTimestamp --limit=1 --format='value(selfLink)')"
  [[ -n "$template" ]] || { printf 'No GPU host template for %s\n' "$template_distro" >&2; exit 1; }
  route_slug="${TAU_QUALIFICATION_ROUTE:-proof}"; route_slug="${route_slug#linux-}"
  instance="tau-q-${GITHUB_RUN_ID:-0}-${GITHUB_RUN_ATTEMPT:-1}-${template_distro}-${route_slug}"
  instance="${instance:0:63}"
fi
instance_zone=''
tunnel_pid=''
cleanup() {
  if [[ -n "$tunnel_pid" ]]; then
    kill "$tunnel_pid" 2>/dev/null || true
    wait "$tunnel_pid" 2>/dev/null || true
  fi
  if [[ -n "$instance_zone" ]]; then
    gcloud compute instances delete "$instance" --project "$TAU_GCP_PROJECT" --zone "$instance_zone" --quiet || true
  fi
  if [[ -n "$qemu_pid" ]]; then
    kill "$qemu_pid" 2>/dev/null || true
    wait "$qemu_pid" 2>/dev/null || true
  fi
  if [[ "$host" == qemu ]]; then sudo setfacl -x "u:$(id -un)" /dev/kvm || true; fi
  rm -rf -- "$work"
}
trap cleanup EXIT
trap 'exit 1' INT TERM
ssh-keygen -q -t ed25519 -N '' -f "$work/client"
if [[ "$host" == qemu ]]; then
  # Do not hide or wait indefinitely on hosted-runner repository refresh problems.
  printf 'Refreshing hosted runner package indexes (five-minute deadline)\n'
  sudo timeout --kill-after=30s 300s apt-get \
    -o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 \
    -o APT::Update::Error-Mode=any update
  sudo apt-get install -y --no-install-recommends qemu-system-x86 qemu-utils cloud-image-utils acl
  # Only this disposable host user receives access. QEMU and the guest tests stay unprivileged.
  sudo setfacl -m "u:$(id -un):rw" /dev/kvm
  curl --fail --location --proto '=https' --proto-redir '=https' --retry 3 "$url" -o "$work/base.qcow2"
  printf '%s  %s\n' "$digest" "$work/base.qcow2" | "$algorithm" --check
  printf '%s\n%s %s\n' "$url" "$algorithm" "$digest" > "$output/image.txt"
  # Qualification retains three signed archives, unpacked candidates, dependencies and runtime generations.
  # The sparse overlay grows only as used; the original 24 GiB guest exhausted native payload headroom.
  guest_size=24G
  if [[ "$mode" == qualification ]]; then guest_size=48G; fi
  df -h "$work"
  qemu-img create -f qcow2 -F qcow2 -b "$work/base.qcow2" "$work/guest.qcow2" "$guest_size"
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
  # 8 GiB of the hosted runner's 16 GiB: at 4 GiB, stock Ubuntu's packagekitd pushed the guest into the OOM killer, which
  # killed a Tau process (2 GiB anon RSS) mid-render in staging run 41662259184 (ubuntu-apt-x11).
  qemu-system-x86_64 -enable-kvm -cpu host -smp 2 -m 8192 -display none -no-reboot \
    -drive "file=$work/guest.qcow2,format=qcow2,if=virtio" \
    -drive "file=$work/seed.img,format=raw,if=virtio,readonly=on" \
    -netdev user,id=net0,hostfwd=tcp:127.0.0.1:2222-:22 -device virtio-net-pci,netdev=net0 \
    -serial "file:$work/serial.log" > "$output/qemu.log" 2>&1 &
  qemu_pid=$!
fi
if [[ "$host" == gcp ]]; then
  # Spot T4 capacity varies by zone; try each configured zone once. The client key is the only login path, and the
  # host keys are read back through the guest agent before the first SSH, so StrictHostKeyChecking stays on.
  printf 'tau:%s\n' "$(cat "$work/client.pub")" > "$work/ssh-keys"
  for zone in $TAU_GCP_ZONES; do
    if gcloud compute instances create "$instance" --project "$TAU_GCP_PROJECT" --zone "$zone" \
      --source-instance-template "$template" --metadata-from-file "ssh-keys=$work/ssh-keys" \
      --metadata enable-guest-attributes=TRUE; then
      instance_zone="$zone"
      break
    fi
  done
  [[ -n "$instance_zone" ]] || { printf 'No zone had spot GPU capacity\n' >&2; exit 1; }
  printf 'gcp %s %s %s\n' "$template" "$instance_zone" "$instance" > "$output/image.txt"
  : > "$work/known_hosts"
  for _attempt in $(seq 1 60); do
    if gcloud compute instances get-guest-attributes "$instance" --project "$TAU_GCP_PROJECT" --zone "$instance_zone" \
      --query-path=hostkeys/ --format='value(key,value)' > "$work/hostkeys" 2>/dev/null && [[ -s "$work/hostkeys" ]]; then
      while read -r key_type key_value _; do
        # The guest agent publishes each key as type -> base64 body; accept a value that repeats the type too.
        if [[ "$key_value" == "$key_type" ]]; then read -r key_value _ <<< "${key_value#"$key_type"}"; fi
        printf '[127.0.0.1]:2222 %s %s\n' "$key_type" "$key_value" >> "$work/known_hosts"
      done < "$work/hostkeys"
      break
    fi
    sleep 5
  done
  [[ -s "$work/known_hosts" ]] || { printf 'Guest never published its host keys\n' >&2; exit 1; }
  gcloud compute start-iap-tunnel "$instance" 22 --project "$TAU_GCP_PROJECT" --zone "$instance_zone" \
    --local-host-port=127.0.0.1:2222 > "$output/iap-tunnel.log" 2>&1 &
  tunnel_pid=$!
fi
ssh_options=(-i "$work/client" -p 2222 -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$work/known_hosts")
# An IAP tunnel can drop a session that stays silent through a long harness step; keep it alive.
if [[ "$host" == gcp ]]; then ssh_options+=(-o ServerAliveInterval=30 -o ServerAliveCountMax=6); fi
wait_for_guest() {
  local _attempt
  for _attempt in $(seq 1 90); do
    if [[ -n "$qemu_pid" ]]; then kill -0 "$qemu_pid"; else kill -0 "$tunnel_pid"; fi
    if ssh "${ssh_options[@]}" tau@127.0.0.1 true 2>/dev/null; then return 0; fi
    sleep 5
  done
  return 1
}
wait_for_guest
# Debian's Google Cloud image has no cloud-init; its guest agent made the tau user from the ssh-keys metadata.
ssh "${ssh_options[@]}" tau@127.0.0.1 'if command -v cloud-init >/dev/null; then sudo cloud-init status --wait; else echo no cloud-init; fi' \
  > "$output/cloud-init-status.txt"
if [[ "$host" == gcp ]]; then
  ssh "${ssh_options[@]}" tau@127.0.0.1 'bash -s' \
    < "$REPO_ROOT/apps/desktop/scripts/hosted-linux-gpu-driver-guest.sh" | tee "$output/gpu-driver.txt"
  # Boot into the installed driver, as a user does after installing it. The IAP tunnel serves each new connection.
  first_boot="$(ssh "${ssh_options[@]}" tau@127.0.0.1 'cat /proc/sys/kernel/random/boot_id')"
  timeout 30 ssh "${ssh_options[@]}" tau@127.0.0.1 'sudo systemctl reboot' || true
  sleep 20
  wait_for_guest
  [[ "$(ssh "${ssh_options[@]}" tau@127.0.0.1 'cat /proc/sys/kernel/random/boot_id')" != "$first_boot" ]]
fi
# Distro is constrained to three literals above, intentionally passed to the guest.
# shellcheck disable=SC2029
ssh "${ssh_options[@]}" tau@127.0.0.1 "bash -s -- $TAU_VM_DISTRO $guest_graphics" \
  < "$REPO_ROOT/apps/desktop/scripts/hosted-linux-vm-guest.sh" | tee "$output/guest-proof.txt"
ssh "${ssh_options[@]}" tau@127.0.0.1 'cat /tmp/tau-desktop.xwd' > "$output/desktop.xwd"
ssh "${ssh_options[@]}" tau@127.0.0.1 'cat /proc/sys/kernel/random/boot_id' > "$output/guest-boot-id.txt"
[[ "$(cat "$output/guest-boot-id.txt")" != "$(cat /proc/sys/kernel/random/boot_id)" ]]
printf 'Full guest infrastructure proof passed; any selected harness outcome is recorded separately.\n' | tee "$output/result.txt"

if [[ "$mode" != qualification ]]; then
  # Installed sandbox bwrap on the stock image: Tau-scoped profile only, shipped sysctl untouched.
  # Qualification guests install real candidates under the same package names, so they skip this fixture.
  # dpkg-deb refuses control directories the 077 umask above would create.
  (umask 022 && cd "$REPO_ROOT" && node --import @oxc-node/core/register apps/desktop/scripts/hosted-linux-bwrap-fixture.mts "$work/bwrap-fixture")
  ssh "${ssh_options[@]}" tau@127.0.0.1 'mkdir -m 700 ~/bwrap-fixture'
  for deb in "$work"/bwrap-fixture/*.deb; do
    # shellcheck disable=SC2029 # Producer-controlled artifact name, expanded on the host by design.
    ssh "${ssh_options[@]}" tau@127.0.0.1 "cat > ~/bwrap-fixture/$(basename "$deb")" < "$deb"
  done
  ssh "${ssh_options[@]}" tau@127.0.0.1 'bash -s' \
    < "$REPO_ROOT/apps/desktop/scripts/hosted-linux-bwrap-guest.sh" | tee "$output/bwrap-proof.txt"
fi

if [[ "$mode" != proof ]]; then
  # Reuse the verified Node installation from setup-nx. No host home/cache or signing material is copied.
  node_root="$(dirname "$(dirname "$(command -v node)")")"
  ssh "${ssh_options[@]}" tau@127.0.0.1 'mkdir -m 700 ~/node'
  tar -C "$node_root" -cf - . | ssh "${ssh_options[@]}" tau@127.0.0.1 'tar -xf - -C ~/node'
  TAU_VM_MODE="$mode" python3 - "$work/qualification-env.json" <<'PYENV'
import json, os, sys
names = ['GH_TOKEN', 'GITHUB_SHA', 'GITHUB_REF', 'GITHUB_EVENT_NAME', 'GITHUB_REPOSITORY', 'GITHUB_RUN_ID',
         'TAU_DESKTOP_QUALIFICATION_SCOPE', 'TAU_QUALIFICATION_ROUTE', 'TAU_QUALIFICATION_CHANNEL',
         'TAU_QUALIFICATION_RUN_A', 'TAU_QUALIFICATION_RUN_B', 'TAU_QUALIFICATION_RUN_C', 'TAU_QUALIFICATION_GRAPHICS',
         'TAU_APPIMAGE_PUBLIC_KEYS', 'TAU_APPIMAGE_KEY_ID', 'TAU_APT_PRIMARY_FINGERPRINT', 'TAU_APT_SIGNING_FINGERPRINT']
if os.environ['TAU_VM_MODE'] == 'tooling':
    names = ['GITHUB_SHA']
values = {name: os.environ[name] for name in names}
values['TAU_VM_MODE'] = os.environ['TAU_VM_MODE']
with open(sys.argv[1], 'x') as output:
    json.dump(values, output)
PYENV
  # The only credential is this job's short-lived contents/actions-read token, never signing secrets.
  ssh "${ssh_options[@]}" tau@127.0.0.1 'umask 077; cat > ~/qualification-env.json' < "$work/qualification-env.json"
  status=0
  ssh "${ssh_options[@]}" tau@127.0.0.1 'bash -s' \
    < "$REPO_ROOT/apps/desktop/scripts/hosted-linux-qualification-guest.sh" | tee "$output/guest-harness.txt" || status=$?
  # Collect only the existing diagnostic allowlist. Never copy TLS keys, app profiles or environment JSON.
  mkdir -p "$REPO_ROOT/out/route-qualification"
  ssh "${ssh_options[@]}" tau@127.0.0.1 'python3 -' <<'PYRESULT' | tar -xf - -C "$REPO_ROOT/out/route-qualification"
import glob, os, sys, tarfile
root = os.path.expanduser('~/tau/out/route-qualification')
with tarfile.open(fileobj=sys.stdout.buffer, mode='w|') as output:
    for pattern in ['qualification-*.json', 'renderer-*.json', 'renderer-*.png', 'mirror-trust.json', 'route-receipts.json', 'software-ci-evidence.json']:
        for path in glob.glob(os.path.join(root, pattern)):
            if os.path.isfile(path) and not os.path.islink(path):
                output.add(path, arcname=os.path.basename(path), recursive=False)
PYRESULT
  if [[ "$status" != 0 ]]; then
    # A page that closes without a renderer error leaves no app-side record, so print the guest kernel's own
    # account of process deaths (OOM killer, segfaults) and its memory. Kernel lines name commands only, never the
    # app profile, its logs or the qualification environment.
    ssh "${ssh_options[@]}" tau@127.0.0.1 \
      'free -m; sudo journalctl -k --no-pager | grep -iE "out of memory|oom-kill|oom_reaper|killed process|segfault|traps:" | tail -n 40' \
      | tee "$output/guest-kernel-deaths.txt" || true
  fi
  printf '%s\n' "$status" > "$output/harness-exit-code.txt"
  exit "$status"
fi
