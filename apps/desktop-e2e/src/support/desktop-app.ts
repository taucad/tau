/* oxlint-disable no-await-in-loop -- Teardown steps are intentionally sequential. */
/* eslint-disable @typescript-eslint/naming-convention -- Environment variables retain their wire names. */
import { mkdtemp, mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as wait } from 'node:timers/promises';
import type * as Electron from 'electron';
import type { BrowserWindow, DownloadItem, Event, IpcMainEvent, UtilityProcess } from 'electron';
import { _electron as electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';
import { expect, onTestFinished } from 'vitest';
import { captureChatLogs, chatLogDestination } from '@taucad/formal/capture';
import {
  desktopE2EApiUrl,
  desktopE2ECompletedArtifact,
  desktopE2EFrontendUrl,
  desktopE2EPackagedExecutable,
} from '#support/config.js';

/**
 * Electron launch + diagnostics for the desktop smoke suite (work item Z1).
 *
 * Packaged-directory mode, exactly as the shell blueprint's L5 status section
 * describes: `electron.launch({ args: [apps/desktop] })` against the built
 * `dist/main/index.js`, with the three required environment names, the A7
 * `TAU_DESKTOP_TOKEN` seed and the `TAU_E2E_PICK_DIRECTORY` dialog override.
 * Every run gets a throwaway `--user-data-dir`, which is what makes a second
 * run idempotent: Home, the granted-root store and IndexedDB all start empty.
 */

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
/* Overridable because `nx run ui:dev:desktop` empties `apps/ui/desktop/build`
 * on start (it re-copies `public/` there): a developer's live desktop session
 * and this suite would otherwise fight over one directory. Point the suite at
 * a snapshot of a built bundle instead. */
const clientRoot = process.env['TAU_DESKTOP_CLIENT_ROOT'] ?? join(workspaceRoot, 'apps/ui/desktop/build/client');
const desktopRoot = join(workspaceRoot, 'apps/desktop');
const defaultPackagedExecutable = join(desktopRoot, 'package-out/Tau-darwin-arm64/Tau.app/Contents/MacOS/Tau');
const diagnosticsRoot = join(workspaceRoot, 'out/test-results/desktop-e2e');
/** Milliseconds. The opt-in startup probe begins only if tracing remains pending. */
const traceProbeDelay = 2000;
/** Milliseconds. A main-process observation cannot extend a failed startup indefinitely. */
const traceProbeMainLimit = 5000;
/** Milliseconds between the two renderer CPU samples. */
const traceProbeCpuInterval = 1000;

const observePendingTrace = async ({
  application,
  directory,
  signal,
  startupStartedAt,
  traceEnter,
  controlNoMainIpc,
}: Readonly<{
  application: ElectronApplication;
  directory: string;
  signal: AbortSignal;
  startupStartedAt: number;
  /** Milliseconds since startup began. */
  traceEnter: number;
  controlNoMainIpc: boolean;
}>): Promise<void> => {
  const observation: {
    status: string;
    samples: unknown[];
    /** Milliseconds since startup began. */
    traceEnter: number;
    mainIpc: Array<{
      /** Milliseconds since startup began. */ enter: number;
      /** Milliseconds since startup began. */ exit?: number;
      /** Milliseconds since startup began; may precede actual IPC settlement on deadline. */
      raceSettled?: number;
    }>;
    errorName?: string;
  } = { status: 'waiting', samples: [], traceEnter, mainIpc: [] };
  const path = join(directory, 'trace-pending.json');
  let pendingWrite: Promise<void> = Promise.resolve();
  const persist = async (): Promise<void> => {
    const snapshot = JSON.stringify(observation);
    const previousWrite = pendingWrite;
    pendingWrite = (async (): Promise<void> => {
      try {
        await previousWrite;
      } catch {
        // A later observation still gets its own attempt if an earlier write failed.
      }
      await writeFile(path, snapshot);
    })();
    await pendingWrite;
  };
  const read = async () => {
    const timing: { enter: number; exit?: number; raceSettled?: number } = {
      enter: performance.now() - startupStartedAt,
    };
    observation.mainIpc.push(timing);
    const mainDeadlineController = new AbortController();
    let readRaceSettled = false;
    try {
      const mainDeadline = async (): Promise<never> => {
        await wait(traceProbeMainLimit, undefined, {
          signal: AbortSignal.any([signal, mainDeadlineController.signal]),
        });
        throw new Error('main-evaluate-timeout');
      };
      const evaluate = async () => {
        try {
          return await application.evaluate(({ app, BrowserWindow }) => {
            const windows = BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed());
            if (windows.length !== 1) {
              return {
                status: windows.length === 0 ? 'missing-window' : 'ambiguous-window',
                windowCount: windows.length,
              } as const;
            }
            const contents = windows[0]!.webContents;
            const rendererPid = contents.getOSProcessId();
            const frames = contents.mainFrame.framesInSubtree;
            const selected = {
              windowCount: 1,
              webContentsId: contents.id,
              rendererPid,
              loading: contents.isLoading(),
              loadingMainFrame: contents.isLoadingMainFrame(),
              waitingForResponse: contents.isWaitingForResponse(),
              crashed: contents.isCrashed(),
              appDocument: contents.getURL().startsWith('app://tau/'),
              frameCount: frames.length,
              frames: frames.slice(0, 16).map((frame) => ({
                processId: frame.processId,
                routingId: frame.routingId,
                detached: frame.detached,
              })),
            };
            if (rendererPid <= 0) {
              return { status: 'missing-renderer', ...selected } as const;
            }
            const metrics = app.getAppMetrics().filter((metric) => metric.pid === rendererPid);
            if (metrics.length !== 1) {
              return {
                status: metrics.length === 0 ? 'missing-metric' : 'ambiguous-metric',
                ...selected,
              } as const;
            }
            const metric = metrics[0]!;
            return {
              status: 'selected',
              ...selected,
              creationTime: metric.creationTime,
              cpu: {
                percentCPUUsage: metric.cpu.percentCPUUsage,
                cumulativeCPUUsage: metric.cpu.cumulativeCPUUsage,
              },
            } as const;
          });
        } finally {
          timing.exit = performance.now() - startupStartedAt;
          if (readRaceSettled) {
            // The observation race already ended; retain the later real IPC result time.
            try {
              await persist();
            } catch {
              // Private diagnostics never replace the original IPC result or error.
            }
          }
        }
      };
      return await Promise.race([evaluate(), mainDeadline()]);
    } finally {
      readRaceSettled = true;
      timing.raceSettled = performance.now() - startupStartedAt;
      mainDeadlineController.abort();
    }
  };
  try {
    await persist();
    await wait(traceProbeDelay, undefined, { signal });
    if (controlNoMainIpc) {
      await persist();
      await wait(traceProbeCpuInterval, undefined, { signal });
      observation.status = 'control-no-main-ipc';
      return;
    }
    const first = await read();
    signal.throwIfAborted();
    observation.samples.push(first);
    await persist();
    if (first.status !== 'selected') {
      observation.status = first.status;
      return;
    }
    await wait(traceProbeCpuInterval, undefined, { signal });
    const second = await read();
    signal.throwIfAborted();
    observation.samples.push(second);
    observation.status =
      second.status === 'selected' &&
      second.rendererPid === first.rendererPid &&
      second.creationTime === first.creationTime &&
      second.webContentsId === first.webContentsId
        ? 'selected'
        : second.status === 'selected'
          ? 'renderer-changed'
          : second.status;
  } catch (error) {
    observation.status = signal.aborted
      ? signal.reason === 'test-finished'
        ? 'test-finished'
        : 'trace-settled'
      : error instanceof Error && error.message === 'main-evaluate-timeout'
        ? 'main-evaluate-timeout'
        : 'main-evaluate-refused';
    if (!signal.aborted) {
      observation.errorName = error instanceof Error ? error.name : typeof error;
    }
  } finally {
    await persist();
  }
};

/** Select the complete descendant command records from one successful ps snapshot. */
export const desktopDescendants = (
  electronPid: number | undefined,
  snapshot: string,
): ReadonlyArray<{ pid: number; command: string }> => {
  const records = snapshot
    .trim()
    .split('\n')
    .flatMap((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/u.exec(line);
      return match ? [{ pid: Number(match[1]), parent: Number(match[2]), command: match[3] ?? '' }] : [];
    });
  const parents = new Map(records.map(({ pid, parent }) => [pid, parent]));
  if (
    electronPid === undefined ||
    !Number.isSafeInteger(electronPid) ||
    electronPid <= 0 ||
    !parents.has(electronPid)
  ) {
    throw new Error('Electron owner is absent or invalid');
  }
  return records
    .filter(({ pid }) => {
      if (pid === electronPid) {
        return false;
      }
      const visited = new Set<number>();
      let current: number | undefined = pid;
      while (current && !visited.has(current)) {
        if (current === electronPid) {
          return true;
        }
        visited.add(current);
        current = parents.get(current);
      }
      return false;
    })
    .map(({ pid, command }) => ({ pid, command }));
};
const completedArtifactForbiddenEnvironment = [
  'NODE_OPTIONS',
  'NODE_PATH',
  'TAU_BUILD123D_RESOURCE_ROOT',
  'TAU_DESKTOP_CLIENT_ROOT',
  'TAU_PICOGK_RESOURCE_ROOT',
] as const;

/**
 * WebGPU launch profile. The default is the hardware adapter this Mac has;
 * headless runners without one set `TAU_E2E_WEBGPU_PROFILE=software`. Copied
 * from `apps/ui-e2e/src/support/webgpu-profile.ts` rather than imported —
 * cross-e2e-project source imports are not a dependency this suite should own.
 */
const webGpuArguments = (): readonly string[] => {
  const profile = process.env['TAU_E2E_WEBGPU_PROFILE'] ?? 'hardware';
  if (profile === 'software') {
    return ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader'];
  }
  if (profile === 'hardware') {
    return ['--enable-unsafe-webgpu'];
  }
  throw new Error(`TAU_E2E_WEBGPU_PROFILE must be 'software' or 'hardware'; received '${profile}'.`);
};

/** One launched desktop app plus everything a spec needs to assert about it. */
export type DesktopSession = {
  readonly application: ElectronApplication;
  /** The app's node-backed Home, `<userData>/home`. */
  readonly homeRoot: string;
  readonly page: Page;
  /**
   * The shell's rotating diagnostics log. Main names this directory to the
   * kernel utility through `TAU_DESKTOP_LOG_DIR`, so the `kernel.engine` line
   * that carries the resolved engine version lands here (N6).
   */
  readonly logPath: string;
  /** The absolute path `window.tau.dialog.selectDirectory()` resolves to. */
  readonly pickedDirectory: string;
  /** Every PostHog-shaped request any renderer made since launch (D13: zero on desktop). */
  readonly analyticsRequests: readonly string[];
  /** Chromium net log begun before the first renderer navigation. */
  readonly startupNetworkLogPath: string | undefined;
  /** Write trace, screenshot, process output and `desktop.log` under `out/`. */
  readonly capture: (label: string) => Promise<string>;
  readonly close: () => Promise<void>;
};

/** One served renderer request, correlated to the child receiving its runtime port. */
export type DesktopRuntimeLease = {
  readonly requestId: string;
  readonly webContentsId: number;
  readonly frameProcessId: number;
  readonly frameRoutingId: number;
  readonly context: Readonly<Record<string, string>>;
  hostId?: string;
  pid?: number;
  exitCode?: number;
  gap?: string;
};

type DesktopRuntimeLeaseState = typeof globalThis & {
  tauE2eRuntimeLeases?: DesktopRuntimeLease[];
  tauE2eRestoreRuntimeLeases?: () => void;
};

/** Serializable test installer: observe real handoffs inside the synchronous broker dispatch. */
export const installDesktopRuntimeLeaseObservation = ({
  ipcMain,
  utilityProcess,
}: Pick<typeof Electron, 'ipcMain' | 'utilityProcess'>): void => {
  const state = globalThis as DesktopRuntimeLeaseState;
  if (state.tauE2eRestoreRuntimeLeases) {
    throw new Error('Runtime lease observation is already installed.');
  }
  const leases: DesktopRuntimeLease[] = [];
  state.tauE2eRuntimeLeases = leases;
  const originalFork = utilityProcess.fork;
  const originalEmit = ipcMain.emit;
  const children: Array<() => void> = [];
  let active: { lease: DesktopRuntimeLease; child?: UtilityProcess; handoffs: number } | undefined;
  const fork = ((...args: Parameters<typeof originalFork>) => {
    const child = originalFork(...args);
    if (args[2]?.serviceName !== 'tau-kernel-host') {
      return child;
    }
    const originalPost = child.postMessage;
    let lease: DesktopRuntimeLease | undefined;
    let { pid } = child;
    const spawned = (): void => {
      pid = child.pid;
      if (lease) {
        lease.pid = pid;
      }
    };
    const exited = (code: number): void => {
      if (lease) {
        lease.pid = pid;
        lease.exitCode = code;
      }
    };
    const post = ((message: unknown, transfer?: Parameters<typeof originalPost>[1]) => {
      originalPost.call(child, message, transfer);
      const frame = message as { taucadRuntime?: unknown; runtimePortIndex?: unknown } | undefined;
      if (
        active &&
        frame?.taucadRuntime === true &&
        typeof frame.runtimePortIndex === 'number' &&
        Number.isSafeInteger(frame.runtimePortIndex) &&
        frame.runtimePortIndex >= 0 &&
        transfer?.[frame.runtimePortIndex]
      ) {
        active.handoffs += 1;
        active.child = child;
        lease = active.lease;
        lease.pid = pid;
      }
    }) as typeof child.postMessage;
    const restore = (): void => {
      child.postMessage = originalPost;
      child.off('spawn', spawned);
      child.off('exit', exited);
    };
    try {
      child.postMessage = post;
      child.once('spawn', spawned);
      child.once('exit', exited);
    } catch {
      // An unavailable observation seam must not change the real broker's admission.
      try {
        restore();
      } catch {
        /* The test will reject the missing handoff. */
      }
    }
    children.push(restore);
    return child;
  }) as typeof utilityProcess.fork;
  const emit = ((...args: Parameters<typeof originalEmit>) => {
    const channel: unknown = args[0];
    const event: unknown = args[1];
    const payload: unknown = args[2];
    const request = payload as { requestId?: unknown; context?: Record<string, string> } | undefined;
    const incoming = event as IpcMainEvent | undefined;
    const target = incoming?.senderFrame;
    if (channel !== 'taucad:connect-runtime' || typeof request?.requestId !== 'string' || !incoming || !target) {
      return originalEmit.apply(ipcMain, args);
    }
    const lease: DesktopRuntimeLease = {
      requestId: request.requestId,
      webContentsId: incoming.sender.id,
      frameProcessId: target.processId,
      frameRoutingId: target.routingId,
      context: { ...request.context },
      gap: 'no-synchronous-served-handoff',
    };
    leases.push(lease);
    const prior = active;
    const scope: NonNullable<typeof active> = { lease, handoffs: 0 };
    const originalRelay = target.postMessage;
    const relay = ((relayChannel: string, message: unknown, transfer?: Parameters<typeof originalRelay>[2]) => {
      originalRelay.call(target, relayChannel, message, transfer);
      const frame = message as { requestId?: unknown; hostId?: unknown } | undefined;
      if (
        active === scope &&
        relayChannel === 'taucad:connect-runtime:port' &&
        frame?.requestId === lease.requestId &&
        typeof frame.hostId === 'string' &&
        frame.hostId.length > 0 &&
        transfer?.length === 1
      ) {
        if (lease.hostId !== undefined) {
          lease.gap = 'ambiguous-frame-relay';
        } else if (scope.handoffs === 1 && scope.child) {
          lease.hostId = frame.hostId;
          delete lease.gap;
        } else {
          lease.hostId = frame.hostId;
          lease.gap = scope.handoffs === 0 ? 'unobserved-child' : 'ambiguous-child-handoff';
          delete lease.pid;
        }
      }
    }) as typeof target.postMessage;
    active = scope;
    try {
      target.postMessage = relay;
    } catch {
      lease.gap = 'unavailable-frame-observation';
    }
    try {
      return originalEmit.apply(ipcMain, args);
    } finally {
      if (lease.gap === undefined && scope.handoffs !== 1) {
        lease.gap = 'ambiguous-child-handoff';
        delete lease.pid;
      }
      active = prior;
      try {
        target.postMessage = originalRelay;
      } catch {
        lease.gap = 'frame-restoration-failed';
      }
    }
  }) as typeof ipcMain.emit;
  let forkInstalled = false;
  try {
    utilityProcess.fork = fork;
    forkInstalled = true;
    ipcMain.emit = emit;
  } catch (error) {
    if (forkInstalled) {
      utilityProcess.fork = originalFork;
    }
    delete state.tauE2eRuntimeLeases;
    throw error;
  }
  state.tauE2eRestoreRuntimeLeases = () => {
    utilityProcess.fork = originalFork;
    ipcMain.emit = originalEmit;
    const errors: unknown[] = [];
    for (const restore of children) {
      try {
        restore();
      } catch (error) {
        errors.push(error);
      }
    }
    delete state.tauE2eRestoreRuntimeLeases;
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Runtime lease observation cleanup failed.');
    }
  };
};

/** Install before scaffold or converter acquisition; pre-existing children are never inferred. */
export const observeDesktopRuntimeLeases = async (session: DesktopSession): Promise<void> => {
  await session.application.evaluate(installDesktopRuntimeLeaseObservation);
};

/** Snapshot exact request/host/child identity, including explicit observation gaps. */
export const desktopRuntimeLeases = async (session: DesktopSession): Promise<readonly DesktopRuntimeLease[]> =>
  session.application.evaluate(() => {
    const state = globalThis as DesktopRuntimeLeaseState;
    if (!state.tauE2eRuntimeLeases) {
      throw new Error('Runtime lease observation was not installed.');
    }
    return state.tauE2eRuntimeLeases.map((lease) => ({ ...lease }));
  });

/** Resolve one page-owned served lease, never a new or most recently spawned PID. */
export const waitForDesktopRuntimeLease = async (
  session: DesktopSession,
  page: Page,
  options: {
    readonly requestId?: string;
    readonly previousRequestIds?: readonly string[];
    readonly leaseTimeout?: number;
  } = {},
): Promise<DesktopRuntimeLease & { readonly hostId: string; readonly pid: number }> => {
  const window = await session.application.browserWindow(page);
  const identity = await window.evaluate(({ webContents }: BrowserWindow) => ({
    webContentsId: webContents.id,
    frameProcessId: webContents.mainFrame.processId,
    frameRoutingId: webContents.mainFrame.routingId,
  }));
  let matches: readonly DesktopRuntimeLease[] = [];
  await expect
    .poll(
      async () => {
        const leases = await desktopRuntimeLeases(session);
        matches = leases.filter(
          (lease) =>
            lease.webContentsId === identity.webContentsId &&
            lease.frameProcessId === identity.frameProcessId &&
            lease.frameRoutingId === identity.frameRoutingId &&
            (options.requestId === undefined
              ? lease.context['purpose'] === 'ephemeral' &&
                lease.context['definition'] === 'default' &&
                !options.previousRequestIds?.includes(lease.requestId)
              : lease.requestId === options.requestId),
        );
        return (
          matches.length === 1 &&
          matches[0]?.gap === undefined &&
          Number.isSafeInteger(matches[0]?.pid) &&
          (matches[0]?.pid ?? 0) > 0
        );
      },
      options.leaseTimeout === undefined ? {} : { timeout: options.leaseTimeout },
    )
    .toBe(true);
  const lease = matches[0];
  if (!lease?.hostId || lease.pid === undefined || (lease.gap ?? '') !== '' || matches.length !== 1) {
    throw new Error(`No unique actual runtime lease: ${JSON.stringify(matches)}`);
  }
  return { ...lease, hostId: lease.hostId, pid: lease.pid };
};

/** Require this actual child exit, OS retirement and matching supervised host diagnostics. */
export const expectDesktopRuntimeLeaseExit = async (
  session: DesktopSession,
  lease: DesktopRuntimeLease & { readonly hostId: string; readonly pid: number },
  options: { readonly released: boolean; readonly exitTimeout?: number },
): Promise<void> => {
  await expect
    .poll(
      async () => {
        const leases = await desktopRuntimeLeases(session);
        const observed = leases.find((entry) => entry.requestId === lease.requestId);
        const present = await session.application.evaluate(
          ({ app }, pid) => app.getAppMetrics().some((metric) => metric.pid === pid),
          lease.pid,
        );
        let retired = false;
        try {
          process.kill(lease.pid, 0);
        } catch (error) {
          if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') {
            throw error;
          }
          retired = true;
        }
        const log = await readFile(session.logPath, 'utf8');
        const lines = log.split('\n');
        const supervised = lines.some((line) => {
          const separator = ' kernel.exit ';
          const index = line.indexOf(separator);
          if (index === -1) {
            return false;
          }
          const exit = JSON.parse(line.slice(index + separator.length)) as {
            hostId?: string;
            code?: number;
            released?: boolean;
          };
          return exit.hostId === lease.hostId && exit.code === observed?.exitCode && exit.released === options.released;
        });
        return (
          observed?.gap === undefined &&
          observed?.hostId === lease.hostId &&
          observed.pid === lease.pid &&
          observed.exitCode !== undefined &&
          !present &&
          retired &&
          supervised
        );
      },
      { timeout: options.exitTimeout ?? 60_000 },
    )
    .toBe(true);
};

/** Save and await the next download emitted by the packaged Electron session. */
export const captureNextDesktopDownload = async (
  desktopSession: DesktopSession,
  savePath: string,
  trigger: () => Promise<void>,
): Promise<{ readonly filename: string; readonly path: string }> => {
  await desktopSession.application.evaluate(({ session }, path) => {
    const state = globalThis as typeof globalThis & {
      __TAU_E2E_DOWNLOAD_CLEANUP__?: () => void;
      __TAU_E2E_DOWNLOAD__?: { readonly filename: string; readonly state: string };
    };
    state.__TAU_E2E_DOWNLOAD_CLEANUP__?.();
    delete state.__TAU_E2E_DOWNLOAD__;
    const listener = (_event: Event, item: DownloadItem): void => {
      item.setSavePath(path);
      item.once('done', (_doneEvent, doneState) => {
        state.__TAU_E2E_DOWNLOAD__ = { filename: item.getFilename(), state: doneState };
      });
      session.defaultSession.off('will-download', listener);
    };
    state.__TAU_E2E_DOWNLOAD_CLEANUP__ = () => {
      session.defaultSession.off('will-download', listener);
      delete state.__TAU_E2E_DOWNLOAD_CLEANUP__;
    };
    session.defaultSession.on('will-download', listener);
  }, savePath);
  let download: { readonly filename: string; readonly state: string } | undefined;
  try {
    await trigger();
    await expect
      .poll(
        async () => {
          download = await desktopSession.application.evaluate(() => {
            const state = globalThis as typeof globalThis & {
              __TAU_E2E_DOWNLOAD__?: { readonly filename: string; readonly state: string };
            };
            return state.__TAU_E2E_DOWNLOAD__;
          });
          return download;
        },
        { timeout: 180_000 },
      )
      .toBeDefined();
  } finally {
    await desktopSession.application.evaluate(() => {
      const state = globalThis as typeof globalThis & { __TAU_E2E_DOWNLOAD_CLEANUP__?: () => void };
      state.__TAU_E2E_DOWNLOAD_CLEANUP__?.();
    });
  }
  if (!download) {
    throw new Error('Electron reported no completed download after its session event settled.');
  }
  expect(download.state).toBe('completed');
  return { filename: download.filename, path: savePath };
};

/**
 * Launch the built desktop shell against the suite's dedicated API.
 *
 * @param options - The seeded bearer handed to main through A7, plus any extra
 *   environment the shell needs (`env`) — credential persistence and the
 *   like, all read at launch.
 * @returns The live session.
 */
/** PostHog through Tau's web proxy or directly. */
export const analyticsRequestPattern = /\/api\/ph(?:\/|$)|posthog\.com/iu;

export const launchDesktopApp = async (options: {
  readonly token: string;
  readonly env?: Readonly<Record<string, string>> | undefined;
  readonly packaged?: boolean | undefined;
  readonly useProductionEndpointDefaults?: boolean | undefined;
  /** Reuse a prior throwaway profile for returning-user smoke checks. */
  readonly profileRoot?: string | undefined;
  /** The caller will relaunch this profile and dispose it after the final run. */
  readonly preserveProfile?: boolean | undefined;
  /** Capture startup traffic before Playwright can attach its request listener. */
  readonly captureStartupNetwork?: boolean | undefined;
  /** Collect private renderer state only while the original tracing call is pending. */
  readonly startupDiagnostic?: boolean | undefined;
  /** Private finite control: retain observation timing without sending main-process IPC. */
  readonly startupDiagnosticNoMainIpc?: boolean | undefined;
  /** Unit tests supply an owned launcher without starting a native process. */
  readonly launchElectron?: typeof electron.launch | undefined;
  /** WAV input for Chromium's fake capture driver; leaves the OS microphone unchanged. */
  readonly fakeMicrophonePath?: string | undefined;
}): Promise<DesktopSession> => {
  if (desktopE2ECompletedArtifact && options.packaged === false) {
    throw new Error('A completed-artifact run cannot launch the workspace desktop app.');
  }
  if (
    desktopE2ECompletedArtifact &&
    completedArtifactForbiddenEnvironment.some((name) => options.env?.[name] !== undefined)
  ) {
    throw new Error('A completed-artifact run cannot override Node or packaged runtime resource paths.');
  }
  const userData = options.profileRoot ?? (await mkdtemp(join(tmpdir(), 'tau-desktop-e2e-user-')));
  const startupNetworkLogPath = options.captureStartupNetwork ? join(userData, 'startup-network.json') : undefined;
  /* A fixed, already-lowercase leaf inside the random parent: the workspace
   * slug the UI mints is the folder name slugified, so a `mkdtemp` name with
   * capitals would make the routed URL differ from the directory on disk for
   * no reason. */
  const pickedParent = await mkdtemp(join(tmpdir(), 'tau-desktop-e2e-pick-'));
  const pickedDirectory = join(pickedParent, 'tau-desktop-workspace');
  await mkdir(pickedDirectory, { recursive: true });
  const output: string[] = [];
  const inheritedEnvironment = { ...(process.env as Record<string, string>) };
  const packaged = desktopE2ECompletedArtifact || options.packaged === true;
  const packagedExecutable = desktopE2ECompletedArtifact ? desktopE2EPackagedExecutable() : defaultPackagedExecutable;
  if (desktopE2ECompletedArtifact) {
    delete inheritedEnvironment['NODE_OPTIONS'];
    delete inheritedEnvironment['NODE_PATH'];
    delete inheritedEnvironment['TAU_BUILD123D_RESOURCE_ROOT'];
    delete inheritedEnvironment['TAU_DESKTOP_CLIENT_ROOT'];
    delete inheritedEnvironment['TAU_PICOGK_RESOURCE_ROOT'];
  }
  if (options.useProductionEndpointDefaults) {
    delete inheritedEnvironment['TAU_API_URL'];
    delete inheritedEnvironment['TAU_WEBSOCKET_URL'];
    delete inheritedEnvironment['TAU_FRONTEND_URL'];
  }

  await mkdir(diagnosticsRoot, { recursive: true });
  const startupDirectory = await mkdtemp(join(diagnosticsRoot, 'startup-'));
  const startupStartedAt = performance.now();
  let startupStage = 'electron.launch';
  const owner: { child?: ReturnType<ElectronApplication['process']> } = {};
  const recordStartup = async (stage: string, status: 'pending' | 'failed' | 'returned' = 'pending'): Promise<void> => {
    startupStage = stage;
    await writeFile(
      join(startupDirectory, 'stage.json'),
      JSON.stringify({
        stage,
        status,
        /** Milliseconds since the first startup mark. */
        elapsed: performance.now() - startupStartedAt,
        pid: owner.child?.pid,
      }),
    );
  };
  await recordStartup(startupStage);

  const launchOptions = {
    ...(packaged ? { executablePath: packagedExecutable } : {}),
    args: [
      ...(packaged ? [] : [desktopRoot]),
      `--user-data-dir=${userData}`,
      ...(startupNetworkLogPath ? [`--log-net-log=${startupNetworkLogPath}`] : []),
      ...webGpuArguments(),
      ...(options.fakeMicrophonePath
        ? [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            // Chromium's sandboxed audio service cannot read the test-owned WAV on macOS.
            '--no-sandbox',
            `--use-file-for-fake-audio-capture=${options.fakeMicrophonePath}`,
          ]
        : []),
    ],
    cwd: packaged ? userData : desktopRoot,
    env: {
      ...inheritedEnvironment,
      NODE_ENV: 'production',
      /* Forwarded into `window.ENV` by the shell's client allowlist, where it
       * turns on the `tauDebug` feature flag that mounts
       * `SectionViewTestBridge` — the viewport-framing observable. `ui-e2e`
       * sets the same variable on its UI server for the same reason. */
      TAU_DEBUG: process.env['TAU_DEBUG'] ?? 'true',
      TAU_S3_ENDPOINT: process.env['TAU_S3_ENDPOINT'] ?? 'http://localhost:9000',
      ...(options.useProductionEndpointDefaults
        ? {}
        : {
            TAU_API_URL: desktopE2EApiUrl,
            TAU_WEBSOCKET_URL: desktopE2EApiUrl.replace(/^http/u, 'ws'),
            TAU_FRONTEND_URL: desktopE2EFrontendUrl,
          }),
      ...(packaged ? {} : { TAU_DESKTOP_CLIENT_ROOT: clientRoot }),
      TAU_DESKTOP_TOKEN: options.token,
      TAU_E2E_PICK_DIRECTORY: pickedDirectory,
      /* Printer access codes go to the throwaway profile's file vault, never the
       * person's login keychain, whatever the shell running the suite sets. */
      TAU_SECRET_VAULT: 'file',
      /* The per-user machine store and every other Tau config live in the
       * throwaway profile too, never the person's own. */
      TAU_CONFIG_DIR: join(userData, 'config'),
      ...options.env,
      TAU_E2E_HIDE_WINDOW: '1',
      ...(packaged ? { TAU_E2E_WAIT_FOR_PLAYWRIGHT: '1' } : {}),
    },
  };
  const launch = options.launchElectron ? options.launchElectron(launchOptions) : electron.launch(launchOptions);
  let application: ElectronApplication;
  try {
    application = await launch;
  } catch (error) {
    await recordStartup(startupStage, 'failed').catch(() => undefined);
    throw error;
  }
  const child = application.process();
  owner.child = child;
  let sessionReturned = false;
  let startupFinished = false;
  let traceProbeAbort: AbortController | undefined;
  let traceProbe: Promise<void> | undefined;
  const assertStartupActive = (): void => {
    if (startupFinished) {
      throw new Error('Desktop startup finished before a session was returned.');
    }
  };
  onTestFinished(async () => {
    startupFinished = true;
    traceProbeAbort?.abort('test-finished');
    if (!sessionReturned && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
    await traceProbe?.catch(() => undefined);
  });
  /* Installed before the first window loads, and kept for the whole session, so
   * startup and late traffic are both observed. */
  const analyticsRequests: string[] = [];
  application.context().on('request', (request) => {
    if (analyticsRequestPattern.test(request.url())) {
      analyticsRequests.push(request.url());
    }
  });

  child.stdout?.on('data', (chunk: unknown) => output.push(String(chunk)));
  child.stderr?.on('data', (chunk: unknown) => output.push(String(chunk)));

  /* Anything that throws between `launch` and the returned session would
   * otherwise strand a live Electron — and a stranded shell keeps polling the
   * API, which blows better-auth's 100-per-10 s bucket and 429s the *next*
   * run's sign-up. Kill it here rather than leaving it to a caller that never
   * received a session to close. */
  const consoleErrors: string[] = [];
  let page: Page;
  try {
    /* A packaged launch releases main bootstrap before its first window exists.
     * Configure the main-process test overrides only after that startup boundary. */
    await recordStartup('first-window');
    assertStartupActive();
    page = await application.firstWindow();
    assertStartupActive();
    await recordStartup('dom-content-loaded');
    assertStartupActive();
    await page.waitForLoadState('domcontentloaded');
    assertStartupActive();
    if (options.fakeMicrophonePath) {
      // Chromium recommends disabling DSP for calibrated file microphone input.
      // Keep the real capture driver; change only its audio-processing constraints.
      await recordStartup('audio-init-script');
      assertStartupActive();
      await page.addInitScript(() => {
        const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          if (!constraints?.audio) {
            return capture(constraints);
          }
          return capture({
            ...constraints,
            audio: {
              ...(typeof constraints.audio === 'object' ? constraints.audio : {}),
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
          });
        };
      });
      assertStartupActive();
    }
    await recordStartup('main-overrides');
    assertStartupActive();
    await application.evaluate(({ dialog, shell }, selectedDirectory) => {
      const testState = globalThis as typeof globalThis & { __TAU_E2E_EXTERNAL_URL__?: string };
      shell.openExternal = async (url): Promise<void> => {
        testState.__TAU_E2E_EXTERNAL_URL__ = url;
      };
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedDirectory] });
      dialog.showMessageBox = async () => ({ checkboxChecked: false, response: 1 });
    }, pickedDirectory);
    assertStartupActive();
    page.setDefaultTimeout(60_000);
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    await recordStartup('trace-start');
    assertStartupActive();
    const traceEnter = performance.now() - startupStartedAt;
    const tracingStart = page.context().tracing.start({ screenshots: true, snapshots: true });
    if (options.startupDiagnostic) {
      traceProbeAbort = new AbortController();
      traceProbe = observePendingTrace({
        application,
        directory: startupDirectory,
        signal: traceProbeAbort.signal,
        startupStartedAt,
        traceEnter,
        controlNoMainIpc: options.startupDiagnosticNoMainIpc === true,
      });
      // oxlint-disable-next-line promise/prefer-await-to-then, tau-lint/no-async-iife -- Attach before the original tracing promise settles.
      void traceProbe.catch(() => undefined);
    }
    let traceOutcome: 'fulfilled' | 'rejected' = 'rejected';
    try {
      await tracingStart;
      traceOutcome = 'fulfilled';
    } finally {
      if (options.startupDiagnostic) {
        await writeFile(
          join(startupDirectory, 'trace-settled.json'),
          JSON.stringify({ status: traceOutcome, elapsed: performance.now() - startupStartedAt }),
        ).catch(() => undefined);
      }
      traceProbeAbort?.abort('trace-settled');
      await traceProbe?.catch(() => undefined);
    }
    assertStartupActive();
  } catch (error) {
    child.kill('SIGKILL');
    await recordStartup(startupStage, 'failed').catch(() => undefined);
    /* The shell's own output is the only account of why it went away, and the
     * caller has no session to read it from. */
    throw new Error(`The desktop shell did not survive launch.\n${output.join('')}`, { cause: error });
  }

  let tracing = true;
  let captured = false;

  /** Shallow-ish listing of a directory tree, for the failure report. */
  const tree = async (directory: string, depth = 3): Promise<string[]> => {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    const lines: string[] = [];
    for (const entry of entries) {
      lines.push(join(directory, entry.name));
      if (entry.isDirectory() && depth > 0) {
        lines.push(...(await tree(join(directory, entry.name), depth - 1)));
      }
    }
    return lines;
  };

  const capture = async (label: string): Promise<string> => {
    captured = true;
    const directory = join(diagnosticsRoot, label);
    await mkdir(directory, { recursive: true });
    if (tracing) {
      tracing = false;
      /* A quit-path failure can close the renderer before diagnostics run;
       * retain Home/process/event logs even when its trace can no longer stop. */
      await page
        .context()
        .tracing.stop({ path: join(directory, 'trace.zip') })
        .catch(() => undefined);
    }
    await page
      .screenshot({ path: join(directory, 'screenshot.png'), fullPage: true, timeout: 10_000 })
      .catch(() => undefined);
    const desktopLog = await readFile(join(userData, 'logs/desktop.log'), 'utf8').catch(() => '(no desktop.log)');
    const bodyText = await page
      .locator('body')
      // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- Rendered line breaks are required in the failure report.
      .innerText({ timeout: 10_000 })
      .then((text) => text.slice(0, 2000))
      .catch(() => '(unavailable)');
    const pickedTree = await tree(pickedDirectory);
    const homeTree = await tree(join(userData, 'home'));
    const grants = await readFile(join(userData, 'granted-roots.json'), 'utf8').catch(() => '(none)');
    await writeFile(
      join(directory, 'diagnostics.log'),
      [
        `url: ${page.url()}`,
        `body: ${bodyText}`,
        `userData: ${userData}`,
        `pickedDirectory: ${pickedDirectory}`,
        '--- console errors ---',
        consoleErrors.join('\n'),
        '--- process output ---',
        output.join(''),
        '--- picked directory ---',
        pickedTree.join('\n'),
        '--- home root ---',
        homeTree.join('\n'),
        '--- granted roots ---',
        grants,
        '--- runtime leases ---',
        JSON.stringify(
          await application
            .evaluate(() => (globalThis as DesktopRuntimeLeaseState).tauE2eRuntimeLeases ?? [])
            .catch(() => '(unavailable)'),
        ),
        '--- desktop.log ---',
        desktopLog,
      ].join('\n'),
      'utf8',
    );
    return directory;
  };

  const close = async (): Promise<void> => {
    const wasRunning = child.exitCode === null && child.signalCode === null;
    const [observationCleanup] = await Promise.allSettled([
      application.evaluate(() => {
        (globalThis as DesktopRuntimeLeaseState).tauE2eRestoreRuntimeLeases?.();
      }),
    ]);
    if (tracing) {
      tracing = false;
      await page
        .context()
        .tracing.stop()
        .catch(() => undefined);
    }
    const exited =
      child.exitCode === null && child.signalCode === null
        ? new Promise<void>((resolve) => {
            child.once('exit', () => {
              resolve();
            });
          })
        : Promise.resolve();
    /* Routine fixture disposal bypasses quit holds exercised by their own specs. */
    await Promise.race([
      application
        .evaluate(({ app }) => {
          app.exit(0);
        })
        .catch(() => undefined),
      wait(5000),
    ]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
    await exited;
    /* Field trace validation (formal-verification policy): copy every chat log the
     * app wrote under Home or the picked project before the roots go. */
    const chatLogs = chatLogDestination('desktop-e2e', expect.getState().testPath);
    await captureChatLogs(userData, chatLogs);
    await captureChatLogs(pickedParent, chatLogs);
    /* Keep the evidence a failing run just produced. */
    if (!captured) {
      if (!options.preserveProfile) {
        await rm(userData, { force: true, recursive: true });
      }
      await rm(pickedParent, { force: true, recursive: true });
    }
    if (wasRunning && observationCleanup.status === 'rejected') {
      const error: unknown = observationCleanup.reason;
      throw error;
    }
  };

  try {
    assertStartupActive();
    await recordStartup('session-returned', 'returned');
    assertStartupActive();
  } catch (error) {
    child.kill('SIGKILL');
    await recordStartup(startupStage, 'failed').catch(() => undefined);
    throw new Error(`The desktop shell did not survive launch.\n${output.join('')}`, { cause: error });
  }
  sessionReturned = true;
  return {
    analyticsRequests,
    startupNetworkLogPath,
    application,
    capture,
    close,
    homeRoot: join(userData, 'home'),
    logPath: join(userData, 'logs/desktop.log'),
    page,
    pickedDirectory,
  };
};

/**
 * Hand the shell one `tau://` link the way the OS does.
 *
 * macOS raises `open-url` on `app`; Windows and Linux pass the link in argv and
 * main re-raises it through the same slot. Main's listener is a module-scope
 * `app.on('open-url', …)`, so emitting the event in the main process is the
 * whole delivery — no packaged bundle and no protocol registration required.
 *
 * @param session - The launched shell.
 * @param link - The `tau://` URL, admitted or not.
 * @returns Nothing.
 */
export const deliverDesktopDeepLink = async (session: DesktopSession, link: string): Promise<void> => {
  await session.application.evaluate(({ app }, url) => {
    app.emit('open-url', { preventDefault: () => undefined }, url);
  }, link);
};

/**
 * Complete the production sign-in handoff for a packaged app.
 *
 * The shell opens `${TAU_FRONTEND_URL}/auth/sign-in?redirectTo=/auth/desktop?state=…`
 * in the system browser (captured here by the `shell.openExternal` override) and
 * waits for a `tau://auth/callback` deep link. R4 deleted the loopback listener,
 * so there is no port to fetch: this mints the one-time token the web route would
 * have minted and delivers the callback through `open-url`, the same event macOS
 * raises. Main's listener is installed at module scope, so emitting on `app`
 * reaches it exactly as the OS would.
 */
export const authenticatePackagedDesktop = async (session: DesktopSession, bearerToken: string): Promise<void> => {
  let signInError: unknown;
  // async-iife: the deep-link callback must arrive while renderer sign-in is pending.
  const signIn = (async (): Promise<void> => {
    try {
      await session.page.evaluate(async () => {
        const { tauAuth } = globalThis as typeof globalThis & { tauAuth: { signIn(): Promise<void> } };
        await tauAuth.signIn();
      });
    } catch (error) {
      signInError = error;
    }
  })();
  let externalUrl = '';
  await expect
    .poll(
      async () => {
        externalUrl = await session.application.evaluate(() => {
          const testState = globalThis as typeof globalThis & { __TAU_E2E_EXTERNAL_URL__?: string };
          return testState.__TAU_E2E_EXTERNAL_URL__ ?? '';
        });
        return externalUrl;
      },
      { timeout: 30_000 },
    )
    .not.toBe('');
  const redirect = new URL(externalUrl).searchParams.get('redirectTo');
  if (!redirect) {
    throw new Error(`Packaged desktop sign-in emitted no redirect target: ${externalUrl}`);
  }
  const handoff = new URL(redirect, desktopE2EFrontendUrl);
  const state = handoff.searchParams.get('state');
  if (!state) {
    throw new Error(`Packaged desktop sign-in emitted an invalid handoff target: ${handoff.toString()}`);
  }
  const generated = await fetch(`${desktopE2EApiUrl}/v1/auth/one-time-token/generate`, {
    headers: { authorization: `Bearer ${bearerToken}` },
  });
  if (!generated.ok) {
    throw new Error(`Packaged desktop token generation failed with HTTP ${String(generated.status)}.`);
  }
  const oneTimeToken = ((await generated.json()) as { readonly token?: string }).token;
  if (!oneTimeToken) {
    throw new Error('Packaged desktop token generation returned no token.');
  }
  const callback = new URL('tau://auth/callback');
  callback.searchParams.set('ott', oneTimeToken);
  callback.searchParams.set('state', state);
  await deliverDesktopDeepLink(session, callback.toString());
  await signIn;
  if (signInError !== undefined) {
    throw signInError instanceof Error
      ? signInError
      : new Error('Packaged desktop sign-in failed.', { cause: signInError });
  }
};
