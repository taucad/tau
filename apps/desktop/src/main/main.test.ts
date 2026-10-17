import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import type { StreamingMachine, MachineQuitDecision } from '#shared/machine-shutdown.js';
/* eslint-disable @typescript-eslint/naming-convention -- mocked Electron exports and environment keys retain production names */
import { mkdir, mkdtemp, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Worker as NodeWorker } from 'node:worker_threads';
import type * as WorkerThreads from 'node:worker_threads';

import type * as Host from '@taucad/host';
import { machineStartWaitMilliseconds } from '@taucad/runtime/machine';
import { desktopUpdateChannels } from '@taucad/types/desktop-updates';
import type { DesktopUpdaterOptions } from '#main/updater.js';
import type { TauHeaderInjectionOptions } from '#main/header-injection.js';

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  agentHostSessionChannels,
  computeControlChannels,
  openDirectoryChannel,
  revealPathChannel,
  machinesChannels,
  quitChannels,
  servicesPortRelayTag,
  slicersChannels,
  windowFullscreenChannel,
} from '#shared/desktop-bootstrap.js';

type UpdateMenuItem = { label: string; click?: () => void };
const originalTitle = process.title;
const originalResourcesPath = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
const originalUncaught = new Set(process.listeners('uncaughtException'));
const originalUnhandled = new Set(process.listeners('unhandledRejection'));

const state = vi.hoisted(() => ({
  appListeners: new Map<string, Array<(...args: unknown[]) => void>>(),
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  /* Held open by the deep-link cases so a link can arrive before `ready`. */
  ready: undefined as Promise<void> | undefined,
  shellApplied: undefined as Promise<void> | undefined,
  authRestored: undefined as Promise<void> | undefined,
  authToken: undefined as string | undefined,
  headerOptions: undefined as TauHeaderInjectionOptions | undefined,
  authHandleCallback: vi.fn(async () => undefined),
  protocolClient: [] as unknown[][],
  resolveFork: undefined as
    | undefined
    | ((context: Record<string, string>) => {
        compute?: unknown;
        env?: Readonly<Record<string, string>>;
        fileSystemPort?: unknown;
        release?: () => void;
      }),
  workers: [] as NodeWorker[],
  /* What main asked to start; the built files themselves exist only under `dist/main`. */
  workerEntries: [] as string[],
  kernelUtilityEntry: undefined as string | undefined,
  servicesUtilityEntry: undefined as string | undefined,
  userData: '',
  servicesDispose: vi.fn(async () => undefined),
  /* The quit hold's two halves, in the order main runs them (R9, D31). */
  shutdownOrder: [] as string[],
  servicesConnect: vi.fn(() => ({ id: 'services-port' })),
  geometryMeasurementConnect: vi.fn(() => ({ id: 'geometry-measurement-port' })),
  geometryDispose: vi.fn(async () => undefined),
  geometrySampleResidentBytes: undefined as undefined | ((utility: { pid: number | undefined }) => number | undefined),
  servicesCompleteBinding: vi.fn(async (_input: Readonly<Record<string, string>>, _boundMilliseconds: number) => ({
    status: 'bound',
    machineId: 'workshop-x1c',
  })),
  servicesStreaming: vi.fn(async (_boundMilliseconds: number): Promise<readonly StreamingMachine[]> => []),
  servicesResumeStarts: vi.fn(),
  servicesRecover: vi.fn(async () => undefined),
  runtimePrewarm: vi.fn(),
  runtimeMaxUtilities: undefined as number | undefined,
  runtimeResidentLimit: undefined as
    | undefined
    | {
        readonly maxBytes: number;
        readonly intervalMilliseconds: number;
        readonly sample: (utility: { pid: number | undefined }) => number | undefined;
      },
  servicesRetainAgentHost: vi.fn(),
  servicesReleaseAgentHost: vi.fn(async () => undefined),
  servicesQuiesce: vi.fn(
    async (
      _boundMilliseconds: number,
      _options?: MachineQuitDecision,
    ): Promise<
      | { status: 'quiesced' }
      | { status: 'failed'; message: string }
      | { status: 'timeout' }
      | { status: 'no-utility' }
      | { status: 'streaming'; machines: readonly StreamingMachine[] }
      | { status: 'streaming-unknown'; message: string }
    > => ({ status: 'quiesced' }),
  ),
  utilityEnvironmentAdditions: [] as NodeJS.ProcessEnv[],
  ipcListeners: new Map<string, Array<(...args: unknown[]) => unknown>>(),
  sentToRenderer: [] as string[],
  /* A renderer that closes its sessions at once, which is what every case but
   * the ordering pin is about. */
  autoQuiesce: true,
  autoForced: false,
  prepareToRestart: undefined as undefined | (() => Promise<boolean>),
  /* Lets a case hold ACP discovery open while the window boots (D17). */
  acpDiscovery: undefined as Promise<{ agents: never[]; refused: never[] }> | undefined,
  bambuStudioStatus: vi.fn(async () => ({ available: false, reason: 'not installed' })),
  log: vi.fn(),
  updateMenuItems: [{ label: 'About Tau' }] as UpdateMenuItem[],
  installedUpdateMenuItems: [] as UpdateMenuItem[],
  updaterCheck: vi.fn(async () => undefined),
  updaterInstall: vi.fn(async () => undefined),
  nativeStoreOptions: undefined as unknown,
  runtimePost: vi.fn(),
}));

vi.mock('#tau/native-store.js', () => ({
  startNativeStore: vi.fn(async (options: unknown) => {
    state.nativeStoreOptions = options;
    return undefined;
  }),
}));

vi.mock('#main/updater.js', () => ({
  startDesktopUpdater: (options: DesktopUpdaterOptions) => {
    state.prepareToRestart = options.prepareToRestart;
    return {
      check: state.updaterCheck,
      install: state.updaterInstall,
      status: () => 'Update ready',
      snapshot: () => ({ phase: 'ready' }),
      download: vi.fn(),
    };
  },
}));

vi.mock('node:worker_threads', async (importOriginal) => {
  const actual = await importOriginal<typeof WorkerThreads>();
  class ObservedWorker extends actual.Worker {
    public constructor(filename: string | URL, options?: ConstructorParameters<typeof actual.Worker>[1]) {
      state.workerEntries.push(String(filename));
      // Main's only worker, run from the source its built entry is bundled from.
      super(new URL('compute-store.worker.ts', import.meta.url), options);
      state.workers.push(this);
    }
  }
  return { ...actual, Worker: ObservedWorker };
});

const app = {
  isPackaged: false,
  dock: { setIcon: vi.fn() },
  requestSingleInstanceLock: vi.fn(() => true),
  whenReady: vi.fn(async () => state.ready),
  setAsDefaultProtocolClient: vi.fn((...args: unknown[]) => {
    state.protocolClient.push(args);
    return true;
  }),
  getPath: vi.fn((name: string) => (name === 'userData' ? state.userData : join(state.userData, name))),
  getVersion: vi.fn(() => 'test'),
  /* No `package.json` here, so a packaged case boots locked, like a release. */
  getAppPath: vi.fn(() => state.userData),
  getAppMetrics: vi.fn((): Array<{ pid: number; memory: { workingSetSize: number } }> => []),
  on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
    const listeners = state.appListeners.get(event) ?? [];
    listeners.push(listener);
    state.appListeners.set(event, listeners);
  }),
  once: vi.fn(),
  quit: vi.fn(),
  exit: vi.fn(),
  setName: vi.fn(),
  setAppUserModelId: vi.fn(),
};

const fakeWindow = {
  id: 1,
  webContents: {
    id: 1,
    getURL: vi.fn(() => 'app://tau/'),
    mainFrame: {},
    send: vi.fn((channel: string, _attemptId?: string) => {
      state.sentToRenderer.push(channel);
      if (channel === 'tau:quit:ask' && state.autoQuiesce) {
        queueMicrotask(() => {
          for (const listener of state.ipcListeners.get('tau:quit:quiesced') ?? []) {
            listener(
              { sender: fakeWindow.webContents, senderFrame: fakeWindow.webContents.mainFrame },
              fakeWindow.webContents.send.mock.calls.findLast(([channel]) => channel === quitChannels.ask)?.[1],
              state.autoForced,
            );
          }
        });
      }
    }),
    isDestroyed: vi.fn(() => false),
    on: vi.fn<(event: string, listener: (...args: unknown[]) => void) => void>(),
    setWindowOpenHandler: vi.fn(),
  },
  isDestroyed: vi.fn(() => false),
  isMinimized: vi.fn(() => false),
  isFullScreen: vi.fn(() => false),
  restore: vi.fn(),
  loadURL: vi.fn(async () => undefined),
  reload: vi.fn(),
  show: vi.fn(),
  focus: vi.fn(),
  once: vi.fn(),
  on: vi.fn<(event: string, listener: (...args: unknown[]) => void) => void>(),
};

const getWindows = vi.fn(() => [fakeWindow]);

/* The quit hold's only visible surface when it cannot settle (C69). */
const dialog = {
  showOpenDialog: vi.fn(),
  showMessageBox: vi.fn(
    async (_options: Readonly<{ buttons?: readonly string[] }>): Promise<{ response: number }> => ({ response: 0 }),
  ),
};

vi.mock('electron', () => ({
  app,
  Menu: {
    getApplicationMenu: vi.fn(() => ({
      items: [
        { submenu: { insert: (index: number, item: UpdateMenuItem) => state.updateMenuItems.splice(index, 0, item) } },
      ],
    })),
    setApplicationMenu: vi.fn(() => {
      // Electron's native menu does not reflect additions until it is installed again.
      state.installedUpdateMenuItems = [...state.updateMenuItems];
    }),
  },
  MenuItem: vi.fn(function MenuItem(options: UpdateMenuItem) {
    return options;
  }),
  autoUpdater: { setFeedURL: vi.fn(), checkForUpdates: vi.fn(), quitAndInstall: vi.fn(), on: vi.fn() },
  BrowserWindow: Object.assign(
    vi.fn(function BrowserWindow() {
      return fakeWindow;
    }),
    {
      getAllWindows: getWindows,
      fromWebContents: vi.fn(() => fakeWindow),
    },
  ),
  dialog,
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => state.handlers.set(channel, handler)),
    on: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      state.ipcListeners.set(channel, [...(state.ipcListeners.get(channel) ?? []), handler]);
    }),
    off: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      state.ipcListeners.set(
        channel,
        (state.ipcListeners.get(channel) ?? []).filter((entry) => entry !== handler),
      );
    }),
  },
  MessageChannelMain: vi.fn(() => ({ port1: {}, port2: {} })),
  net: { fetch: vi.fn() },
  powerSaveBlocker: { start: vi.fn(() => 1), stop: vi.fn() },
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
  safeStorage: { isEncryptionAvailable: vi.fn(() => false), encryptString: vi.fn(), decryptString: vi.fn() },
  screen: {
    getAllDisplays: vi.fn(() => [{ workArea: { x: 0, y: 0, width: 1440, height: 900 } }]),
    getCursorScreenPoint: vi.fn(() => ({ x: 0, y: 0 })),
    getDisplayNearestPoint: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } })),
  },
  session: {
    defaultSession: {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      webRequest: {},
    },
  },
  shell: { openExternal: vi.fn(), openPath: vi.fn(async () => ''), showItemInFolder: vi.fn() },
  utilityProcess: { fork: vi.fn() },
}));

vi.mock('@taucad/runtime/electron/main', () => ({
  installElectronRuntimeHeaders: vi.fn(),
  registerElectronRuntimeMain: vi.fn(
    (options: {
      maxUtilities?: number;
      residentLimit?: typeof state.runtimeResidentLimit;
      resolveFork?: typeof state.resolveFork;
      utilityEntry: string;
    }) => {
      state.resolveFork = options.resolveFork;
      state.runtimeMaxUtilities = options.maxUtilities;
      state.runtimeResidentLimit = options.residentLimit;
      state.kernelUtilityEntry = options.utilityEntry;
      return { connect: vi.fn(), dispose: vi.fn(), post: state.runtimePost, prewarm: state.runtimePrewarm };
    },
  ),
}));
vi.mock('@taucad/host', async (importOriginal) => {
  /* The host's real bounds, so the quit waits main derives from them are the shipped ones (rule 9). */
  const { keepAwakeWhileStreaming, projectCloseMilliseconds, projectReleaseMilliseconds } =
    await importOriginal<typeof Host>();
  return {
    defaultConfigDirectory: vi.fn(() => join(state.userData, 'config')),
    defaultPayloadStore: vi.fn(() => join(state.userData, 'store')),
    discoverAcpAgents: vi.fn(async () => state.acpDiscovery ?? { agents: [], refused: [] }),
    externalAgentDescriptors: vi.fn(() => []),
    keepAwakeWhileStreaming,
    projectCloseMilliseconds,
    projectReleaseMilliseconds,
  };
});
vi.mock('#main/app-protocol.js', () => ({
  appOrigin: 'app://tau',
  appSchemePrivileges: [],
  registerAppProtocol: vi.fn(),
}));
vi.mock('#main/auth-service.js', () => ({
  createAuthService: vi.fn(() => ({
    restore: vi.fn(async () => state.authRestored),
    token: vi.fn(() => state.authToken),
    principal: vi.fn(() => undefined),
    refresh: vi.fn(async () => undefined),
    onChange: vi.fn(),
    dispose: vi.fn(),
    handleCallback: state.authHandleCallback,
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}));
vi.mock('#main/diagnostics.js', () => ({
  createDiagnosticsLog: vi.fn(() => ({ log: state.log, dispose: vi.fn() })),
  forwardRendererDiagnostics: vi.fn(),
  forwardUtilityDiagnostics: vi.fn(),
  kernelUtilityDiagnostics: vi.fn(() => ({})),
}));
vi.mock('#main/environment.js', async (importOriginal) => ({
  /* The packaged lock (`packagedOverridesEnabled`, `stripPackagedOverrides`) runs for real. */
  ...(await importOriginal<Record<string, unknown>>()),
  clientEnvironment: vi.fn(() => ({})),
  desktopAgentGatewayBaseUrl: vi.fn(() => 'http://127.0.0.1:1'),
  desktopAgentSystemPrompt: vi.fn(() => 'test'),
  desktopEnvironment: vi.fn(() => ({
    TAU_MACHINES_ENABLED: 'true',
    TAU_API_URL: 'http://127.0.0.1:1',
    TAU_WEBSOCKET_URL: 'ws://127.0.0.1:1',
    TAU_FRONTEND_URL: 'http://127.0.0.1:1',
  })),
}));
vi.mock('#main/header-injection.js', () => ({
  installTauHeaderInjection: vi.fn((_request: unknown, options: TauHeaderInjectionOptions) => {
    state.headerOptions = options;
  }),
  originOf: vi.fn((url: string | undefined) => (url ? new URL(url).origin : undefined)),
}));
vi.mock('#main/navigation-policy.js', () => ({
  contentSecurityPolicy: vi.fn(() => ''),
  isPermissionGranted: vi.fn(() => false),
  isTrustedSender: vi.fn(() => true),
  navigationDecision: vi.fn(() => 'allow'),
  rendererOrigins: vi.fn(() => []),
}));
vi.mock('#main/services-broker.js', () => ({
  rendererServicesConcerns: ['nodeFs', 'agentHost', 'exactMeasurement', 'machines'],
  ServicesQuiescingError: class ServicesQuiescingError extends Error {},
  createServicesBroker: vi.fn((options: { utilityEntry: string }) => {
    state.servicesUtilityEntry = options.utilityEntry;
    return {
      post: vi.fn(),
      connect: state.servicesConnect,
      completeMachineBinding: state.servicesCompleteBinding,
      streamingMachines: state.servicesStreaming,
      peekStreamingMachines: vi.fn(async () => []),
      resumeMachineStarts: state.servicesResumeStarts,
      recover: state.servicesRecover,
      quiesce: state.servicesQuiesce,
      dispose: state.servicesDispose,
      retainAgentHost: state.servicesRetainAgentHost,
      releaseAgentHost: state.servicesReleaseAgentHost,
      computeProjectRoot: (root: string) =>
        root.includes('/.tau/checkouts/') ? root.slice(0, root.indexOf('/.tau/checkouts/')) : undefined,
    };
  }),
}));
vi.mock('#main/geometry-broker.js', () => ({
  createGeometryBroker: vi.fn((options: { sampleResidentBytes: typeof state.geometrySampleResidentBytes }) => {
    state.geometrySampleResidentBytes = options.sampleResidentBytes;
    return {
      connectMeasurement: state.geometryMeasurementConnect,
      connectSuite: vi.fn(),
      revokeUnauthorized: vi.fn(),
      dispose: state.geometryDispose,
    };
  }),
}));
vi.mock('#main/utility-environment.js', () => ({
  loginShellEnvironment: vi.fn(async () => state.shellApplied),
  packagedEsbuildEnvironment: vi.fn(() => ({ ESBUILD_BINARY_PATH: '/staged/esbuild' })),
  bundledGitEnvironment: vi.fn(() => ({})),
  compileCacheEnvironment: vi.fn((userDataPath: string) => ({
    TAU_COMPILE_CACHE_DIR: join(userDataPath, 'compile-cache'),
  })),
  utilityEnvironment: vi.fn((_environment: unknown, additions: NodeJS.ProcessEnv = {}) => {
    state.utilityEnvironmentAdditions.push(additions);
    return {};
  }),
}));
vi.mock('#main/browser-host.js', () => ({ installBrowserHost: vi.fn() }));
vi.mock('#main/quick-look.js', () => ({
  createQuickLookController: vi.fn(() => ({ dispose: vi.fn() })),
  removeStaleQuickLookSessions: vi.fn(),
}));
vi.mock('#main/bambu-studio-service.js', () => ({
  createBambuStudioService: vi.fn(() => ({
    status: state.bambuStudioStatus,
    catalog: vi.fn(),
    resolveSelection: vi.fn(),
    settings: vi.fn(),
  })),
}));
vi.mock('#main/open-files.js', () => ({
  createOpenFileQueue: vi.fn(() => ({
    enqueue: vi.fn(() => 0),
    hasPending: vi.fn(() => false),
    consume: vi.fn(async () => []),
  })),
}));

afterEach(async () => {
  await Promise.all(state.workers.splice(0).map(async (worker) => worker.terminate()));
  state.workerEntries.length = 0;
  state.kernelUtilityEntry = undefined;
  state.servicesUtilityEntry = undefined;
  if (state.userData) {
    await rm(state.userData, { recursive: true, force: true });
  }
  state.appListeners.clear();
  state.handlers.clear();
  state.ipcListeners.clear();
  state.sentToRenderer.length = 0;
  state.autoQuiesce = true;
  state.autoForced = false;
  state.prepareToRestart = undefined;
  state.updateMenuItems = [{ label: 'About Tau' }];
  state.installedUpdateMenuItems = [];
  getWindows.mockReturnValue([fakeWindow]);
  state.acpDiscovery = undefined;
  state.ready = undefined;
  state.shellApplied = undefined;
  state.authRestored = undefined;
  state.authToken = undefined;
  state.headerOptions = undefined;
  app.isPackaged = false;
  state.protocolClient.length = 0;
  state.authHandleCallback.mockClear();
  state.resolveFork = undefined;
  state.servicesConnect.mockClear();
  state.geometryMeasurementConnect.mockClear();
  state.geometrySampleResidentBytes = undefined;
  state.runtimeResidentLimit = undefined;
  state.servicesRetainAgentHost.mockClear();
  state.servicesReleaseAgentHost.mockClear();
  app.getAppMetrics.mockReset();
  app.getAppMetrics.mockReturnValue([]);
  state.runtimePrewarm.mockClear();
  state.utilityEnvironmentAdditions.length = 0;
  // Each case bootstraps main afresh; the cached module would otherwise register nothing.
  vi.resetModules();
  vi.unstubAllGlobals();
  for (const listener of process.listeners('uncaughtException')) {
    if (!originalUncaught.has(listener)) {
      process.removeListener('uncaughtException', listener);
    }
  }
  for (const listener of process.listeners('unhandledRejection')) {
    if (!originalUnhandled.has(listener)) {
      process.removeListener('unhandledRejection', listener);
    }
  }
  process.title = originalTitle;
  if (originalResourcesPath) {
    Object.defineProperty(process, 'resourcesPath', originalResourcesPath);
  } else {
    Reflect.deleteProperty(process, 'resourcesPath');
  }
  vi.clearAllMocks();
  fakeWindow.isFullScreen.mockReturnValue(false);
});

describe('desktop main compute owner', () => {
  /* Every case here evaluates the whole main module, which alone is seconds on
   * a loaded machine — the 5 s default is a load flake, not a budget. */
  const bootMilliseconds = 30_000;

  const bootstrap = async (): Promise<string> => {
    vi.stubGlobal('tauCloudBuildEnabled', false);
    state.userData = await mkdtemp(join(tmpdir(), 'tau-main-owner-'));
    await import('#main/main.js');
    await vi.waitFor(() => {
      expect(state.resolveFork).toBeDefined();
      expect(fakeWindow.loadURL).toHaveBeenCalledOnce();
    });
    return resolve(join(state.userData, 'home', 'project'));
  };

  it(
    'should open the update surface from the native menu without a modal or restart',
    async () => {
      await bootstrap();
      await vi.waitFor(() => {
        expect(state.installedUpdateMenuItems.map((item) => item.label)).toEqual(['About Tau', 'Check for Updates…']);
      });
      dialog.showMessageBox.mockClear();
      state.installedUpdateMenuItems[1]!.click!();
      await vi.waitFor(() => {
        expect(state.updaterCheck).toHaveBeenCalledOnce();
        expect(state.updaterCheck).toHaveBeenCalledWith(true);
        expect(state.updaterInstall).not.toHaveBeenCalled();
        expect(dialog.showMessageBox).not.toHaveBeenCalled();
      });
    },
    bootMilliseconds,
  );

  it(
    'should refuse update IPC from an untrusted document',
    async () => {
      await bootstrap();
      const { isTrustedSender } = await import('#main/navigation-policy.js');
      await Promise.all(
        [
          desktopUpdateChannels.snapshot,
          desktopUpdateChannels.check,
          desktopUpdateChannels.install,
          desktopUpdateChannels.download,
        ].map(async (channel) => {
          vi.mocked(isTrustedSender).mockReturnValueOnce(false);
          await expect(state.handlers.get(channel)!({ senderFrame: {} })).rejects.toThrow('Untrusted update request');
        }),
      );
      expect(state.updaterInstall).not.toHaveBeenCalled();
    },
    bootMilliseconds,
  );

  it(
    'settles restart without normal quit stealing the updater finalizer',
    async () => {
      await bootstrap();
      const assessment = Promise.withResolvers<readonly StreamingMachine[]>();
      state.servicesStreaming.mockReturnValueOnce(assessment.promise);
      const restart = state.prepareToRestart!();
      state.appListeners.get('before-quit')!.at(-1)!({ preventDefault: vi.fn() });
      assessment.resolve([]);
      await expect(restart).resolves.toBe(true);
      expect(state.servicesDispose).toHaveBeenCalledOnce();
      expect(app.quit).not.toHaveBeenCalled();
    },
    bootMilliseconds,
  );

  it(
    'refuses updater takeover of a normal quit attempt',
    async () => {
      await bootstrap();
      const assessment = Promise.withResolvers<readonly StreamingMachine[]>();
      state.servicesStreaming.mockReturnValueOnce(assessment.promise);
      state.appListeners.get('before-quit')!.at(-1)!({ preventDefault: vi.fn() });
      await expect(state.prepareToRestart!()).resolves.toBe(false);
      assessment.resolve([]);
      await vi.waitFor(() => {
        expect(app.quit).toHaveBeenCalledOnce();
      });
    },
    bootMilliseconds,
  );
  it('should open only granted directories and propagate file manager failures', async () => {
    const directory = await bootstrap();
    await mkdir(directory, { recursive: true });
    const { shell } = await import('electron');
    const open = state.handlers.get(openDirectoryChannel)!;
    await expect(open({ senderFrame: {} }, directory)).resolves.toBeUndefined();
    const canonicalDirectory = await realpath(directory);
    expect(shell.openPath).toHaveBeenCalledWith(canonicalDirectory);
    vi.mocked(shell.openPath).mockClear();
    await expect(open({ senderFrame: {} }, tmpdir())).rejects.toThrow('Reopen this folder');
    await expect(open({ senderFrame: {} }, 42)).rejects.toThrow('refused');
    await expect(open({ senderFrame: {} }, join(directory, 'missing'))).rejects.toThrow('ENOENT');
    await symlink(tmpdir(), join(directory, 'escape'));
    await expect(open({ senderFrame: {} }, join(directory, 'escape'))).rejects.toThrow('Reopen this folder');
    expect(shell.openPath).not.toHaveBeenCalled();
    vi.mocked(shell.openPath).mockResolvedValueOnce('No file manager available');
    await expect(open({ senderFrame: {} }, directory)).rejects.toThrow('No file manager available');
  }, 120_000);

  it('should reveal only granted files and folders in the file manager', async () => {
    const directory = await bootstrap();
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'main.ts'), '');
    const { shell } = await import('electron');
    const reveal = state.handlers.get(revealPathChannel)!;
    await expect(reveal({ senderFrame: {} }, join(directory, 'main.ts'))).resolves.toBeUndefined();
    expect(shell.showItemInFolder).toHaveBeenCalledWith(join(await realpath(directory), 'main.ts'));
    vi.mocked(shell.showItemInFolder).mockClear();
    await expect(reveal({ senderFrame: {} }, join(tmpdir(), 'outside.ts'))).rejects.toThrow('Reopen this folder');
    await expect(reveal({ senderFrame: {} }, 42)).rejects.toThrow('refused');
    await expect(reveal({ senderFrame: {} }, join(directory, 'missing.ts'))).rejects.toThrow('ENOENT');
    await symlink(tmpdir(), join(directory, 'escape'));
    await expect(reveal({ senderFrame: {} }, join(directory, 'escape', 'x'))).rejects.toThrow('Reopen this folder');
    expect(shell.showItemInFolder).not.toHaveBeenCalled();
  }, 120_000);

  it(
    'should publish current native fullscreen state on enter, leave and renderer reload',
    async () => {
      await bootstrap();
      const enter = fakeWindow.on.mock.calls.find(([name]) => name === 'enter-full-screen')?.[1];
      const leave = fakeWindow.on.mock.calls.find(([name]) => name === 'leave-full-screen')?.[1];
      const loaded = fakeWindow.webContents.on.mock.calls.find(([name]) => name === 'did-finish-load')?.[1];
      expect(enter).toBeTypeOf('function');
      expect(leave).toBeTypeOf('function');
      expect(loaded).toBeTypeOf('function');
      fakeWindow.isFullScreen.mockReturnValue(true);
      enter?.();
      expect(fakeWindow.webContents.send).toHaveBeenLastCalledWith(windowFullscreenChannel, true);
      loaded?.();
      expect(fakeWindow.webContents.send).toHaveBeenLastCalledWith(windowFullscreenChannel, true);
      fakeWindow.isFullScreen.mockReturnValue(false);
      leave?.();
      expect(fakeWindow.webContents.send).toHaveBeenLastCalledWith(windowFullscreenChannel, false);
    },
    bootMilliseconds,
  );

  /* AF-L03-1: the descriptors used to be frozen into the window's
   * `additionalArguments`, so a vendor model probe on a 5 s clock was a
   * prerequisite of the window's existence (D17). */
  it(
    'creates and loads the window while agent discovery is still running',
    async () => {
      const discovery = Promise.withResolvers<{ agents: never[]; refused: never[] }>();
      state.acpDiscovery = discovery.promise;

      await bootstrap();

      expect(fakeWindow.loadURL).toHaveBeenCalledOnce();
      const answer = state.handlers.get('tau:external-agents')!({ senderFrame: {} });
      discovery.resolve({ agents: [], refused: [] });
      await expect(answer).resolves.toEqual([]);
    },
    bootMilliseconds,
  );

  /* `electron.vite.config.ts` emits each entry as `<name>.js` beside `index.js`,
   * the bundle main lands in. */
  it(
    'should start every utility and worker from its entry beside the main bundle',
    async () => {
      const projectRoot = await bootstrap();
      state.resolveFork!({ projectRoot, computeMode: 'durable' });

      expect(state.kernelUtilityEntry).toBe(join(import.meta.dirname, 'kernel-host.js'));
      expect(state.servicesUtilityEntry).toBe(join(import.meta.dirname, 'services-host.js'));
      expect(state.workerEntries).toEqual([join(import.meta.dirname, 'compute-store.worker.js')]);
    },
    bootMilliseconds,
  );

  /* W-L03-4: a spare is only adoptable when the fork it would serve is
   * configured identically, so every project open has to resolve to one
   * environment. The root the renderer asked for reaches the utility on its
   * rooted filesystem port, not through the process environment. */
  it(
    'warms one kernel utility at boot and forks every project root with the same environment',
    async () => {
      const projectRoot = await bootstrap();

      expect(state.runtimePrewarm).toHaveBeenCalledOnce();
      /* A fork-loop guard well above what the sessions registry can admit,
       * never a live-project budget: that budget is the registry's and is
       * memory, not a count. */
      expect(state.runtimeMaxUtilities).toBeGreaterThanOrEqual(64);
      const home = state.resolveFork!({ projectRoot, computeMode: 'memory' });
      const checkout = state.resolveFork!({
        projectRoot: join(projectRoot, '.tau/checkouts/run'),
        computeMode: 'memory',
      });
      expect(home.env).toEqual(checkout.env);
      expect(state.servicesConnect).toHaveBeenLastCalledWith('runtimeFileSystem', {
        workspaceRoot: join(projectRoot, '.tau/checkouts/run'),
      });
    },
    bootMilliseconds,
  );

  it(
    "should keep a root's compute connection while any utility holds it and drop it after the last release",
    async () => {
      const projectRoot = await bootstrap();
      const first = state.resolveFork!({ projectRoot, computeMode: 'durable' });
      const second = state.resolveFork!({ projectRoot, computeMode: 'durable' });
      const storeOf = (resolved: typeof first): unknown => (resolved.compute as { store: unknown }).store;
      expect(storeOf(second)).toBe(storeOf(first));

      /* One utility of two goes: the other still reads through the same connection. */
      first.release!();
      const third = state.resolveFork!({ projectRoot, computeMode: 'durable' });
      expect(storeOf(third)).toBe(storeOf(first));

      /* Every holder gone: main keeps no connection for a root nobody runs. */
      second.release!();
      third.release!();
      const reopened = state.resolveFork!({ projectRoot, computeMode: 'durable' });
      expect(storeOf(reopened)).not.toBe(storeOf(first));
      reopened.release!();
    },
    bootMilliseconds,
  );

  it(
    'should cap every kernel utility at a resident ceiling sampled from the exact pid',
    async () => {
      await bootstrap();
      const limit = state.runtimeResidentLimit;
      expect(limit).toBeDefined();
      expect(limit!.maxBytes).toBeGreaterThanOrEqual(2 * 1024 * 1024 * 1024);
      expect(limit!.maxBytes).toBeLessThanOrEqual(8 * 1024 * 1024 * 1024);
      expect(limit!.intervalMilliseconds).toBe(5000);
      app.getAppMetrics.mockReturnValue([
        { pid: 41, memory: { workingSetSize: 999 } },
        { pid: 42, memory: { workingSetSize: 512 } },
      ]);
      expect(limit!.sample({ pid: 42 })).toBe(512 * 1024);
      expect(limit!.sample({ pid: undefined })).toBeUndefined();
    },
    bootMilliseconds,
  );

  it(
    'should release every agent-host attachment a document held once that document goes',
    async () => {
      const projectRoot = await bootstrap();
      const retain = state.handlers.get(agentHostSessionChannels.retain)!;
      const release = state.handlers.get(agentHostSessionChannels.release)!;
      // oxlint-disable-next-line unicorn/prefer-event-target -- Electron's WebContents is a Node EventEmitter.
      const sender = Object.assign(new EventEmitter(), { id: 7 });
      const event = { sender, senderFrame: { url: 'app://tau/' } };
      const held = { workspaceRoot: projectRoot, projectId: 'proj_a', attachmentId: 'attachment-1' };
      const released = { workspaceRoot: projectRoot, projectId: 'proj_a', attachmentId: 'attachment-2' };
      await retain(event, held);
      await retain(event, released);
      await release(event, released);
      state.servicesReleaseAgentHost.mockClear();

      /* A deep link or Open-With replaces the document without closing the window. */
      sender.emit('did-navigate', {}, 'app://tau/w/other');
      await vi.waitFor(() => {
        expect(state.servicesReleaseAgentHost).toHaveBeenCalledExactlyOnceWith(held, expect.any(Number));
      });

      /* The next document holds its own; the window closing releases it, and nothing twice. */
      const next = { workspaceRoot: projectRoot, projectId: 'proj_a', attachmentId: 'attachment-3' };
      await retain(event, next);
      sender.emit('destroyed');
      await vi.waitFor(() => {
        expect(state.servicesReleaseAgentHost).toHaveBeenLastCalledWith(next, expect.any(Number));
      });
      expect(state.servicesReleaseAgentHost).toHaveBeenCalledTimes(2);
      expect(sender.listenerCount('destroyed')).toBe(0);
      expect(sender.listenerCount('did-navigate')).toBe(0);
    },
    bootMilliseconds,
  );

  it(
    'invalidates a worker immediately on error and restarts through the owner resolver',
    async () => {
      const projectRoot = await bootstrap();
      state.resolveFork!({ projectRoot, computeMode: 'durable' });
      const first = state.workers[0]!;

      first.emit('error', new Error('fixture worker error'));
      const recovered = state.resolveFork!({ projectRoot, computeMode: 'durable' });

      expect(recovered.compute).toMatchObject({ mode: 'durable' });
      expect(state.workers).toHaveLength(2);
    },
    bootMilliseconds,
  );

  it(
    'allocates lazily, reuses original identity, invalidates on error, restarts, and awaits quit',
    async () => {
      const projectRoot = await bootstrap();
      expect(state.utilityEnvironmentAdditions.at(-1)?.['TAU_DESKTOP_AUTHORITY_DIR']).toBe(
        join(state.userData, 'filesystem-authority'),
      );
      /* W12: every forked realm is told where its compile cache lives, and it is
       * the app's own data root — never the read-only signed bundle. */
      expect(state.utilityEnvironmentAdditions.length).toBeGreaterThanOrEqual(2);
      for (const additions of state.utilityEnvironmentAdditions) {
        expect(additions['TAU_COMPILE_CACHE_DIR']).toBe(join(state.userData, 'compile-cache'));
      }
      const off = state.resolveFork!({ projectRoot, computeMode: 'off' });
      expect(off.compute).toEqual({ mode: 'off' });
      expect(state.workers).toHaveLength(0);
      expect(() => state.resolveFork!({ purpose: 'ephemeral', computeMode: 'durable' })).toThrow(/durable.*ephemeral/u);
      expect(state.workers).toHaveLength(0);

      const direct = state.resolveFork!({ projectRoot: `${projectRoot}/.`, computeMode: 'durable' });
      const candidate = state.resolveFork!({
        projectRoot: join(projectRoot, '.tau/checkouts/run'),
        computeMode: 'durable',
      });
      expect((candidate.compute as { store: unknown }).store).toBe((direct.compute as { store: unknown }).store);
      expect(state.servicesConnect).toHaveBeenCalledWith('runtimeFileSystem', {
        workspaceRoot: join(projectRoot, '.tau/checkouts/run'),
      });
      expect(state.workers).toHaveLength(1);

      const inspect = state.handlers.get(computeControlChannels.inspect)!;
      const event = { senderFrame: { url: 'app://tau/' } };
      const before = (await inspect(event, projectRoot)) as { generation: number };

      const first = state.workers[0]!;
      first.emit('error', new Error('fixture worker error'));
      const recovered = state.resolveFork!({ projectRoot, computeMode: 'durable' });
      expect(recovered.compute).toMatchObject({ mode: 'durable' });
      expect(state.workers).toHaveLength(2);
      await first.terminate();
      const after = (await inspect(event, `${projectRoot}/.`)) as { generation: number };
      expect(after.generation).toBe(before.generation);

      const quit = state.appListeners.get('before-quit')!.at(-1)!;
      state.servicesDispose.mockRejectedValueOnce(new Error('services close failed'));
      const firstPreventDefault = vi.fn();
      const secondPreventDefault = vi.fn();
      quit({ preventDefault: firstPreventDefault });
      quit({ preventDefault: secondPreventDefault });
      expect(firstPreventDefault).toHaveBeenCalledOnce();
      expect(secondPreventDefault).toHaveBeenCalledOnce();
      expect(app.quit).not.toHaveBeenCalled();
      await vi.waitFor(() => {
        expect(app.quit).toHaveBeenCalledOnce();
      });
      expect(state.log).toHaveBeenCalledWith('error', 'main.shutdown', expect.any(Error));
      expect(state.workers[1]!.threadId).toBe(-1);
    },
    bootMilliseconds,
  );

  it(
    'should reject a relayed port request that main refuses',
    async () => {
      await bootstrap();
      const postMessage = vi.fn();
      const senderFrame = { url: 'app://tau/index.html', postMessage };

      for (const listener of state.ipcListeners.get(servicesPortRelayTag) ?? []) {
        listener(
          { senderFrame },
          { requestId: 'req-1', concern: 'agentHost', context: { workspaceRoot: '/somewhere/never/opened' } },
        );
      }

      // The renderer awaits this relay; a silent refusal is a permanent wait.
      expect(postMessage).toHaveBeenCalledWith(servicesPortRelayTag, {
        requestId: 'req-1',
        error: 'services.untrusted-root',
      });
      expect(state.servicesConnect).not.toHaveBeenCalledWith('agentHost', expect.anything());
    },
    bootMilliseconds,
  );

  it(
    'should answer a concern refused while quitting as quiescing rather than a connection failure',
    async () => {
      await bootstrap();
      const { ServicesQuiescingError } = await import('#main/services-broker.js');
      state.servicesConnect.mockImplementationOnce(() => {
        throw new ServicesQuiescingError();
      });
      const postMessage = vi.fn();

      for (const listener of state.ipcListeners.get(servicesPortRelayTag) ?? []) {
        listener(
          { senderFrame: { url: 'app://tau/index.html', postMessage } },
          { requestId: 'req-quit', concern: 'nodeFs' },
        );
      }

      /* Every `services.connect-failed` in the desktop log so far was this
       * shutdown refusal; the requester and the audit must be able to tell. */
      expect(postMessage).toHaveBeenCalledExactlyOnceWith(servicesPortRelayTag, {
        requestId: 'req-quit',
        error: 'services.quiescing',
      });
      expect(state.log).toHaveBeenCalledWith('info', 'services.connect-refused-quiescing', { concern: 'nodeFs' });
      expect(state.log).not.toHaveBeenCalledWith('error', 'services.connect-failed', expect.anything());
    },
    bootMilliseconds,
  );

  it(
    'holds quit for the renderer and the utility, in that order (R9, D31)',
    async () => {
      await bootstrap();
      const order: string[] = [];
      state.autoQuiesce = false;
      state.servicesQuiesce.mockImplementation(async (): Promise<{ status: 'quiesced' }> => {
        order.push('quiesce');
        return { status: 'quiesced' };
      });
      state.servicesDispose.mockImplementation(async () => {
        order.push('dispose');
      });

      const quit = state.appListeners.get('before-quit')!.at(-1)!;
      quit({ preventDefault: vi.fn() });

      /* The page is asked first, and answers through its own channel. */
      await vi.waitFor(() => {
        expect(state.sentToRenderer).toContain(quitChannels.ask);
      });
      expect(order).toEqual([]);
      for (const listener of state.ipcListeners.get(quitChannels.quiesced) ?? []) {
        listener(
          { sender: fakeWindow.webContents, senderFrame: fakeWindow.webContents.mainFrame },
          fakeWindow.webContents.send.mock.calls.findLast(([channel]) => channel === quitChannels.ask)?.[1],
          false,
        );
      }

      await vi.waitFor(() => {
        expect(order).toContain('dispose');
      });
      /* The utility's quiesce resolves before anything is killed; a failure in
       * it never skips the dispose that follows. */
      expect(order.indexOf('quiesce')).toBeGreaterThanOrEqual(0);
      expect(order.indexOf('quiesce')).toBeLessThan(order.indexOf('dispose'));
      expect(state.log).toHaveBeenCalledWith('info', 'main.renderer-quiesce', { outcome: 'quiesced' });
    },
    bootMilliseconds,
  );

  it(
    'requires every window, rejects stale attempts and subframes, and ignores duplicate replies',
    async () => {
      await bootstrap();
      state.autoQuiesce = false;
      const second = {
        ...fakeWindow,
        id: 2,
        webContents: { ...fakeWindow.webContents, id: 2, mainFrame: {}, send: vi.fn() },
      };
      getWindows.mockReturnValue([fakeWindow, second]);
      state.appListeners.get('before-quit')!.at(-1)!({ preventDefault: vi.fn() });
      await vi.waitFor(() => {
        expect(second.webContents.send).toHaveBeenCalled();
      });
      const attempt = fakeWindow.webContents.send.mock.calls.findLast(([channel]) => channel === quitChannels.ask)?.[1];
      const reply = (sender: typeof fakeWindow.webContents, id = attempt, frame = sender.mainFrame): void => {
        for (const listener of state.ipcListeners.get(quitChannels.quiesced) ?? []) {
          listener({ sender, senderFrame: frame }, id, false);
        }
      };
      reply(fakeWindow.webContents, 'retired');
      reply(second.webContents, attempt, {});
      reply(fakeWindow.webContents);
      reply(fakeWindow.webContents);
      expect(state.servicesQuiesce).not.toHaveBeenCalled();
      reply(second.webContents);
      await vi.waitFor(() => {
        expect(app.quit).toHaveBeenCalledOnce();
      });
    },
    bootMilliseconds,
  );

  it(
    'requires explicit unsaved-edit consent before forced renderer recovery reloads',
    async () => {
      await bootstrap();
      state.autoForced = true;
      state.servicesQuiesce.mockResolvedValueOnce({ status: 'failed', message: 'drain failed' });
      const decision = Promise.withResolvers<{ response: number }>();
      dialog.showMessageBox.mockResolvedValueOnce({ response: 0 }).mockImplementationOnce(async () => decision.promise);
      state.appListeners.get('before-quit')!.at(-1)!({ preventDefault: vi.fn() });
      await vi.waitFor(() => {
        expect(dialog.showMessageBox).toHaveBeenCalledTimes(2);
      });
      expect(fakeWindow.reload).not.toHaveBeenCalled();
      expect(state.servicesRecover).not.toHaveBeenCalled();
      expect(dialog.showMessageBox.mock.calls[1]?.[0]).toMatchObject({
        buttons: ['Review again', 'Restore and discard unsaved changes'],
        defaultId: 0,
      });
      decision.resolve({ response: 1 });
      await vi.waitFor(() => {
        expect(fakeWindow.reload).toHaveBeenCalledOnce();
      });
    },
    bootMilliseconds,
  );

  it(
    'offers machine navigation before any teardown and releases the quit fence',
    async () => {
      await bootstrap();
      state.servicesStreaming.mockResolvedValueOnce([{ hostId: 'host', machineId: 'mill', name: 'LongMill' }]);
      const quit = state.appListeners.get('before-quit')!.at(-1)!;
      quit({ preventDefault: vi.fn() });
      await vi.waitFor(() => {
        expect(state.servicesResumeStarts).toHaveBeenCalledOnce();
      });
      expect(dialog.showMessageBox.mock.calls[0]?.[0]).toMatchObject({
        buttons: ['View machines', 'Keep Tau open', 'Quit anyway'],
        cancelId: 1,
      });
      expect(fakeWindow.webContents.send).toHaveBeenCalledWith(quitChannels.navigate, '/machines/host/mill');
      expect(state.sentToRenderer).not.toContain(quitChannels.ask);
      expect(state.servicesDispose).not.toHaveBeenCalled();
    },
    bootMilliseconds,
  );

  it(
    'requires explicit interruption confirmation for an unknown assessment',
    async () => {
      await bootstrap();
      state.servicesStreaming.mockRejectedValueOnce(new Error('Host did not answer'));
      dialog.showMessageBox.mockResolvedValueOnce({ response: 2 }).mockResolvedValueOnce({ response: 1 });
      state.appListeners.get('before-quit')!.at(-1)!({ preventDefault: vi.fn() });
      await vi.waitFor(() => {
        expect(app.quit).toHaveBeenCalledOnce();
      });
      expect(dialog.showMessageBox.mock.calls[1]?.[0]).toMatchObject({
        buttons: ['Go back', 'Quit anyway'],
        defaultId: 0,
        cancelId: 0,
      });
      expect(state.servicesQuiesce).toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({ forceMachines: true }),
      );
    },
    bootMilliseconds,
  );

  it(
    'recovers the service and reloads a usable renderer when saving fails and Keep open is chosen',
    async () => {
      await bootstrap();
      state.servicesQuiesce.mockResolvedValueOnce({ status: 'failed', message: 'drain failed' });
      dialog.showMessageBox.mockResolvedValueOnce({ response: 0 });
      state.appListeners.get('before-quit')!.at(-1)!({ preventDefault: vi.fn() });
      await vi.waitFor(() => {
        expect(fakeWindow.reload).toHaveBeenCalledOnce();
      });
      expect(state.servicesRecover).toHaveBeenCalledWith(expect.any(String), expect.any(Number));
      expect(state.servicesDispose).not.toHaveBeenCalled();
      expect(app.quit).not.toHaveBeenCalled();
    },
    bootMilliseconds,
  );

  it(
    'requires a separate confirmation after a utility settlement failure',
    async () => {
      await bootstrap();
      state.servicesQuiesce.mockResolvedValueOnce({ status: 'failed', message: 'drain failed' });
      dialog.showMessageBox.mockResolvedValueOnce({ response: 1 }).mockResolvedValueOnce({ response: 1 });
      state.appListeners.get('before-quit')!.at(-1)!({ preventDefault: vi.fn() });
      await vi.waitFor(() => {
        expect(app.quit).toHaveBeenCalledOnce();
      });
      expect(dialog.showMessageBox).toHaveBeenCalledTimes(2);
    },
    bootMilliseconds,
  );
});

describe('desktop main admission gates', () => {
  const bootMilliseconds = 30_000;

  const boot = async (): Promise<void> => {
    vi.stubGlobal('tauCloudBuildEnabled', false);
    state.userData = await mkdtemp(join(tmpdir(), 'tau-main-admission-'));
    if (app.isPackaged) {
      Object.defineProperty(process, 'resourcesPath', { configurable: true, value: state.userData });
    }
    await import('#main/main.js');
  };

  it(
    'waits for a packaged login shell before capturing the environment and loading the first page',
    async () => {
      const shell = Promise.withResolvers<void>();
      app.isPackaged = true;
      state.shellApplied = shell.promise;

      await boot();
      await vi.waitFor(() => {
        expect(app.whenReady).toHaveBeenCalled();
      });
      expect(fakeWindow.loadURL).not.toHaveBeenCalled();

      shell.resolve();
      await vi.waitFor(() => {
        expect(fakeWindow.loadURL).toHaveBeenCalledOnce();
      });
      expect(fakeWindow.show).toHaveBeenCalled();
    },
    bootMilliseconds,
  );

  it(
    'ignores e2e switches and renderer overrides and disables DevTools in a locked packaged build',
    async () => {
      /* Widened: Electron's typings declare `ELECTRON_RENDERER_URL` read-only. */
      const environment: Record<string, string | undefined> = process.env;
      const names = ['TAU_E2E_HIDE_WINDOW', 'ELECTRON_RENDERER_URL'] as const;
      const previous = Object.fromEntries(names.map((name) => [name, environment[name]]));
      environment['TAU_E2E_HIDE_WINDOW'] = '1';
      environment['ELECTRON_RENDERER_URL'] = 'https://attacker.example';
      app.isPackaged = true;
      try {
        await boot();
        await vi.waitFor(() => {
          expect(fakeWindow.loadURL).toHaveBeenCalledWith('app://tau/');
        });
        const { BrowserWindow } = await import('electron');
        const options = vi.mocked(BrowserWindow).mock.calls[0]?.[0];
        expect(options?.webPreferences?.focusOnNavigation).toBe(true);
        expect(options?.webPreferences?.devTools).toBe(false);
        expect(fakeWindow.show).toHaveBeenCalled();
        expect(environment['TAU_E2E_HIDE_WINDOW']).toBeUndefined();
        expect(environment['ELECTRON_RENDERER_URL']).toBeUndefined();
      } finally {
        for (const name of names) {
          if (previous[name] === undefined) {
            Reflect.deleteProperty(environment, name);
          } else {
            environment[name] = previous[name];
          }
        }
      }
    },
    bootMilliseconds,
  );

  it(
    'restores the credential before the first page can request an authenticated origin',
    async () => {
      const restore = Promise.withResolvers<void>();
      state.authRestored = restore.promise;
      const { injectTauHeaders } = await vi.importActual<{
        injectTauHeaders: (
          url: string,
          headers: Record<string, string>,
          options: TauHeaderInjectionOptions,
        ) => Record<string, string>;
      }>('#main/header-injection.js');
      let firstRequestHeaders: Record<string, string> | undefined;
      fakeWindow.loadURL.mockImplementationOnce(async () => {
        firstRequestHeaders = injectTauHeaders('http://127.0.0.1:1/v1/projects', {}, state.headerOptions!);
      });

      await boot();
      await vi.waitFor(() => {
        expect(state.headerOptions).toBeDefined();
      });
      expect(fakeWindow.loadURL).not.toHaveBeenCalled();
      expect(state.headerOptions?.token()).toBeUndefined();

      state.authToken = 'restored-token';
      restore.resolve();
      await vi.waitFor(() => {
        expect(fakeWindow.loadURL).toHaveBeenCalledOnce();
      });
      expect(firstRequestHeaders).toEqual({ authorization: 'Bearer restored-token', 'tau-client': 'tau-desktop/test' });
    },
    bootMilliseconds,
  );

  it(
    'keeps a deep link queued while credential restore is pending',
    async () => {
      const restore = Promise.withResolvers<void>();
      state.authRestored = restore.promise;
      await boot();
      const openUrl = state.appListeners.get('open-url')?.at(-1);
      expect(openUrl).toBeDefined();
      openUrl?.({ preventDefault: vi.fn() }, 'tau://invitations/queued-token');
      expect(fakeWindow.loadURL).not.toHaveBeenCalled();

      restore.resolve();
      await vi.waitFor(() => {
        expect(fakeWindow.loadURL).toHaveBeenCalledWith('app://tau/invitations/queued-token');
      });
    },
    bootMilliseconds,
  );

  it(
    'reports a failed credential restore without loading an unauthenticated page',
    async () => {
      const restore = Promise.withResolvers<void>();
      state.authRestored = restore.promise;
      await boot();
      await vi.waitFor(() => {
        expect(state.headerOptions).toBeDefined();
      });
      restore.reject(new Error('credential store failed'));

      await vi.waitFor(() => {
        expect(app.exit).toHaveBeenCalledWith(1);
      });
      expect(fakeWindow.loadURL).not.toHaveBeenCalled();
    },
    bootMilliseconds,
  );
});

describe('desktop quit bounds', () => {
  it('nests each quit wait strictly outside the host close it awaits (rule 9, RV-W2b #1)', async () => {
    const host = await vi.importActual<typeof Host>('@taucad/host');
    vi.stubGlobal('tauCloudBuildEnabled', false);
    state.userData = await mkdtemp(join(tmpdir(), 'tau-main-quit-'));
    const { quitQuiesceMilliseconds, quitRendererMilliseconds } = await import('#main/main.js');

    /* The utility's launchers drain their runs before they release. */
    expect(host.projectCloseMilliseconds).toBeGreaterThan(host.projectReleaseMilliseconds);
    /* The utility's quiesce first waits for machine job starts in flight, then closes its projects. */
    expect(quitQuiesceMilliseconds).toBeGreaterThan(host.projectCloseMilliseconds + machineStartWaitMilliseconds);
    /* The page cancels runs and flushes producers (10 s each) before the host's close. */
    expect(quitRendererMilliseconds).toBeGreaterThan(2 * 10_000 + host.projectReleaseMilliseconds);
  }, 60_000);
});

/*
 * `tau://` deep links (R4).
 *
 * A link is a *window navigation*, not a new IPC channel: main validates the
 * identifier and loads the matching in-app route exactly the way an Open With
 * file loads `/import?desktop-open=1`. The sign-in callback is the exception —
 * it is redeemed in main and never reaches the renderer.
 */
describe('desktop main deep links', () => {
  const bootMilliseconds = 30_000;

  const boot = async (): Promise<void> => {
    vi.stubGlobal('tauCloudBuildEnabled', false);
    state.userData = await mkdtemp(join(tmpdir(), 'tau-main-links-'));
    await import('#main/main.js');
  };

  const bootAndWait = async (): Promise<void> => {
    await boot();
    await vi.waitFor(() => {
      expect(fakeWindow.loadURL).toHaveBeenCalled();
    });
    fakeWindow.loadURL.mockClear();
    fakeWindow.focus.mockClear();
  };

  const listener = (event: string): ((...args: unknown[]) => void) => state.appListeners.get(event)!.at(-1)!;

  it(
    'waits for the packaged Playwright bridge before creating the first window',
    async () => {
      const previous = process.env['TAU_E2E_WAIT_FOR_PLAYWRIGHT'];
      const previousRelease = Object.getOwnPropertyDescriptor(globalThis, '__playwright_run');
      process.env['TAU_E2E_WAIT_FOR_PLAYWRIGHT'] = '1';
      try {
        await boot();
        const release: unknown = Reflect.get(globalThis, '__playwright_run');
        await app.whenReady();
        expect(fakeWindow.loadURL).not.toHaveBeenCalled();
        const isRelease = (value: unknown): value is () => void => typeof value === 'function';
        if (!isRelease(release)) {
          throw new TypeError('Packaged Playwright readiness callback was not installed');
        }
        release();
        await vi.waitFor(() => {
          expect(fakeWindow.loadURL).toHaveBeenCalledWith('app://tau/');
        });
      } finally {
        if (previous === undefined) {
          delete process.env['TAU_E2E_WAIT_FOR_PLAYWRIGHT'];
        } else {
          process.env['TAU_E2E_WAIT_FOR_PLAYWRIGHT'] = previous;
        }
        if (previousRelease) {
          Object.defineProperty(globalThis, '__playwright_run', previousRelease);
        } else {
          Reflect.deleteProperty(globalThis, '__playwright_run');
        }
      }
    },
    bootMilliseconds,
  );

  it(
    'preserves the development Playwright loader when a packaged wait flag is inherited',
    async () => {
      const previous = process.env['TAU_E2E_WAIT_FOR_PLAYWRIGHT'];
      const ready = Promise.withResolvers<void>();
      state.ready = ready.promise;
      const loaderRelease = vi.fn(() => {
        ready.resolve();
      });
      vi.stubGlobal('__playwright_run', loaderRelease);
      process.env['TAU_E2E_WAIT_FOR_PLAYWRIGHT'] = '1';
      try {
        await boot();
        expect(Reflect.get(globalThis, '__playwright_run')).toBe(loaderRelease);
        expect(fakeWindow.loadURL).not.toHaveBeenCalled();
        loaderRelease();
        await vi.waitFor(() => {
          expect(fakeWindow.loadURL).toHaveBeenCalledWith('app://tau/');
        });
      } finally {
        if (previous === undefined) {
          delete process.env['TAU_E2E_WAIT_FOR_PLAYWRIGHT'];
        } else {
          process.env['TAU_E2E_WAIT_FOR_PLAYWRIGHT'] = previous;
        }
      }
    },
    bootMilliseconds,
  );

  it(
    'registers the app as the tau scheme handler',
    async () => {
      await bootAndWait();

      expect(state.protocolClient).toContainEqual(['tau']);
    },
    bootMilliseconds,
  );

  /* On macOS the link that launched the app is delivered before `ready`, so a
   * handler installed after `whenReady()` silently loses it. */
  it(
    'should load a link that arrived before the window existed',
    async () => {
      const ready = Promise.withResolvers<void>();
      state.ready = ready.promise;
      await boot();
      await vi.waitFor(() => {
        expect(state.appListeners.get('open-url')).toBeDefined();
      });
      const preventDefault = vi.fn();

      listener('open-url')({ preventDefault }, 'tau://invitations/queued-token');
      expect(preventDefault).toHaveBeenCalledOnce();
      expect(fakeWindow.loadURL).not.toHaveBeenCalled();
      ready.resolve();

      await vi.waitFor(() => {
        expect(fakeWindow.loadURL).toHaveBeenCalledWith('app://tau/invitations/queued-token');
      });
    },
    bootMilliseconds,
  );

  it(
    'should load and focus a share link delivered as a second-instance argument',
    async () => {
      await bootAndWait();

      listener('second-instance')({}, ['/Applications/Tau.app', 'tau://s/direct#v=2&jwe=a.b.c.d.e']);

      await vi.waitFor(() => {
        expect(fakeWindow.loadURL).toHaveBeenCalledWith('app://tau/s/direct#v=2&jwe=a.b.c.d.e');
      });
      expect(fakeWindow.focus).toHaveBeenCalled();
    },
    bootMilliseconds,
  );

  it(
    'keeps an E2E window hidden when a deep link arrives',
    async () => {
      const previous = process.env['TAU_E2E_HIDE_WINDOW'];
      process.env['TAU_E2E_HIDE_WINDOW'] = '1';
      try {
        await bootAndWait();
        const { BrowserWindow } = await import('electron');
        const options = vi.mocked(BrowserWindow).mock.calls[0]?.[0];
        expect(options?.webPreferences?.focusOnNavigation).toBe(false);
        expect(options?.webPreferences?.devTools).toBe(true);
        expect(fakeWindow.show).not.toHaveBeenCalled();
        listener('open-url')({ preventDefault: vi.fn() }, 'tau://i/github.com/taucad/tau-examples');
        await vi.waitFor(() => {
          expect(fakeWindow.loadURL).toHaveBeenCalledWith('app://tau/import/github.com/taucad/tau-examples');
        });
        expect(fakeWindow.show).not.toHaveBeenCalled();
        expect(fakeWindow.focus).not.toHaveBeenCalled();
      } finally {
        if (previous === undefined) {
          delete process.env['TAU_E2E_HIDE_WINDOW'];
        } else {
          process.env['TAU_E2E_HIDE_WINDOW'] = previous;
        }
      }
    },
    bootMilliseconds,
  );

  it(
    'should load an import link delivered by open-url',
    async () => {
      await bootAndWait();

      listener('open-url')({ preventDefault: vi.fn() }, 'tau://i/github.com/taucad/tau-examples');

      await vi.waitFor(() => {
        expect(fakeWindow.loadURL).toHaveBeenCalledWith('app://tau/import/github.com/taucad/tau-examples');
      });
    },
    bootMilliseconds,
  );

  it(
    'should refuse and log a foreign link, loading nothing',
    async () => {
      await bootAndWait();

      listener('open-url')({ preventDefault: vi.fn() }, 'tau://projects/../../etc/passwd');

      await vi.waitFor(() => {
        expect(state.log).toHaveBeenCalledWith('warn', 'deep-link.refused', expect.anything());
      });
      expect(fakeWindow.loadURL).not.toHaveBeenCalled();
      /* The person clicked something and the app came forward; it has to say so
       * by being in front rather than doing nothing at all. */
      expect(fakeWindow.focus).toHaveBeenCalled();
    },
    bootMilliseconds,
  );

  it(
    'should redeem a sign-in callback in main and never navigate the renderer to it',
    async () => {
      await bootAndWait();

      listener('open-url')({ preventDefault: vi.fn() }, 'tau://auth/callback?ott=A1b2C3d4&state=dGhlLXN0YXRl');

      await vi.waitFor(() => {
        expect(state.authHandleCallback).toHaveBeenCalledWith({
          kind: 'auth-callback',
          oneTimeToken: 'A1b2C3d4',
          state: 'dGhlLXN0YXRl',
        });
      });
      expect(fakeWindow.loadURL).not.toHaveBeenCalled();
    },
    bootMilliseconds,
  );
});

describe('desktop main Bambu Studio channels', () => {
  const bootMilliseconds = 30_000;

  it(
    'should answer Bambu Studio calls only for the trusted renderer',
    async () => {
      vi.stubGlobal('tauCloudBuildEnabled', false);
      state.userData = await mkdtemp(join(tmpdir(), 'tau-main-bambu-'));
      await import('#main/main.js');
      await vi.waitFor(() => {
        expect(state.handlers.has(slicersChannels.bambuStudio.status)).toBe(true);
      });
      const { isTrustedSender } = await import('#main/navigation-policy.js');
      const status = state.handlers.get(slicersChannels.bambuStudio.status)!;

      await expect(status({ senderFrame: {} })).resolves.toEqual({ available: false, reason: 'not installed' });
      vi.mocked(isTrustedSender).mockReturnValueOnce(false);
      await expect(status({ senderFrame: { url: 'https://evil.example/' } })).rejects.toThrow(
        'Desktop shell refused Bambu Studio request.',
      );
      expect(state.bambuStudioStatus).toHaveBeenCalledOnce();
      for (const channel of Object.values(slicersChannels.bambuStudio)) {
        expect(state.handlers.has(channel)).toBe(true);
      }
    },
    bootMilliseconds,
  );
});

describe('desktop main machine binding channel', () => {
  it('refuses machine and slicer IPC without creating the machine store when disabled', async () => {
    vi.stubGlobal('tauCloudBuildEnabled', false);
    const { desktopEnvironment } = await import('#main/environment.js');
    vi.mocked(desktopEnvironment).mockReturnValueOnce({
      TAU_API_URL: 'http://127.0.0.1:1',
      TAU_WEBSOCKET_URL: 'ws://127.0.0.1:1',
      TAU_FRONTEND_URL: 'http://127.0.0.1:1',
    });
    state.userData = await mkdtemp(join(tmpdir(), 'tau-main-machines-disabled-'));
    await import('#main/main.js');
    await vi.waitFor(() => {
      expect(state.handlers.has(machinesChannels.completeBinding)).toBe(true);
    });
    const complete = state.handlers.get(machinesChannels.completeBinding)!;
    await expect(complete({ senderFrame: {} }, { ceremonyId: 'old' })).resolves.toMatchObject({
      status: 'failed',
      code: 'MACHINES_DISABLED',
    });
    expect(state.servicesCompleteBinding).not.toHaveBeenCalled();
    const status = state.handlers.get(slicersChannels.bambuStudio.status)!;
    await expect(status({ senderFrame: {} })).rejects.toThrow('Machines are not available');
    const postMessage = vi.fn();
    for (const listener of state.ipcListeners.get(servicesPortRelayTag) ?? []) {
      listener(
        { senderFrame: { url: 'app://tau/index.html', postMessage } },
        { requestId: 'disabled', concern: 'machines' },
      );
    }
    expect(postMessage).toHaveBeenCalledWith(servicesPortRelayTag, {
      requestId: 'disabled',
      error: 'Machines are not available in this release.',
    });
    expect(state.servicesConnect).not.toHaveBeenCalled();
    expect(existsSync(join(state.userData, 'config', 'machines'))).toBe(false);
  }, 30_000);

  const bootMilliseconds = 30_000;

  it(
    'should forward an access code only when one was typed, and refuse one over 256 characters',
    async () => {
      vi.stubGlobal('tauCloudBuildEnabled', false);
      state.userData = await mkdtemp(join(tmpdir(), 'tau-main-machines-'));
      await import('#main/main.js');
      await vi.waitFor(() => {
        expect(state.handlers.has(machinesChannels.completeBinding)).toBe(true);
      });
      const complete = state.handlers.get(machinesChannels.completeBinding)!;

      /* No code: the utility reuses the printer's saved one. */
      await expect(complete({ senderFrame: {} }, { ceremonyId: 'ceremony-1' })).resolves.toEqual({
        status: 'bound',
        machineId: 'workshop-x1c',
      });
      await complete({ senderFrame: {} }, { ceremonyId: 'ceremony-2', address: '10.0.0.5', accessCode: '12345678' });
      await expect(
        complete({ senderFrame: {} }, { ceremonyId: 'ceremony-3', accessCode: 'x'.repeat(257) }),
      ).rejects.toThrow('Desktop shell refused invalid machine binding completion.');

      expect(state.servicesCompleteBinding.mock.calls.map(([input]) => input)).toEqual([
        { ceremonyId: 'ceremony-1' },
        { ceremonyId: 'ceremony-2', address: '10.0.0.5', accessCode: '12345678' },
      ]);
      expect(JSON.stringify(state.log.mock.calls)).not.toContain('12345678');

      /* A refusal resolves as data, so the host's typed code crosses the context bridge, which keeps only an error's
       * message. */
      state.servicesCompleteBinding.mockRejectedValueOnce(
        Object.assign(new Error('Enter the access code shown on the machine.'), {
          code: 'MACHINE_CREDENTIAL_REQUIRED',
        }),
      );
      await expect(complete({ senderFrame: {} }, { ceremonyId: 'ceremony-4' })).resolves.toEqual({
        status: 'failed',
        code: 'MACHINE_CREDENTIAL_REQUIRED',
        message: 'Enter the access code shown on the machine.',
      });
      state.servicesCompleteBinding.mockRejectedValueOnce(new Error('The desktop machine binding timed out.'));
      await expect(complete({ senderFrame: {} }, { ceremonyId: 'ceremony-5' })).resolves.toEqual({
        status: 'failed',
        message: 'The desktop machine binding timed out.',
      });
    },
    bootMilliseconds,
  );
});

describe('desktop main machine store', () => {
  const bootMilliseconds = 30_000;

  /**
   * Boot main over fresh user data, after `before` lays out what an earlier build left there.
   *
   * @returns The environment main adds for the services utility.
   */
  const boot = async (before?: (userData: string) => Promise<void>): Promise<NodeJS.ProcessEnv> => {
    vi.stubGlobal('tauCloudBuildEnabled', false);
    state.userData = await mkdtemp(join(tmpdir(), 'tau-main-store-'));
    await before?.(state.userData);
    await import('#main/main.js');
    await vi.waitFor(() => {
      expect(state.ipcListeners.has(servicesPortRelayTag)).toBe(true);
    });
    return state.utilityEnvironmentAdditions.find((additions) => 'TAU_DESKTOP_MACHINES_DIR' in additions)!;
  };

  const relay = (senderFrame: Record<string, unknown>, requestId: string): void => {
    for (const listener of state.ipcListeners.get(servicesPortRelayTag) ?? []) {
      listener({ senderFrame }, { requestId, concern: 'machines' });
    }
  };

  it(
    'routes exact measurement to geometry, never the services singleton',
    async () => {
      await boot();
      const postMessage = vi.fn();
      for (const listener of state.ipcListeners.get(servicesPortRelayTag) ?? []) {
        listener(
          { senderFrame: { url: 'app://tau/index.html', postMessage } },
          { requestId: 'measure', concern: 'exactMeasurement' },
        );
      }
      expect(state.geometryMeasurementConnect).toHaveBeenCalledOnce();
      expect(state.servicesConnect).not.toHaveBeenCalled();
      expect(postMessage).toHaveBeenCalledWith(servicesPortRelayTag, { requestId: 'measure' }, [
        { id: 'geometry-measurement-port' },
      ]);
    },
    bootMilliseconds,
  );

  it(
    'passes the staged esbuild binary to the geometry utility that bundles GeoSpec files',
    async () => {
      await boot();
      // The kernel and geometry utilities; the services utility is the one that receives the config directory.
      const runtimeEnvironments = state.utilityEnvironmentAdditions.filter(
        (additions) => 'TAU_DESKTOP_LOG_DIR' in additions && !('TAU_CONFIG_DIR' in additions),
      );
      expect(runtimeEnvironments).toHaveLength(2);
      for (const environment of runtimeEnvironments) {
        expect(environment['ESBUILD_BINARY_PATH']).toBe('/staged/esbuild');
      }
    },
    bootMilliseconds,
  );

  it(
    'seeds the shared payload store and posts its native composition to the kernel utilities, with no resource roots',
    async () => {
      await boot();
      await vi.waitFor(() => {
        expect(state.nativeStoreOptions).toBeDefined();
      });
      const options = state.nativeStoreOptions as {
        readonly store: string;
        readonly bundle: string | undefined;
        readonly hostPath: string;
        readonly post: (frame: unknown) => void;
      };
      // Unpackaged there is no bundle to seed from; the store is the one every Tau host on the machine shares.
      expect(options).toMatchObject({ store: join(state.userData, 'store'), bundle: undefined });
      expect(options.hostPath).toBe(join(state.userData, 'exe'));
      const frame = { type: 'tau:native-kernels', kernels: [] };
      options.post(frame);
      expect(state.runtimePost).toHaveBeenCalledWith(frame);
      for (const additions of state.utilityEnvironmentAdditions) {
        expect(Object.keys(additions).filter((name) => name.endsWith('_RESOURCE_ROOT'))).toEqual([]);
      }
    },
    bootMilliseconds,
  );

  it(
    'refuses the retired GeoSpec performance concern as unknown',
    async () => {
      await boot();
      const postMessage = vi.fn();
      for (const listener of state.ipcListeners.get(servicesPortRelayTag) ?? []) {
        listener(
          { senderFrame: { url: 'app://tau/index.html', postMessage } },
          { requestId: 'diagnostic', concern: 'geospecPerformance' },
        );
      }
      expect(postMessage).toHaveBeenCalledWith(servicesPortRelayTag, {
        requestId: 'diagnostic',
        error: 'services.unknown-concern',
      });
      expect(state.geometryMeasurementConnect).not.toHaveBeenCalled();
      expect(state.servicesConnect).not.toHaveBeenCalled();
    },
    bootMilliseconds,
  );

  it(
    'samples only the exact geometry utility pid and converts Electron KiB to bytes',
    async () => {
      await boot();
      app.getAppMetrics.mockReturnValue([
        { pid: 41, memory: { workingSetSize: 999 } },
        { pid: 42, memory: { workingSetSize: 512 } },
      ]);
      expect(state.geometrySampleResidentBytes?.({ pid: 42 })).toBe(512 * 1024);
      expect(state.geometrySampleResidentBytes?.({ pid: 43 })).toBeUndefined();
      expect(state.geometrySampleResidentBytes?.({ pid: undefined })).toBeUndefined();
    },
    bootMilliseconds,
  );

  it(
    'should keep the machine store under the config directory and connect a machines port that names no root, for a trusted frame only',
    async () => {
      /* A real directory an earlier build kept its printers in: imported from once. */
      const additions = await boot(async (userData) => {
        await mkdir(join(userData, 'machines'));
      });
      const store = join(state.userData, 'config', 'machines');
      expect(additions['TAU_DESKTOP_MACHINES_DIR']).toBe(store);
      const { mode } = await stat(store);
      // oxlint-disable-next-line eslint/no-bitwise -- the POSIX mode is a bit field
      expect(mode & 0o777).toBe(0o700);
      expect(additions['TAU_DESKTOP_LEGACY_MACHINES_DIR']).toBe(join(state.userData, 'machines'));

      const postMessage = vi.fn();
      relay({ url: 'app://tau/index.html', postMessage }, 'req-machines');
      expect(state.servicesConnect).toHaveBeenCalledExactlyOnceWith('machines', {});
      expect(postMessage).toHaveBeenCalledExactlyOnceWith(servicesPortRelayTag, { requestId: 'req-machines' }, [
        { id: 'services-port' },
      ]);

      const { isTrustedSender } = await import('#main/navigation-policy.js');
      vi.mocked(isTrustedSender).mockReturnValueOnce(false);
      const foreign = vi.fn();
      relay({ url: 'https://evil.example/', postMessage: foreign }, 'req-foreign');
      expect(foreign).not.toHaveBeenCalled();
      expect(state.servicesConnect).toHaveBeenCalledOnce();
      expect(state.log).toHaveBeenCalledWith('error', 'ipc.untrusted-sender', { url: 'https://evil.example/' });
    },
    bootMilliseconds,
  );

  it(
    'should not name the old machine directory when it is the store itself',
    async () => {
      /* How `…/Tau/machines` and `…/tau/machines` meet on a case-insensitive volume. */
      const additions = await boot(async (userData) => {
        await mkdir(join(userData, 'config', 'machines'), { recursive: true });
        await symlink(join(userData, 'config', 'machines'), join(userData, 'machines'));
      });
      expect(additions['TAU_DESKTOP_MACHINES_DIR']).toBe(join(state.userData, 'config', 'machines'));
      expect(additions).not.toHaveProperty('TAU_DESKTOP_LEGACY_MACHINES_DIR');
    },
    bootMilliseconds,
  );
});

/* eslint-enable @typescript-eslint/naming-convention -- End environment fixtures. */
