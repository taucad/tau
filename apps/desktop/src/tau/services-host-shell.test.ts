import { mkdir, mkdtemp, realpath, rm, writeFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFakeShellProvider } from '@taucad/native-process-core/shell';

import { createDesktopShell, desktopShellCustody, desktopShellProvider } from '#tau/services-host-shell.js';

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
    expect(current()?.identity).toEqual(probe.status === 'available' ? probe.shell.identity : undefined);
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

  it("answers each run's mode from the project that admitted it and records every finished call there (W9)", async () => {
    const provider = versionThenOk();
    const shell = createDesktopShell({ appDataRoots: [appData], provider, home: base });
    const recorded: Array<[string, string, string]> = [];
    const hooksFor = (name: string, mode: 'ask' | 'bypass') => ({
      permissionModeOf: async () => mode,
      recordCall: async ({ request, output }: { request: { runId: string }; output: { status: string } }) => {
        recorded.push([name, request.runId, output.status]);
      },
    });
    const current = shell.forProject(
      project,
      new Map([['run-bracket', { cwd: project }]]),
      hooksFor('bracket', 'bypass'),
    );
    shell.forProject(other, new Map([['run-other', { cwd: other }]]), hooksFor('other', 'ask'));
    await shell.probe();
    const run = async (runId: string) =>
      current()!.run({
        runId,
        toolCallId: `call-${runId}`,
        signal: new AbortController().signal,
        input: { command: 'npm ping', access: { reason: 'Reach the registry', domains: ['registry.npmjs.org'] } },
      });

    /* Bypass in one project approves the widening; Ask in the other, with no approval channel, refuses it. */
    await expect(run('run-bracket')).resolves.toMatchObject({
      status: 'completed',
      approval: { approvedBy: 'bypass', mode: 'bypass' },
    });
    await expect(run('run-other')).resolves.toMatchObject({ status: 'not-started', code: 'approval-unavailable' });
    /* A run no project admitted reads Ask and is refused before any hook runs. */
    await expect(run('run-unknown')).resolves.toMatchObject({ status: 'not-started' });
    expect(recorded).toEqual([
      ['bracket', 'run-bracket', 'completed'],
      ['other', 'run-other', 'not-started'],
    ]);
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

/* I7: the desktop keeps shell receipts in app data and releases an earlier agent receipt once its project answers. */
describe.runIf(process.platform === 'linux' || process.platform === 'darwin')('createDesktopShell custody', () => {
  it('keeps the sandbox provider’s receipts in Tau’s app data', () => {
    expect(desktopShellCustody([appData])).toEqual({
      directory: join(appData, 'shell-custody'),
      sessionDirectory: tmpdir(),
    });
    expect(desktopShellCustody([])).toBeUndefined();
  });

  it('releases an earlier agent receipt once the project that owns its checkout registers', async () => {
    const privateRoot = await mkdtemp(join(tmpdir(), 'tau-shell-'));
    const provider = createFakeShellProvider(
      (launch) =>
        launch.arguments.at(-1)?.includes('BASH_VERSION') === true
          ? { status: 'started', stdout: '5.2.21(1)-release\n', exit: { exitCode: 0 } }
          : { status: 'started', stdout: 'ok\n', exit: { exitCode: 0 } },
      {
        prior: [
          {
            executionId: 'earlier',
            privateRoot,
            resource: { key: 'agent:run-0', root: project },
            phase: 'exited',
          },
        ],
      },
    );
    const shell = createDesktopShell({ appDataRoots: [appData], provider, home: base });
    const probe = await shell.probe();
    if (probe.status !== 'available') {
      throw new Error(probe.message);
    }
    const released: string[] = [];
    const checkouts = Object.assign(new Map([['run-1', { cwd: project }]]), {
      executions: {
        owns: async (root: string) => root === project,
        held: async () =>
          new Map([
            [
              'earlier',
              async () => {
                released.push('earlier');
                return { status: 'applied' } as const;
              },
            ],
          ]),
      },
    });
    shell.forProject(project, checkouts);

    await expect.poll(() => provider.released).toContain('earlier');
    expect(released).toEqual(['earlier']);
    await expect(
      probe.shell.run({
        runId: 'run-1',
        toolCallId: 'call-1',
        signal: new AbortController().signal,
        input: { command: 'pwd' },
      }),
    ).resolves.toMatchObject({ status: 'completed' });
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

describe('bundled shell supervisor', () => {
  it('starts the sibling supervisor from a real split utility bundle', async () => {
    const entry = join(base, 'entry.js');
    const supervisor = join(base, 'supervisor.js');
    const output = join(base, 'dist');
    const source = fileURLToPath(new URL('services-host-shell.ts', import.meta.url));
    await writeFile(join(base, 'package.json'), JSON.stringify({ type: 'module' }));
    await writeFile(
      entry,
      `const { bundledShellSupervisor } = await import(${JSON.stringify(source)}); console.log(JSON.stringify(bundledShellSupervisor()));`,
    );
    // This executable is only a path oracle; it does not emulate or qualify a sandbox provider.
    await writeFile(supervisor, "console.log('sibling-supervisor-started');");
    await build({
      configFile: false,
      root: base,
      logLevel: 'silent',
      build: {
        target: 'node24',
        outDir: output,
        minify: false,
        rolldownOptions: {
          input: { 'services-host': entry, 'shell-supervisor': supervisor },
          external: [/^node:/u, '@taucad/host', '@taucad/native-process-core/shell'],
          treeshake: { moduleSideEffects: false },
          output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name].js' },
        },
      },
    });
    expect(await readdir(join(output, 'chunks'))).toContain('services-host-shell.js');
    const execute = promisify(execFile);
    const resolved = await execute(process.execPath, [join(output, 'services-host.js')]);
    const expected = { executablePath: process.execPath, arguments: [join(output, 'shell-supervisor.js')] };
    expect(JSON.parse(resolved.stdout)).toEqual(expected);
    const started = await execute(expected.executablePath, expected.arguments);
    expect(started.stdout.trim()).toBe('sibling-supervisor-started');
  });
});
