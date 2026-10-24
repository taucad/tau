import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFakeShellProvider } from '@taucad/native-process-core/shell';

import { createDesktopShell, desktopShellProvider } from '#tau/services-host-shell.js';

let base = '';
let project = '';
let other = '';
let appData = '';

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'tau-desktop-shell-')));
  project = join(base, 'projects', 'bracket');
  other = join(base, 'projects', 'other');
  appData = join(base, 'user-data');
  for (const directory of [project, other, appData]) {
    // oxlint-disable-next-line no-await-in-loop -- fixture setup.
    await mkdir(directory, { recursive: true });
  }
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const versionThenOk = () =>
  createFakeShellProvider((launch) =>
    launch.arguments.at(-1)?.includes('BASH_VERSION') === true
      ? { status: 'started', stdout: '5.2.21(1)-release\n', exit: { exitCode: 0 } }
      : { status: 'started', stdout: 'ok\n', exit: { exitCode: 0 } },
  );

describe.runIf(process.platform === 'linux' || process.platform === 'darwin')('createDesktopShell', () => {
  it('offers nothing until the probe is ready, then the same memoised shell to every project', async () => {
    const provider = versionThenOk();
    const shell = createDesktopShell({ appDataRoots: [appData], provider, home: base });
    const current = shell.forProject(project, new Map());

    expect(current()).toBeUndefined();
    const probe = await shell.probe();
    expect(probe.status).toBe('available');
    expect(current()).toBe(probe.status === 'available' ? probe.shell : undefined);
    expect(await shell.probe()).toBe(probe);
    expect(shell.forProject(other, new Map())()).toBe(current());
    expect(provider.launches).toHaveLength(1);
  });

  it("reads a run's checkout from the project that admitted it and refuses an unknown run", async () => {
    const provider = versionThenOk();
    const shell = createDesktopShell({ appDataRoots: [appData], provider, home: base });
    shell.forProject(project, new Map([['run-bracket', { cwd: project }]]));
    shell.forProject(other, new Map([['run-other', { cwd: other }]]));
    const probe = await shell.probe();
    if (probe.status !== 'available') {
      throw new Error(probe.message);
    }
    const run = async (runId: string) =>
      probe.shell.run({
        runId,
        toolCallId: `call-${runId}`,
        signal: new AbortController().signal,
        input: { command: 'pwd' },
      });

    await expect(run('run-bracket')).resolves.toMatchObject({ status: 'completed', exitCode: 0 });
    const launch = provider.launches.at(-1)!;
    expect(launch.workingDirectory).toBe(project);
    /* The other registered project and the app data are denied whole. */
    expect(launch.filesystem.denied).toEqual(expect.arrayContaining([other, appData]));
    await expect(run('run-unknown')).resolves.toMatchObject({ status: 'not-started', code: 'checkout-unavailable' });

    shell.release(other);
    await expect(run('run-other')).resolves.toMatchObject({ status: 'not-started', code: 'checkout-unavailable' });
  });

  it('reports a broken sandbox as unavailable and never offers the shell', async () => {
    const shell = createDesktopShell({
      appDataRoots: [appData],
      provider: createFakeShellProvider(() => ({ status: 'sandbox-unavailable', message: 'bwrap is missing' })),
      home: base,
    });
    const current = shell.forProject(project, new Map());

    await expect(shell.probe()).resolves.toMatchObject({ status: 'unavailable', code: 'sandbox-unavailable' });
    expect(current()).toBeUndefined();
  });
});

describe('desktopShellProvider', () => {
  it('has no Windows provider in this build, and answers sandbox-unavailable without one', async () => {
    expect(desktopShellProvider({ platform: 'win32' })).toBeUndefined();
    await expect(createDesktopShell({ appDataRoots: [], platform: 'win32' }).probe()).resolves.toMatchObject({
      status: 'unavailable',
      code: 'sandbox-unavailable',
    });
  });

  it('builds the sandbox provider on Linux and macOS', () => {
    expect(desktopShellProvider({ platform: 'linux', bwrapPath: '/opt/tau/sandbox/bwrap' })?.name).toMatch(/^srt-/u);
    expect(desktopShellProvider({ platform: 'darwin' })?.name).toMatch(/^srt-/u);
  });
});
