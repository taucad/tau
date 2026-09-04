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
  nativeCodeTrustChannels,
  readBootstrap,
  servicesPortRelayTag,
} from '#shared/desktop-bootstrap.js';
import type { AppIconTheme } from '#shared/desktop-bootstrap.js';
import { openFilesIpcChannel, quickLookIpcChannels } from '#shared/quick-look.js';
import type {
  DesktopOpenFile,
  QuickLookPathRequest,
  QuickLookResult,
  QuickLookUsdzRequest,
} from '#shared/quick-look.js';
import quickLookManifest from '#macos/quick-look-formats.json' with { type: 'json' };

const bootstrap = readBootstrap(process.argv);

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
  nodeFs: { homeRoot: bootstrap.homeRoot },
  runtimeKernelIds: bootstrap.runtimeKernelIds,
  nativeCode: {
    isTrusted: async (projectRoot: string): Promise<boolean> =>
      (await ipcRenderer.invoke(nativeCodeTrustChannels.status, projectRoot)) as boolean,
    grant: async (projectRoot: string): Promise<boolean> =>
      (await ipcRenderer.invoke(nativeCodeTrustChannels.grant, projectRoot)) as boolean,
    revoke: async (projectRoot: string): Promise<void> => {
      await ipcRenderer.invoke(nativeCodeTrustChannels.revoke, projectRoot);
    },
  },
  appIcon: {
    setTheme: (theme: AppIconTheme): void => {
      ipcRenderer.send(appIconThemeChannel, theme);
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
