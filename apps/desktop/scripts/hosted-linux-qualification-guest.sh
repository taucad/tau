#!/usr/bin/env bash
# Run the existing authentic installed harness inside a disposable proved Linux guest.
# Required files: ~/node (verified host runtime), ~/qualification-env.json (explicit job input allowlist).
# Optional env: none. Usage: invoked over SSH by hosted-linux-vm.sh in qualification mode.
# Exit codes: 0 harness/cleanup passed; nonzero missing prerequisite, qualification or cleanup failure.
set -euo pipefail
# The transferred credential file is already 0600; public source/package directories need normal modes.
umask 022
export PATH="$HOME/node/bin:$PATH"
[[ "$(id -un)" == tau && "$(id -u)" != 0 && "$(cat /proc/1/comm)" == systemd ]]
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  git git-lfs curl ca-certificates gh python3 openssl gnupg apt-utils unattended-upgrades \
  libnss3-tools xdg-utils xdotool wmctrl bubblewrap desktop-file-utils libgtk-3-0t64 libsecret-1-0 libasound2t64 \
  libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libdrm2 libxkbcommon0 libxcomposite1 \
  libxdamage1 libxrandr2 libgbm1
sudo systemctl enable --now apt-daily.timer apt-daily-upgrade.timer
# Clone public source without credentials; only the checked main-dispatch commit is admitted.
source_sha="$(python3 -c 'import json,pathlib; print(json.loads((pathlib.Path.home()/"qualification-env.json").read_text())["GITHUB_SHA"])')"
[[ "$source_sha" =~ ^[a-f0-9]{40}$ ]]
export GIT_LFS_SKIP_SMUDGE=1
git clone --no-checkout https://github.com/taucad/tau.git "$HOME/tau"
cd "$HOME/tau"
git fetch origin "$source_sha"
git checkout --detach "$source_sha"
[[ "$(git rev-parse HEAD)" == "$source_sha" ]]
# Use the repository's integrity-pinned pnpm and frozen dependencies. No token is exported during install.
corepack enable
pnpm install --frozen-lockfile
python3 - <<'PYRUN'
import json, os, pathlib, subprocess, sys
root = pathlib.Path.home() / 'tau'
config = pathlib.Path.home() / 'qualification-env.json'
values = json.loads(config.read_text())
mode = values.pop('TAU_VM_MODE')
env = dict(os.environ, **values)
env.update({'DISPLAY': ':0', 'XAUTHORITY': str(pathlib.Path.home()/'.Xauthority'), 'XDG_SESSION_TYPE': 'x11',
            'TAU_QUALIFICATION_DISPOSABLE_HOST': '1', 'TAU_QUALIFICATION_DISPOSABLE_VM': '1',
            'TAU_QUALIFICATION_DIRECTORY': str(root/'out/route-qualification'),
            'GITHUB_WORKSPACE': str(root), 'NX_NO_CLOUD': 'true', 'NX_DAEMON': 'false', 'NX_NATIVE_COMMAND_RUNNER': 'false'})
# Exercise the real admission helper in tooling as well as installed runs.
subprocess.run(['node', '--import', '@oxc-node/core/register', '--input-type=module', '--eval',
                "import { assertDisposableQualificationHost } from './apps/desktop/scripts/qualification-tls.mts'; assertDisposableQualificationHost();"],
               cwd=root, env=env, check=True)
# The harness creates its own fresh leaf with recursive=false. A fresh clone has no out parent.
(root / 'out').mkdir(exist_ok=True)
if mode == 'tooling':
    config.unlink()
    result = subprocess.run(['pnpm', 'nx', 'run-many', '-p', 'desktop', '-t', 'test-qualification-linux',
                             'test-qualification-metadata', 'test-qualification-evidence', 'test-qualification-probe-process'], cwd=root, env=env)
    sys.exit(result.returncode)
if mode != 'qualification':
    raise ValueError('Invalid guest mode')
status = 1
try:
    status = subprocess.run(['pnpm', 'nx', 'run', 'desktop:qualify-installed-route'], cwd=root, env=env).returncode
finally:
    cleanup = subprocess.run(['pnpm', 'nx', 'run', 'desktop:cleanup-qualification-trust'], cwd=root, env=env).returncode
    config.unlink(missing_ok=True)
    if cleanup:
        status = cleanup
sys.exit(status)
PYRUN
