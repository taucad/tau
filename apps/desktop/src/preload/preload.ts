/**
 * Electron preload entry (work item E4).
 *
 * Four seams reach the renderer from here, and nothing else:
 *
 * 1. `exposeElectronRuntime()` — the kernel-port bridge `@taucad/runtime` owns.
 * 2. `window.ENV` — installed **before** app-module evaluation, which is the
 *    contract `environment.config.ts` requires. The document's own inline
 *    script merges *under* whatever is already there
 *    (`window.ENV = { ...<build env>, ...(window.ENV ?? {}) }`), so preload
 *    wins; the desktop build bakes in nothing, and `TAU_API_URL` /
 *    `TAU_WEBSOCKET_URL` are required — `requireClientEnvironment` throws
 *    without them.
 * 3. `window.tauAuth` — the A6 renderer session bridge.
 * 4. `window.tau` — L2's node-filesystem and dialog seam. Plain values and
 *    functions only: a `MessagePort` cannot cross `contextBridge` (it arrives
 *    as an inert proxy), so the services port takes the same route the
 *    runtime's kernel port already takes — `relayElectronPorts` posts it into
 *    this document, and the page claims it with `awaitElectronRelayedPort`,
 *    whose same-window guard is the tree's one relay-acceptance predicate.
 */

import { contextBridge, ipcRenderer } from 'electron';
import { exposeElectronRuntime, relayElectronPorts } from '@taucad/runtime/electron/preload';

import {
  appIconThemeChannel,
  agentHostSessionChannels,
  externalAgentsChannel,
  machinesChannels,
  quitChannels,
  computeControlChannels,
  readBootstrap,
  servicesPortRelayTag,
  slicersChannels,
} from '#shared/desktop-bootstrap.js';
import type { AppIconTheme } from '#shared/desktop-bootstrap.js';
import { generatedImageIpcChannel, openFilesIpcChannel, quickLookIpcChannels } from '#shared/quick-look.js';
import type {
  DesktopOpenFile,
  QuickLookPathRequest,
  QuickLookResult,
  QuickLookUsdzRequest,
} from '#shared/quick-look.js';
import quickLookManifest from '#macos/quick-look-formats.json' with { type: 'json' };

const bootstrap = readBootstrap(process.argv);

let pendingQuitAsk = false;
let quitAskHandler: (() => void) | undefined;
ipcRenderer.on(quitChannels.ask, () => {
  if (quitAskHandler === undefined) {
    pendingQuitAsk = true;
    return;
  }
  quitAskHandler();
});

exposeElectronRuntime();
relayElectronPorts(servicesPortRelayTag);

contextBridge.exposeInMainWorld('ENV', bootstrap.env);

contextBridge.exposeInMainWorld('tauAuth', {
  signIn: async (): Promise<void> => {
    await ipcRenderer.invoke('tau:auth:sign-in');
  },
  signOut: async (): Promise<void> => {
    await ipcRenderer.invoke('tau:auth:sign-out');
  },
  onAuthChanged: (listener: () => void): (() => void) => {
    const handler = (): void => {
      listener();
    };
    ipcRenderer.on('tau:auth-changed', handler);
    return () => {
      ipcRenderer.off('tau:auth-changed', handler);
    };
  },
});

contextBridge.exposeInMainWorld('tau', {
  /* The page matches relays on this tag rather than repeating the literal:
   * a duplicated string across a process boundary is how relays go quiet. */
  relayTag: servicesPortRelayTag,
  requestServicesPort: (requestId: string, concern: string, context?: Readonly<Record<string, string>>): void => {
    ipcRenderer.send(servicesPortRelayTag, { requestId, concern, context });
  },
  agentHost: {
    retain: async (workspaceRoot: string, projectId: string, attachmentId: string): Promise<void> => {
      await ipcRenderer.invoke(agentHostSessionChannels.retain, { workspaceRoot, projectId, attachmentId });
    },
    release: async (workspaceRoot: string, projectId: string, attachmentId: string): Promise<void> => {
      await ipcRenderer.invoke(agentHostSessionChannels.release, { workspaceRoot, projectId, attachmentId });
    },
  },
  machines: {
    /* The one route a secret takes: invoke → main → the utility's ceremony,
     * which saves it once the printer accepts it. Omit `accessCode` to reuse
     * a saved one. The port relay above carries the non-secret half. A failed
     * ceremony resolves `{ status: 'failed', code?, message }`, keeping the
     * host's typed code, which a rejection across this bridge would drop. */
    completeBinding: async (input: { ceremonyId: string; address?: string; accessCode?: string }): Promise<unknown> =>
      ipcRenderer.invoke(machinesChannels.completeBinding, input),
  },
  slicers: {
    /* Read-only presets and settings (D12); refusals arrive as `{ ok: false, error }`. */
    bambuStudio: {
      status: async (): Promise<unknown> => ipcRenderer.invoke(slicersChannels.bambuStudio.status),
      catalog: async (filter?: unknown): Promise<unknown> =>
        ipcRenderer.invoke(slicersChannels.bambuStudio.catalog, filter),
      resolveSelection: async (input: unknown): Promise<unknown> =>
        ipcRenderer.invoke(slicersChannels.bambuStudio.resolveSelection, input),
      settings: async (input: unknown): Promise<unknown> =>
        ipcRenderer.invoke(slicersChannels.bambuStudio.settings, input),
    },
  },
  nodeFs: { homeRoot: bootstrap.homeRoot },
  runtimeKernelIds: bootstrap.runtimeKernelIds,
  /* A call, not a value (D17): main answers when ACP discovery settles, which no
   * longer blocks this window's creation. */
  externalAgents: async (): Promise<unknown> => ipcRenderer.invoke(externalAgentsChannel),
  compute: {
    inspect: async (projectRoot: string) =>
      (await ipcRenderer.invoke(computeControlChannels.inspect, projectRoot)) as unknown,
    clear: async (projectRoot: string) =>
      (await ipcRenderer.invoke(computeControlChannels.clear, projectRoot)) as unknown,
    collect: async (projectRoot: string, input: { budget: number; cursor?: string }) =>
      (await ipcRenderer.invoke(computeControlChannels.collect, projectRoot, input)) as unknown,
  },
  appIcon: {
    setTheme: (theme: AppIconTheme): void => {
      ipcRenderer.send(appIconThemeChannel, theme);
    },
  },
  quit: {
    isReady: (): boolean => quitAskHandler !== undefined,
    onAsk: (handler: () => void): (() => void) => {
      quitAskHandler = handler;
      if (pendingQuitAsk) {
        pendingQuitAsk = false;
        handler();
      }
      return () => {
        if (quitAskHandler === handler) {
          quitAskHandler = undefined;
        }
      };
    },
    reportQuiesced: (forced: boolean): void => {
      ipcRenderer.send(quitChannels.quiesced, forced);
    },
  },
  dialog: {
    selectDirectory: async (options?: { id?: string }): Promise<string | undefined> =>
      (await ipcRenderer.invoke('tau:select-directory', options)) as string | undefined,
  },
  openFiles: {
    consume: async (): Promise<DesktopOpenFile[]> =>
      (await ipcRenderer.invoke(openFilesIpcChannel)) as DesktopOpenFile[],
  },
  generatedImages: {
    read: async (path: string): Promise<{ readonly path: string; readonly bytes: Uint8Array<ArrayBuffer> }> =>
      (await ipcRenderer.invoke(generatedImageIpcChannel, path)) as {
        readonly path: string;
        readonly bytes: Uint8Array<ArrayBuffer>;
      },
  },
  quickLook: {
    directPreviewExtensions: quickLookManifest.directElectronPreviewExtensions,
    previewPath: async (request: QuickLookPathRequest): Promise<QuickLookResult> =>
      (await ipcRenderer.invoke(quickLookIpcChannels.previewPath, request)) as QuickLookResult,
    previewUsdz: async (request: QuickLookUsdzRequest): Promise<QuickLookResult> =>
      (await ipcRenderer.invoke(quickLookIpcChannels.previewUsdz, request)) as QuickLookResult,
    close: (): void => {
      ipcRenderer.send(quickLookIpcChannels.close);
    },
  },
});
