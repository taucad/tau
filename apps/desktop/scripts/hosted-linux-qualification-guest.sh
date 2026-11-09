#!/usr/bin/env bash
# Run the existing authentic installed harness inside a disposable proved Linux guest.
# Required files: ~/node (verified host runtime), ~/qualification-env.json (explicit job input allowlist).
# Optional env: none. Usage: invoked over SSH by hosted-linux-vm.sh in tooling, qualification or clean-host mode;
#   clean-host adds the standard `consumer` account that runs the app (qualification-linux-consumer.mts).
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
# The guest gets the same guard as setup-nx's "Rerun Nx once after a segfault" step: Nx 22.7.1 is sometimes
# killed by SIGSEGV about two seconds into a command, before it runs anything, and the guest's own install has no
# such guard (guest (ubuntu) on #1378: `nx run desktop:test-qualification-electron-writer` killed 2 s after start).
# Only Nx's own exit 139 reruns it, once; a failed task exits otherwise and passes through unchanged.
nx_bin=node_modules/.bin
mv "$nx_bin/nx" "$nx_bin/nx-segv-guarded"
cat > "$nx_bin/nx" <<'SH'
#!/bin/sh
real="$(dirname "$0")/nx-segv-guarded"
"$real" "$@"
status=$?
if [ "$status" -eq 139 ]; then
  echo "Nx was killed by SIGSEGV; rerunning once: nx $*" >&2
  "$real" "$@"
  status=$?
fi
exit "$status"
SH
chmod +x "$nx_bin/nx"
mode="$(python3 -c 'import json,pathlib; print(json.loads((pathlib.Path.home()/"qualification-env.json").read_text())["TAU_VM_MODE"])')"
if [[ "$mode" == clean-host ]]; then
  # A standard consumer account, as on a person's desktop: its own group only (no sudo/adm), locked password, its own
  # systemd user session and D-Bus, and the session's X display. It downloads, makes the AppImage executable and runs
  # Tau; this administrator account only installs the downloaded packages and reads system state.
  consumer=consumer
  sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends acl libglib2.0-bin dbus-user-session
  if id "$consumer" >/dev/null 2>&1; then printf 'Consumer account already exists\n' >&2; exit 1; fi
  sudo useradd --create-home --user-group --shell /bin/bash "$consumer"
  sudo passwd --lock "$consumer" >/dev/null
  consumer_uid="$(id -u "$consumer")"
  sudo loginctl enable-linger "$consumer"
  for _attempt in $(seq 1 60); do [[ -S "/run/user/$consumer_uid/bus" ]] && break; sleep 1; done
  [[ -S "/run/user/$consumer_uid/bus" ]] || { printf 'Consumer session bus did not start\n' >&2; exit 1; }
  # Same rights a desktop user has on their own display, from the session's cookie.
  xauth -f "$HOME/.Xauthority" nlist :0 |
    sudo -n -u "$consumer" env -i "HOME=/home/$consumer" xauth -f "/home/$consumer/.Xauthority" nmerge -
  # Search (x) on this home and read on the verified Node runtime. The public harness checkout is world-readable under
  # umask 022, so the consumer reads it as any local user could; the job's environment file (the only credential) is
  # 0600, and the run's output directory is made owner-only below. Nothing grants the consumer a write or admin path.
  sudo setfacl -m "u:$consumer:x" "$HOME"
  sudo setfacl -R -m "u:$consumer:rX" "$HOME/node"
  # The consumer's download browser, installed once outside every home and read-only to it.
  sudo install -d -m 0755 -o "$(id -un)" /usr/local/share/ms-playwright
  PLAYWRIGHT_BROWSERS_PATH=/usr/local/share/ms-playwright pnpm exec playwright install chromium
  sudo env "PATH=$PATH" "$PWD/node_modules/.bin/playwright" install-deps chromium
  # The consumer has no administrator rights (the harness re-observes this as the consumer and records it).
  # Container, VM and raw-disk groups are root-equivalent, so they count as administrator rights too.
  if id -nG "$consumer" | grep -qwE 'root|sudo|admin|adm|wheel|google-sudoers|lxd|incus-admin|docker|libvirt|disk' ||
    sudo -n -u "$consumer" sudo -n true 2>/dev/null; then
    printf 'Consumer account has administrator rights\n' >&2
    exit 1
  fi
fi
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
# The harness now creates both parents itself; these stay as a guest-side belt
# and braces, and neither touches the leaves it creates with recursive=false.
(root / 'out').mkdir(exist_ok=True)
# Run outputs stay with this account; a clean-host consumer has no reason to read them.
(root / 'out').chmod(0o700)
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
    # Explicit isolated software preflight; it produces no stock GPU or release acceptance receipt.
    subprocess.run(['pnpm', 'nx', 'run', 'desktop:test-qualification-electron-writer'], cwd=root,
                   env=dict(env, TAU_QUALIFICATION_GRAPHICS='isolated-software'), check=True)
    subprocess.run(['pnpm', 'nx', 'run', 'desktop:test-qualification-appimage-sandbox'], cwd=root, env=env, check=True)
    result = subprocess.run(['pnpm', 'nx', 'run-many', '-p', 'desktop', '-t', 'test-qualification-linux',
                             'test-qualification-metadata', 'test-qualification-evidence', 'test-qualification-probe-process'], cwd=root, env=env)
    sys.exit(result.returncode)
if mode == 'clean-host':
    # The harness reaches the consumer's profile and app only through its unprivileged agent.
    env['TAU_QUALIFICATION_CONSUMER'] = 'consumer'
elif mode != 'qualification':
    raise ValueError('Invalid guest mode')
status = 1
try:
    status = subprocess.run(['pnpm', 'nx', 'run', 'desktop:qualify-installed-route'], cwd=root, env=env).returncode
finally:
    # Whether the X server stayed up for the whole run: its unit's start/stop lines only, and why any restart happened.
    subprocess.run(['sudo', 'journalctl', '--no-pager', '-o', 'short-iso', '-u', 'tau-proof-xorg.service',
                    '-g', 'Started|Stopping|Stopped|Deactivated|Failed|code=exited'], check=False)
    subprocess.run(['sudo', 'sh', '-c', 'grep -h -A3 "Restarting services" /var/log/unattended-upgrades/*.log 2>/dev/null || true'],
                   check=False)
    # Whether the scheduler could still run when an upgrade wait expired (run 41827213025 Debian rows saw no mirror
    # request for 15 minutes after reconnect): each APT unit's state, its start and finish lines, and any APT process
    # still running.
    subprocess.run(['systemctl', 'show',
                    '--property=Id,ActiveState,SubState,ExecMainStartTimestamp,LastTriggerUSec,NextElapseUSecRealtime',
                    'apt-daily.service', 'apt-daily-upgrade.service', 'apt-daily.timer', 'apt-daily-upgrade.timer'],
                   check=False)
    subprocess.run(['sudo', 'sh', '-c', 'journalctl --no-pager -o short-iso -u apt-daily.service -u apt-daily-upgrade.service '
                    '-g "Start|Finish|Fail|Deactivat|skipped|condition|code=|timed out" | tail -n 40'], check=False)
    subprocess.run(['sh', '-c', 'ps -eo pid,etimes,args | grep -E "[a]pt|[d]pkg|[u]nattended" || true'], check=False)
    cleanup = subprocess.run(['pnpm', 'nx', 'run', 'desktop:cleanup-qualification-trust'], cwd=root, env=env).returncode
    config.unlink(missing_ok=True)
    if cleanup:
        status = cleanup
sys.exit(status)
PYRUN
