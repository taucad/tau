/* eslint-disable @typescript-eslint/naming-convention -- Environment variables retain their wire names. */
/** Request an ordinary native window close only for the admitted disposable process. */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, realpath, readlink, rm, writeFile } from 'node:fs/promises';
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

/**
 * Name what the kernel reports instead of the admitted outer path, so a mismatch is diagnosable from the CI log:
 * only the APPIMAGE entries (a guest path, never a secret) and how many entries the record holds, which separates a
 * different outer path from an environment block the process has overwritten. Run 41662259184 ubuntu-appimage-x11
 * failed this check with nothing else to go on.
 */
const appImageMismatch = (outerPath: string, browserPid: number, environment: readonly string[]): string => {
  const reported = environment.filter((entry) => entry.startsWith('APPIMAGE='));
  const found = reported.length === 0 ? 'no APPIMAGE entry' : reported.map((entry) => JSON.stringify(entry)).join(', ');
  return (
    `Native quit requires the admitted AppImage outer path: expected APPIMAGE=${outerPath}; ` +
    `/proc/${browserPid}/environ holds ${environment.length} entries and ${found}`
  );
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
        const environmentText = await readFile(`/proc/${browserPid}/environ`, 'utf8');
        const environment = environmentText.split('\0');
        if (!environment.includes(`APPIMAGE=${outerPath}`)) {
          throw new Error(appImageMismatch(outerPath, browserPid, environment));
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
