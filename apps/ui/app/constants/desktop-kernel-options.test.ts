/**
 * The desktop kernel preset: dependency injection only.
 *
 * No Electron runs here. The preload bridge is stubbed the way the shell
 * installs it and answers each port request with one leg of an in-process
 * `MessageChannel`, which is all `createElectronClientOptions` needs to build
 * the transport.
 */

// oxlint-disable-next-line import/no-unassigned-import -- side-effect import polyfills IndexedDB for tests
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as DesktopKernelOptions from '#constants/desktop-kernel-options.js';
import type * as HandleStore from '#filesystem/handle-store.js';
import type * as KernelOptionsPresets from '#constants/kernel-options.presets.js';

const homeRoot = '/Users/tester/Library/Application Support/Tau/home';
const projectId = 'proj_aaaaaaaaaaaaaaaaaaaaa';

const requestRuntimePort = vi.fn();
const releaseRuntimeHost = vi.fn();

/** The preload bridge `@taucad/runtime/electron/renderer` reads, plus its relay. */
const installRuntimeBridge = (): void => {
  const relayTag = { runtime: 'taucad:runtime-port', hostExit: 'taucad:runtime-host-exit' };
  requestRuntimePort.mockImplementation((requestId: string, context?: Record<string, string>) => {
    void context;
    const { port1 } = new MessageChannel();
    // Dispatched rather than posted: the renderer only accepts a relay whose
    // `source` is this window, and jsdom's `postMessage` leaves it null.
    globalThis.window.dispatchEvent(
      new MessageEvent('message', {
        data: { taucadRelay: relayTag.runtime, hostId: 'host_1', requestId },
        origin: globalThis.location.origin,
        source: globalThis.window,
        ports: [port1],
      }),
    );
  });
  vi.stubGlobal('taucad', { requestRuntimePort, releaseRuntimeHost, relayTag });
};

const installDesktopBridge = (): void => {
  vi.stubEnv('TAU_TARGET', 'desktop');
  vi.stubGlobal('tau', {
    nodeFs: { homeRoot, connect: async () => new MessageChannel().port1 },
    dialog: { selectDirectory: async () => undefined },
  });
};

/** Fresh module graph per case: the target flag is read once at module scope. */
const loadModules = async (): Promise<{
  desktop: typeof DesktopKernelOptions;
  presets: typeof KernelOptionsPresets;
  handleStore: typeof HandleStore;
}> => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  return {
    desktop: await import('#constants/desktop-kernel-options.js'),
    presets: await import('#constants/kernel-options.presets.js'),
    handleStore: await import('#filesystem/handle-store.js'),
  };
};

// Each case rebuilds the module graph from scratch (the target flag is read at
// module scope) and reaches the runtime's electron entry — well past the 5 s
// default while the whole app suite transforms in parallel.
const moduleGraphTimeout = 30_000;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  requestRuntimePort.mockReset();
});

describe('localKernelOptions', () => {
  it(
    'keeps the browser preset off the desktop build',
    async () => {
      const { desktop, presets } = await loadModules();

      expect(desktop.localKernelOptions(projectId)).toBe(presets.debugKernelOptions);
    },
    moduleGraphTimeout,
  );

  it(
    'selects the desktop preset behind the TAU_TARGET define',
    async () => {
      installDesktopBridge();
      const { desktop, presets } = await loadModules();

      expect(desktop.localKernelOptions(projectId)).not.toBe(presets.debugKernelOptions);
    },
    moduleGraphTimeout,
  );
});

describe('desktopKernelOptions', () => {
  it(
    'forks the utility against the project directory under Home',
    async () => {
      installDesktopBridge();
      installRuntimeBridge();
      const { desktop, handleStore } = await loadModules();
      await handleStore.setProjectFileSystemConfig({ projectId, backend: 'node', providerBasePath: 'widget' });

      const factory = await desktop.desktopKernelOptions(projectId)();

      expect(requestRuntimePort).toHaveBeenCalledExactlyOnceWith(expect.any(String), {
        definition: 'default',
        projectRoot: `${homeRoot}/widget`,
      });
      // The utility owns the bytes (`fileSystem: 'host-local'`), so the renderer's
      // filesystem dep is deliberately unused.
      const options = factory({
        get fileSystem(): never {
          throw new Error('host-local runtime must not read the renderer filesystem');
        },
      });
      expect(options.transport).toBeDefined();
      expect(options.config).toBeDefined();
    },
    moduleGraphTimeout,
  );

  it(
    'forks against a picked folder when the project lives in one',
    async () => {
      installDesktopBridge();
      installRuntimeBridge();
      const { desktop, handleStore } = await loadModules();
      await handleStore.setProjectFileSystemConfig({
        projectId,
        backend: 'node',
        path: '/Users/tester/Projects/Workshop',
        providerBasePath: 'widget',
      });

      await desktop.desktopKernelOptions(projectId)();

      expect(requestRuntimePort).toHaveBeenCalledExactlyOnceWith(expect.any(String), {
        definition: 'default',
        projectRoot: '/Users/tester/Projects/Workshop/widget',
      });
    },
    moduleGraphTimeout,
  );

  it(
    'refuses a project that is not on disk',
    async () => {
      installDesktopBridge();
      installRuntimeBridge();
      const { desktop, handleStore } = await loadModules();
      await handleStore.setProjectFileSystemConfig({ projectId, backend: 'opfs', providerBasePath: 'widget' });

      await expect(desktop.desktopKernelOptions(projectId)()).rejects.toThrow(/not on disk/);
      expect(requestRuntimePort).not.toHaveBeenCalled();
    },
    moduleGraphTimeout,
  );
});
