/**
 * The desktop's contained shell (desktop shell blueprint W4; D1, D3, D9, D14, F5).
 *
 * One probe per services utility, run lazily and memoized: it proves the platform's provider and the machine's own shell
 * before anything is offered. Every project host hands in its own run→checkout map, and the one shell service reads a
 * call's checkout from whichever project owns that run, so an unknown run is refused and never defaults to a project.
 * The agent registry reads the probe at every listing, so `shell` appears once the probe is ready and never before; the
 * Terminal (W5) reads the same memoized probe through {@link DesktopShell.probe}.
 *
 * @module
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { probeHostShell } from '@taucad/host';
import type { HostShell, PermissionMode, ShellCheckout, ShellProbe, ShellUnavailable } from '@taucad/host';
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
  /** The chat's permission mode for a run (W9); absent reads Ask. */
  permissionModeOf?: ((runId: string) => Promise<PermissionMode>) | undefined;
  platform?: NodeJS.Platform | undefined;
  home?: string | undefined;
  /** Injected for tests; otherwise {@link desktopShellProvider}. */
  provider?: ShellProvider | undefined;
  log?: ((event: string, detail?: unknown, level?: 'info' | 'warn') => void) | undefined;
}>;

/** @public */
export type DesktopShell = Readonly<{
  /** The memoized probe; the first call starts it. */
  probe: () => Promise<ShellProbe>;
  /**
   * The shell one project's registry offers: register the project's run→checkout map, and read the probe at every
   * listing and call.
   */
  forProject: (projectRoot: string, checkouts: ReadonlyMap<string, ShellCheckout>) => () => HostShell | undefined;
  /** Forget a project's runs once its host is gone. */
  release: (projectRoot: string) => void;
}>;

/**
 * The supervisor the shell provider starts per launch. In the bundled app it is `shell-supervisor.js` beside this
 * utility's own bundle (`electron.vite.config.ts`); from source the provider's own default applies.
 *
 * @returns The supervisor, or `undefined` for the provider's default.
 */
const bundledSupervisor = (): SandboxShellProviderOptions['supervisor'] =>
  import.meta.url.endsWith('.ts')
    ? undefined
    : {
        executablePath: process.execPath,
        arguments: [join(dirname(fileURLToPath(import.meta.url)), 'shell-supervisor.js')],
      };

/**
 * The one provider for this platform, chosen once (D3). macOS ships its Terminal with the PTY rows unverified (operator
 * ruling 2026-10-24T20:45Z). Windows has no provider in this build (Q15 adds its branch here).
 *
 * @param options - The platform, bubblewrap and home.
 * @returns The provider, or `undefined` when this platform has none.
 */
export const desktopShellProvider = (
  options: Pick<DesktopShellOptions, 'bwrapPath' | 'home'> & Readonly<{ platform: NodeJS.Platform }>,
): ShellProvider | undefined => {
  const supervisor = bundledSupervisor();
  const shared = {
    ...(supervisor === undefined ? {} : { supervisor }),
    ...(options.home === undefined ? {} : { home: options.home }),
  };
  switch (options.platform) {
    case 'linux': {
      return createSandboxShellProvider({
        ...shared,
        ...(options.bwrapPath === undefined ? {} : { bwrapPath: options.bwrapPath }),
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
  public readonly projects = new Map<string, ReadonlyMap<string, ShellCheckout>>();

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
 * @param options - App data, admitted roots, the platform's prerequisites and the mode reader.
 * @returns The memoized probe and the per-project shell getter.
 */
export const createDesktopShell = (options: DesktopShellOptions): DesktopShell => {
  const platform = options.platform ?? process.platform;
  const checkouts = new ProjectCheckouts();
  let probing: Promise<ShellProbe> | undefined;
  let settled: ShellProbe | undefined;

  const probe = async (): Promise<ShellProbe> => {
    probing ??= (async (): Promise<ShellProbe> => {
      const provider =
        options.provider ?? desktopShellProvider({ platform, bwrapPath: options.bwrapPath, home: options.home });
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
              ...(options.permissionModeOf === undefined ? {} : { permissionModeOf: options.permissionModeOf }),
            }).catch(
              (error: unknown): ShellUnavailable => ({
                status: 'unavailable',
                code: 'sandbox-unavailable',
                message: `The shell sandbox could not be checked: ${error instanceof Error ? error.message : String(error)}`,
                recovery: 'Restart Tau. If it happens again, reinstall Tau to restore its sandbox components.',
              }),
            );
      settled = outcome;
      options.log?.(
        'shell.probe',
        outcome.status === 'available'
          ? { status: 'available', identity: outcome.shell.identity }
          : { status: 'unavailable', code: outcome.code, message: outcome.message },
        outcome.status === 'available' ? undefined : 'warn',
      );
      return outcome;
    })();
    return probing;
  };

  return {
    probe,
    forProject: (projectRoot, projectCheckouts) => {
      checkouts.projects.set(projectRoot, projectCheckouts);
      void probe();
      return () => (settled?.status === 'available' ? settled.shell : undefined);
    },
    release: (projectRoot) => {
      checkouts.projects.delete(projectRoot);
    },
  };
};
