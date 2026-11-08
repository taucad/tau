#!/usr/bin/env bash
# Install the distribution's own NVIDIA driver on a disposable Google Cloud T4 host before its first desktop boot.
# Called over the IAP-tunnelled SSH by hosted-linux-vm.sh (TAU_VM_HOST=gcp); the host then reboots so the driver,
# not a boot-time display driver, owns the GPU, exactly as after a user installs it.
# Required env: none. Usage: bash hosted-linux-gpu-driver-guest.sh
# Exit codes: 0 driver packages installed; nonzero package or repository failure.
set -euo pipefail
[[ "$(id -un)" == tau && "$(id -u)" != 0 ]]
# shellcheck source=/dev/null
source /etc/os-release
if [[ "$ID" == debian ]]; then
  # Debian ships the NVIDIA driver in non-free; the cloud image enables main only.
  sudo sed -i -E 's/^Components: main$/Components: main contrib non-free non-free-firmware/' /etc/apt/sources.list.d/debian.sources
fi
sudo env DEBIAN_FRONTEND=noninteractive apt-get update -qq
if [[ "$ID" == ubuntu ]]; then
  # The driver Ubuntu's Additional Drivers recommends for this GPU, with its prebuilt signed kernel modules.
  sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ubuntu-drivers-common
  ubuntu-drivers devices || true
  sudo env DEBIAN_FRONTEND=noninteractive ubuntu-drivers install
else
  # nvidia-smi is its own package in Debian (only recommended by the driver), and both scripts read the GPU with it.
  sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    "linux-headers-$(uname -r)" nvidia-driver nvidia-smi firmware-misc-nonfree
fi
dpkg-query -W -f='${Package} ${Version}\n' | grep -E '^(nvidia-driver|linux-modules-nvidia|nvidia-kernel-dkms|xserver-xorg-video-nvidia|libnvidia-gl)' || true
# Which display driver the first boot bound, for the record; the reboot that follows hands the GPU to NVIDIA.
lspci -nnk -d 10de: || true
