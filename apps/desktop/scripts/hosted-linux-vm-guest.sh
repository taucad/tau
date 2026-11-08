#!/usr/bin/env bash
# Validate distro/kernel, systemd timer and a real Xorg/Openbox desktop in a disposable guest.
# Called over authenticated loopback SSH by hosted-linux-vm.sh, never on the host.
# Required env: none. Usage: bash hosted-linux-vm-guest.sh ubuntu|ubuntu2604|debian [dummy|nvidia]
#   dummy (default): QEMU guest with the Xorg dummy driver and Mesa. nvidia: a Google Cloud T4 host whose Xorg
#   drives the real GPU, so stock-graphics qualification renders on hardware.
# Exit codes: 0 assertions passed; 1 assertion or guest setup failed.
set -euo pipefail
[[ "$(id -un)" == tau && "$(id -u)" != 0 && "$(uname -m)" == x86_64 ]]
[[ "$(cat /proc/1/comm)" == systemd ]]
# shellcheck source=/dev/null
source /etc/os-release
# The argument names the expected image: each token admits exactly one release.
case "$1:$ID:$VERSION_ID" in ubuntu:ubuntu:24.04|ubuntu2604:ubuntu:26.04|debian:debian:13) ;; *) exit 1 ;; esac
printf 'Guest: %s\n' "$PRETTY_NAME"
uname -a
graphics="${2:-dummy}"
case "$graphics" in
  dummy) systemd-detect-virt | grep -x kvm ;;
  # Google Cloud reports its own hypervisor name on current systemd and kvm on older ones.
  nvidia) systemd-detect-virt | grep -xE 'kvm|google' ;;
  *) exit 1 ;;
esac
if [[ "$graphics" == nvidia && "$ID" == debian ]]; then
  # Debian ships the NVIDIA driver in non-free; the cloud image enables main only.
  sudo sed -i -E 's/^Components: main$/Components: main contrib non-free non-free-firmware/' /etc/apt/sources.list.d/debian.sources
fi
sudo env DEBIAN_FRONTEND=noninteractive apt-get update -qq
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  xserver-xorg-core xserver-xorg-video-dummy openbox xauth x11-utils x11-apps x11-xserver-utils xclip \
  dbus-x11 apparmor apparmor-utils libfuse2t64 fuse3 libgl1-mesa-dri libglx-mesa0 libegl-mesa0 mesa-utils
command -v fusermount
if [[ "$graphics" == nvidia ]]; then
  # The distribution's own packaged driver, as a user of that release installs it (secure boot is off on these hosts).
  if [[ "$ID" == ubuntu ]]; then
    sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ubuntu-drivers-common
    sudo env DEBIAN_FRONTEND=noninteractive ubuntu-drivers install
  else
    sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      "linux-headers-$(uname -r)" nvidia-driver firmware-misc-nonfree
  fi
  sudo modprobe nvidia
  sudo modprobe nvidia-drm modeset=1 || true
  nvidia-smi
  dpkg-query -W -f='${Package} ${Version}\n' | grep -E '^(nvidia-driver|xserver-xorg-video-nvidia|libnvidia-gl)' || true
fi
sudo aa-status
[[ "$(cat /sys/module/apparmor/parameters/enabled)" == Y ]]
sudo grep -E '^CONFIG_(SECCOMP|SECCOMP_FILTER|USER_NS)=y$' "/boot/config-$(uname -r)"
for feature in SECCOMP SECCOMP_FILTER USER_NS; do
  sudo grep -qx "CONFIG_${feature}=y" "/boot/config-$(uname -r)"
done
/usr/sbin/sysctl kernel.unprivileged_userns_clone user.max_user_namespaces
if [[ "$ID" == ubuntu ]]; then
  [[ "$(/usr/sbin/sysctl -n kernel.apparmor_restrict_unprivileged_userns)" == 1 ]]
fi
# Record the stock policy's decision; do not turn off AppArmor to make unshare pass.
if unshare -Ur true; then printf 'Unprivileged userns: allowed\n'; else printf 'Unprivileged userns: restricted by stock policy\n'; fi
sudo systemd-run --unit=tau-proof-timer --on-active=2s --timer-property=AccuracySec=1s /usr/bin/touch /tmp/tau-timer-fired
for _attempt in $(seq 1 30); do [[ -f /tmp/tau-timer-fired ]] && break; sleep 1; done
[[ -f /tmp/tau-timer-fired ]]
sudo journalctl -u tau-proof-timer.service --no-pager
if [[ "$graphics" == nvidia ]]; then
  # nvidia-smi reports a hexadecimal domain:bus:device.function; Xorg wants decimal PCI:bus:device:function.
  IFS=':.' read -r _domain bus device function <<< "$(nvidia-smi --query-gpu=pci.bus_id --format=csv,noheader | head -1)"
  bus_id="PCI:$((16#$bus)):$((16#$device)):$((16#$function))"
  sudo tee /tmp/tau-xorg.conf >/dev/null <<XORG
Section "Device"
  Identifier "GPU"
  Driver "nvidia"
  BusID "$bus_id"
  Option "AllowEmptyInitialConfiguration" "True"
EndSection
Section "Screen"
  Identifier "Screen"
  Device "GPU"
  DefaultDepth 24
  SubSection "Display"
    Depth 24
    Virtual 1280 800
  EndSubSection
EndSection
XORG
else
  sudo tee /tmp/tau-xorg.conf >/dev/null <<'XORG'
Section "Device"
  Identifier "Dummy"
  Driver "dummy"
  VideoRam 256000
EndSection
Section "Monitor"
  Identifier "Monitor"
  HorizSync 5.0-1000.0
  VertRefresh 5.0-200.0
  Modeline "1280x800" 83.50 1280 1352 1480 1680 800 803 809 831
EndSection
Section "Screen"
  Identifier "Screen"
  Device "Dummy"
  Monitor "Monitor"
  DefaultDepth 24
  SubSection "Display"
    Depth 24
    Modes "1280x800"
  EndSubSection
EndSection
XORG
fi
export DISPLAY=:0 XAUTHORITY="$HOME/.Xauthority"
touch "$XAUTHORITY"
xauth add :0 . "$(mcookie)"
# Stock needrestart never restarts a display manager (gdm, lightdm, sddm, ... in its override_rc), so a real
# desktop keeps its X server through unattended upgrades. This guest's X server is a transient unit those
# defaults do not name: give it the same exclusion. In run 41783968750 Tau died with "X connection error
# received" on ubuntu-appimage-x11 and ubuntu2604-apt-x11 while unattended-upgrades held the dpkg lock.
sudo mkdir -p /etc/needrestart/conf.d
# shellcheck disable=SC2016 # The Perl line is written literally.
printf '%s\n' '$nrconf{override_rc}{qr(^tau-proof-xorg\.service$)} = 0;' | sudo tee /etc/needrestart/conf.d/tau-proof-xorg.conf >/dev/null
sudo systemd-run --unit=tau-proof-xorg /usr/lib/xorg/Xorg :0 -config /tmp/tau-xorg.conf -auth "$XAUTHORITY" -nolisten tcp -noreset
for _attempt in $(seq 1 30); do xdpyinfo >/dev/null 2>&1 && break; sleep 1; done
xdpyinfo | head -20 || true
xdpyinfo >/dev/null
# A cloud image plus a dummy Xorg driver is not a complete graphics desktop.
# Require an actual Mesa context before attempting the shipping Electron/WebGL renderer.
glxinfo_output="$(glxinfo -B)"
printf '%s\n' "$glxinfo_output"
grep -q 'OpenGL renderer string:' <<< "$glxinfo_output"
# A GPU host must render on the GPU, never fall back to llvmpipe.
if [[ "$graphics" == nvidia ]]; then grep -q 'OpenGL renderer string: .*NVIDIA\|OpenGL vendor string: NVIDIA' <<< "$glxinfo_output"; fi
# The window manager runs as the ordinary guest user, with D-Bus, not as root.
systemd-run --user --unit=tau-proof-desktop --setenv=DISPLAY=:0 --setenv="XAUTHORITY=$XAUTHORITY" dbus-run-session openbox
for _attempt in $(seq 1 30); do xprop -root _NET_SUPPORTING_WM_CHECK | grep -q 'window id' && break; sleep 1; done
xprop -root _NET_SUPPORTING_WM_CHECK | grep 'window id'
printf 'tau-guest-clipboard' | xclip -selection clipboard >/dev/null 2>&1
[[ "$(xclip -selection clipboard -o)" == tau-guest-clipboard ]]
xwd -root -silent -out /tmp/tau-desktop.xwd
[[ -s /tmp/tau-desktop.xwd ]]
free -m
df -h /
printf 'PASS: independent kernel, systemd timer, AppArmor, seccomp capability, Xorg/Openbox and clipboard.\n'
