#!/usr/bin/env bash
# Inside a stock guest: install the real APT selector's profiled bwrap, then run the shell conformance targets as an
# unprivileged user against it. Called over SSH by shell-conformance-vm.sh with the distro as its argument.
# Required files: ~/bwrap-fixture/*.deb (staging), ~/bwrap-fixture-production/*.deb, ~/node, ~/tau (tracked sources plus verified host-built Electron/UI artifacts).
# Required env: GITHUB_SHA/GITHUB_RUN_ID/GITHUB_REPOSITORY, TAU_SHELL_CONFORMANCE_ROW (forwarded identities).
# Usage: bash shell-conformance-guest.sh ubuntu|debian (inside the disposable guest only).
# Exit: nonzero for any prerequisite, conformance/application assertion, evidence or stock-policy failure.
set -euo pipefail
umask 022
export PATH="$HOME/node/bin:$PATH"
[[ "$(id -un)" == tau && "$(id -u)" != 0 ]]
source /etc/os-release
[[ "$ID" == "$1" ]]
case "$ID:$VERSION_ID" in ubuntu:24.04|debian:13) ;; *) exit 1 ;; esac
printf 'Guest: %s (%s)\n' "$PRETTY_NAME" "$(uname -r)"
before="$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || printf 'absent')"
printf 'apparmor_restrict_unprivileged_userns: %s\n' "$before"
evidence="$HOME/tau/out/test-results/shell-application"
mkdir -p "$evidence"
printf '%s\n' "$before" > "$evidence/apparmor-before.txt"
finish() {
  local exit_code=$?
  local after
  after="$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || printf 'absent')"
  printf '%s\n' "$after" > "$evidence/apparmor-after.txt"
  [[ "$after" == "$before" ]] || exit_code=1
  sudo cat /sys/kernel/security/apparmor/profiles > "$evidence/apparmor-profiles.txt" || exit_code=1
  if command -v docker >/dev/null; then
    sudo timeout 15s docker ps -a > "$evidence/docker-containers.txt" 2>&1 || true
    sudo timeout 20s docker compose -f "$HOME/tau/infra/docker-compose.yml" logs --no-color > "$evidence/services.log" 2>&1 || true
  fi
  printf '%s\n' "$exit_code" > "$evidence/exit-code.txt"
  exit "$exit_code"
}
trap finish EXIT
trap 'exit 1' INT TERM
{ cat /etc/os-release; uname -a; printf 'source=%s\nrun=%s\nrepository=%s\n' "$GITHUB_SHA" "$GITHUB_RUN_ID" "$GITHUB_REPOSITORY"; } > "$evidence/identity.txt"

sudo env DEBIAN_FRONTEND=noninteractive apt-get update -qq
# Runtime prerequisites (bubblewrap, socat, ripgrep) and the toolchain node-pty builds from source with.
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  apparmor bubblewrap socat ripgrep curl git git-lfs ca-certificates build-essential python3 util-linux \
  xvfb xauth dbus-x11 dbus-user-session xdg-utils libsecret-1-0 libgtk-3-0t64 libnss3 libasound2t64 libatk-bridge2.0-0t64 libcups2t64 \
  libdrm2 libgbm1 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libx11-xcb1 libxss1 \
  libvulkan1 mesa-vulkan-drivers vulkan-tools docker.io
# Debian ships the Docker client separately and only recommends it; Ubuntu's docker.io carries it.
case "$ID" in ubuntu) docker_client_packages=(docker-compose-v2) ;; debian) docker_client_packages=(docker-cli docker-compose) ;; esac
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${docker_client_packages[@]}"
sudo systemctl enable --now docker
sudo usermod -aG docker tau
# Named E06 services are real guest services, not absent endpoints mistaken for containment.
user_uid="$(id -u)"
sudo loginctl enable-linger tau
sudo systemctl start "user@$user_uid.service"
export XDG_RUNTIME_DIR="/run/user/$user_uid"
export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
sudo -u tau env XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" DBUS_SESSION_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS" \
  systemctl --user start dbus.socket
[[ -S /var/run/docker.sock && -S "$XDG_RUNTIME_DIR/bus" ]]

sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  "$HOME"/bwrap-fixture/tau-staging-runtime-*_amd64.deb "$HOME"/bwrap-fixture/tau-staging_*_amd64.deb
sudo grep -Fx 'tau-staging-bwrap (unconfined)' /sys/kernel/security/apparmor/profiles
bwrap=/opt/tau-staging/sandbox/bwrap
# The production Electron application resolves the production channel's selector bwrap; install that real pair too.
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  "$HOME"/bwrap-fixture-production/tau-runtime-*_amd64.deb "$HOME"/bwrap-fixture-production/tau_*_amd64.deb
sudo grep -Fx 'tau-bwrap (unconfined)' /sys/kernel/security/apparmor/profiles
application_bwrap=/opt/tau/sandbox/bwrap
[[ -x "$application_bwrap" ]]
cd "$HOME/tau"
corepack enable --install-directory "$HOME/node/bin"
pnpm install --frozen-lockfile
# The package installer fetches the locked Electron binary normally; missing native prerequisites are failures.
node node_modules/electron/install.js
cp apps/api/.env.example apps/api/.env
cp application-build.sha256 "$evidence/application-build.sha256"
sha256sum --check application-build.sha256 > "$evidence/application-build-verification.txt"
# Use the actual selector directory, not a path through its executable.
export PATH="$(dirname "$bwrap"):$HOME/node/bin:/usr/local/bin:/usr/bin:/bin"
for dependency in bash rg socat bwrap git node pnpm xvfb-run docker; do
  command -v "$dependency" >> "$evidence/runtime-paths.txt" || { printf 'Missing prerequisite: %s\n' "$dependency" >&2; exit 1; }
done
{ node --version; pnpm --version; bash --version; bwrap --version; rg --version; git --version; } > "$evidence/runtime-versions.txt"
node --input-type=module -e '
  import { createRequire } from "node:module";
  import { resolve } from "node:path";
  const desktop = createRequire(resolve("apps/desktop/package.json"));
  const native = createRequire(resolve("packages/core/native-process/package.json"));
  console.log(JSON.stringify({electron:desktop("electron/package.json").version,nodePty:native("node-pty/package.json").version,openScad:desktop("@taulabs/openrscad-engine/package.json").version}));
' > "$evidence/native-package-versions.json"

status=0
NX_NO_CLOUD=true NX_DAEMON=false TAU_SHELL_CONFORMANCE_BWRAP="$bwrap" \
  TAU_SHELL_CONFORMANCE_RECEIPT="$HOME/shell-conformance-receipt.json" \
  pnpm nx run native-process-core:test:shell-conformance --skip-nx-cache || status=$?
# The host shell service's rows over the same provider and bwrap (H01-H06), with their own receipt.
NX_NO_CLOUD=true NX_DAEMON=false TAU_SHELL_CONFORMANCE_BWRAP="$bwrap" \
  TAU_SHELL_CONFORMANCE_RECEIPT="$HOME/shell-service-conformance-receipt.json" \
  pnpm nx run host:test:shell-conformance --skip-nx-cache || status=$?
# The W7 qualification rows: the agent host over the same provider and bwrap, with their own receipt.
sudo -u tau env PATH="$PATH" XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" DBUS_SESSION_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS" \
  GITHUB_SHA="$GITHUB_SHA" GITHUB_RUN_ID="$GITHUB_RUN_ID" GITHUB_REPOSITORY="$GITHUB_REPOSITORY" GITHUB_SERVER_URL="$GITHUB_SERVER_URL" \
  TAU_SHELL_CONFORMANCE_ROW="$TAU_SHELL_CONFORMANCE_ROW" NX_NO_CLOUD=true NX_DAEMON=false TAU_SHELL_CONFORMANCE_BWRAP="$bwrap" \
  TAU_SHELL_CONFORMANCE_RECEIPT="$HOME/shell-qualification-receipt.json" \
  pnpm nx run host:test:shell-qualification --skip-nx-cache || status=$?
# The desktop Terminal's rows through the services host's terminal concern (W5), with their own receipt.
NX_NO_CLOUD=true NX_DAEMON=false TAU_SHELL_CONFORMANCE_BWRAP="$bwrap" \
  TAU_SHELL_CONFORMANCE_RECEIPT="$HOME/terminal-conformance-receipt.json" \
  pnpm nx run desktop:test:terminal-conformance --skip-nx-cache || status=$?
# Chromium's SwiftShader profile and native capture's Mesa Vulkan adapter are independent backends.
icds=(/usr/share/vulkan/icd.d/lvp_icd*.json)
[[ "${#icds[@]}" == 1 && -s "${icds[0]}" ]]
export VK_DRIVER_FILES="${icds[0]}"
[[ -d "$XDG_RUNTIME_DIR" && -O "$XDG_RUNTIME_DIR" ]]
xvfb-run -a vulkaninfo --summary > "$evidence/vulkan-summary.txt" 2>&1
grep -E 'deviceType.*CPU' "$evidence/vulkan-summary.txt"
sha256sum "$VK_DRIVER_FILES" > "$evidence/vulkan-icd.sha256"

# Fresh group membership allows this unprivileged user to start the disposable test services.
# The target runs both terminal and model tiers, preserving a failed tier's nonzero status.
application_status=0
sudo -u tau env PATH="$PATH" XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" VK_DRIVER_FILES="$VK_DRIVER_FILES" \
  NX_NO_CLOUD=true NX_DAEMON=false NODE_OPTIONS=--no-experimental-webstorage \
  TAU_DESKTOP_SHELL_BWRAP="$application_bwrap" TAU_E2E_WEBGPU_PROFILE=software \
  GITHUB_SHA="$GITHUB_SHA" GITHUB_RUN_ID="$GITHUB_RUN_ID" \
  timeout --signal=TERM --kill-after=60s 45m xvfb-run -a \
  node --env-file=apps/api/.env.example node_modules/nx/dist/bin/nx.js \
  run desktop-e2e:test:e2e:shell --skip-nx-cache --outputStyle=stream \
  > "$evidence/application.log" 2>&1 || application_status=$?
printf '%s\n' "$application_status" > "$evidence/application-exit-code.txt"
cat "$evidence/application.log"
# The model tier's own observers: the API, storage worker and provider-stub logs its global setup writes, and the
# per-tier JSON reports. The Nx stream above shows only what vitest printed, which does not say what the API answered.
mkdir -p "$evidence/application"
# A tier that wrote no log is not a failure; a copy that cannot be made is, because the receipt would be short
# without saying so.
shopt -s nullglob
application_logs=(out/test-results/desktop-e2e/*.log)
application_reports=(out/test-results/desktop-shell/*.json)
shopt -u nullglob
((${#application_logs[@]} == 0)) || cp -f -- "${application_logs[@]}" "$evidence/application/"
((${#application_reports[@]} == 0)) || cp -f -- "${application_reports[@]}" "$evidence/application/"
if [[ "$application_status" != 0 ]]; then status="$application_status"; fi
# The run never relaxed the stock policy.
[[ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || printf 'absent')" == "$before" ]]
exit "$status"
