#!/usr/bin/env bash
# Guest side of linux-vm.sh: stock Ubuntu 24.04, run as the ordinary user `tau` with the Chromium sandbox on.
# Usage: bash linux-vm-guest.sh <repo> <node-root> <drop> [sets: all or a comma list of row labels]. Each row records its own outcome; this script fails only
# when the guest cannot be prepared.
set -euo pipefail
REPO="$1" NODE_ROOT="$2" DROP="$3" SETS="${4:-all}"
[[ "$(id -un)" == tau && "$(id -u)" != 0 ]]
sudo mkdir -p "$REPO" "$NODE_ROOT"
sudo mount -t 9p -o trans=virtio,version=9p2000.L,msize=524288 taurepo "$REPO"
sudo mount -t 9p -o trans=virtio,version=9p2000.L,msize=524288,ro taunode "$NODE_ROOT"
export PATH="$NODE_ROOT/bin:$PATH"
cd "$REPO"
# shellcheck source=/dev/null
source /etc/os-release
printf 'Guest: %s, kernel %s, %s\n' "$PRETTY_NAME" "$(uname -r)" "$(systemd-detect-virt)" | tee "$DROP/guest.txt"
sudo env DEBIAN_FRONTEND=noninteractive timeout 900 apt-get update -qq
sudo env DEBIAN_FRONTEND=noninteractive timeout 1200 apt-get install -y --no-install-recommends \
  xvfb xauth xdotool dbus-x11 at-spi2-core orca gsettings-desktop-schemas \
  libnss3 libgbm1 libasound2t64 libgtk-3-0t64 libxss1 libnotify4 libsecret-1-0 libdrm2 libxkbcommon0 fonts-dejavu-core
# Stock policy keeps kernel.apparmor_restrict_unprivileged_userns=1. Like Tau's .deb, grant userns to the exact
# Electron binaries through a scoped AppArmor profile instead of relaxing the sysctl or disabling the sandbox.
/usr/sbin/sysctl kernel.apparmor_restrict_unprivileged_userns | tee -a "$DROP/guest.txt"
electron_binary="$(node -e "process.stdout.write(require('module').createRequire('$REPO/apps/desktop/package.json')('electron'))")"
packaged_binary="$REPO/out/s3-renderer/packaged/TauS3Fixture-linux-x64/TauS3Fixture"
sudo tee /etc/apparmor.d/tau-s3-fixture >/dev/null <<PROFILE
abi <abi/4.0>,
include <tunables/global>

profile tau-s3-electron $electron_binary flags=(unconfined) {
  userns,
}
profile tau-s3-packaged $packaged_binary flags=(unconfined) {
  userns,
}
PROFILE
sudo apparmor_parser -r /etc/apparmor.d/tau-s3-fixture
cp /etc/apparmor.d/tau-s3-fixture "$DROP/apparmor-profile.txt"
export S3_HOST_LABEL=LNX-VM S3_GPU_LABEL='software/virtual GPU (QEMU, no GPU device)'
run() {
  local label="$1"; shift
  local status=0
  [[ "$SETS" == all || ",$SETS," == *",$label,"* ]] || return 0
  timeout --kill-after=30s "${S3_STEP_TIMEOUT:-2400}" "$@" > "$DROP/$label.log" 2>&1 || status=$?
  printf '%s exit=%s\n' "$label" "$status" | tee -a "$DROP/rows.txt"
}
runner=(node apps/ui/scripts/s3-renderer/run.mts --skip-build --software-gl --kinds xterm,aurigax)
xvfb=(xvfb-run -a -s '-screen 0 1920x1080x24')
run core "${xvfb[@]}" "${runner[@]}" --suite integrity,disposal,r02,r03,r04,r05,r06,r07 --out "$DROP/core"
run core-default "${xvfb[@]}" node apps/ui/scripts/s3-renderer/run.mts --skip-build --kinds xterm,aurigax \
  --suite integrity,r02,r04,r06 --out "$DROP/core-default"
run r01-rate4 "${xvfb[@]}" "${runner[@]}" --suite r01 --rounds 3 --rate 4 --out "$DROP/r01-rate4"
run r01 "${xvfb[@]}" "${runner[@]}" --suite r01 --rounds 3 --out "$DROP/r01"
run packaged "${xvfb[@]}" "${runner[@]}" --packaged --suite integrity,r02,r06 --out "$DROP/packaged"
run orca dbus-run-session -- sh apps/ui/scripts/s3-renderer/native/orca-session.sh "$DROP/orca" \
  "${runner[@]}" --suite r04orca --out "$DROP/orca"
