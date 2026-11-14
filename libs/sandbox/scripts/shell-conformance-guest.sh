#!/usr/bin/env bash
# Inside a stock guest: install the real APT selector's profiled bwrap, then run the shell conformance targets as an
# unprivileged user against it. Called over SSH by shell-conformance-vm.sh with the distro as its argument.
# Required files: ~/bwrap-fixture/*.deb (staging), ~/bwrap-fixture-production/*.deb, ~/node, ~/store-guard (the
# host-built tau-store-guard with its NOTICE and manifest), ~/tau (tracked sources plus, in the full tier only,
# verified host-built Electron/UI artifacts).
# Required env: GITHUB_SHA/GITHUB_RUN_ID/GITHUB_REPOSITORY, TAU_SHELL_CONFORMANCE_ROW (forwarded identities),
# TAU_SHELL_TIER (full: every target and the application tier; semantics: the listed projects' targets only, no
# Electron, xvfb, Vulkan or application tier) and TAU_SHELL_PROJECTS (comma list of the projects whose targets run).
# Usage: bash shell-conformance-guest.sh ubuntu|ubuntu2604|debian (inside the disposable guest only).
# Exit: nonzero for any prerequisite, conformance/application assertion, evidence or stock-policy failure.
set -euo pipefail
umask 022
export PATH="$HOME/node/bin:$PATH"
[[ "$(id -un)" == tau && "$(id -u)" != 0 ]]
tier="${TAU_SHELL_TIER:?set TAU_SHELL_TIER}"
[[ "$tier" == full || "$tier" == semantics ]]
[[ "${TAU_SHELL_PROJECTS:?set TAU_SHELL_PROJECTS}" =~ ^[a-z0-9-]+(,[a-z0-9-]+)*$ ]]
# A target runs only when its project is listed; the full tier lists all seven.
listed() { [[ ",$TAU_SHELL_PROJECTS," == *",$1,"* ]]; }
printf 'Shell tier: %s; projects: %s\n' "$tier" "$TAU_SHELL_PROJECTS"
source /etc/os-release
# The argument names the expected image: each token admits exactly one release.
case "$1:$ID:$VERSION_ID" in ubuntu:ubuntu:24.04|ubuntu2604:ubuntu:26.04|debian:debian:13) ;; *) exit 1 ;; esac
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
if [[ "$tier" == full ]]; then
  sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    apparmor bubblewrap socat ripgrep curl git git-lfs ca-certificates build-essential python3 util-linux \
    xvfb xauth dbus-x11 dbus-user-session xdg-utils libsecret-1-0 libgtk-3-0t64 libnss3 libasound2t64 libatk-bridge2.0-0t64 libcups2t64 \
    libdrm2 libgbm1 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libx11-xcb1 libxss1 \
    libvulkan1 mesa-vulkan-drivers vulkan-tools docker.io
else
  # No Electron, xvfb or Vulkan prerequisites; Docker and the user session bus only for the host rows below.
  host_packages=()
  if listed host; then host_packages=(dbus-user-session docker.io); fi
  sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    apparmor bubblewrap socat ripgrep curl git git-lfs ca-certificates build-essential python3 util-linux \
    "${host_packages[@]}"
fi
# The host rows (W7 E06) assert that /var/run/docker.sock and the session bus are live sockets: every full run, and
# a semantics run that lists host.
if [[ "$tier" == full ]] || listed host; then
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
fi

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
cp apps/api/.env.example apps/api/.env
if [[ "$tier" == full ]]; then
  # The package installer fetches the locked Electron binary normally; missing native prerequisites are failures.
  node node_modules/electron/install.js
  cp application-build.sha256 "$evidence/application-build.sha256"
  sha256sum --check application-build.sha256 > "$evidence/application-build-verification.txt"
  dependencies=(bash rg socat bwrap git node pnpm xvfb-run docker)
else
  # The semantics tier expects no host-built artefact: the runner built none and transferred none.
  [[ ! -e application-build.sha256 && ! -e apps/desktop/dist && ! -e apps/ui/desktop/build ]]
  dependencies=(bash rg socat bwrap git node pnpm)
  if listed host; then dependencies+=(docker); fi
fi
# Use the actual selector directory, not a path through its executable.
export PATH="$(dirname "$bwrap"):$HOME/node/bin:/usr/local/bin:/usr/bin:/bin"
for dependency in "${dependencies[@]}"; do
  command -v "$dependency" >> "$evidence/runtime-paths.txt" || { printf 'Missing prerequisite: %s\n' "$dependency" >&2; exit 1; }
done
{ node --version; pnpm --version; bash --version; bwrap --version; rg --version; git --version; } > "$evidence/runtime-versions.txt"
node --input-type=module -e '
  import { createRequire } from "node:module";
  import { resolve } from "node:path";
  const desktop = createRequire(resolve("apps/desktop/package.json"));
  const native = createRequire(resolve("libs/sandbox/package.json"));
  console.log(JSON.stringify({electron:desktop("electron/package.json").version,nodePty:native("node-pty/package.json").version,openScad:desktop("@taulabs/openrscad-engine/package.json").version}));
' > "$evidence/native-package-versions.json"

# The Linux Terminal's git store guard as the package ships it: a static executable the shell rows start under the
# selector's bwrap (TAU_SHELL_CONFORMANCE_STORE_GUARD), and, in the full tier, the unpackaged app's own resources copy.
store_guard="$HOME/store-guard/tau-store-guard"
[[ -x "$store_guard" && -s "$HOME/store-guard/NOTICE" ]]
"$store_guard" --version > "$evidence/store-guard-version.txt"
cp "$HOME/store-guard/manifest.json" "$evidence/store-guard-manifest.json"
{ stat -c '%a %U:%G' /dev/fuse 2>&1 || printf 'absent\n'; } > "$evidence/dev-fuse.txt"
export TAU_SHELL_CONFORMANCE_STORE_GUARD="$store_guard"
if [[ "$tier" == full ]]; then
  mkdir -p apps/desktop/resources/store-guard/linux-x64
  cp "$HOME"/store-guard/{tau-store-guard,NOTICE,manifest.json} apps/desktop/resources/store-guard/linux-x64/
fi

status=0
# The guard's own acceptance (blueprint LP2): workflow, protected writes, git outside mid-session, the bypass shape,
# the server's death and the cost bound, as this unprivileged user under the selector's bwrap.
if listed sandbox; then
  bash libs/sandbox/store-guard/tests/acceptance.sh "$store_guard" "$bwrap" "$evidence/store-guard-acceptance.txt" || status=$?
fi
if listed sandbox; then
  NX_NO_CLOUD=true NX_DAEMON=false TAU_SHELL_CONFORMANCE_BWRAP="$bwrap" \
    TAU_SHELL_CONFORMANCE_RECEIPT="$HOME/shell-conformance-receipt.json" \
    pnpm nx run sandbox:test:shell-conformance --skip-nx-cache || status=$?
fi
# The native sandbox every kernel worker runs in, as the packaged app runs it: the stock bwrap first on PATH and the
# selector's copy named by TAU_NATIVE_SANDBOX_BWRAP. Stock Ubuntu 26.04 confines /usr/bin/bwrap with
# bwrap-userns-restrict, so apply-seccomp opens its nested namespace only through the Tau copy (qualification
# 41865985263 ubuntu2604-*: build123d's bytecode compile exited 1 and no model rendered). CI=1 forbids a skip.
if listed native-process-core; then
  PATH="$HOME/node/bin:/usr/local/bin:/usr/bin:/bin" CI=1 NX_NO_CLOUD=true NX_DAEMON=false TAU_NATIVE_SANDBOX_BWRAP="$bwrap" \
    pnpm nx run native-process-core:test:native-sandbox-integration --skip-nx-cache || status=$?
fi
# The shell service's rows over the same provider and bwrap (H01-H07), with their own receipt.
if listed shell-service; then
  NX_NO_CLOUD=true NX_DAEMON=false TAU_SHELL_CONFORMANCE_BWRAP="$bwrap" \
    TAU_SHELL_CONFORMANCE_RECEIPT="$HOME/shell-service-conformance-receipt.json" \
    pnpm nx run shell-service:test:shell-conformance --skip-nx-cache || status=$?
fi
# The service rows through a real Tau agent host and the host's tool registry (H08-H10), with their own receipt.
if listed host; then
  NX_NO_CLOUD=true NX_DAEMON=false TAU_SHELL_CONFORMANCE_BWRAP="$bwrap" \
    TAU_SHELL_CONFORMANCE_RECEIPT="$HOME/host-shell-conformance-receipt.json" \
    pnpm nx run host:test:shell-conformance --skip-nx-cache || status=$?
fi
# The W7 qualification rows: the agent host over the same provider and bwrap, with their own receipt.
if listed host; then
  sudo -u tau env PATH="$PATH" XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" DBUS_SESSION_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS" \
    GITHUB_SHA="$GITHUB_SHA" GITHUB_RUN_ID="$GITHUB_RUN_ID" GITHUB_REPOSITORY="$GITHUB_REPOSITORY" GITHUB_SERVER_URL="$GITHUB_SERVER_URL" \
    TAU_SHELL_CONFORMANCE_ROW="$TAU_SHELL_CONFORMANCE_ROW" NX_NO_CLOUD=true NX_DAEMON=false TAU_SHELL_CONFORMANCE_BWRAP="$bwrap" \
    TAU_SHELL_CONFORMANCE_STORE_GUARD="$TAU_SHELL_CONFORMANCE_STORE_GUARD" \
    TAU_SHELL_CONFORMANCE_RECEIPT="$HOME/shell-qualification-receipt.json" \
    pnpm nx run host:test:shell-qualification --skip-nx-cache || status=$?
fi
# The desktop Terminal's rows through the services host's terminal concern (W5), with their own receipt.
if listed desktop-services-host; then
  NX_NO_CLOUD=true NX_DAEMON=false TAU_SHELL_CONFORMANCE_BWRAP="$bwrap" \
    TAU_SHELL_CONFORMANCE_RECEIPT="$HOME/terminal-conformance-receipt.json" \
    pnpm nx run desktop-services-host:test:terminal-conformance --skip-nx-cache || status=$?
fi
# The Terminal concern's own rows over a port into the concern (shell split PR 3), with their own receipt.
if listed desktop-terminal; then
  NX_NO_CLOUD=true NX_DAEMON=false TAU_SHELL_CONFORMANCE_BWRAP="$bwrap" \
    TAU_SHELL_CONFORMANCE_RECEIPT="$HOME/terminal-concern-conformance-receipt.json" \
    pnpm nx run desktop-terminal:test:terminal-conformance --skip-nx-cache || status=$?
fi
# The application tier (Vulkan, xvfb and the packaged-equivalent Electron app) runs in the full tier only.
if [[ "$tier" == full ]] && listed desktop-e2e; then
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
fi
# The run never relaxed the stock policy.
[[ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || printf 'absent')" == "$before" ]]
exit "$status"
