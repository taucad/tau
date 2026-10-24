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
import json, os, pathlib, select, subprocess, sys, tempfile, time, zipfile
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
        "import fcntl,select,sys; f=open('/var/lib/dpkg/lock-frontend','r+'); fcntl.lockf(f,fcntl.LOCK_EX); print('locked',flush=True); ready=select.select([sys.stdin],[],[],60)[0]; sys.exit(0 if ready and sys.stdin.read(1)=='x' else 1)"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    apt = None
    try:
        if not select.select([lock.stdout], [], [], 30)[0] or lock.stdout.readline().strip() != b'locked':
            raise RuntimeError('Could not acquire fixture dpkg lock')
        apt = subprocess.Popen(['node', '--import', '@oxc-node/core/register', '--input-type=module', '--eval',
            "import { runQualificationApt } from './apps/desktop/scripts/qualification-linux.mts'; runQualificationApt('install', [process.argv[1]]);",
            'ca-certificates=' + version], cwd=root, env=dict(env, LC_ALL='C'),
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        output = b''
        deadline = time.monotonic() + 30
        while b'Waiting for cache lock' not in output:
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not select.select([apt.stdout], [], [], remaining)[0]:
                raise RuntimeError('APT did not report fixture lock contention: ' + output.decode(errors='replace'))
            chunk = os.read(apt.stdout.fileno(), 4096)
            if not chunk:
                raise RuntimeError('APT exited before observing contention: ' + output.decode(errors='replace'))
            output += chunk
        lock.stdin.write(b'x')
        lock.stdin.flush()
        if lock.wait(timeout=10) != 0:
            raise RuntimeError('Fixture dpkg lock holder failed')
        tail, _ = apt.communicate(timeout=140)
        if apt.returncode != 0:
            raise RuntimeError('APT failed after lock release: ' + (output + tail).decode(errors='replace'))
    finally:
        if apt is not None:
            if apt.poll() is None:
                apt.terminate()
                apt.wait(timeout=10)
            apt.stdout.close()
        lock.stdin.close()
        if lock.poll() is None:
            lock.terminate()
            lock.wait(timeout=10)
        lock.stdout.close()
    print('Native APT signature and lock-contention fixtures passed', flush=True)
    subprocess.run(['pnpm', 'nx', 'run', 'desktop:test-appimage-package', '--skip-nx-cache'], cwd=root, env=env, check=True)
    subprocess.run(['pnpm', 'nx', 'run', 'desktop:test-qualification-electron-writer'], cwd=root, env=env, check=True)
    subprocess.run(['pnpm', 'nx', 'run', 'desktop:test-qualification-appimage-sandbox'], cwd=root, env=env, check=True)
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
