#!/usr/bin/env bash
# Validate distro/kernel, systemd timer and a real Xorg/Openbox desktop in a disposable guest.
# Called over authenticated loopback SSH by hosted-linux-vm-proof.sh, never on the host.
# Required env: none. Usage: bash hosted-linux-vm-guest.sh ubuntu|debian
# Exit codes: 0 assertions passed; 1 assertion or guest setup failed.
set -euo pipefail
[[ "$(id -un)" == tau && "$(id -u)" != 0 && "$(uname -m)" == x86_64 ]]
[[ "$(cat /proc/1/comm)" == systemd ]]
# shellcheck source=/dev/null
source /etc/os-release
[[ "$ID" == "$1" ]]
case "$ID:$VERSION_ID" in ubuntu:24.04|debian:13) ;; *) exit 1 ;; esac
printf 'Guest: %s\n' "$PRETTY_NAME"
uname -a
systemd-detect-virt | grep -x kvm
sudo env DEBIAN_FRONTEND=noninteractive apt-get update -qq
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  xserver-xorg-core xserver-xorg-video-dummy openbox xauth x11-utils x11-apps x11-xserver-utils xclip \
  dbus-x11 apparmor apparmor-utils libfuse2t64
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
export DISPLAY=:0 XAUTHORITY="$HOME/.Xauthority"
touch "$XAUTHORITY"
xauth add :0 . "$(mcookie)"
sudo systemd-run --unit=tau-proof-xorg /usr/lib/xorg/Xorg :0 -config /tmp/tau-xorg.conf -auth "$XAUTHORITY" -nolisten tcp -noreset
for _attempt in $(seq 1 30); do xdpyinfo >/dev/null 2>&1 && break; sleep 1; done
xdpyinfo | head -20 || true
xdpyinfo >/dev/null
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
