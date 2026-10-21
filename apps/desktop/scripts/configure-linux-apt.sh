#!/usr/bin/env bash
# Enroll or remove Tau's scoped APT repository and unattended-update origin.
# No secrets; required inputs: channel, armored PUBLIC key, independently checked primary fingerprint.
# Usage: sudo configure-linux-apt.sh production|staging --manual|--automatic KEY.asc FINGERPRINT
#        sudo configure-linux-apt.sh production|staging --disable-automatic|--remove-repository
# Existing distro unattended-update scheduling is required for --automatic; this script never changes it.
# Exit: 0 configured, 1 invalid state/input, 3 missing dependency. Installed apps/projects are never removed.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo 'Run through sudo as the system administrator.' >&2; exit 1; }
[ "$#" -ge 2 ] || { echo 'Expected channel and operation.' >&2; exit 1; }
channel=$1
operation=$2
case "$channel" in
  production) origin=https://downloads.tau.new/apt; suite=stable; label=TauProduction; suffix='' ;;
  staging) origin=https://downloads.taucad.dev/apt; suite=staging; label=TauStaging; suffix=-staging ;;
  *) echo 'Channel must be production or staging.' >&2; exit 1 ;;
esac
source_path=/etc/apt/sources.list.d/tau-$channel.sources
key_path=/etc/apt/keyrings/tau-$channel.gpg
auto_path=/etc/apt/apt.conf.d/52tau-$channel-unattended
marker='# Managed by Tau APT enrollment v1'
require_owned() {
  if [ -e "$1" ] || [ -L "$1" ]; then
    [ ! -L "$1" ] && [ -f "$1" ] && [ "$(head -n 1 "$1")" = "$marker" ] || { echo "Refusing modified/unowned configuration: $1" >&2; exit 1; }
  fi
}
remove_owned() {
  require_owned "$1"
  if [ -f "$1" ]; then rm -- "$1"; fi
}
case "$operation" in
  --disable-automatic)
    [ "$#" -eq 2 ] || exit 1
    remove_owned "$auto_path"
    echo 'Tau automatic origin enrollment removed; distro policy is unchanged.'
    exit 0 ;;
  --remove-repository)
    [ "$#" -eq 2 ] || exit 1
    require_owned "$auto_path"
    require_owned "$source_path"
    remove_owned "$auto_path"
    remove_owned "$source_path"
    # Retain the public key harmlessly: another administrator-owned source may reference it.
    echo 'Tau source removed. Installed runtime generations and projects remain.'
    exit 0 ;;
  --manual|--automatic) [ "$#" -eq 4 ] || exit 1 ;;
  *) echo 'Unknown operation.' >&2; exit 1 ;;
esac
for tool in gpg apt-config apt-get install mktemp cmp; do
  command -v "$tool" >/dev/null || { echo "Required command missing: $tool" >&2; exit 3; }
done
if [ "$operation" = --automatic ]; then
  command -v unattended-upgrade >/dev/null || { echo 'Install unattended-upgrades and enable distro automatic updates first.' >&2; exit 3; }
  command -v systemctl >/dev/null || { echo 'Automatic enrollment requires the distro systemd APT timers.' >&2; exit 3; }
  for timer in apt-daily.timer apt-daily-upgrade.timer; do
    systemctl is-enabled --quiet "$timer" && systemctl is-active --quiet "$timer" || { echo 'Enable and start both distro APT timers before enrollment.' >&2; exit 1; }
  done
  periodic=$(apt-config dump)
  grep -q '^APT::Periodic::Update-Package-Lists "1";' <<< "$periodic" &&
    grep -q '^APT::Periodic::Unattended-Upgrade "1";' <<< "$periodic" || {
      echo 'Configure daily package-list refresh and unattended upgrades through distro administration first.' >&2; exit 1;
    }
fi
public_key=$3
fingerprint=${4^^}
[[ "$fingerprint" =~ ^[A-F0-9]{40}$|^[A-F0-9]{64}$ ]] || { echo 'Invalid complete fingerprint.' >&2; exit 1; }
[ "$(head -n 1 "$public_key")" = '-----BEGIN PGP PUBLIC KEY BLOCK-----' ] || { echo 'Expected an armored public key.' >&2; exit 1; }
workspace=$(mktemp -d)
trap 'rm -rf -- "$workspace"' EXIT
chmod 700 "$workspace"
key_info=$(gpg --batch --homedir "$workspace" --with-colons --show-keys -- "$public_key")
[ "$(awk -F: '$1=="pub" {n++} END {print n+0}' <<< "$key_info")" -eq 1 ] || { echo 'Expected exactly one primary public key.' >&2; exit 1; }
actual=$(awk -F: '$1=="fpr" {print $10;exit}' <<< "$key_info")
[ "$actual" = "$fingerprint" ] || { echo 'Public key fingerprint mismatch.' >&2; exit 1; }
gpg --batch --homedir "$workspace" --dearmor < "$public_key" > "$workspace/key.gpg"
for owned in "$source_path" "$auto_path"; do
  require_owned "$owned"
done
if [ -e "$key_path" ] || [ -L "$key_path" ]; then
  [ ! -L "$key_path" ] && [ -f "$key_path" ] && cmp -s -- "$workspace/key.gpg" "$key_path" || {
    echo "Refusing conflicting public keyring: $key_path. Arrange key rotation explicitly with the administrator." >&2; exit 1;
  }
fi
install -d -m 0755 /etc/apt/keyrings /etc/apt/sources.list.d /etc/apt/apt.conf.d
install -m 0644 "$workspace/key.gpg" "$key_path"
printf '%s\nTypes: deb\nURIs: %s\nSuites: %s\nComponents: main\nArchitectures: amd64\nSigned-By: %s\n' "$marker" "$origin" "$suite" "$key_path" > "$workspace/source"
install -m 0644 "$workspace/source" "$source_path"
if [ "$operation" = --automatic ]; then
  printf '%s\nUnattended-Upgrade::Origins-Pattern { "origin=Tau,label=%s,codename=%s,component=main"; };\n' "$marker" "$label" "$suite" > "$workspace/automatic"
  install -m 0644 "$workspace/automatic" "$auto_path"
else
  remove_owned "$auto_path"
fi
apt-get update --error-on=any
printf 'Tau %s repository enrolled (%s). Install with apt install tau%s.\n' "$channel" "$operation" "$suffix"
