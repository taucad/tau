/**
 * Electron main-process helpers for Tau runtime utility-process hosts.
 *
 * @public
 */

import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import type { ForkOptions, IpcMain, IpcMainEvent, Session, UtilityProcess, WebRequestFilter } from 'electron';
import { ipcMain as defaultIpcMain, MessageChannelMain, session as defaultSession, utilityProcess } from 'electron';

import { electronRuntimeChannel as runtimeChannel } from '#electron/constants.js';
import { documentHeaders } from '#cross-origin-isolation/index.js';

/**
 * Default IPC channel used by Tau's Electron runtime bridge.
 *
 * @public
 */
export const electronRuntimeChannel = runtimeChannel;

/**
 * Options for {@link installElectronRuntimeHeaders}.
 *
 * @public
 */
export type ElectronRuntimeHeadersOptions = {
  /** Electron session whose responses receive COOP and COEP headers. */
  readonly session?: Session;
};

/**
 * Options for {@link registerElectronRuntimeMain}.
 *
 * @public
 */
export type RegisterElectronRuntimeMainOptions = {
  /** IPC channel shared with preload. Defaults to {@link electronRuntimeChannel}. */
  readonly channel?: string;
  /** Environment passed to each spawned utility process. */
  readonly env?: NodeJS.ProcessEnv;
  /**
   * Executable arguments for each spawned utility process — canonically
   * `['--max-old-space-size=8192']` to raise the utility's V8 heap for large
   * assemblies. Omitted entirely when unset, so Electron's default applies.
   *
   * Caveat: Electron documents `execArgv` only as "arguments passed to the
   * executable" and says nothing about V8 flags. The utility process is a Node
   * environment that parses them, but that is unverified against Electron
   * 36.9.5 here; if a flag does not take effect, pass it as `NODE_OPTIONS`
   * through `env` instead.
   */
  readonly execArgv?: readonly string[];
  /**
   * Electron IPC main implementation, primarily for alternate hosts and tests.
   * Also the admission seam: a view that filters before delegating to the real
   * `ipcMain` gates which frames may fork a utility.
   */
  // ponytail: admission rides the existing ipcMain injection point; add a predicate the day the desktop spike proves the wrapper awkward.
  readonly ipcMain?: IpcMain;
  /** Receives utility-spawn and relay failures. */
  readonly onError?: (error: Error) => void;
  /** Operating-system service name assigned to the utility process. */
  readonly serviceName?: string;
  /** Utility-process standard I/O routing. */
  readonly stdio?: ForkOptions['stdio'];
  /** Built utility-process module that calls `serveElectronRuntime`. */
  readonly utilityEntry: string | URL;
};

/**
 * Disposable main-process runtime broker registration.
 *
 * @public
 */
export type ElectronRuntimeMainHandle = {
  /** Unregister IPC listeners and terminate every utility host owned by this broker. */
  dispose(): void;
};

const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

/* Document headers this handler manages, in canonical casing — the complete
 * canonical set, CORP included. CORP is safe here *because* the handler is
 * registered with a document-only filter (see `documentResponseFilter`): the
 * cross-origin API responses that a `require-corp` document would then reject
 * never reach it. Restoring CORP reverses the earlier unconditional exclusion,
 * whose stated precondition — an unfiltered handler that rewrites every
 * response in the session — no longer holds (see
 * `docs/research/runtime-desktop-crossover-batch-d-blueprint.md`, D3(c)).
 * Residual: a cross-origin `subFrame` document response now carries
 * `same-origin`; under `require-corp` such a frame is already excluded unless
 * it opts in. Narrow to `types: ['mainFrame']` if cross-origin iframes are
 * ever needed. */
const managedHeaders: ReadonlyArray<readonly [string, string]> = Object.entries(documentHeaders);
const managedHeaderNamesLc: ReadonlySet<string> = new Set(managedHeaders.map(([name]) => name.toLowerCase()));

/* `<all_urls>`, never a scheme-wildcard pattern: the wildcard form does not
 * match the custom standard schemes (`app://`) that `protocol.handle` serves a
 * packaged renderer from, which is exactly where cross-origin isolation fails. */
const documentResponseFilter: WebRequestFilter = { urls: ['<all_urls>'], types: ['mainFrame', 'subFrame'] };

/**
 * Install COOP/COEP response headers for Electron renderer pages.
 *
 * @param options - Optional Electron session override.
 * @returns Nothing.
 * @public
 */
export const installElectronRuntimeHeaders = (options: ElectronRuntimeHeadersOptions = {}): void => {
  const targetSession = options.session ?? defaultSession.defaultSession;
  targetSession.webRequest.onHeadersReceived(documentResponseFilter, (details, callback) => {
    /* Electron delivers response headers with lowercase keys; adding a
     * Title-Case copy leaves the name case-duplicated, and Chromium then
     * refuses cross-origin isolation on a custom scheme. Upsert case-
     * insensitively instead, leaving unrelated headers and their casing alone.
     * Not `applyDocumentHeaders`: its `Object.assign` would re-add Title-Case
     * keys beside the lowercase ones Electron delivered. */
    const responseHeaders: Record<string, string[]> = {};
    for (const [name, value] of Object.entries(details.responseHeaders ?? {})) {
      if (!managedHeaderNamesLc.has(name.toLowerCase())) {
        responseHeaders[name] = value;
      }
    }
    for (const [name, value] of managedHeaders) {
      responseHeaders[name] = [value];
    }
    callback({ responseHeaders });
  });
};

/**
 * Register the main-process broker that owns one utility host per renderer client.
 * Each relayed port carries an opaque lease used for exact-host close and timeout recovery.
 *
 * Admission is the application's: every `requestRuntimePort()` from any frame
 * holding the preload bridge forks one utility, and the broker imposes no cap.
 * An application that must gate this — by sender, or with a concurrency cap —
 * supplies its own `ipcMain` view that filters before delegating. The broker
 * owns the only listeners on its channels, so `off` may delegate wholesale:
 *
 * ```typescript
 * import { ipcMain } from 'electron';
 * import type { IpcMain, IpcMainEvent } from 'electron';
 *
 * const allowFrame = (event: IpcMainEvent): boolean => event.senderFrame?.url.startsWith('app://') === true;
 * const gatedIpcMain = {
 *   on: (channel: string, listener: (event: IpcMainEvent) => void) =>
 *     ipcMain.on(channel, (event) => {
 *       if (allowFrame(event)) {
 *         listener(event);
 *       }
 *     }),
 *   off: (channel: string) => ipcMain.removeAllListeners(channel),
 * } as unknown as IpcMain;
 * ```
 *
 * @param options - Utility entry and optional Electron wiring overrides.
 * @returns A handle that unregisters IPC listeners and terminates remaining owned utilities.
 * @public
 *
 * @example <caption>Register and dispose the Electron runtime broker</caption>
 * ```typescript
 * import { registerElectronRuntimeMain } from '@taucad/runtime/electron/main';
 *
 * const runtimeMain = registerElectronRuntimeMain({
 *   utilityEntry: new URL('./runtime.utility.js', import.meta.url),
 * });
 * runtimeMain.dispose();
 * ```
 */
export const registerElectronRuntimeMain = (options: RegisterElectronRuntimeMainOptions): ElectronRuntimeMainHandle => {
  const channel = options.channel ?? electronRuntimeChannel;
  const releaseChannel = `${channel}:release`;
  const targetIpcMain = options.ipcMain ?? defaultIpcMain;
  const liveUtilities = new Map<
    string,
    { readonly utility: UtilityProcess; readonly sender: IpcMainEvent['sender'] }
  >();

  const reportError = (error: unknown): void => {
    options.onError?.(toError(error));
  };

  const releaseUtility = (hostId: string): void => {
    const record = liveUtilities.get(hostId);
    if (!record) {
      return;
    }
    liveUtilities.delete(hostId);
    try {
      record.utility.kill();
    } catch {
      /* Best-effort */
    }
  };

  const listener = (event: IpcMainEvent): void => {
    let utility: UtilityProcess | undefined;
    let hostId: string | undefined;
    try {
      const targetFrame = event.senderFrame;
      if (!targetFrame) {
        throw new Error('registerElectronRuntimeMain: IPC event did not include senderFrame');
      }
      const utilityEntry =
        options.utilityEntry instanceof URL ? fileURLToPath(options.utilityEntry) : options.utilityEntry;
      const spawnedUtility = utilityProcess.fork(utilityEntry, [], {
        env: options.env,
        /* Copied because Electron declares `execArgv?: string[]` (TS4104). */
        ...(options.execArgv === undefined ? {} : { execArgv: [...options.execArgv] }),
        serviceName: options.serviceName ?? 'tau-runtime-host',
        stdio: options.stdio ?? 'inherit',
      });
      utility = spawnedUtility;
      hostId = randomUUID();
      liveUtilities.set(hostId, { utility: spawnedUtility, sender: event.sender });
      /* Main is the only process that sees the utility's exit code. Relay it to
       * the same frame the port goes to, so the renderer client can settle
       * `closed` with it; `WebFrameMain.postMessage` throws on a destroyed
       * frame, which must not take the bookkeeping down with it. */
      const exitHostId = hostId;
      spawnedUtility.on('exit', (code: number) => {
        liveUtilities.delete(exitHostId);
        try {
          targetFrame.postMessage(`${channel}:host-exit`, { hostId: exitHostId, exitCode: code });
        } catch (error) {
          reportError(error);
        }
      });

      const { port1: rendererPort, port2: utilityPort } = new MessageChannelMain();
      spawnedUtility.postMessage({ taucadRuntime: true }, [utilityPort]);
      targetFrame.postMessage(`${channel}:port`, { hostId }, [rendererPort]);

      const releaseOnce = (): void => {
        if (hostId) {
          releaseUtility(hostId);
        }
      };
      event.sender.once('destroyed', releaseOnce);
      /* A crashed renderer never fires `pagehide` and is never `destroyed`
       * until its window closes; only main sees this. `releaseUtility` is
       * idempotent, so a later `'destroyed'` is harmless. */
      event.sender.once('render-process-gone', releaseOnce);
    } catch (error) {
      if (hostId) {
        releaseUtility(hostId);
      } else {
        try {
          utility?.kill();
        } catch {
          /* Best-effort */
        }
      }
      reportError(error);
    }
  };

  const releaseListener = (event: IpcMainEvent, payload: unknown): void => {
    if (!payload || typeof payload !== 'object') {
      return;
    }
    const { hostId } = payload as { hostId?: unknown };
    if (typeof hostId !== 'string') {
      return;
    }
    const record = liveUtilities.get(hostId);
    if (!record || record.sender !== event.sender) {
      return;
    }
    releaseUtility(hostId);
  };

  targetIpcMain.on(channel, listener);
  targetIpcMain.on(releaseChannel, releaseListener);

  return {
    dispose(): void {
      targetIpcMain.off(channel, listener);
      targetIpcMain.off(releaseChannel, releaseListener);
      for (const hostId of liveUtilities.keys()) {
        releaseUtility(hostId);
      }
    },
  };
};
