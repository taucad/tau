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
  git git-lfs curl ca-certificates gh unzip python3 openssl gnupg gpgv apt-utils unattended-upgrades \
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
import json, os, pathlib, select, subprocess, sys, tempfile, zipfile
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
# Cloud images need not have the desktop config parent; the app's profile leaf must remain absent.
(pathlib.Path.home() / '.config').mkdir(exist_ok=True)
# Exercise the same native ZIP listing/extraction used by authenticated artifact admission.
with tempfile.TemporaryDirectory(prefix='tau-zip-preflight-') as scratch:
    archive = pathlib.Path(scratch) / 'candidate.zip'
    with zipfile.ZipFile(archive, 'x') as fixture:
        fixture.writestr('fixture.txt', 'archive admission prerequisite')
    listing = subprocess.check_output(['unzip', '-Z1', str(archive)], text=True)
    if listing.strip() != 'fixture.txt':
        raise RuntimeError('ZIP prerequisite listing mismatch')
    extracted = pathlib.Path(scratch) / 'extracted'
    subprocess.run(['unzip', '-q', str(archive), '-d', str(extracted)], check=True)
    if (extracted / 'fixture.txt').read_text() != 'archive admission prerequisite':
        raise RuntimeError('ZIP prerequisite extraction mismatch')
print('Guest archive tools and fresh-profile parent ready', flush=True)
if mode == 'tooling':
    config.unlink()
    # Real fixture signatures exercise gpgv; no release signing key enters a tooling guest.
    env['TAU_APT_DISPOSABLE_CONTAINER'] = '1'
    subprocess.run(['pnpm', 'nx', 'run', 'desktop:test-apt-publication'], cwd=root, env=env, check=True)
    # Hold the native frontend lock, then release it while the actual driver command waits.
    # Selecting the already installed CA package version makes this transaction a no-op.
    version = subprocess.check_output(['dpkg-query', '-W', '-f=${Version}', 'ca-certificates'], text=True)
    lock = subprocess.Popen(['sudo', '-n', 'python3', '-c',
        "import fcntl,time; f=open('/var/lib/dpkg/lock-frontend','r+'); fcntl.lockf(f,fcntl.LOCK_EX); print('locked',flush=True); time.sleep(8)"],
        stdout=subprocess.PIPE, text=True)
    try:
        if not select.select([lock.stdout], [], [], 30)[0] or lock.stdout.readline().strip() != 'locked':
            raise RuntimeError('Could not acquire fixture dpkg lock')
        result = subprocess.run(['node', '--import', '@oxc-node/core/register', '--input-type=module', '--eval',
            "import { runQualificationApt } from './apps/desktop/scripts/qualification-linux.mts'; console.log(runQualificationApt('install', [process.argv[1]]));",
            'ca-certificates=' + version], cwd=root, env=dict(env, LC_ALL='C'), check=True, timeout=170,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        if 'Waiting for cache lock' not in result.stdout:
            raise RuntimeError('APT did not observe the held fixture lock: ' + result.stdout)
        if lock.wait(timeout=10) != 0:
            raise RuntimeError('Fixture dpkg lock holder failed')
    finally:
        if lock.poll() is None:
            lock.terminate()
            lock.wait(timeout=10)
        lock.stdout.close()
    print('Native APT signature and lock-contention fixtures passed', flush=True)
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
