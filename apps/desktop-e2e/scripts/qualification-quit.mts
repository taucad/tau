/* eslint-disable @typescript-eslint/naming-convention -- Environment variables retain their wire names. */
/** Request an ordinary native window close only for the admitted disposable process. */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, realpath, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
const execute = promisify(execFile);
const readySchema = z.object({
  pid: z.number().int().positive(),
  profile: z.string(),
  installedPath: z.string(),
  nonce: z.uuid(),
  route: z.enum(['macos-zip', 'macos-dmg', 'windows-nsis', 'linux-apt', 'linux-appimage']),
  version: z.string().regex(/^\d+\.\d+\.\d+$/u),
});

/** One mount from `/proc/<pid>/mountinfo`: where it is mounted, its filesystem type and its source. */
type MountRecord = { readonly point: string; readonly type: string; readonly source: string };

/** Decode the octal escapes (`\040` for a space) the kernel writes into mountinfo paths. */
const decodeMountPath = (value: string): string =>
  value.replaceAll(/\\([0-7]{3})/gu, (_, octal: string) => String.fromCodePoint(Number.parseInt(octal, 8)));

/** The mount that holds `path` in `pid`'s mount namespace: the longest mount point that is a prefix of it. */
const mountHolding = async (pid: number, path: string): Promise<MountRecord | undefined> => {
  let best: MountRecord | undefined;
  const mountinfo = await readFile(`/proc/${pid}/mountinfo`, 'utf8');
  for (const line of mountinfo.split('\n')) {
    const [fields, tail] = line.split(' - ');
    const point = fields?.split(' ')[4];
    const [type, source] = tail?.split(' ') ?? [];
    if (point === undefined || type === undefined || source === undefined) {
      continue;
    }
    const record = { point: decodeMountPath(point), type, source: decodeMountPath(source) };
    const inside = record.point === '/' || path === record.point || path.startsWith(`${record.point}/`);
    if (inside && (best === undefined || record.point.length > best.point.length)) {
      best = record;
    }
  }
  return best;
};

/** Every process whose executable is an AppImage, with its parent, read from the kernel's process table. */
const appImageProcesses = async (): Promise<ReadonlyArray<{ pid: number; parent: number; exe: string }>> => {
  const found: Array<{ pid: number; parent: number; exe: string }> = [];
  for (const entry of await readdir('/proc')) {
    if (!/^\d+$/u.test(entry)) {
      continue;
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- a bounded scan of one disposable guest's process table
      const exe = await readlink(`/proc/${entry}/exe`);
      if (!exe.endsWith('.AppImage')) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- see above
      const stat = await readFile(`/proc/${entry}/stat`, 'utf8');
      // The command name in field 2 may hold spaces and parentheses; the parent PID follows its last ')'.
      const parent = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
      found.push({ pid: Number(entry), parent, exe });
    } catch {
      // A process that exited, or one this user may not inspect, binds nothing.
    }
  }
  return found;
};

/** The pipes `pid` holds open, as the kernel names them (`pipe:[<inode>]`); one end of a pipe names the same inode. */
const pipesHeldBy = async (pid: number): Promise<ReadonlySet<string>> => {
  const pipes = new Set<string>();
  const directory = `/proc/${pid}/fd`;
  const descriptors = await readdir(directory).catch(() => []);
  for (const descriptor of descriptors) {
    // oxlint-disable-next-line no-await-in-loop -- a bounded scan of one process's descriptor table
    const target = await readlink(join(directory, descriptor)).catch(() => '');
    if (target.startsWith('pipe:[')) {
      pipes.add(target);
    }
  }
  return pipes;
};

/**
 * Bind the browser process to the admitted AppImage outer path, or say why it cannot be bound.
 *
 * The AppImage runtime exports `APPIMAGE` before it executes the app, but Chromium's process-title code may overwrite
 * the browser's original environment block afterwards: on stock Ubuntu 24.04 (run 41735517425 ubuntu-appimage-x11)
 * `/proc/<pid>/environ` held 3475 entries and no `APPIMAGE` at all. Two kernel records the process cannot rewrite
 * name the same outer file, so any one of three exact matches binds it:
 * - `APPIMAGE=<outer path>` in `/proc/<pid>/environ` (the original binding, still taken when it survives);
 * - the FUSE mount that holds `/proc/<pid>/exe` has the outer path as its source, which the runtime gives it;
 * - a process whose own `/proc/<pid>/exe` is the outer path and that holds a pipe the browser process also holds. The
 *   type-2 runtime opens a keepalive pipe, forks, and the child mounts the image and daemonizes (so its parent is 1, run
 *   41771037853) holding the write end; the parent keeps the read end and executes the app, which becomes the browser.
 *   The mount's source is only the file's base name (`fuse.Tau.AppImage` "Tau.AppImage"), so it cannot bind on its own.
 * @returns `undefined` when bound, otherwise the observations a CI log needs (guest paths only, never values).
 */
const appImageBinding = async (outerPath: string, browserPid: number): Promise<string | undefined> => {
  const environmentText = await readFile(`/proc/${browserPid}/environ`, 'utf8');
  const environment = environmentText.split('\0');
  if (environment.includes(`APPIMAGE=${outerPath}`)) {
    return undefined;
  }
  const executable = await readlink(`/proc/${browserPid}/exe`);
  const mount = await mountHolding(browserPid, executable);
  if (mount?.type.startsWith('fuse') === true && mount.source === outerPath) {
    return undefined;
  }
  const runtimes = await appImageProcesses();
  const browserPipes = await pipesHeldBy(browserPid);
  const runtimePipes = await Promise.all(
    runtimes.filter(({ exe }) => exe === outerPath).map(async ({ pid }) => pipesHeldBy(pid)),
  );
  if (runtimePipes.some((pipes) => [...pipes].some((pipe) => browserPipes.has(pipe)))) {
    return undefined;
  }
  const reported = environment.filter((entry) => entry.startsWith('APPIMAGE='));
  return [
    `Native quit requires the admitted AppImage outer path ${outerPath}`,
    `/proc/${browserPid}/environ holds ${environment.length} entries and ${reported.length === 0 ? 'no APPIMAGE entry' : reported.map((entry) => JSON.stringify(entry)).join(', ')}`,
    `/proc/${browserPid}/exe is ${JSON.stringify(executable)} on ${mount === undefined ? 'no mount' : `${mount.type} ${JSON.stringify(mount.source)} at ${JSON.stringify(mount.point)}`}`,
    `AppImage processes: ${runtimes.length === 0 ? 'none' : runtimes.map(({ pid, parent, exe }) => `${pid} (parent ${parent}) ${JSON.stringify(exe)}`).join(', ')}`,
    `browser holds ${browserPipes.size} pipes; none is shared with a process running the outer path`,
  ].join('; ');
};

/** Bind the CDP browser PID to the probe and native executable before sending a user-style close request. */
export const requestQualificationQuit = async (
  profile: string,
  browserPid: number,
  reinstalledPid?: number,
): Promise<void> => {
  if (process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'] !== '1') {
    throw new Error('Native quit requires an explicitly disposable host');
  }
  const ready = readySchema.parse(JSON.parse(await readFile(join(profile, 'route-qualification.ready.json'), 'utf8')));
  const request = readySchema
    .pick({ profile: true, installedPath: true, nonce: true })
    .parse(JSON.parse(await readFile(join(profile, 'route-qualification.request.json'), 'utf8')));
  if (
    (reinstalledPid ?? ready.pid) !== browserPid ||
    ready.profile !== (await realpath(profile)) ||
    ready.profile !== request.profile ||
    ready.nonce !== request.nonce ||
    ready.installedPath !== request.installedPath
  ) {
    throw new Error('Native quit process differs from the admitted profile');
  }
  if (reinstalledPid !== undefined) {
    const requestBytes = await readFile(join(profile, 'route-qualification.request.json'));
    const state = z
      .object({ requestSha256: z.string(), observations: z.array(z.object({ stage: z.string() })) })
      .parse(JSON.parse(await readFile(join(profile, 'route-qualification.state.json'), 'utf8')));
    if (
      state.requestSha256 !== createHash('sha256').update(requestBytes).digest('hex') ||
      state.observations.at(-1)?.stage !== 'c'
    ) {
      throw new Error('Reinstalled quit requires the unchanged completed qualification request');
    }
  }
  const options = { timeout: 15_000, windowsHide: true };
  switch (process.platform) {
    case 'win32': {
      // Environment transport avoids inserting a path into PowerShell source.
      await execute(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '$ErrorActionPreference="Stop"; $p=Get-Process -Id ([int]$env:TAU_QUIT_PID); if ($p.Path -cne $env:TAU_QUIT_EXE) { throw "Executable mismatch" }; if (-not $p.CloseMainWindow()) { throw "No native main window accepted WM_CLOSE" }',
        ],
        { ...options, env: { ...process.env, TAU_QUIT_PID: String(browserPid), TAU_QUIT_EXE: ready.installedPath } },
      );
      break;
    }
    case 'linux': {
      if (ready.route === 'linux-apt') {
        if (!['/usr/bin/tau', '/usr/bin/tau-staging'].includes(ready.installedPath)) {
          throw new Error('Unrecognized APT launcher');
        }
        const name = ready.installedPath === '/usr/bin/tau' ? 'tau' : 'tau-staging';
        const expected = `/opt/${name}/releases/${ready.version}/Tau`;
        if ((await readlink(`/proc/${browserPid}/exe`)) !== expected) {
          throw new Error('APT running generation differs from the admitted probe');
        }
      } else if (ready.route === 'linux-appimage') {
        // A managed install reports its /usr/bin launcher while the process runs the exact
        // generation under /opt; a portable AppImage reports its own outer path.
        const managed = {
          '/usr/bin/tau-appimage': '/opt/tau-appimage',
          '/usr/bin/tau-staging-appimage': '/opt/tau-staging-appimage',
        }[ready.installedPath];
        const outerPath = managed ? `${managed}/releases/${ready.version}/Tau.AppImage` : ready.installedPath;
        const unbound = await appImageBinding(outerPath, browserPid);
        if (unbound !== undefined) {
          throw new Error(unbound);
        }
      } else {
        throw new Error('Unexpected Linux route');
      }
      // Ask the EWMH window manager to close gracefully; xdotool windowclose destroys the window.
      const { stdout } = await execute('xdotool', ['search', '--onlyvisible', '--pid', String(browserPid)], options);
      const windows = stdout.trim().split(/\s+/u);
      if (windows.length !== 1 || !/^\d+$/u.test(windows[0] ?? '')) {
        throw new Error('Expected exactly one visible qualification window');
      }
      await execute('wmctrl', ['-i', '-c', windows[0] ?? ''], options);
      break;
    }
    case 'darwin': {
      const app = dirname(dirname(dirname(ready.installedPath)));
      const executable = join(app, 'Contents/MacOS/Tau');
      // `ps -o comm=` can print the bare process name (run 41561293311 macos-dmg-arm64 got `Tau`), so the
      // kernel's proc_pidpath names the running executable instead.
      const temporary = await mkdtemp(join(tmpdir(), 'tau-quit-'));
      let running: string;
      try {
        const source = join(temporary, 'pid-path.c');
        const helper = join(temporary, 'pid-path');
        await writeFile(
          source,
          `#include <libproc.h>
#include <stdio.h>
#include <stdlib.h>
int main(int argc,char **argv) { if(argc!=2) return 2; pid_t pid=(pid_t)strtol(argv[1],0,10); if(pid<=0) return 3; char path[PROC_PIDPATHINFO_MAXSIZE]; if(proc_pidpath(pid,path,sizeof path)<=0) return 4; printf("%s\\n",path); return 0; }
`,
        );
        await execute('/usr/bin/xcrun', ['clang', '-Wall', '-Werror', source, '-o', helper], {
          ...options,
          timeout: 120_000,
        });
        ({ stdout: running } = await execute(helper, [String(browserPid)], options));
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
      if (running.trim() !== executable) {
        throw new Error('Mac native quit requires the exact admitted executable');
      }
      // PID targeting avoids quitting another instance of the same bundle. Missing Accessibility permission fails closed.
      await execute(
        '/usr/bin/osascript',
        [
          '-e',
          `tell application "System Events" to tell first application process whose unix id is ${browserPid}`,
          '-e',
          'set frontmost to true',
          '-e',
          'keystroke "q" using command down',
          '-e',
          'end tell',
        ],
        options,
      );
      break;
    }
    default: {
      throw new Error('Unsupported native quit platform');
    }
  }
};
