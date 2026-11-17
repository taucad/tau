/**
 * The desktop's contained shell (desktop shell blueprint W4; D1, D3, D9, D14, F5).
 *
 * One probe per services utility, run lazily and memoized: it proves the platform's provider and the machine's own shell
 * before anything is offered. Every project host hands in its own run→checkout map, and the one shell service reads a
 * call's checkout from whichever project owns that run, so an unknown run is refused and never defaults to a project.
 * The same project answers the run's permission mode and records each finished call (W9).
 * The agent registry reads the probe at every listing, so `shell` appears once the probe is ready and never before; the
 * Terminal (W5) reads the same memoized probe through {@link DesktopShell.probe}.
 *
 * @module
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

import { probeHostShell } from '@taucad/shell-service';
import type {
  HostShell,
  PermissionMode,
  ShellCheckout,
  ShellOutput,
  ShellProjectExecutions,
  ShellProbe,
  ShellRunRequest,
  ShellUnavailable,
} from '@taucad/shell-service';
import {
  createSandboxShellProvider,
  createWindowsShellProvider,
  readWindowsSandboxStatus,
} from '@taucad/native-process-core/shell';
import type { SandboxShellProviderOptions, ShellProvider } from '@taucad/native-process-core/shell';

/** The host environment, as far as shell composition reads it. */
type HostEnvironment = Readonly<Record<string, string | undefined>>;

/** @public */
export type DesktopShellOptions = Readonly<{
  /** Tau's app data (Electron `userData`, the config directory): denied whole, never grantable. */
  appDataRoots: readonly string[];
  /**
   * Admitted project roots beyond the ones whose hosts registered here, read per launch: every project but the run's
   * own is denied whole.
   */
  projectRoots?: (() => readonly string[]) | undefined;
  /** On Linux, the Tau-owned bubblewrap (`linuxInstallation(...).bwrap`); a portable AppImage has none. */
  bwrapPath?: string | undefined;
  platform?: NodeJS.Platform | undefined;
  home?: string | undefined;
  /** On Linux, the host-owned file journalling protected-path stand-ins, swept at the next start after a crash. */
  standInJournal?: string | undefined;
  /**
   * On Linux, the `tau-store-guard` this build ships (`resources/store-guard/linux-x64`): the Terminal then writes the
   * project's git store through it where it can start, and keeps the store read-only where it cannot (Linux Terminal
   * git parity blueprint, R3 and OD2). Absent, the store stays read-only.
   */
  storeGuardPath?: string | undefined;
  /**
   * The bundled git's toolchain ({@link bundledGitToolchain}): readable, and first on both shells' `PATH`, so the agent
   * and the Terminal run the git the revision engine records with.
   */
  toolchain?: Readonly<{ roots: readonly string[]; bins: readonly string[] }> | undefined;
  /** Injected for tests; otherwise {@link desktopShellProvider}. */
  provider?: ShellProvider | undefined;
  /**
   * The environment composition reads: `TAU_WINDOWS_SHELL_SANDBOX` and `TAU_WINDOWS_SANDBOX_HELPER` on Windows.
   * Defaults to `process.env`.
   */
  environment?: HostEnvironment | undefined;
  log?: ((event: string, detail?: unknown, level?: 'info' | 'warn') => void) | undefined;
}>;

/** One project's permission hooks (W9): the store's `permissionModeOfRun` and `recordShellCall` for that project. */
export type DesktopShellProjectHooks = Readonly<{
  /** The run's chat mode, read per call after recall; a project without one reads Ask. */
  permissionModeOf?: ((runId: string) => Promise<PermissionMode>) | undefined;
  /** Record one finished call; reporting only, never fatal. */
  recordCall?: ((call: Readonly<{ request: ShellRunRequest; output: ShellOutput }>) => Promise<void>) | undefined;
}>;

/**
 * One project's run→checkout map, carrying that project's side of shell startup recovery when its host has one (I7).
 *
 * @public
 */
export type DesktopShellCheckouts = ReadonlyMap<string, ShellCheckout> &
  Readonly<{ executions?: ShellProjectExecutions | undefined }>;

/** @public */
export type DesktopShell = Readonly<{
  /** The memoized probe; the first call starts it. */
  probe: () => Promise<ShellProbe>;
  /**
   * The shell one project's registry offers: register the project's run→checkout map and permission hooks, and read
   * the probe at every listing and call.
   */
  forProject: (
    projectRoot: string,
    checkouts: DesktopShellCheckouts,
    hooks?: DesktopShellProjectHooks,
  ) => () => HostShell | undefined;
  /** Forget a project's runs once its host is gone. */
  release: (projectRoot: string) => void;
}>;

/**
 * The shell toolchain for the `git` this build ships: its payload folder readable, and its `bin` folder and the exec
 * path that holds its `git-lfs` on `PATH`. Git starts its LFS filter through its own exec path, so `git status` on a
 * project with large files works without a `git-lfs` of the machine's own, and `git-lfs` is there to type as well.
 * Without a bundled git (a development tree, a platform with no payload) the shell keeps the machine's `PATH`.
 *
 * @param gitExecutable - The bundled `git` (`TAU_GIT_EXECUTABLE`), `<payload>/bin/git`.
 * @returns The toolchain, or `undefined` when no git is bundled.
 */
export const bundledGitToolchain = (
  gitExecutable: string | undefined,
): Readonly<{ roots: readonly string[]; bins: readonly string[] }> | undefined => {
  if (gitExecutable === undefined || gitExecutable === '') {
    return undefined;
  }
  const bin = dirname(gitExecutable);
  const payload = dirname(bin);
  const execPath = join(payload, 'libexec', 'git-core');
  return {
    roots: [payload],
    bins: existsSync(join(execPath, 'git-lfs')) ? [bin, execPath] : [bin],
  };
};

/**
 * Resolve the supervisor beside the launched utility entry, even when this module lives in a shared bundle chunk.
 * Source execution retains the provider's default supervisor.
 *
 * @returns The bundled supervisor, or `undefined` during source execution.
 */
export const bundledShellSupervisor = (): SandboxShellProviderOptions['supervisor'] => {
  if (import.meta.url.endsWith('.ts')) {
    return undefined;
  }
  const entry = process.argv[1];
  if (!entry) {
    throw new Error('The desktop shell utility has no launched entry path');
  }
  return { executablePath: process.execPath, arguments: [join(dirname(entry), 'shell-supervisor.js')] };
};

/** The helper's file name, packaged under `<resources>/sandbox/` and built by `sandbox:build:windows-sandbox`. */
const windowsSandboxHelperName = 'tau-windows-sandbox.exe';

/**
 * Where the Windows shell sandbox helper is: `TAU_WINDOWS_SANDBOX_HELPER` when set; in source execution, the release
 * build in the sandbox library's Cargo target; packaged, `<resources>/sandbox/tau-windows-sandbox.exe`. It does not
 * check that the file exists.
 *
 * @param input - The environment, Electron's resources folder and whether this module runs from source; each defaults
 *   to this process's own.
 * @returns The helper path, or `undefined` for a bundled module with no resources folder.
 */
export const bundledWindowsSandboxHelper = (
  input: Readonly<{
    environment?: HostEnvironment | undefined;
    resourcesPath?: string | undefined;
    source?: boolean | undefined;
  }> = {},
): string | undefined => {
  const override = (input.environment ?? process.env)['TAU_WINDOWS_SANDBOX_HELPER'];
  if (override !== undefined && override !== '') {
    return override;
  }
  if (input.source ?? import.meta.url.endsWith('.ts')) {
    return fileURLToPath(
      new URL(
        `../../../../libs/sandbox/windows-sandbox/target/x86_64-pc-windows-msvc/release/${windowsSandboxHelperName}`,
        import.meta.url,
      ),
    );
  }
  const resources = input.resourcesPath ?? (Reflect.get(process, 'resourcesPath') as string | undefined);
  return resources === undefined || resources === ''
    ? undefined
    : win32.join(resources, 'sandbox', windowsSandboxHelperName);
};

/**
 * The Windows sandbox helper this host composes, or `undefined` while the sandbox is off: only with
 * `TAU_WINDOWS_SHELL_SANDBOX=1` (until the WIN-X64 conformance row is green on a merged head, Q15) and a helper that
 * exists.
 *
 * @param environment - The host environment.
 * @returns The helper path.
 */
const enabledWindowsSandboxHelper = (environment: HostEnvironment): string | undefined => {
  if (environment['TAU_WINDOWS_SHELL_SANDBOX'] !== '1') {
    return undefined;
  }
  const helper = bundledWindowsSandboxHelper({ environment });
  return helper !== undefined && existsSync(helper) ? helper : undefined;
};

/** The outcome of {@link setUpWindowsShellSandbox}. @public */
export type WindowsShellSandboxSetup = Readonly<{ status: 'set-up' }> | Readonly<{ status: 'failed'; message: string }>;

/** Run one program and answer its standard output; rejects on a nonzero exit. */
type RunProgram = (
  file: string,
  arguments_: readonly string[],
  options: Readonly<{ timeoutMilliseconds: number }>,
) => Promise<string>;

const runProgram: RunProgram = async (file, arguments_, { timeoutMilliseconds }) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      [...arguments_],
      { windowsHide: true, timeout: timeoutMilliseconds, maxBuffer: 64 * 1024 },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve(stdout);
        } else {
          reject(new Error(`${error.message} ${stderr}`.trim(), { cause: error }));
        }
      },
    );
  });

/** A PowerShell single-quoted literal. */
const powerShellLiteral = (value: string): string => `'${value.replaceAll("'", "''")}'`;

/**
 * Run the Windows shell sandbox's one-time setup: the helper's `setup --for-user <SID>`, elevated through the fixed
 * Windows PowerShell's `Start-Process -Verb RunAs -Wait`, so Windows shows one administrator prompt (D15). The SID is the
 * current person's, read with System32's `whoami /user`; their host is the one that may read the sandbox password.
 * Nothing calls it yet; the Terminal's setup affordance will.
 *
 * @public
 * @param helperPath - The helper ({@link bundledWindowsSandboxHelper}).
 * @param options - The host environment, for `SystemRoot`, and the program runner; injectable for tests.
 * @returns Whether setup completed; a declined prompt or a failed setup answers `failed`.
 */
export const setUpWindowsShellSandbox = async (
  helperPath: string,
  options: Readonly<{
    environment?: HostEnvironment | undefined;
    run?: RunProgram | undefined;
  }> = {},
): Promise<WindowsShellSandboxSetup> => {
  const environment = options.environment ?? process.env;
  const run = options.run ?? runProgram;
  const systemRoot = environment['SystemRoot'] ?? environment['SYSTEMROOT'] ?? String.raw`C:\Windows`;
  const system32 = win32.join(systemRoot, 'System32');
  let sid: string;
  try {
    const identity = await run(win32.join(system32, 'whoami.exe'), ['/user', '/fo', 'csv', '/nh'], {
      timeoutMilliseconds: 10_000,
    });
    const match = /"(S-1-5-21(?:-\d+)+)"\s*$/u.exec(identity.trim());
    if (match?.[1] === undefined) {
      return {
        status: 'failed',
        message: 'Tau could not read your Windows account.',
      };
    }
    sid = match[1];
  } catch (error) {
    return {
      status: 'failed',
      message: `Tau could not read your Windows account: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$setup = Start-Process -FilePath ${powerShellLiteral(helperPath)} -ArgumentList @('setup', '--for-user', ${powerShellLiteral(sid)}) -Verb RunAs -Wait -PassThru`,
    'exit $setup.ExitCode',
  ].join('; ');
  try {
    await run(
      win32.join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
      { timeoutMilliseconds: 10 * 60_000 },
    );
    return { status: 'set-up' };
  } catch (error) {
    return {
      status: 'failed',
      message: `The Windows shell sandbox was not set up: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

/** Why an enabled Windows sandbox has no shell yet: its one-time elevated setup has not run. */
const windowsSetupNeeded: ShellUnavailable = {
  status: 'unavailable',
  code: 'sandbox-unavailable',
  message: 'The Windows shell sandbox is not set up on this device.',
  recovery:
    'Tau needs one administrator approval to set up the Windows shell sandbox. Approve the Windows prompt when Tau asks, then open the shell again.',
};

/**
 * The one provider for this platform, chosen once (D3). macOS ships its Terminal with the PTY rows unverified (operator
 * ruling 2026-10-24T20:45Z). Windows composes the restricted-token provider only with `TAU_WINDOWS_SHELL_SANDBOX=1` and
 * the helper present (Q15); otherwise it has none.
 *
 * @param options - The platform, bubblewrap, home and, on Windows, the environment that enables the sandbox.
 * @returns The provider, or `undefined` when this platform has none.
 */
export const desktopShellProvider = (
  options: Pick<DesktopShellOptions, 'bwrapPath' | 'home' | 'standInJournal' | 'storeGuardPath' | 'environment'> &
    Partial<Pick<DesktopShellOptions, 'appDataRoots'>> &
    Readonly<{ platform: NodeJS.Platform }>,
): ShellProvider | undefined => {
  const supervisor = bundledShellSupervisor();
  const custody = desktopShellCustody(options.appDataRoots ?? []);
  const shared = {
    ...(supervisor === undefined ? {} : { supervisor }),
    ...(options.home === undefined ? {} : { home: options.home }),
    ...(custody === undefined ? {} : { custody }),
  };
  switch (options.platform) {
    case 'linux': {
      return createSandboxShellProvider({
        ...shared,
        ...(options.bwrapPath === undefined ? {} : { bwrapPath: options.bwrapPath }),
        ...(options.standInJournal === undefined ? {} : { standInJournal: options.standInJournal }),
        ...(options.storeGuardPath === undefined ? {} : { storeGuardPath: options.storeGuardPath }),
      });
    }
    case 'darwin': {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- the provider's own option name.
      return createSandboxShellProvider({ ...shared, macOSTerminal: true });
    }
    case 'win32': {
      const helperPath = enabledWindowsSandboxHelper(options.environment ?? process.env);
      return helperPath === undefined
        ? undefined
        : createWindowsShellProvider({
            helperPath,
            ...(options.home === undefined ? {} : { home: options.home }),
            ...(custody === undefined ? {} : { custody }),
          });
    }
    default: {
      return undefined;
    }
  }
};

/**
 * Where the sandbox provider keeps its execution receipts (I7): in Tau's own app data, which every launch denies whole
 * and which survives a restart. Private roots stay in the system temporary directory, the shell service's default,
 * because a launch must be able to write them.
 *
 * @param appDataRoots - Tau's app data roots, Electron `userData` first.
 * @returns The custody namespace, or `undefined` for the provider's default when there is no app data.
 */
export const desktopShellCustody = (
  appDataRoots: readonly string[],
): Readonly<{ directory: string; sessionDirectory: string }> | undefined => {
  const [appData] = appDataRoots;
  return appData === undefined ? undefined : { directory: join(appData, 'shell-custody'), sessionDirectory: tmpdir() };
};

/** Why a platform with no provider has no shell; matches `probeHostShell`'s own Windows answer. */
const noProvider = (platform: NodeJS.Platform): ShellUnavailable =>
  platform === 'win32'
    ? {
        status: 'unavailable',
        code: 'sandbox-unavailable',
        message: 'The Windows shell sandbox is not part of this Tau build.',
        recovery: 'Use Tau on macOS or Linux for the shell and Terminal until the Windows sandbox ships.',
      }
    : {
        status: 'unavailable',
        code: 'platform-unsupported',
        message: `${platform} has no supported shell sandbox.`,
        recovery: 'Use Tau on macOS or Linux for the shell and Terminal.',
      };

/**
 * Every project's runs as one read-only map: a run id is unique to the project host that admitted it.
 */
class ProjectCheckouts implements ReadonlyMap<string, ShellCheckout> {
  public readonly projects = new Map<string, DesktopShellCheckouts>();

  public get size(): number {
    return this.merged().size;
  }

  public get(runId: string): ShellCheckout | undefined {
    for (const checkouts of this.projects.values()) {
      const checkout = checkouts.get(runId);
      if (checkout !== undefined) {
        return checkout;
      }
    }
    return undefined;
  }

  public has(runId: string): boolean {
    return this.get(runId) !== undefined;
  }

  public forEach(
    callback: (value: ShellCheckout, key: string, map: ReadonlyMap<string, ShellCheckout>) => void,
    thisArgument?: unknown,
  ): void {
    for (const [key, value] of this.merged()) {
      callback.call(thisArgument, value, key, this);
    }
  }

  public entries(): MapIterator<[string, ShellCheckout]> {
    return this.merged().entries();
  }

  public keys(): MapIterator<string> {
    return this.merged().keys();
  }

  public values(): MapIterator<ShellCheckout> {
    return this.merged().values();
  }

  public [Symbol.iterator](): MapIterator<[string, ShellCheckout]> {
    return this.entries();
  }

  private merged(): Map<string, ShellCheckout> {
    return new Map([...this.projects.values()].flatMap((checkouts) => [...checkouts]));
  }
}

/**
 * Compose the desktop's shell.
 *
 * @param options - App data, admitted roots and the platform's prerequisites.
 * @returns The memoized probe and the per-project shell getter.
 */
export const createDesktopShell = (options: DesktopShellOptions): DesktopShell => {
  const platform = options.platform ?? process.platform;
  const checkouts = new ProjectCheckouts();
  const hooks = new Map<string, DesktopShellProjectHooks>();
  /* A run belongs to the one project whose host admitted it; a run no project knows reads Ask. */
  const hooksOfRun = (runId: string): DesktopShellProjectHooks | undefined => {
    for (const [projectRoot, projectCheckouts] of checkouts.projects) {
      if (projectCheckouts.has(runId)) {
        return hooks.get(projectRoot);
      }
    }
    return undefined;
  };
  const permissionModeOf = async (runId: string): Promise<PermissionMode> =>
    (await hooksOfRun(runId)?.permissionModeOf?.(runId)) ?? 'ask';
  let probing: Promise<ShellProbe> | undefined;
  let recording: HostShell | undefined;

  const probe = async (): Promise<ShellProbe> => {
    probing ??= (async (): Promise<ShellProbe> => {
      const environment = options.environment ?? process.env;
      const provider =
        options.provider ??
        desktopShellProvider({
          platform,
          bwrapPath: options.bwrapPath,
          home: options.home,
          appDataRoots: options.appDataRoots,
          standInJournal: options.standInJournal,
          storeGuardPath: options.storeGuardPath,
          environment,
        });
      /* An enabled Windows sandbox runs nothing until its one elevated setup has written the install record. */
      const windowsHelper =
        platform === 'win32' && options.provider === undefined ? enabledWindowsSandboxHelper(environment) : undefined;
      const windowsStatus =
        windowsHelper === undefined ? undefined : await readWindowsSandboxStatus(windowsHelper, { environment });
      const notSetUp = windowsStatus?.installed === false ? windowsSetupNeeded : undefined;
      const outcome =
        provider === undefined
          ? noProvider(platform)
          : (notSetUp ??
            (await probeHostShell({
              /* One sandbox account serves every Windows launch: one Terminal, and agent calls one at a time (A23). */
              ...(platform === 'win32' ? { maxTerminals: 1, maxExecutions: 1 } : {}),
              provider,
              checkouts,
              appDataRoots: options.appDataRoots,
              projectRoots: () => [...new Set([...checkouts.projects.keys(), ...(options.projectRoots?.() ?? [])])],
              platform,
              ...(options.home === undefined ? {} : { home: options.home }),
              ...(options.toolchain === undefined ? {} : { toolchain: options.toolchain }),
              permissionModeOf,
              /* I7: an earlier host's agent receipts wait for the project whose run records still name them. */
              projectExecutions: () =>
                [...checkouts.projects.values()].flatMap((projectCheckouts) =>
                  projectCheckouts.executions === undefined ? [] : [projectCheckouts.executions],
                ),
            }).catch(
              (error: unknown): ShellUnavailable => ({
                status: 'unavailable',
                code: 'sandbox-unavailable',
                message: `The shell sandbox could not be checked: ${error instanceof Error ? error.message : String(error)}`,
                recovery: 'Restart Tau. If it happens again, reinstall Tau to restore its sandbox components.',
              }),
            )));
      recording =
        outcome.status === 'available'
          ? {
              ...outcome.shell,
              run: async (request) => {
                const recordCall = hooksOfRun(request.runId)?.recordCall;
                const output = await outcome.shell.run(request);
                await recordCall?.({ request, output }).catch((error: unknown) => {
                  options.log?.('shell.record-failed', error instanceof Error ? error.message : String(error), 'warn');
                });
                return output;
              },
            }
          : undefined;
      options.log?.(
        'shell.probe',
        outcome.status === 'available'
          ? { status: 'available', identity: outcome.shell.identity }
          : {
              status: 'unavailable',
              code: outcome.code,
              message: outcome.message,
              ...(outcome.diagnostic === undefined ? {} : { diagnostic: outcome.diagnostic }),
            },
        outcome.status === 'available' ? undefined : 'warn',
      );
      return outcome;
    })();
    return probing;
  };

  return {
    probe,
    forProject: (projectRoot, projectCheckouts, projectHooks) => {
      checkouts.projects.set(projectRoot, projectCheckouts);
      if (projectHooks === undefined) {
        hooks.delete(projectRoot);
      } else {
        hooks.set(projectRoot, projectHooks);
      }
      /* async-iife: bootstrap -- a project that can answer for its runs lets startup recovery finish (I7). */
      void (async (): Promise<void> => {
        const outcome = await probe();
        if (outcome.status === 'available') {
          await outcome.shell.reconcile?.();
        }
      })();
      return () => recording;
    },
    release: (projectRoot) => {
      checkouts.projects.delete(projectRoot);
      hooks.delete(projectRoot);
    },
  };
};
