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
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { probeHostShell } from '@taucad/host';
import type {
  HostShell,
  PermissionMode,
  ShellCheckout,
  ShellOutput,
  ShellProjectExecutions,
  ShellProbe,
  ShellRunRequest,
  ShellUnavailable,
} from '@taucad/host';
import { createSandboxShellProvider } from '@taucad/native-process-core/shell';
import type { SandboxShellProviderOptions, ShellProvider } from '@taucad/native-process-core/shell';

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
  /** Injected for tests; otherwise {@link desktopShellProvider}. */
  provider?: ShellProvider | undefined;
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

/**
 * The one provider for this platform, chosen once (D3). macOS ships its Terminal with the PTY rows unverified (operator
 * ruling 2026-10-24T20:45Z). Windows has no provider in this build (Q15 adds its branch here).
 *
 * @param options - The platform, bubblewrap and home.
 * @returns The provider, or `undefined` when this platform has none.
 */
export const desktopShellProvider = (
  options: Pick<DesktopShellOptions, 'bwrapPath' | 'home' | 'standInJournal'> &
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
      });
    }
    case 'darwin': {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- the provider's own option name.
      return createSandboxShellProvider({ ...shared, macOSTerminal: true });
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
      const provider =
        options.provider ??
        desktopShellProvider({
          platform,
          bwrapPath: options.bwrapPath,
          home: options.home,
          appDataRoots: options.appDataRoots,
          standInJournal: options.standInJournal,
        });
      const outcome =
        provider === undefined
          ? noProvider(platform)
          : await probeHostShell({
              provider,
              checkouts,
              appDataRoots: options.appDataRoots,
              projectRoots: () => [...new Set([...checkouts.projects.keys(), ...(options.projectRoots?.() ?? [])])],
              platform,
              ...(options.home === undefined ? {} : { home: options.home }),
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
            );
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
