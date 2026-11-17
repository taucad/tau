/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFakeShellProvider } from '@taucad/native-process-core/shell';

import {
  bundledGitToolchain,
  bundledWindowsSandboxHelper,
  createDesktopShell,
  desktopShellCustody,
  desktopShellProvider,
  setUpWindowsShellSandbox,
  windowsSandboxSetupNeeded,
} from '#services-host-shell.js';
import type { WindowsShellSandboxSetup } from '#services-host-shell.js';

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

describe('bundledGitToolchain', () => {
  it('names the payload readable and puts its bin folder and the exec path holding git-lfs on PATH', async () => {
    const payload = join(base, 'resources', 'git', 'linux-x64');
    await mkdir(join(payload, 'bin'), { recursive: true });
    await mkdir(join(payload, 'libexec', 'git-core'), { recursive: true });
    await writeFile(join(payload, 'bin', 'git'), '');
    const git = join(payload, 'bin', 'git');

    expect(bundledGitToolchain(git)).toStrictEqual({ roots: [payload], bins: [join(payload, 'bin')] });
    await writeFile(join(payload, 'libexec', 'git-core', 'git-lfs'), '');
    expect(bundledGitToolchain(git)).toStrictEqual({
      roots: [payload],
      bins: [join(payload, 'bin'), join(payload, 'libexec', 'git-core')],
    });
    expect(bundledGitToolchain(undefined)).toBeUndefined();
    expect(bundledGitToolchain('')).toBeUndefined();
  });

  it('finds git-lfs.exe in the MinGit exec path of the Windows payload', async () => {
    const payload = join(base, 'resources', 'git', 'win32-x64');
    await mkdir(join(payload, 'bin'), { recursive: true });
    await mkdir(join(payload, 'mingw64', 'libexec', 'git-core'), { recursive: true });
    await writeFile(join(payload, 'mingw64', 'libexec', 'git-core', 'git-lfs.exe'), '');

    expect(bundledGitToolchain(join(payload, 'bin', 'git.exe'))).toStrictEqual({
      roots: [payload],
      bins: [join(payload, 'bin'), join(payload, 'mingw64', 'libexec', 'git-core')],
    });
  });
});

describe.runIf(process.platform === 'linux' || process.platform === 'darwin')('createDesktopShell', () => {
  it('runs both shells with the bundled git first on PATH and its payload readable', async () => {
    const provider = versionThenOk();
    const toolchain = { roots: [join(base, 'git')], bins: [join(base, 'git', 'bin'), join(base, 'git', 'libexec')] };
    const shell = createDesktopShell({ appDataRoots: [appData], provider, home: base, toolchain });
    shell.forProject(project, new Map([['run-bracket', { cwd: project }]]));
    const probe = await shell.probe();
    if (probe.status !== 'available') {
      throw new Error(probe.message);
    }
    await probe.shell.run({
      runId: 'run-bracket',
      toolCallId: 'call-git',
      signal: new AbortController().signal,
      input: { command: 'git --version' },
    });
    const launch = provider.launches.at(-1)!;

    expect(launch.environment['PATH']?.split(':').slice(0, 2)).toStrictEqual(toolchain.bins);
    expect(launch.filesystem.readable).toContain(join(base, 'git'));
  });

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

  describe('Windows shell sandbox flag', () => {
    const installedRecord = JSON.stringify({ version: 1, account: 'TauSandbox', accountSid: 'S-1-5-21-1-2-3-1001' });
    const absentRecord = JSON.stringify({ installed: false });
    /* A stand-in helper that answers `status` only; it never launches anything. */
    const statusHelper = async (installed: boolean): Promise<string> => {
      const helper = join(base, 'tau-windows-sandbox');
      const record = installed ? installedRecord : absentRecord;
      await writeFile(helper, `#!/bin/sh\nprintf '%s' '${record}'\n`);
      await chmod(helper, 0o755);
      return helper;
    };
    /* A stand-in helper whose `status` reports an install record once `install` (the fake setup) has written one. */
    const installableHelper = async (): Promise<{ helper: string; install: () => Promise<void> }> => {
      const helper = join(base, 'tau-windows-sandbox');
      const record = join(base, 'install.json');
      await writeFile(record, absentRecord);
      await writeFile(helper, `#!/bin/sh\ncat '${record}'\n`);
      await chmod(helper, 0o755);
      return {
        helper,
        install: async () => {
          await writeFile(record, installedRecord);
        },
      };
    };

    it('keeps the Windows answer unchanged while the flag is off, even with a helper present', async () => {
      const environment = { TAU_WINDOWS_SANDBOX_HELPER: await statusHelper(true) };

      expect(desktopShellProvider({ platform: 'win32', environment })).toBeUndefined();
      await expect(
        createDesktopShell({ appDataRoots: [], platform: 'win32', environment }).probe(),
      ).resolves.toStrictEqual({
        status: 'unavailable',
        code: 'sandbox-unavailable',
        message: 'The Windows shell sandbox is not part of this Tau build.',
        recovery: 'Use Tau on macOS or Linux for the shell and Terminal until the Windows sandbox ships.',
      });
    });

    it('composes the restricted-token provider when the flag is on and the helper exists', async () => {
      const environment = { TAU_WINDOWS_SHELL_SANDBOX: '1', TAU_WINDOWS_SANDBOX_HELPER: await statusHelper(true) };

      expect(desktopShellProvider({ platform: 'win32', environment, appDataRoots: [appData] })?.name).toBe(
        'tau-windows-restricted-token-1',
      );
    });

    it('has no provider when the flag is on but the helper is missing', () => {
      const environment = { TAU_WINDOWS_SHELL_SANDBOX: '1', TAU_WINDOWS_SANDBOX_HELPER: join(base, 'absent.exe') };

      expect(desktopShellProvider({ platform: 'win32', environment })).toBeUndefined();
    });

    it.skipIf(process.platform === 'win32')(
      'asks for the one administrator approval while the helper reports no install record',
      async () => {
        const environment = { TAU_WINDOWS_SHELL_SANDBOX: '1', TAU_WINDOWS_SANDBOX_HELPER: await statusHelper(false) };

        await expect(
          createDesktopShell({ appDataRoots: [appData], platform: 'win32', environment }).probe(),
        ).resolves.toStrictEqual({
          status: 'unavailable',
          code: 'provisioning-required',
          message: 'The Windows shell sandbox is not set up on this device.',
          recovery:
            'Choose Set up in the Terminal and approve the Windows administrator prompt. Tau asks once; then the shell and Terminal work.',
        });
      },
    );

    it.skipIf(process.platform === 'win32')(
      'says why a status run that failed read as not set up, and asks again at the next probe',
      async () => {
        const helper = join(base, 'tau-windows-sandbox');
        const record = join(base, 'install.json');
        await writeFile(
          helper,
          `#!/bin/sh\nif [ -f '${record}' ]; then cat '${record}'; exit 0; fi\necho 'tau-windows-sandbox status: Access is denied. (os error 5)' >&2\nexit 3\n`,
        );
        await chmod(helper, 0o755);
        const environment = { TAU_WINDOWS_SHELL_SANDBOX: '1', TAU_WINDOWS_SANDBOX_HELPER: helper };
        const shell = createDesktopShell({ appDataRoots: [appData], platform: 'win32', environment });

        await expect(shell.probe()).resolves.toMatchObject({
          code: 'provisioning-required',
          diagnostic:
            'exit 3; its output is not JSON: ""; stderr: tau-windows-sandbox status: Access is denied. (os error 5)',
        });

        /* The record was there all along; the next probe reads it, with no setup in between. */
        await writeFile(record, installedRecord);

        await expect(shell.probe()).resolves.toMatchObject({ status: 'unavailable', code: 'shell-missing' });
      },
    );

    describe('provision', () => {
      it.skipIf(process.platform === 'win32')(
        'runs the one-time setup with the helper, then probes again past the setup answer',
        async () => {
          const { helper, install } = await installableHelper();
          const environment = {
            TAU_WINDOWS_SHELL_SANDBOX: '1',
            TAU_WINDOWS_SANDBOX_HELPER: helper,
          };
          const setUps: string[] = [];
          const shell = createDesktopShell({
            appDataRoots: [appData],
            platform: 'win32',
            environment,
            setUpWindowsSandbox: async (path): Promise<WindowsShellSandboxSetup> => {
              setUps.push(path);
              await install();
              return { status: 'set-up' };
            },
          });
          await expect(shell.probe()).resolves.toMatchObject({
            code: 'provisioning-required',
          });

          const provisioned = await shell.provision();

          expect(setUps).toStrictEqual([helper]);
          /* Past setup the real probe runs; this Linux host has no Windows PowerShell for it to find. */
          expect(provisioned).toMatchObject({
            status: 'unavailable',
            code: 'shell-missing',
          });
          await expect(shell.probe()).resolves.toBe(provisioned);
        },
      );

      it.skipIf(process.platform === 'win32')(
        'keeps offering setup with a clean message when the person declines the prompt',
        async () => {
          const declined = String.raw`The Windows shell sandbox was not set up: Command failed: C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe The operation was canceled by the user.`;
          const { helper } = await installableHelper();
          const environment = {
            TAU_WINDOWS_SHELL_SANDBOX: '1',
            TAU_WINDOWS_SANDBOX_HELPER: helper,
          };
          let setUps = 0;
          const shell = createDesktopShell({
            appDataRoots: [appData],
            platform: 'win32',
            environment,
            setUpWindowsSandbox: async (): Promise<WindowsShellSandboxSetup> => {
              setUps += 1;
              return {
                status: 'failed',
                message: declined,
              };
            },
          });

          await expect(shell.provision()).resolves.toStrictEqual({
            status: 'unavailable',
            code: 'provisioning-required',
            message: 'The Windows shell sandbox was not set up: the administrator prompt was declined or setup failed.',
            recovery: 'Choose Set up to try again. Tau starts no shell until the sandbox is set up.',
            diagnostic: declined,
          });
          await expect(shell.probe()).resolves.toMatchObject({
            code: 'provisioning-required',
            message: 'The Windows shell sandbox is not set up on this device.',
          });
          await expect(shell.provision()).resolves.toMatchObject({
            code: 'provisioning-required',
          });
          expect(setUps).toBe(2);
        },
      );

      it.skipIf(process.platform === 'win32')('shares one setup between concurrent requests', async () => {
        const { helper, install } = await installableHelper();
        const environment = {
          TAU_WINDOWS_SHELL_SANDBOX: '1',
          TAU_WINDOWS_SANDBOX_HELPER: helper,
        };
        const approved = Promise.withResolvers<void>();
        let setUps = 0;
        const shell = createDesktopShell({
          appDataRoots: [appData],
          platform: 'win32',
          environment,
          setUpWindowsSandbox: async (): Promise<WindowsShellSandboxSetup> => {
            setUps += 1;
            await approved.promise;
            await install();
            return { status: 'set-up' };
          },
        });
        const first = shell.provision();
        const second = shell.provision();
        approved.resolve();

        expect(await first).toBe(await second);
        expect(setUps).toBe(1);
      });

      it('runs no setup where the probe does not ask for one', async () => {
        let setUps = 0;
        const setUpWindowsSandbox = async (): Promise<WindowsShellSandboxSetup> => {
          setUps += 1;
          return { status: 'set-up' };
        };
        const off = createDesktopShell({
          appDataRoots: [],
          platform: 'win32',
          environment: {
            TAU_WINDOWS_SANDBOX_HELPER: await statusHelper(false),
          },
          setUpWindowsSandbox,
        });
        await expect(off.provision()).resolves.toMatchObject({
          code: 'sandbox-unavailable',
          message: 'The Windows shell sandbox is not part of this Tau build.',
        });
        const linux = createDesktopShell({
          appDataRoots: [appData],
          platform: 'linux',
          provider: versionThenOk(),
          setUpWindowsSandbox,
        });
        await expect(linux.provision()).resolves.toBe(await linux.probe());
        expect(setUps).toBe(0);
      });
    });
  });
});

describe('windowsSandboxSetupNeeded', () => {
  const refused = (message: string, diagnostic?: string) =>
    ({
      status: 'unavailable',
      code: 'sandbox-unavailable',
      message: `The shell sandbox is not available on this device: ${message}`,
      recovery: 'Reinstall Tau to restore its sandbox components.',
      ...(diagnostic === undefined ? {} : { diagnostic }),
    }) as const;

  it('asks for setup while the helper reports no install record, whatever the probe said', () => {
    expect(windowsSandboxSetupNeeded(refused('anything'), false)).toMatchObject({
      code: 'provisioning-required',
      message: 'The Windows shell sandbox is not set up on this device.',
    });
  });

  it.each([
    'the sandbox runner needs repair (run setup again)',
    'the sandbox network rules are missing or disabled (run setup again)',
    'the sandbox account is missing (run setup again)',
  ])('asks for setup again when the helper refuses with a fault its setup repairs: %s', (message) => {
    expect(
      windowsSandboxSetupNeeded(refused(message, 'the installed runner differs from this helper'), true),
    ).toStrictEqual({
      status: 'unavailable',
      code: 'provisioning-required',
      message: 'The Windows shell sandbox needs to be set up again on this device, for example after a Tau update.',
      recovery:
        'Choose Set up in the Terminal and approve the Windows administrator prompt. Tau asks once; then the shell and Terminal work.',
      diagnostic: `The shell sandbox is not available on this device: ${message}\nthe installed runner differs from this helper`,
    });
  });

  it('leaves every other answer to the probe', () => {
    const firewallOff = refused(
      'Windows Firewall is off for Public, so Tau cannot keep the sandbox off the network. Turn it on, then try again.',
    );
    expect(windowsSandboxSetupNeeded(firewallOff, true)).toBeUndefined();
    expect(
      windowsSandboxSetupNeeded(
        {
          status: 'unavailable',
          code: 'shell-missing',
          message: 'No PowerShell (run setup again)',
          recovery: 'x',
        },
        true,
      ),
    ).toBeUndefined();
  });
});

describe('bundledWindowsSandboxHelper', () => {
  it('prefers TAU_WINDOWS_SANDBOX_HELPER', () => {
    expect(
      bundledWindowsSandboxHelper({
        environment: { TAU_WINDOWS_SANDBOX_HELPER: String.raw`D:\tau\helper.exe` },
        source: false,
      }),
    ).toBe(String.raw`D:\tau\helper.exe`);
  });

  it('runs the release build from the sandbox library in source execution', () => {
    const helper = bundledWindowsSandboxHelper({ environment: {}, source: true });

    expect(helper).toBe(
      fileURLToPath(
        new URL(
          '../../../../libs/sandbox/windows-sandbox/target/x86_64-pc-windows-msvc/release/tau-windows-sandbox.exe',
          import.meta.url,
        ),
      ),
    );
  });

  it('runs the packaged helper from the resources folder', () => {
    expect(
      bundledWindowsSandboxHelper({
        environment: {},
        source: false,
        resourcesPath: String.raw`C:\Program Files\Tau\resources`,
      }),
    ).toBe(String.raw`C:\Program Files\Tau\resources\windows-sandbox\win32-x64\tau-windows-sandbox.exe`);
    expect(bundledWindowsSandboxHelper({ environment: {}, source: false, resourcesPath: '' })).toBeUndefined();
  });
});

describe('setUpWindowsShellSandbox', () => {
  const environment = { SystemRoot: String.raw`C:\Windows` };
  const helper = String.raw`C:\Program Files\Tau's Build\resources\sandbox\tau-windows-sandbox.exe`;

  const recorder = (answers: { whoami: () => Promise<string>; powershell: () => Promise<string> }) => {
    const calls: Array<Readonly<{ file: string; arguments_: readonly string[] }>> = [];
    const run = async (file: string, arguments_: readonly string[]): Promise<string> => {
      calls.push({ file, arguments_ });
      return file.endsWith('whoami.exe') ? answers.whoami() : answers.powershell();
    };
    return { calls, run };
  };

  it("runs the helper's setup for the current person, elevated through the fixed Windows PowerShell", async () => {
    const { calls, run } = recorder({
      whoami: async () => `${String.raw`"desktop-1\person","S-1-5-21-111-222-333-1001"`}\r\n`,
      powershell: async () => '',
    });

    await expect(setUpWindowsShellSandbox(helper, { environment, run })).resolves.toStrictEqual({ status: 'set-up' });

    expect(calls).toStrictEqual([
      { file: String.raw`C:\Windows\System32\whoami.exe`, arguments_: ['/user', '/fo', 'csv', '/nh'] },
      {
        file: String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`,
        arguments_: [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          String.raw`$ErrorActionPreference = 'Stop'; $setup = Start-Process -FilePath 'C:\Program Files\Tau''s Build\resources\sandbox\tau-windows-sandbox.exe' -ArgumentList @('setup', '--for-user', 'S-1-5-21-111-222-333-1001') -Verb RunAs -Wait -PassThru; exit $setup.ExitCode`,
        ],
      },
    ]);
  });

  it('answers failed without elevating when the account cannot be read', async () => {
    const { calls, run } = recorder({ whoami: async () => 'unexpected', powershell: async () => '' });

    await expect(setUpWindowsShellSandbox(helper, { environment, run })).resolves.toStrictEqual({
      status: 'failed',
      message: 'Tau could not read your Windows account.',
    });
    expect(calls).toHaveLength(1);
  });

  it('answers failed when the person declines the administrator prompt', async () => {
    const { run } = recorder({
      whoami: async () => String.raw`"desktop-1\person","S-1-5-21-111-222-333-1001"`,
      powershell: async () => {
        throw new Error('The operation was canceled by the user.');
      },
    });

    await expect(setUpWindowsShellSandbox(helper, { environment, run })).resolves.toStrictEqual({
      status: 'failed',
      message: 'The Windows shell sandbox was not set up: The operation was canceled by the user.',
    });
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
          external: [
            /^node:/u,
            '@taucad/host',
            '@taucad/native-process-core/shell',
            '@taucad/sandbox/shell',
            '@taucad/shell-service',
          ],
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
