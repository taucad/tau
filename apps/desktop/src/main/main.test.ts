import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import type * as FileSystem from 'node:fs';
import type { StreamingMachine, MachineQuitDecision } from '@taucad/types/desktop';
/* eslint-disable @typescript-eslint/naming-convention -- mocked Electron exports and environment keys retain production names */
import { mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Worker as NodeWorker } from 'node:worker_threads';
import type * as WorkerThreads from 'node:worker_threads';

import type * as Host from '@taucad/host';
import { machineStartWaitMilliseconds } from '@taucad/runtime/machine';
import { desktopNativeKernelChannels } from '@taucad/types/desktop-native-kernels';
import { desktopUpdateChannels } from '@taucad/types/desktop-updates';
import type { DesktopUpdaterOptions } from '#main/updater.js';
import type * as Updater from '#main/updater.js';
import type { TauHeaderInjectionOptions } from '#main/header-injection.js';
import { desktopAgentSystemPrompt } from '#main/environment.js';

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  agentHostRatingChannel,
  agentHostSessionChannels,
  computeControlChannels,
  directoryGrantChannels,
  openDirectoryChannel,
  revealPathChannel,
  machinesChannels,
  quitChannels,
  servicesPortRelayTag,
  slicersChannels,
  windowFullscreenChannel,
} from '#shared/desktop-bootstrap.js';

type UpdateMenuItem = { label?: string; type?: string; role?: string; click?: () => void; submenu?: unknown };
const originalTitle = process.title;
const originalResourcesPath = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
const originalUncaught = new Set(process.listeners('uncaughtException'));
const originalUnhandled = new Set(process.listeners('unhandledRejection'));

const state = vi.hoisted(() => ({
  initializeErrorReporting: vi.fn(),
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
  servicesHasActiveDirectory: vi.fn(() => false),
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
  servicesStreaming: vi.fn(
    async (_boundMilliseconds: number, _attemptId?: string): Promise<readonly StreamingMachine[]> => [],
  ),
  servicesTerminals: vi.fn(async (_boundMilliseconds: number, _attemptId?: string): Promise<number> => 0),
  servicesResumeStarts: vi.fn(),
  servicesRecover: vi.fn(async () => undefined),
  runtimePrewarm: vi.fn(),
  runtimeMaxUtilities: undefined as number | undefined,
  runtimeSpareIdleMilliseconds: undefined as number | undefined,
  runtimeResidentLimit: undefined as
    | undefined
    | {
        readonly maxBytes: number;
        readonly intervalMilliseconds: number;
        readonly sample: (utility: { pid: number | undefined }) => number | undefined;
      },
  servicesRetainAgentHost: vi.fn(),
  servicesSend: vi.fn(),
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
  prepareToInstall: undefined as DesktopUpdaterOptions['prepareToInstall'],
  /* Lets a case hold ACP discovery open while the window boots (D17). */
  acpDiscovery: undefined as Promise<{ agents: never[]; refused: never[] }> | undefined,
  acpDiscoveryCalls: 0,
  bambuStudioStatus: vi.fn(async () => ({ available: false, reason: 'not installed' })),
  log: vi.fn(),
  updateMenuItems: [{ label: 'About Tau' }] as UpdateMenuItem[],
  installedUpdateMenuItems: [] as UpdateMenuItem[],
  helpMenuItems: [{ label: 'Learn More' }] as UpdateMenuItem[],
  installedHelpMenuItems: [] as UpdateMenuItem[],
  reportSignal: vi.fn(),
  flushReports: vi.fn(async () => true),
  authSignIn: vi.fn(async () => undefined),
  /* Per-case faults in synchronous filesystem calls main makes during bootstrap (B18). */
  mkdirSync: undefined as undefined | ((path: string) => void),
  realpathNative: undefined as undefined | ((path: string) => void),
  updaterCheck: vi.fn(async () => undefined),
  updaterInstall: vi.fn(async () => undefined),
  nativeStoreOptions: undefined as unknown,
  nativePreparerOptions: undefined as unknown,
  nativePrepare: vi.fn(async (kernel: string) => ({ status: 'ready', kernel, byteLength: 1 })),
  nativeCancel: vi.fn(),
  runtimePost: vi.fn(),
  servicesPost: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  const mkdirSync = ((path: FileSystem.PathLike, options?: FileSystem.MakeDirectoryOptions) => {
    state.mkdirSync?.(String(path));
    return actual.mkdirSync(path, options);
  }) as typeof actual.mkdirSync;
  const native = ((path: FileSystem.PathLike) => {
    state.realpathNative?.(String(path));
    return actual.realpathSync.native(path);
  }) as typeof actual.realpathSync.native;
  const realpathSync = Object.assign(
    ((path: FileSystem.PathLike, options?: FileSystem.EncodingOption) =>
      actual.realpathSync(path, options)) as typeof actual.realpathSync,
    { native },
  );
  const overridden = { ...actual, mkdirSync, realpathSync };
  return { ...overridden, default: overridden };
});

vi.mock('#main/error-reporting.js', () => ({
  initializeDesktopErrorReporting: state.initializeErrorReporting,
  reportDesktopSignal: state.reportSignal,
  flushDesktopErrorReporting: state.flushReports,
  rendererErrorReportingEnvironment: vi.fn(() => ({})),
}));

vi.mock('@taucad/desktop-services-host/native-preparation', () => ({
  createDesktopKernelPreparer: (options: unknown) => {
    state.nativePreparerOptions = options;
    return { prepare: state.nativePrepare, cancel: state.nativeCancel, dispose: async () => undefined };
  },
}));

vi.mock('@taucad/desktop-services-host/native-store', () => ({
  desktopNativeKernelIds: () => ['build123d'],
  startNativeStore: vi.fn(async (options: unknown) => {
    state.nativeStoreOptions = options;
    return undefined;
  }),
}));

vi.mock('#main/updater.js', async (importOriginal) => ({
  /* The update controller reads the retry delays and check interval from here. */
  ...(await importOriginal<typeof Updater>()),
  startDesktopUpdater: (options: DesktopUpdaterOptions) => {
    state.prepareToRestart = options.prepareToRestart;
    state.prepareToInstall = options.prepareToInstall;
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
  commandLine: { hasSwitch: vi.fn(() => false) },
  setPath: vi.fn((_name: string, _path: string) => undefined),
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
  relaunch: vi.fn(),
  disableHardwareAcceleration: vi.fn(),
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
  getSize: vi.fn((): [number, number] => [1216, 859]),
  getContentSize: vi.fn((): [number, number] => [1200, 800]),
  setMinimumSize: vi.fn(),
  restore: vi.fn(),
  loadURL: vi.fn(async () => undefined),
  loadFile: vi.fn(async () => undefined),
  reload: vi.fn(),
  close: vi.fn(),
  show: vi.fn(),
  focus: vi.fn(),
  once: vi.fn(),
  on: vi.fn<(event: string, listener: (...args: unknown[]) => void) => void>(),
};

const getWindows = vi.fn(() => [fakeWindow]);

/* The quit hold's only visible surface when it cannot settle (C69). */
const dialog = {
  showOpenDialog: vi.fn(),
  showMessageBoxSync: vi.fn((_window: unknown, _options: Readonly<{ buttons?: readonly string[] }>) => 0),
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
        {
          role: 'help',
          label: 'Help',
          submenu: {
            items: state.helpMenuItems,
            append: (item: UpdateMenuItem) => state.helpMenuItems.push(item),
          },
        },
      ],
      append: vi.fn(),
    })),
    setApplicationMenu: vi.fn(() => {
      // Electron's native menu does not reflect additions until it is installed again.
      state.installedUpdateMenuItems = [...state.updateMenuItems];
      state.installedHelpMenuItems = [...state.helpMenuItems];
    }),
  },
  clipboard: { writeText: vi.fn() },
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
  net: { fetch: vi.fn(), isOnline: vi.fn(() => true) },
  powerMonitor: { on: vi.fn() },
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
      spareIdleMilliseconds?: number;
      utilityEntry: string;
    }) => {
      state.runtimeSpareIdleMilliseconds = options.spareIdleMilliseconds;
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
  const { computeStoreWorkspace, keepAwakeWhileStreaming, projectCloseMilliseconds, projectReleaseMilliseconds } =
    await importOriginal<typeof Host>();
  return {
    computeStoreWorkspace,
    defaultConfigDirectory: vi.fn(() => join(state.userData, 'config')),
    defaultDependencyStore: vi.fn(() => join(state.userData, 'store')),
    discoverAcpAgents: vi.fn(async () => {
      state.acpDiscoveryCalls += 1;
      return state.acpDiscovery ?? { agents: [], refused: [] };
    }),
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
    principalName: vi.fn(() => undefined),
    refresh: vi.fn(async () => undefined),
    onChange: vi.fn(),
    dispose: vi.fn(),
    handleCallback: state.authHandleCallback,
    signIn: state.authSignIn,
    signOut: vi.fn(),
  })),
}));
vi.mock('#main/diagnostics.js', () => ({
  createDiagnosticsLog: vi.fn(() => ({
    filePath: join(state.userData, 'logs', 'desktop.log'),
    log: state.log,
    flush: vi.fn(async () => undefined),
    dispose: vi.fn(),
  })),
  forwardRendererDiagnostics: vi.fn(),
  forwardUtilityDiagnostics: vi.fn(),
  kernelUtilityDiagnostics: vi.fn(() => ({})),
  pagesThatCanSave: vi.fn((windows: readonly unknown[]) => [...windows]),
  watchRendererHangs: vi.fn(),
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
      post: state.servicesPost,
      connect: state.servicesConnect,
      completeMachineBinding: state.servicesCompleteBinding,
      streamingMachines: state.servicesStreaming,
      terminalSessions: state.servicesTerminals,
      peekStreamingMachines: vi.fn(async () => []),
      resumeMachineStarts: state.servicesResumeStarts,
      recover: state.servicesRecover,
      quiesce: state.servicesQuiesce,
      dispose: state.servicesDispose,
      hasActiveDirectory: state.servicesHasActiveDirectory,
      retainAgentHost: state.servicesRetainAgentHost,
      releaseAgentHost: state.servicesReleaseAgentHost,
      send: state.servicesSend,
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
  bundledStoreGuardEnvironment: vi.fn(() => ({})),
  windowsShellSandboxEnvironment: vi.fn(() => ({
    TAU_WINDOWS_SANDBOX_HELPER: String.raw`C:\Tau\resources\windows-sandbox\win32-x64\tau-windows-sandbox.exe`,
  })),
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
  state.prepareToInstall = undefined;
  state.updateMenuItems = [{ label: 'About Tau' }];
  state.installedUpdateMenuItems = [];
  state.helpMenuItems = [{ label: 'Learn More' }];
  state.installedHelpMenuItems = [];
  state.mkdirSync = undefined;
  state.realpathNative = undefined;
  state.flushReports.mockImplementation(async () => true);
  getWindows.mockReturnValue([fakeWindow]);
  state.acpDiscovery = undefined;
  state.acpDiscoveryCalls = 0;
  state.ready = undefined;
  state.shellApplied = undefined;
  state.authRestored = undefined;
  state.authToken = undefined;
  state.headerOptions = undefined;
  app.isPackaged = false;
  app.commandLine.hasSwitch.mockReturnValue(false);
  state.protocolClient.length = 0;
  state.authHandleCallback.mockClear();
  state.resolveFork = undefined;
  state.servicesConnect.mockClear();
  state.geometryMeasurementConnect.mockClear();
  state.geometrySampleResidentBytes = undefined;
  state.runtimeResidentLimit = undefined;
  state.servicesRetainAgentHost.mockClear();
  state.servicesSend.mockReset();
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
  state.servicesHasActiveDirectory.mockReturnValue(false);
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
      expect(state.initializeErrorReporting).toHaveBeenCalledOnce();
      expect(state.initializeErrorReporting.mock.invocationCallOrder[0]).toBeLessThan(
        fakeWindow.loadURL.mock.invocationCallOrder[0] ?? 0,
      );
    });
    return resolve(join(state.userData, 'home', 'project'));
  };

  it(
    'should register app privileges after Sentry installs its protocol wrapper',
    async () => {
      await bootstrap();
      const { protocol } = await import('electron');
      expect(state.initializeErrorReporting.mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(protocol.registerSchemesAsPrivileged).mock.invocationCallOrder[0] ?? 0,
      );
    },
    bootMilliseconds,
  );

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
    'should prepare and cancel a native kernel for a trusted document only',
    async () => {
      await bootstrap();
      const { isTrustedSender } = await import('#main/navigation-policy.js');
      const prepare = state.handlers.get(desktopNativeKernelChannels.prepare)!;
      const cancel = state.handlers.get(desktopNativeKernelChannels.cancel)!;

      await expect(prepare({ senderFrame: {} }, 'build123d')).resolves.toEqual({
        status: 'ready',
        kernel: 'build123d',
        byteLength: 1,
      });
      await cancel({ senderFrame: {} }, 'build123d');
      expect(state.nativeCancel).toHaveBeenCalledWith('build123d');

      vi.mocked(isTrustedSender).mockReturnValueOnce(false);
      await expect(prepare({ senderFrame: {} }, 'build123d')).rejects.toThrow('Untrusted kernel preparation request');
      await expect(prepare({ senderFrame: {} }, 42)).rejects.toThrow('Untrusted kernel preparation request');
      expect(state.nativePrepare).toHaveBeenCalledTimes(1);
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
    'logs a quit that reached before-quit with no reason of its own as external',
    async () => {
      await bootstrap();
      state.appListeners.get('before-quit')!.at(-1)!({ preventDefault: vi.fn() });
      await vi.waitFor(() => {
        expect(state.log).toHaveBeenCalledWith('info', 'main.quit-requested', { purpose: 'quit', reason: 'external' });
      });
    },
    bootMilliseconds,
  );

  it(
    'logs the session ending as the reason for the quit that follows it',
    async () => {
      await bootstrap();
      const { powerMonitor } = await import('electron');
      // `on` is overloaded per event, so its recorded calls are read untyped.
      const calls: ReadonlyArray<readonly unknown[]> = vi.mocked(powerMonitor.on).mock.calls;
      const shutdown = calls.findLast(([event]) => event === 'shutdown')?.[1];
      expect(shutdown).toBeTypeOf('function');
      (shutdown as () => void)();
      state.appListeners.get('before-quit')!.at(-1)!({ preventDefault: vi.fn() });
      await vi.waitFor(() => {
        expect(state.log).toHaveBeenCalledWith('info', 'main.quit-requested', {
          purpose: 'quit',
          reason: 'system-shutdown',
        });
      });
    },
    bootMilliseconds,
  );

  it(
    'logs an update restart as its own quit reason',
    async () => {
      await bootstrap();
      await expect(state.prepareToRestart!()).resolves.toBe(true);
      expect(state.log).toHaveBeenCalledWith('info', 'main.quit-requested', {
        purpose: 'restart',
        reason: 'update-install',
      });
    },
    bootMilliseconds,
  );

  it(
    'installer failure restores services before permitting another install',
    async () => {
      await bootstrap();
      const commit = vi.fn(async () => {
        throw new Error('spawn refused');
      });
      await expect(state.prepareToInstall!(commit)).resolves.toBe(false);
      expect(commit).toHaveBeenCalledOnce();
      expect(state.servicesDispose).not.toHaveBeenCalled();
      expect(state.geometryDispose).not.toHaveBeenCalled();
      expect(state.servicesRecover).toHaveBeenCalledOnce();
      expect(app.quit).not.toHaveBeenCalled();
      const retry = vi.fn();
      await expect(state.prepareToInstall!(retry)).resolves.toBe(true);
      expect(retry).toHaveBeenCalledOnce();
      expect(state.servicesDispose).toHaveBeenCalledOnce();
    },
    bootMilliseconds,
  );

  it(
    'installer commits before destructive service teardown',
    async () => {
      await bootstrap();
      const commit = vi.fn(() => {
        expect(state.servicesDispose).not.toHaveBeenCalled();
        expect(state.geometryDispose).not.toHaveBeenCalled();
      });
      await expect(state.prepareToInstall!(commit)).resolves.toBe(true);
      expect(commit).toHaveBeenCalledOnce();
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
  it(
    'revokes an unused saved grant, notifies windows, and preserves its files',
    async () => {
      await bootstrap();
      const directory = join(state.userData, 'Downloads');
      await mkdir(directory);
      await writeFile(join(directory, 'model.step'), 'preserve me');
      dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [directory] });
      await state.handlers.get('tau:select-directory')!({ senderFrame: {} });
      const list = state.handlers.get(directoryGrantChannels.list)!;
      const disconnect = state.handlers.get(directoryGrantChannels.disconnect)!;
      expect(list({ senderFrame: {} })).toEqual([directory]);
      state.servicesHasActiveDirectory.mockReturnValueOnce(true);
      expect(disconnect({ senderFrame: {} }, directory)).toContain('Close projects');
      expect(list({ senderFrame: {} })).toEqual([directory]);
      disconnect({ senderFrame: {} }, directory);
      expect(list({ senderFrame: {} })).toEqual([]);
      expect(JSON.parse(await readFile(join(state.userData, 'granted-roots.json'), 'utf8'))).not.toContain(directory);
      expect(await readFile(join(directory, 'model.step'), 'utf8')).toBe('preserve me');
      expect(fakeWindow.webContents.send).toHaveBeenCalledWith(directoryGrantChannels.changed);
    },
    bootMilliseconds,
  );

  it(
    'should open the folder picker at the nearest existing ancestor of a default path that is gone (T-R4.5)',
    async () => {
      await bootstrap();
      const parent = join(state.userData, 'Projects');
      await mkdir(parent, { recursive: true });
      dialog.showOpenDialog.mockClear();
      dialog.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });

      await state.handlers.get('tau:select-directory')!(
        { senderFrame: {} },
        { id: 'tau-locate-wsp_tau', defaultPath: join(parent, 'Moved Away', 'Workshop') },
      );

      expect(dialog.showOpenDialog).toHaveBeenCalledOnce();
      const request = dialog.showOpenDialog.mock.calls[0]!.at(-1) as { defaultPath?: string };
      expect(request.defaultPath).toBe(parent);
    },
    bootMilliseconds,
  );

  it(
    "should refuse a picked folder that holds Tau's own data and leave the grants unchanged",
    async () => {
      await bootstrap();
      const list = state.handlers.get(directoryGrantChannels.list)!;
      const before = list({ senderFrame: {} });
      dialog.showMessageBox.mockClear();
      const pickRefused = async (picked: string): Promise<void> => {
        await mkdir(picked, { recursive: true });
        dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [picked] });

        await expect(state.handlers.get('tau:select-directory')!({ senderFrame: {} })).resolves.toBeUndefined();

        expect(list({ senderFrame: {} })).toEqual(before);
      };
      await pickRefused(state.userData);
      await pickRefused(join(state.userData, 'filesystem-authority', 'nested'));
      expect(dialog.showMessageBox).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(dialog.showMessageBox.mock.calls[0])).toContain("Tau's own data");
      expect(fakeWindow.webContents.send).not.toHaveBeenCalledWith(directoryGrantChannels.changed);
    },
    bootMilliseconds,
  );

  it(
    'refuses Home, relative paths, and untrusted grant requests',
    async () => {
      await bootstrap();
      const disconnect = state.handlers.get(directoryGrantChannels.disconnect)!;
      expect(() => disconnect({ senderFrame: {} }, join(state.userData, 'home'))).toThrow('Home cannot');
      expect(() => disconnect({ senderFrame: {} }, 'Downloads')).toThrow('invalid directory');
      const { isTrustedSender } = await import('#main/navigation-policy.js');
      vi.mocked(isTrustedSender).mockReturnValueOnce(false);
      expect(() => disconnect({ senderFrame: {} }, '/Downloads')).toThrow('invalid directory');
      vi.mocked(isTrustedSender).mockReturnValueOnce(false);
      expect(() => state.handlers.get(directoryGrantChannels.list)!({ senderFrame: {} })).toThrow(
        'untrusted directory',
      );
    },
    bootMilliseconds,
  );

  /* WP9 (R7, T-B5.8): a reset database adopts each granted folder under the id its marker names. */
  it(
    'should read the marker of a granted folder only, and answer nothing for a folder without one',
    async () => {
      await bootstrap();
      const granted = join(state.userData, 'Granted');
      const bare = join(state.userData, 'Bare');
      await mkdir(join(granted, '.tau'), { recursive: true });
      await mkdir(bare, { recursive: true });
      await writeFile(join(granted, '.tau', 'workspace.json'), '{"workspaceId":"wsp_marked"}');
      for (const directory of [granted, bare]) {
        dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [directory] });
        // oxlint-disable-next-line no-await-in-loop -- grants are admitted one pick at a time.
        await state.handlers.get('tau:select-directory')!({ senderFrame: {} });
      }
      const marker = state.handlers.get(directoryGrantChannels.marker)!;
      await expect(marker({ senderFrame: {} }, granted)).resolves.toBe('{"workspaceId":"wsp_marked"}');
      await expect(marker({ senderFrame: {} }, bare)).resolves.toBeUndefined();
      /* Not granted, relative, or not a string: refused before any read. */
      await expect(marker({ senderFrame: {} }, join(state.userData, 'Elsewhere'))).resolves.toBeUndefined();
      await expect(async () => marker({ senderFrame: {} }, 'Granted')).rejects.toThrow('invalid directory');
      await expect(async () => marker({ senderFrame: {} }, 42)).rejects.toThrow('invalid directory');
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

  /* T-A2.1 (D4.6): the floor is a 400 × 300 content area, so the minimum set on the frame adds the frame's own size,
   * measured after creation and again whenever full screen changes the chrome. */
  it(
    'should hold the window to a 400 x 300 content floor through its frame, and measure again after full screen',
    async () => {
      fakeWindow.setMinimumSize.mockClear();
      fakeWindow.getSize.mockReturnValue([1216, 859]);
      fakeWindow.getContentSize.mockReturnValue([1200, 800]);
      await bootstrap();
      expect(fakeWindow.setMinimumSize).toHaveBeenLastCalledWith(416, 359);

      fakeWindow.setMinimumSize.mockClear();
      fakeWindow.getSize.mockReturnValue([1440, 900]);
      fakeWindow.getContentSize.mockReturnValue([1440, 900]);
      const enter = fakeWindow.on.mock.calls.findLast(([name]) => name === 'enter-full-screen')?.[1];
      enter?.();
      expect(fakeWindow.setMinimumSize).toHaveBeenLastCalledWith(400, 300);

      fakeWindow.setMinimumSize.mockClear();
      fakeWindow.getSize.mockReturnValue([1216, 859]);
      fakeWindow.getContentSize.mockReturnValue([1200, 800]);
      const leave = fakeWindow.on.mock.calls.findLast(([name]) => name === 'leave-full-screen')?.[1];
      leave?.();
      expect(fakeWindow.setMinimumSize).toHaveBeenLastCalledWith(416, 359);
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

  it(
    'configures project history even when external agent discovery rejects',
    async () => {
      const discovery = Promise.withResolvers<{ agents: never[]; refused: never[] }>();
      state.acpDiscovery = discovery.promise;
      await bootstrap();
      const answer = state.handlers.get('tau:external-agents')!({ senderFrame: {} });
      discovery.reject(new Error('The external agent could not be discovered.'));
      await expect(answer).resolves.toEqual([]);
      expect(state.servicesPost).toHaveBeenCalledWith({
        type: 'agentHost',
        config: {
          gatewayBaseUrl: 'http://127.0.0.1:1',
          systemPrompt: desktopAgentSystemPrompt,
          tauApiUrl: 'http://127.0.0.1:1',
          tauWebSocketUrl: 'ws://127.0.0.1:1',
        },
      });
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
    "should give a copy of a project the project's compute connection and keep other projects apart",
    async () => {
      const projectRoot = await bootstrap();
      const copyRoot = resolve(join(state.userData, 'home', 'project-copy'));
      const otherRoot = resolve(join(state.userData, 'home', 'other'));
      const identify = async (root: string, projectId: string): Promise<void> => {
        await mkdir(join(root, '.tau'), { recursive: true });
        await writeFile(join(root, '.tau', 'project.json'), `${JSON.stringify({ version: 1, projectId })}\n`);
      };
      await identify(projectRoot, 'proj_AAAAAAAAAAAAAAAAAAAAA');
      await identify(copyRoot, 'proj_AAAAAAAAAAAAAAAAAAAAA');
      await identify(otherRoot, 'proj_BBBBBBBBBBBBBBBBBBBBB');
      const project = state.resolveFork!({ projectRoot, computeMode: 'durable' });
      const copy = state.resolveFork!({ projectRoot: copyRoot, computeMode: 'durable' });
      const other = state.resolveFork!({ projectRoot: otherRoot, computeMode: 'durable' });
      const storeOf = (resolved: typeof project): unknown => (resolved.compute as { store: unknown }).store;

      expect(storeOf(copy)).toBe(storeOf(project));
      expect(storeOf(other)).not.toBe(storeOf(project));
      for (const resolved of [project, copy, other]) {
        resolved.release!();
      }
    },
    bootMilliseconds,
  );

  it(
    "should give a Git worktree of a project the project's compute connection",
    async () => {
      const projectRoot = await bootstrap();
      const worktreeRoot = resolve(join(state.userData, 'home', 'project-feature'));
      await mkdir(join(projectRoot, '.tau'), { recursive: true });
      await writeFile(
        join(projectRoot, '.tau', 'project.json'),
        `${JSON.stringify({ version: 1, projectId: 'proj_AAAAAAAAAAAAAAAAAAAAA' })}\n`,
      );
      await writeFile(join(projectRoot, '.gitignore'), '/.tau/*\n');
      await writeFile(join(projectRoot, 'tau.json'), '{}\n');
      const git = (...args: string[]): void => {
        execFileSync(
          'git',
          ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
          { cwd: projectRoot, stdio: 'ignore' },
        );
      };
      git('init', '-q');
      git('add', '.');
      git('commit', '-qm', 'init');
      git('worktree', 'add', '-q', worktreeRoot);
      const project = state.resolveFork!({ projectRoot, computeMode: 'durable' });
      const worktree = state.resolveFork!({ projectRoot: worktreeRoot, computeMode: 'durable' });
      const storeOf = (resolved: typeof project): unknown => (resolved.compute as { store: unknown }).store;

      expect(existsSync(join(worktreeRoot, '.tau', 'project.json'))).toBe(false);
      expect(storeOf(worktree)).toBe(storeOf(project));
      project.release!();
      worktree.release!();
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
    'should keep the prewarmed kernel spare only while projects are being opened',
    async () => {
      await bootstrap();
      expect(state.runtimePrewarm).toHaveBeenCalled();
      /* D-DT-09: the same idle bound as the geometry slot, so an idle app holds no spare utility. */
      expect(state.runtimeSpareIdleMilliseconds).toBe(120_000);
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
    'should relay a trusted rating of a run to the services utility, and refuse anything else',
    async () => {
      await bootstrap();
      const rated = state.handlers.get(agentHostRatingChannel)!;
      const trusted = { sender: { id: 7 }, senderFrame: { url: 'app://tau/' } };
      const rating = { projectId: 'proj_a', chatId: 'chat-1', runId: 'run-1', value: 'positive', at: 1 };

      await rated(trusted, rating);
      expect(state.servicesSend).toHaveBeenCalledExactlyOnceWith({ type: 'agent-host-rated', ...rating });

      const { isTrustedSender } = await import('#main/navigation-policy.js');
      vi.mocked(isTrustedSender).mockReturnValueOnce(false);
      await expect(rated(trusted, rating)).rejects.toThrow();
      await expect(rated(trusted, { ...rating, value: 'great' })).rejects.toThrow();
      await expect(rated(trusted, { ...rating, at: Number.NaN })).rejects.toThrow();
      await expect(rated(trusted, { ...rating, projectId: '' })).rejects.toThrow();
      expect(state.servicesSend).toHaveBeenCalledOnce();

      /* A quiescing utility takes no request: the rating is only a missing feedback fact, never a renderer error. */
      state.servicesSend.mockImplementationOnce(() => {
        throw new Error('The services broker is quiescing and sends no requests.');
      });
      await expect(rated(trusted, rating)).resolves.toBeUndefined();
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
    'gives the shell app data and Tau-owned bubblewrap to the services utility, the only reader of either',
    async () => {
      await bootstrap();
      /* Both names were once set on the geometry utility, which reads neither, so the services host fell back to the
       * distro `/usr/bin/bwrap` — unprofiled, and on a stock Ubuntu 24.04 or Debian 13 that means a user namespace
       * with no capabilities and no shell at all — and never denied its own `userData` to a launch. */
      const carrying = state.utilityEnvironmentAdditions.filter(
        (additions) => 'TAU_DESKTOP_USER_DATA_DIR' in additions,
      );
      expect(carrying).toHaveLength(1);
      expect(carrying[0]?.['TAU_DESKTOP_USER_DATA_DIR']).toBe(state.userData);
      expect(carrying[0]?.['TAU_DESKTOP_AUTHORITY_DIR']).toBe(join(state.userData, 'filesystem-authority'));
    },
    bootMilliseconds,
  );

  it(
    'gives the Windows shell sandbox helper to the services utility alone',
    async () => {
      await bootstrap();
      const carrying = state.utilityEnvironmentAdditions.filter(
        (additions) => 'TAU_WINDOWS_SANDBOX_HELPER' in additions,
      );
      expect(carrying).toHaveLength(1);
      expect(carrying[0]).toHaveProperty('TAU_DESKTOP_USER_DATA_DIR', state.userData);
      expect(carrying[0]?.['TAU_WINDOWS_SANDBOX_HELPER']).toBe(
        String.raw`C:\Tau\resources\windows-sandbox\win32-x64\tau-windows-sandbox.exe`,
      );
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
          /* A filesystem concern is scoped to the asking window's import grants (W7.4). */
          { sender: { id: 7 }, senderFrame: { url: 'app://tau/index.html', postMessage } },
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
    'quits with running Terminal sessions without asking, and the quit stops them (T15)',
    async () => {
      await bootstrap();
      state.servicesTerminals.mockResolvedValueOnce(2);
      state.appListeners.get('before-quit')!.at(-1)!({ preventDefault: vi.fn() });
      await vi.waitFor(() => {
        expect(app.quit).toHaveBeenCalledOnce();
      });
      expect(dialog.showMessageBox).not.toHaveBeenCalled();
      expect(state.servicesQuiesce).toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({ forceMachines: false }),
      );
    },
    bootMilliseconds,
  );

  it(
    'quits without asking when the Terminal count is unanswered (T15)',
    async () => {
      await bootstrap();
      state.servicesTerminals.mockRejectedValueOnce(new Error('The desktop shell service did not answer'));
      state.appListeners.get('before-quit')!.at(-1)!({ preventDefault: vi.fn() });
      await vi.waitFor(() => {
        expect(app.quit).toHaveBeenCalledOnce();
      });
      expect(dialog.showMessageBox).not.toHaveBeenCalled();
    },
    bootMilliseconds,
  );

  it(
    'keeps the machine review without a Terminal note when Terminals are running (T15)',
    async () => {
      await bootstrap();
      state.servicesTerminals.mockResolvedValueOnce(1);
      state.servicesStreaming.mockResolvedValueOnce([{ hostId: 'host', machineId: 'mill', name: 'LongMill' }]);
      dialog.showMessageBox.mockResolvedValueOnce({ response: 1 });
      state.appListeners.get('before-quit')!.at(-1)!({ preventDefault: vi.fn() });
      await vi.waitFor(() => {
        expect(state.servicesResumeStarts).toHaveBeenCalledOnce();
      });
      const [options] = dialog.showMessageBox.mock.calls[0] as unknown as [{ buttons: string[]; detail: string }];
      expect(options.buttons).toEqual(['View machines', 'Keep Tau open', 'Quit anyway']);
      expect(options.detail).not.toContain('Terminal');
      expect(state.servicesQuiesce).not.toHaveBeenCalled();
    },
    bootMilliseconds,
  );

  it(
    'lets a window close or reload without asking, even when the page holds its unload (T15)',
    async () => {
      await bootstrap();
      const unload = fakeWindow.webContents.on.mock.calls.findLast(([name]) => name === 'will-prevent-unload')?.[1];
      expect(unload).toBeDefined();
      const held = { preventDefault: vi.fn() };
      unload!(held);
      expect(held.preventDefault).toHaveBeenCalledOnce();
      expect(dialog.showMessageBoxSync).not.toHaveBeenCalled();
    },
    bootMilliseconds,
  );

  it(
    'keeps a window when Keep Tau open answers a quit that followed the last window closing (T15)',
    async () => {
      const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
      Object.defineProperty(process, 'platform', { ...platform, value: 'linux' });
      try {
        await bootstrap();
        expect(fakeWindow.loadURL).toHaveBeenCalledOnce();
        getWindows.mockReturnValue([]);
        state.servicesStreaming.mockResolvedValueOnce([{ hostId: 'host', machineId: 'mill', name: 'LongMill' }]);
        dialog.showMessageBox.mockResolvedValueOnce({ response: 1 });
        state.appListeners.get('before-quit')!.at(-1)!({ preventDefault: vi.fn() });
        await vi.waitFor(() => {
          expect(fakeWindow.loadURL).toHaveBeenCalledTimes(2);
        });
        expect(app.quit).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, 'platform', platform);
      }
    },
    bootMilliseconds,
  );

  it(
    'creates no window on macOS when Keep Tau open answers a quit with no window open (T15 control)',
    async () => {
      const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
      Object.defineProperty(process, 'platform', { ...platform, value: 'darwin' });
      try {
        await bootstrap();
        expect(fakeWindow.loadURL).toHaveBeenCalledOnce();
        getWindows.mockReturnValue([]);
        state.servicesStreaming.mockResolvedValueOnce([{ hostId: 'host', machineId: 'mill', name: 'LongMill' }]);
        dialog.showMessageBox.mockResolvedValueOnce({ response: 1 });
        state.appListeners.get('before-quit')!.at(-1)!({ preventDefault: vi.fn() });
        await vi.waitFor(() => {
          expect(state.servicesResumeStarts).toHaveBeenCalledOnce();
        });
        /* A later quit goes through, so the cancelled one settled; the dock reopens a window, not the quit. */
        state.appListeners.get('before-quit')!.at(-1)!({ preventDefault: vi.fn() });
        await vi.waitFor(() => {
          expect(app.quit).toHaveBeenCalledOnce();
        });
        expect(fakeWindow.loadURL).toHaveBeenCalledOnce();
      } finally {
        Object.defineProperty(process, 'platform', platform);
      }
    },
    bootMilliseconds,
  );

  it(
    'settles a called-off quit even when reopening the window fails, so a later quit still quits (T15)',
    async () => {
      const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
      Object.defineProperty(process, 'platform', { ...platform, value: 'linux' });
      try {
        await bootstrap();
        getWindows.mockReturnValue([]);
        fakeWindow.loadURL.mockRejectedValueOnce(new Error('renderer failed to load'));
        state.servicesStreaming.mockResolvedValueOnce([{ hostId: 'host', machineId: 'mill', name: 'LongMill' }]);
        dialog.showMessageBox.mockResolvedValueOnce({ response: 1 });
        state.appListeners.get('before-quit')!.at(-1)!({ preventDefault: vi.fn() });
        await vi.waitFor(() => {
          expect(fakeWindow.loadURL).toHaveBeenCalledTimes(2);
        });
        expect(app.quit).not.toHaveBeenCalled();

        state.appListeners.get('before-quit')!.at(-1)!({ preventDefault: vi.fn() });
        await vi.waitFor(() => {
          expect(app.quit).toHaveBeenCalledOnce();
        });
      } finally {
        Object.defineProperty(process, 'platform', platform);
      }
    },
    bootMilliseconds,
  );

  it(
    'keeps a window when restoring the workspace follows a quit that closed the last window (T15)',
    async () => {
      const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
      Object.defineProperty(process, 'platform', { ...platform, value: 'linux' });
      try {
        await bootstrap();
        expect(fakeWindow.loadURL).toHaveBeenCalledOnce();
        getWindows.mockReturnValue([]);
        state.servicesQuiesce.mockResolvedValueOnce({ status: 'failed', message: 'drain failed' });
        dialog.showMessageBox.mockResolvedValueOnce({ response: 0 });
        state.appListeners.get('before-quit')!.at(-1)!({ preventDefault: vi.fn() });
        await vi.waitFor(() => {
          expect(fakeWindow.loadURL).toHaveBeenCalledTimes(2);
        });
        expect(state.servicesRecover).toHaveBeenCalledOnce();
        expect(fakeWindow.reload).not.toHaveBeenCalled();
        expect(app.quit).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, 'platform', platform);
      }
    },
    bootMilliseconds,
  );

  it(
    'asks for the quit attempt so the utility holds new Terminal starts, alongside the machine question (T15)',
    async () => {
      await bootstrap();
      const terminals = Promise.withResolvers<number>();
      state.servicesTerminals.mockReturnValueOnce(terminals.promise);
      state.appListeners.get('before-quit')!.at(-1)!({ preventDefault: vi.fn() });
      /* Both questions are out before either answers. */
      await vi.waitFor(() => {
        expect(state.servicesStreaming).toHaveBeenCalled();
      });
      const [, attemptId] = state.servicesTerminals.mock.calls.at(-1) as unknown as [number, string];
      expect(typeof attemptId).toBe('string');
      expect(state.servicesStreaming.mock.calls.at(-1)?.[1]).toBe(attemptId);
      terminals.resolve(0);
      await vi.waitFor(() => {
        expect(app.quit).toHaveBeenCalledOnce();
      });
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

  /* T-R11.2 (D7): only a locked release owns `Tau Staging`. A staging build that honours overrides and is started
   * without `--user-data-dir` uses `Tau Staging Dev`, so a development or test run can never default into the
   * installed app's profile. */
  it.each([
    { overrides: true, explicitProfile: true, profile: undefined },
    { overrides: true, explicitProfile: false, profile: 'Tau Staging Dev' },
    { overrides: false, explicitProfile: true, profile: 'Tau Staging' },
    { overrides: false, explicitProfile: false, profile: 'Tau Staging' },
  ])(
    'should isolate a staging profile according to $overrides/$explicitProfile',
    async (options) => {
      state.userData = await mkdtemp(join(tmpdir(), 'tau-staging-profile-'));
      state.ready = Promise.withResolvers<void>().promise;
      app.isPackaged = true;
      Object.defineProperty(process, 'resourcesPath', { configurable: true, value: state.userData });
      app.commandLine.hasSwitch.mockReturnValue(options.explicitProfile);
      await writeFile(
        join(state.userData, 'package.json'),
        JSON.stringify({ tauDesktop: { channel: 'staging', environmentOverrides: options.overrides } }),
      );
      await import('#main/main.js');
      const profileCall = app.setPath.mock.calls.find(([name]) => name === 'userData');
      if (options.profile === undefined) {
        expect(profileCall).toBeUndefined();
      } else {
        expect(profileCall).toEqual(['userData', join(state.userData, 'appData', options.profile)]);
      }
      expect(app.setPath).toHaveBeenCalledWith('sessionData', state.userData);
    },
    bootMilliseconds,
  );

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
    'holds the first authenticated request, not the first page, until the credential is restored (B32)',
    async () => {
      const restore = Promise.withResolvers<void>();
      state.authRestored = restore.promise;
      const { installTauHeaderInjection } = await vi.importActual<{
        installTauHeaderInjection: (
          webRequest: {
            onBeforeSendHeaders: (
              filter: unknown,
              listener: (
                details: { url: string; requestHeaders: Record<string, string> },
                callback: (response: { requestHeaders: Record<string, string> }) => void,
              ) => void,
            ) => void;
          },
          options: TauHeaderInjectionOptions,
        ) => void;
      }>('#main/header-injection.js');
      let firstRequestHeaders: Record<string, string> | undefined;
      fakeWindow.loadURL.mockImplementationOnce(async () => {
        installTauHeaderInjection(
          {
            onBeforeSendHeaders: (_filter, listener) => {
              listener({ url: 'http://127.0.0.1:1/v1/projects', requestHeaders: {} }, ({ requestHeaders }) => {
                firstRequestHeaders = requestHeaders;
              });
            },
          },
          state.headerOptions!,
        );
      });

      await boot();
      await vi.waitFor(() => {
        expect(fakeWindow.loadURL).toHaveBeenCalledOnce();
      });
      expect(state.headerOptions?.token()).toBeUndefined();
      expect(firstRequestHeaders).toBeUndefined();

      state.authToken = 'restored-token';
      restore.resolve();
      await vi.waitFor(() => {
        expect(firstRequestHeaders).toEqual({
          authorization: 'Bearer restored-token',
          'tau-client': 'tau-desktop/test',
        });
      });
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
      await vi.waitFor(() => {
        expect(fakeWindow.loadURL).toHaveBeenCalledWith('app://tau/');
      });
      expect(fakeWindow.loadURL).not.toHaveBeenCalledWith('app://tau/invitations/queued-token');

      restore.resolve();
      await vi.waitFor(() => {
        expect(fakeWindow.loadURL).toHaveBeenCalledWith('app://tau/invitations/queued-token');
      });
    },
    bootMilliseconds,
  );

  it(
    'logs a failed credential restore and starts signed out instead of ending the launch',
    async () => {
      const restore = Promise.withResolvers<void>();
      state.authRestored = restore.promise;
      await boot();
      await vi.waitFor(() => {
        expect(fakeWindow.loadURL).toHaveBeenCalledOnce();
      });
      restore.reject(new Error('credential store failed'));

      await vi.waitFor(() => {
        expect(state.log).toHaveBeenCalledWith('warn', 'auth.restore-failed', expect.any(Error));
      });
      expect(app.exit).not.toHaveBeenCalled();
      expect(state.headerOptions?.token()).toBeUndefined();
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
    'reads the shared dependency store and posts its native composition to the kernel utilities, with no resource roots',
    async () => {
      await boot();
      await vi.waitFor(() => {
        expect(state.nativeStoreOptions).toBeDefined();
      });
      const options = state.nativeStoreOptions as {
        readonly store: string;
        readonly hostPath: string;
        readonly post: (frame: unknown) => void;
      };
      // The store is the one every Tau host on the machine shares, and the one main prepares kernels into.
      expect(options).toMatchObject({ store: join(state.userData, 'store') });
      expect(options).not.toHaveProperty('bundle');
      expect(state.nativePreparerOptions).toMatchObject({ store: join(state.userData, 'store') });
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

/* eslint-disable @typescript-eslint/naming-convention -- Electron exports keep their names; Sentry tags are snake_case. */
describe('desktop main boot hardening (WP5)', () => {
  const bootMilliseconds = 30_000;

  /** Boot main over fresh user data, after `before` lays out what an earlier launch left there. */
  const boot = async (before?: (userData: string) => Promise<void>): Promise<void> => {
    vi.stubGlobal('tauCloudBuildEnabled', false);
    state.userData = await mkdtemp(join(tmpdir(), 'tau-main-hardening-'));
    await before?.(state.userData);
    await import('#main/main.js');
  };
  const booted = async (before?: (userData: string) => Promise<void>): Promise<void> => {
    await boot(before);
    await vi.waitFor(() => {
      expect(fakeWindow.loadURL).toHaveBeenCalledOnce();
    });
  };
  const signals = (name: string): Array<{ tags: Record<string, string> }> =>
    state.reportSignal.mock.calls
      .map(([signal]) => signal as { fingerprint?: readonly string[]; tags: Record<string, string> } | undefined)
      .filter((signal) => signal?.fingerprint?.[0] === name) as Array<{ tags: Record<string, string> }>;
  const troubleshooting = (): UpdateMenuItem[] => {
    const entry = state.installedHelpMenuItems.find((item) => item.label === 'Troubleshooting');
    return (entry?.submenu ?? []) as UpdateMenuItem[];
  };

  it(
    'should start the updater and install the menu before the first page loads, and show the window at 15 s (T-B17.1)',
    async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        fakeWindow.loadURL.mockReturnValueOnce(Promise.withResolvers<undefined>().promise);
        await boot();
        /* `vi.waitFor` advances fake timers while it polls, which would spend the deadline under test. */
        const giveUpAt = Date.now() + 20_000;
        while (Date.now() < giveUpAt && fakeWindow.loadURL.mock.calls.length === 0) {
          // oxlint-disable-next-line no-await-in-loop -- yield to bootstrap without touching the faked clock
          await new Promise((resolve) => {
            setImmediate(resolve);
          });
        }
        expect(fakeWindow.loadURL).toHaveBeenCalledOnce();
        const { Menu } = await import('electron');
        expect(state.prepareToRestart).toBeDefined();
        expect(state.installedUpdateMenuItems.map((item) => item.label)).toContain('Check for Updates…');
        expect(troubleshooting().map((item) => item.label)).toContain('Check for Updates…');
        expect(vi.mocked(Menu.setApplicationMenu).mock.invocationCallOrder[0]).toBeLessThan(
          fakeWindow.loadURL.mock.invocationCallOrder[0] ?? 0,
        );
        expect(fakeWindow.show).not.toHaveBeenCalled();
        vi.advanceTimersByTime(14_999);
        expect(fakeWindow.show).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(fakeWindow.show).toHaveBeenCalledOnce();
      } finally {
        vi.useRealTimers();
      }
    },
    bootMilliseconds,
  );

  it(
    'should show the window as soon as it is ready to show (T-B17.2)',
    async () => {
      fakeWindow.loadURL.mockReturnValueOnce(Promise.withResolvers<undefined>().promise);
      await boot();
      await vi.waitFor(() => {
        expect(fakeWindow.loadURL).toHaveBeenCalledOnce();
      });
      const readyToShow = [...fakeWindow.once.mock.calls, ...fakeWindow.on.mock.calls].find(
        ([event]) => event === 'ready-to-show',
      )?.[1] as (() => void) | undefined;
      expect(readyToShow).toBeTypeOf('function');
      expect(fakeWindow.show).not.toHaveBeenCalled();
      readyToShow!();
      expect(fakeWindow.show).toHaveBeenCalledOnce();
    },
    bootMilliseconds,
  );

  it(
    'should explain a bootstrap failure in a native dialog before it exits (T-B18.1)',
    async () => {
      state.mkdirSync = (path) => {
        if (path === join(state.userData, 'home')) {
          throw Object.assign(new Error(`EACCES: permission denied, mkdir '${path}'`), { code: 'EACCES' });
        }
      };
      dialog.showMessageBox.mockResolvedValueOnce({ response: 3 });
      await boot();
      await vi.waitFor(() => {
        expect(app.exit).toHaveBeenCalled();
      });
      expect(dialog.showMessageBox).toHaveBeenCalledOnce();
      const options = dialog.showMessageBox.mock.calls[0]![0];
      expect(options.buttons).toEqual(['Restart in Safe Mode', 'Show Logs', 'Download Tau', 'Quit']);
      expect(dialog.showMessageBox.mock.invocationCallOrder[0]).toBeLessThan(app.exit.mock.invocationCallOrder[0]!);
      expect(state.flushReports.mock.invocationCallOrder[0]).toBeLessThan(
        dialog.showMessageBox.mock.invocationCallOrder[0]!,
      );
      expect(signals('desktop-bootstrap-failed')).toEqual([
        expect.objectContaining({ tags: { step: 'home-directory', errno: 'EACCES' } }),
      ]);
      expect(state.log).toHaveBeenCalledWith(
        'error',
        'main.bootstrap-failed',
        expect.objectContaining({ step: 'home-directory' }),
      );
      expect(fakeWindow.loadURL).not.toHaveBeenCalled();
    },
    bootMilliseconds,
  );

  it(
    'should log and report an uncaught exception and an unhandled rejection after bootstrap (T-B18.3)',
    async () => {
      await booted();
      const added = (event: 'uncaughtException' | 'unhandledRejection', original: ReadonlySet<unknown>) =>
        (process.listeners(event as 'uncaughtException') as unknown[]).filter(
          (listener) => !original.has(listener),
        ) as Array<(...args: unknown[]) => void>;
      const exception = new TypeError('late fault');
      const rejection = new RangeError('late rejection');
      for (const listener of added('uncaughtException', originalUncaught)) {
        listener(exception, 'uncaughtException');
      }
      for (const listener of added('unhandledRejection', originalUnhandled)) {
        listener(rejection, Promise.resolve());
      }
      expect(state.log).toHaveBeenCalledWith('error', 'main.uncaught-exception', exception);
      expect(state.log).toHaveBeenCalledWith('error', 'main.unhandled-rejection', rejection);
      expect(signals('desktop-main-uncaught')).toEqual([
        expect.objectContaining({ tags: { kind: 'exception', error_name: 'TypeError' } }),
        expect.objectContaining({ tags: { kind: 'rejection', error_name: 'RangeError' } }),
      ]);
    },
    bootMilliseconds,
  );

  it(
    'should skip a failing optional step and still load the first page (T-B18.4)',
    async () => {
      const { removeStaleQuickLookSessions } = await import('#main/quick-look.js');
      vi.mocked(removeStaleQuickLookSessions).mockImplementationOnce(() => {
        throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
      });
      await booted(async (userData) => {
        await mkdir(join(userData, 'machines'));
        state.realpathNative = (path) => {
          if (path === join(userData, 'machines')) {
            throw Object.assign(new Error('EIO'), { code: 'EIO' });
          }
        };
      });
      expect(signals('desktop-optional-step-failed').map(({ tags }) => tags)).toEqual(
        expect.arrayContaining([
          { step: 'quick-look-cleanup', errno: 'EBUSY' },
          { step: 'legacy-machines', errno: 'EIO' },
        ]),
      );
      expect(signals('desktop-optional-step-failed')).toHaveLength(2);
      expect(app.exit).not.toHaveBeenCalled();
    },
    bootMilliseconds,
  );

  it(
    'should create a window for a second launch when none exists, and show a hidden one (T-B19.1)',
    async () => {
      await booted();
      const { BrowserWindow } = await import('electron');
      const created = vi.mocked(BrowserWindow).mock.calls.length;
      const secondInstance = state.appListeners.get('second-instance')!.at(-1)!;
      getWindows.mockReturnValue([]);
      secondInstance({}, ['tau']);
      await vi.waitFor(() => {
        expect(vi.mocked(BrowserWindow).mock.calls.length).toBe(created + 1);
      });
      getWindows.mockReturnValue([fakeWindow]);
      fakeWindow.show.mockClear();
      secondInstance({}, ['tau']);
      expect(fakeWindow.show).toHaveBeenCalled();
    },
    bootMilliseconds,
  );

  it(
    'should boot normally past a leftover route qualification state file and report it once (T-B23.1)',
    async () => {
      await booted(async (userData) => {
        await writeFile(join(userData, 'route-qualification.state.json'), '{}');
      });
      expect(signals('desktop-probe-leftover-ignored')).toEqual([
        expect.objectContaining({ tags: { probe: 'route-qualification', error_name: 'Error' } }),
      ]);
    },
    bootMilliseconds,
  );

  it(
    'should boot normally past a leftover OTA receipt and report it once (T-B29.1)',
    async () => {
      await booted(async (userData) => {
        await writeFile(join(userData, 'ota-probe.pending.json'), 'not json');
      });
      expect(signals('desktop-probe-leftover-ignored')).toEqual([
        expect.objectContaining({ tags: { probe: 'ota', error_name: 'Error' } }),
      ]);
    },
    bootMilliseconds,
  );

  it(
    'should load the first page while the credential is unread, and hold sign-in until it is (T-B32.1)',
    async () => {
      const restore = Promise.withResolvers<void>();
      state.authRestored = restore.promise;
      await booted();
      const signIn = state.handlers.get('tau:auth:sign-in')!;
      const pending = signIn({ senderFrame: {} });
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      expect(state.authSignIn).not.toHaveBeenCalled();
      restore.resolve();
      await pending;
      expect(state.authSignIn).toHaveBeenCalledOnce();
    },
    bootMilliseconds,
  );

  it(
    'should offer Help → Troubleshooting with logs and scrubbed diagnostics (T-U5.1)',
    async () => {
      await booted();
      await vi.waitFor(() => {
        expect(troubleshooting().map((item) => item.label)).toEqual([
          'Restart in Safe Mode',
          'Show Logs',
          'Copy Diagnostics',
          'Check for Updates…',
        ]);
      });
      const { clipboard, shell } = await import('electron');
      troubleshooting().find((item) => item.label === 'Show Logs')!.click!();
      expect(shell.showItemInFolder).toHaveBeenCalledWith(join(state.userData, 'logs', 'desktop.log'));
      troubleshooting().find((item) => item.label === 'Copy Diagnostics')!.click!();
      await vi.waitFor(() => {
        expect(clipboard.writeText).toHaveBeenCalledOnce();
      });
      const text = vi.mocked(clipboard.writeText).mock.calls[0]![0];
      expect(text).toContain('Version: test');
      expect(text).not.toContain(homedir());
    },
    bootMilliseconds,
  );
});
/* eslint-enable @typescript-eslint/naming-convention -- End WP5 boot hardening rows. */

/* eslint-disable @typescript-eslint/naming-convention -- Sentry tag names are snake_case. */
describe('desktop main boot health and safe mode (WP6)', () => {
  const bootMilliseconds = 30_000;
  /** This test build's identity, as main computes it: version `test`, no stamped commit, unpackaged. */
  const testBuild = 'test+unknown+unpackaged';

  const boot = async (before?: (userData: string) => Promise<void>, argv: readonly string[] = []): Promise<void> => {
    vi.stubGlobal('tauCloudBuildEnabled', false);
    state.userData = await mkdtemp(join(tmpdir(), 'tau-main-boot-health-'));
    await before?.(state.userData);
    const original = process.argv;
    process.argv = [...original, ...argv];
    try {
      await import('#main/main.js');
    } finally {
      process.argv = original;
    }
  };
  const booted = async (before?: (userData: string) => Promise<void>, argv: readonly string[] = []): Promise<void> => {
    await boot(before, argv);
    await vi.waitFor(() => {
      expect(fakeWindow.loadURL).toHaveBeenCalledOnce();
    });
  };
  const ledgerPath = (): string => join(state.userData, 'boot-health.json');
  type LedgerOnDisk = { readonly unhealthyCount?: number; readonly last?: Record<string, unknown> };
  const readLedger = async (): Promise<LedgerOnDisk> => {
    const text = await readFile(ledgerPath(), 'utf8');
    return JSON.parse(text) as LedgerOnDisk;
  };
  const seedLedger = (unhealthyCount: number) => async (userData: string) => {
    await writeFile(
      join(userData, 'boot-health.json'),
      JSON.stringify({
        schemaVersion: 1,
        build: testBuild,
        unhealthyCount,
        last: { launchId: 'previous', mode: 'normal', stage: 'shell-mounted', deadlinePassed: true },
      }),
    );
  };
  const signals = (name: string): Array<{ tags: Record<string, string> }> =>
    state.reportSignal.mock.calls
      .map(([signal]) => signal as { fingerprint?: readonly string[]; tags: Record<string, string> } | undefined)
      .filter((signal) => signal?.fingerprint?.[0] === name) as Array<{ tags: Record<string, string> }>;
  const bootstrapArgument = async (): Promise<Record<string, unknown>> => {
    const { BrowserWindow } = await import('electron');
    const options = vi.mocked(BrowserWindow).mock.calls[0]?.[0] as
      | { webPreferences?: { additionalArguments?: string[] } }
      | undefined;
    const argument = options?.webPreferences?.additionalArguments?.find((value) =>
      value.startsWith('--tau-bootstrap='),
    );
    return JSON.parse(argument!.slice('--tau-bootstrap='.length)) as Record<string, unknown>;
  };
  const reportStage = (stage: string): void => {
    for (const listener of state.ipcListeners.get('tau:boot:stage') ?? []) {
      listener({ sender: fakeWindow.webContents, senderFrame: fakeWindow.webContents.mainFrame }, stage);
    }
  };
  const troubleshooting = (): UpdateMenuItem[] => {
    const entry = state.installedHelpMenuItems.find((item) => item.label === 'Troubleshooting');
    return (entry?.submenu ?? []) as UpdateMenuItem[];
  };

  it(
    'should neither read nor write the ledger in a launch that does not hold the single-instance lock (T-R12.4)',
    async () => {
      app.requestSingleInstanceLock.mockReturnValueOnce(false);
      await boot(seedLedger(2));
      await vi.waitFor(() => {
        expect(app.quit).toHaveBeenCalled();
      });
      expect(app.disableHardwareAcceleration).not.toHaveBeenCalled();
      const ledger = await readLedger();
      expect(ledger.last).toEqual(expect.objectContaining({ launchId: 'previous' }));
      expect(ledger.unhealthyCount).toBe(2);
    },
    bootMilliseconds,
  );

  it(
    'should neither read nor write the ledger in a probe launch (T-R12.4)',
    async () => {
      vi.doMock('#main/ota-probe.js', () => ({
        admitOtaProbe: vi.fn(() => ({ candidateTag: 'v0.0.0', complete: vi.fn() })),
      }));
      try {
        await booted(seedLedger(2));
      } finally {
        vi.doUnmock('#main/ota-probe.js');
      }
      expect(app.disableHardwareAcceleration).not.toHaveBeenCalled();
      const ledger = await readLedger();
      expect(ledger.last).toEqual(expect.objectContaining({ launchId: 'previous' }));
      expect(existsSync(join(state.userData, 'boot-health.json.tmp'))).toBe(false);
    },
    bootMilliseconds,
  );

  it(
    'should record this launch at main-started and advance it through the renderer stages',
    async () => {
      await booted();
      const first = await readLedger();
      expect(first).toEqual(expect.objectContaining({ schemaVersion: 1, build: testBuild, unhealthyCount: 0 }));
      expect(first.last).toEqual(expect.objectContaining({ mode: 'normal', deadlinePassed: false }));
      reportStage('shell-mounted');
      const mounted = await readLedger();
      expect(mounted.last?.['stage']).toBe('shell-mounted');
      reportStage('main-started');
      reportStage('home-ready');
      const ready = await readLedger();
      expect(ready.last?.['stage']).toBe('home-ready');
    },
    bootMilliseconds,
  );

  it(
    'should start in safe mode with --safe-mode: no hardware acceleration before ready, the bootstrap names it, and the optional subsystems stay off (T-R12.8)',
    async () => {
      await booted(undefined, ['--safe-mode']);
      expect(app.disableHardwareAcceleration).toHaveBeenCalledOnce();
      expect(app.disableHardwareAcceleration.mock.invocationCallOrder[0]).toBeLessThan(
        app.whenReady.mock.invocationCallOrder[0]!,
      );
      expect(await bootstrapArgument()).toEqual(expect.objectContaining({ safeMode: { reason: 'requested' } }));
      const { removeStaleQuickLookSessions } = await import('#main/quick-look.js');
      const { installBrowserHost } = await import('#main/browser-host.js');
      const { createBambuStudioService } = await import('#main/bambu-studio-service.js');
      expect(removeStaleQuickLookSessions).not.toHaveBeenCalled();
      expect(installBrowserHost).not.toHaveBeenCalled();
      expect(state.acpDiscoveryCalls).toBe(0);
      expect(createBambuStudioService).not.toHaveBeenCalled();
      expect(state.utilityEnvironmentAdditions.some((additions) => 'TAU_DESKTOP_MACHINES_DIR' in additions)).toBe(
        false,
      );
      const ledger = await readLedger();
      expect(ledger.last).toEqual(expect.objectContaining({ mode: 'safe-requested' }));
      expect(signals('desktop-safe-mode')).toEqual([
        expect.objectContaining({ tags: { trigger: 'requested', count: '0' } }),
      ]);
    },
    bootMilliseconds,
  );

  it(
    'should start in safe mode by itself after two unhealthy launches of this build (T-R12.8)',
    async () => {
      await booted(seedLedger(1));
      expect(app.disableHardwareAcceleration).toHaveBeenCalledOnce();
      expect(await bootstrapArgument()).toEqual(
        expect.objectContaining({ safeMode: { reason: 'unhealthy-launches' } }),
      );
      const ledger = await readLedger();
      expect(ledger.unhealthyCount).toBe(2);
      expect(signals('desktop-boot-unhealthy')).toEqual([
        expect.objectContaining({ tags: { stage: 'shell-mounted', ended: 'none', count: '2', mode: 'normal' } }),
      ]);
      expect(signals('desktop-safe-mode')).toEqual([
        expect.objectContaining({ tags: { trigger: 'unhealthy-launches', count: '2' } }),
      ]);
    },
    bootMilliseconds,
  );

  it(
    'should start normally with no safe mode in the bootstrap',
    async () => {
      await booted();
      expect(app.disableHardwareAcceleration).not.toHaveBeenCalled();
      expect(await bootstrapArgument()).not.toHaveProperty('safeMode');
    },
    bootMilliseconds,
  );

  it(
    'should not wait for the page to save when a restart is asked for before shell-mounted (T-R12.8)',
    async () => {
      state.autoQuiesce = false;
      await booted();
      await vi.waitFor(() => {
        expect(troubleshooting().map((item) => item.label)).toContain('Restart in Safe Mode');
      });
      troubleshooting().find((item) => item.label === 'Restart in Safe Mode')!.click!();
      await vi.waitFor(() => {
        expect(app.relaunch).toHaveBeenCalledOnce();
      });
      expect(state.sentToRenderer).not.toContain(quitChannels.ask);
      expect(app.relaunch.mock.calls[0]![0]).toEqual({ args: expect.arrayContaining(['--safe-mode']) as unknown });
    },
    bootMilliseconds,
  );

  it(
    'should still wait for the page to save once the shell has mounted',
    async () => {
      await booted();
      reportStage('shell-mounted');
      await vi.waitFor(() => {
        expect(troubleshooting().map((item) => item.label)).toContain('Restart in Safe Mode');
      });
      troubleshooting().find((item) => item.label === 'Restart in Safe Mode')!.click!();
      await vi.waitFor(() => {
        expect(app.relaunch).toHaveBeenCalledOnce();
      });
      expect(state.sentToRenderer).toContain(quitChannels.ask);
    },
    bootMilliseconds,
  );

  it(
    'should not wait for the page to save when an update installs before shell-mounted (N1, T-B22.4)',
    async () => {
      /* A page that never mounted cannot answer: waiting on it ends in the saving review, which no one is there to
       * answer, so the automatic install never restarts into the update. */
      state.autoQuiesce = false;
      await booted();
      await vi.waitFor(() => {
        expect(state.prepareToInstall).toBeDefined();
      });
      const commit = vi.fn();
      const installing = state.prepareToInstall!(commit);
      await vi.waitFor(() => {
        expect(commit).toHaveBeenCalledOnce();
      });
      await expect(installing).resolves.toBe(true);
      expect(state.sentToRenderer).not.toContain(quitChannels.ask);
      expect(dialog.showMessageBox).not.toHaveBeenCalled();
    },
    bootMilliseconds,
  );

  it(
    'should still wait for the page to save when an update installs once the shell has mounted',
    async () => {
      /* No `home-ready` either: a project session opens once `rootFiles` holds the shared worker, before it is
       * `ready`, so a mounted page may hold edits even in a launch whose Home never became ready (N1). */
      await booted();
      reportStage('shell-mounted');
      await vi.waitFor(() => {
        expect(state.prepareToInstall).toBeDefined();
      });
      const commit = vi.fn();
      await expect(state.prepareToInstall!(commit)).resolves.toBe(true);
      expect(commit).toHaveBeenCalledOnce();
      expect(state.sentToRenderer).toContain(quitChannels.ask);
      expect(state.log).not.toHaveBeenCalledWith('info', 'main.restart-without-page', expect.anything());
    },
    bootMilliseconds,
  );

  it(
    'should not wait for the page to save when a Squirrel update restarts before shell-mounted, and log why (N1)',
    async () => {
      /* On macOS and Windows, Squirrel's `quitAndInstall` runs after the updater's `prepareToRestart`. */
      state.autoQuiesce = false;
      await booted();
      await vi.waitFor(() => {
        expect(state.prepareToRestart).toBeDefined();
      });
      await expect(state.prepareToRestart!()).resolves.toBe(true);
      expect(state.sentToRenderer).not.toContain(quitChannels.ask);
      expect(dialog.showMessageBox).not.toHaveBeenCalled();
      expect(state.log).toHaveBeenCalledWith('info', 'main.restart-without-page', { reason: 'update-install' });
    },
    bootMilliseconds,
  );

  it(
    'should ask the page to save again on a later quit after an install before shell-mounted fails',
    async () => {
      await booted();
      await vi.waitFor(() => {
        expect(state.prepareToInstall).toBeDefined();
      });
      const commit = vi.fn(async () => {
        throw new Error('spawn refused');
      });
      await expect(state.prepareToInstall!(commit)).resolves.toBe(false);
      expect(state.log).toHaveBeenCalledWith('info', 'main.restart-without-page', { reason: 'update-install' });
      expect(state.sentToRenderer).not.toContain(quitChannels.ask);
      state.appListeners.get('before-quit')!.at(-1)!({ preventDefault: vi.fn() });
      await vi.waitFor(() => {
        expect(state.sentToRenderer).toContain(quitChannels.ask);
      });
    },
    bootMilliseconds,
  );

  it(
    'should ask once, in a native prompt, when a second launch carries --safe-mode (T-R12.8)',
    async () => {
      await booted();
      dialog.showMessageBox.mockClear();
      dialog.showMessageBox.mockResolvedValueOnce({ response: 1 });
      const secondInstance = state.appListeners.get('second-instance')!.at(-1)!;
      secondInstance({}, ['tau', '--safe-mode']);
      secondInstance({}, ['tau', '--safe-mode']);
      await vi.waitFor(() => {
        expect(dialog.showMessageBox).toHaveBeenCalledOnce();
      });
      expect(dialog.showMessageBox.mock.calls[0]![0].buttons).toEqual(['Restart in Safe Mode', 'Not Now']);
      expect(app.relaunch).not.toHaveBeenCalled();
      secondInstance({}, ['tau']);
      expect(dialog.showMessageBox).toHaveBeenCalledOnce();
    },
    bootMilliseconds,
  );

  it(
    'should report a GPU process that exited and not count the launch healthy for it (T-B26.1)',
    async () => {
      await booted();
      const gone = state.appListeners.get('child-process-gone')!.at(-1)!;
      gone({}, { type: 'GPU', reason: 'crashed', exitCode: 133 });
      expect(signals('desktop-gpu-process-gone')).toEqual([
        expect.objectContaining({ tags: { reason: 'crashed', exit_code: '133', safe_mode: 'false' } }),
      ]);
      const { last } = await readLedger();
      expect(last?.['stage']).not.toBe('home-ready');
      expect(last?.['gpuProcessGone']).toBe(true);
    },
    bootMilliseconds,
  );

  it(
    'should open the recovery window in its own partition when the first load fails',
    async () => {
      fakeWindow.loadURL.mockRejectedValueOnce(Object.assign(new Error('ERR_FILE_NOT_FOUND'), { errno: -6 }));
      await booted();
      const { BrowserWindow } = await import('electron');
      const partitions = (): unknown[] =>
        vi.mocked(BrowserWindow).mock.calls.map(([options]) => options?.webPreferences?.partition);
      /* Counted by partition, not by position: a slow host may create the app's windows at other times. */
      await vi.waitFor(() => {
        expect(partitions().filter((partition) => partition === 'tau-recovery')).toHaveLength(1);
      });
      expect(fakeWindow.loadFile).toHaveBeenCalledOnce();
      expect(signals('desktop-recovery-shown')).toEqual([
        expect.objectContaining({ tags: { surface: 'window', trigger: 'load-failed' } }),
      ]);
      expect(app.exit).not.toHaveBeenCalled();
      expect(fakeWindow.reload).not.toHaveBeenCalled();
      expect(fakeWindow.close).not.toHaveBeenCalled();
    },
    bootMilliseconds,
  );

  it(
    'should apply a pending reset at the next start before the window, and never delete it',
    async () => {
      await booted(async (userData) => {
        await writeFile(join(userData, 'granted-roots.json'), JSON.stringify([join(userData, 'gone')]));
        await mkdir(join(userData, 'recovery'), { recursive: true });
        await writeFile(
          join(userData, 'recovery', 'pending-resets.json'),
          JSON.stringify({ schemaVersion: 1, stores: ['folder-list'] }),
        );
      });
      expect(existsSync(join(state.userData, 'recovery', 'pending-resets.json'))).toBe(false);
      const { readdir } = await import('node:fs/promises');
      const entries = await readdir(join(state.userData, 'recovery'));
      const quarantines = entries.filter((name) => name !== 'pending-resets.json');
      expect(quarantines).toHaveLength(1);
      expect(
        JSON.parse(await readFile(join(state.userData, 'recovery', quarantines[0]!, 'granted-roots.json'), 'utf8')),
      ).toEqual([join(state.userData, 'gone')]);
      expect(signals('desktop-store-reset')).toEqual([
        expect.objectContaining({ tags: { store: 'folder-list', outcome: 'moved' } }),
      ]);
    },
    bootMilliseconds,
  );

  it(
    'should accept a boot stage only from a trusted main frame',
    async () => {
      await booted();
      const { isTrustedSender } = await import('#main/navigation-policy.js');
      vi.mocked(isTrustedSender).mockReturnValue(false);
      try {
        reportStage('shell-mounted');
      } finally {
        vi.mocked(isTrustedSender).mockReturnValue(true);
      }
      const refused = await readLedger();
      expect(refused.last?.['stage']).not.toBe('shell-mounted');
      for (const listener of state.ipcListeners.get('tau:boot:stage') ?? []) {
        listener({ sender: fakeWindow.webContents, senderFrame: { url: 'app://tau/frame' } }, 'shell-mounted');
      }
      const wrongFrame = await readLedger();
      expect(wrongFrame.last?.['stage']).not.toBe('shell-mounted');
    },
    bootMilliseconds,
  );

  it(
    'should put the boot-health ledger in Copy Diagnostics',
    async () => {
      await booted(seedLedger(1));
      const { clipboard } = await import('electron');
      await vi.waitFor(() => {
        expect(troubleshooting().map((item) => item.label)).toContain('Copy Diagnostics');
      });
      troubleshooting().find((item) => item.label === 'Copy Diagnostics')!.click!();
      await vi.waitFor(() => {
        expect(clipboard.writeText).toHaveBeenCalledOnce();
      });
      const text = vi.mocked(clipboard.writeText).mock.calls[0]![0];
      expect(text).toContain('Boot health:');
      expect(text).toContain('Mode: safe-auto');
      expect(text).toContain('Unhealthy launches: 2');
      expect(text).toContain('Previous launch: unhealthy (stage shell-mounted');
    },
    bootMilliseconds,
  );
});
/* eslint-enable @typescript-eslint/naming-convention -- End WP6 boot health rows. */

/* eslint-disable @typescript-eslint/naming-convention -- Sentry tag names are snake_case. */
describe('desktop main update path without a renderer (WP7)', () => {
  const bootMilliseconds = 30_000;

  const boot = async (): Promise<void> => {
    vi.stubGlobal('tauCloudBuildEnabled', false);
    state.userData = await mkdtemp(join(tmpdir(), 'tau-main-update-path-'));
    if (app.isPackaged) {
      Object.defineProperty(process, 'resourcesPath', { configurable: true, value: state.userData });
    }
    await import('#main/main.js');
  };
  const booted = async (): Promise<void> => {
    await boot();
    await vi.waitFor(() => {
      expect(fakeWindow.loadURL).toHaveBeenCalledOnce();
    });
  };
  const signals = (name: string): Array<{ tags: Record<string, string> }> =>
    state.reportSignal.mock.calls
      .map(([signal]) => signal as { fingerprint?: readonly string[]; tags: Record<string, string> } | undefined)
      .filter((signal) => signal?.fingerprint?.[0] === name) as Array<{ tags: Record<string, string> }>;
  const reportStage = (stage: string): void => {
    for (const listener of state.ipcListeners.get('tau:boot:stage') ?? []) {
      listener({ sender: fakeWindow.webContents, senderFrame: fakeWindow.webContents.mainFrame }, stage);
    }
  };
  const recoveryAction = async (action: unknown): Promise<unknown> =>
    state.handlers.get('tau:recovery:action')!(
      { sender: fakeWindow.webContents, senderFrame: fakeWindow.webContents.mainFrame },
      action,
    );
  const windowsCreated = async (): Promise<Array<{ webPreferences?: { partition?: string } } | undefined>> => {
    const { BrowserWindow } = await import('electron');
    return vi
      .mocked(BrowserWindow)
      .mock.calls.map(([options]) => options as { webPreferences?: { partition?: string } } | undefined);
  };
  const checkForUpdatesItem = (): UpdateMenuItem =>
    state.installedUpdateMenuItems.find((item) => item.label === 'Check for Updates…')!;

  /* The windows this launch created after `from`, as recovery windows or not. */
  const createdSince = async (from: number): Promise<Array<string | undefined>> => {
    const created = await windowsCreated();
    return created.slice(from).map((options) => options?.webPreferences?.partition);
  };

  it(
    'should open the recovery window, not a renderer window, for Check for Updates… before any window has mounted (T-B22.3)',
    async () => {
      await booted();
      state.updaterCheck.mockClear();
      fakeWindow.focus.mockClear();
      const { length: before } = await windowsCreated();
      checkForUpdatesItem().click!();
      await vi.waitFor(async () => {
        expect(await createdSince(before)).toEqual(['tau-recovery']);
      });
      expect(fakeWindow.loadURL).toHaveBeenCalledOnce();
      expect(fakeWindow.loadFile).toHaveBeenCalledOnce();
      await vi.waitFor(() => {
        expect(state.updaterCheck).toHaveBeenCalledWith(true);
      });
      expect(signals('desktop-recovery-shown')).toEqual([
        expect.objectContaining({ tags: { surface: 'window', trigger: 'check-for-updates' } }),
      ]);
    },
    bootMilliseconds,
  );

  it(
    'should still bring up the app window for Check for Updates… once the shell has mounted',
    async () => {
      await booted();
      reportStage('shell-mounted');
      fakeWindow.focus.mockClear();
      const { length: before } = await windowsCreated();
      checkForUpdatesItem().click!();
      await vi.waitFor(() => {
        expect(state.updaterCheck).toHaveBeenCalledWith(true);
      });
      expect(fakeWindow.focus).toHaveBeenCalled();
      expect(await createdSince(before)).toEqual([]);
      expect(fakeWindow.loadFile).not.toHaveBeenCalled();
    },
    bootMilliseconds,
  );

  it(
    "should install from the recovery window's Install update and restart (T-B22.3)",
    async () => {
      await booted();
      await recoveryAction({ type: 'open-recovery-window' });
      await vi.waitFor(() => {
        expect(fakeWindow.loadFile).toHaveBeenCalledOnce();
      });
      await recoveryAction({ type: 'install-update' });
      expect(state.updaterInstall).toHaveBeenCalledOnce();
    },
    bootMilliseconds,
  );

  it(
    'should run exactly one update check when home-ready arrives (T-B22.3)',
    async () => {
      await booted();
      state.updaterCheck.mockClear();
      reportStage('shell-mounted');
      reportStage('home-ready');
      reportStage('home-ready');
      await vi.waitFor(() => {
        expect(state.updaterCheck).toHaveBeenCalledOnce();
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      expect(state.updaterCheck).toHaveBeenCalledOnce();
    },
    bootMilliseconds,
  );

  it(
    "should say this copy can't update itself, with a download page and one report, when the installation marker is damaged (T-B27.1)",
    async () => {
      app.isPackaged = true;
      vi.doMock('#main/update-platform.js', () => ({
        startPlatformUpdater: vi.fn(async () => {
          throw new TypeError('Installed update route disagrees with the running app');
        }),
        relaunchSelf: vi.fn(async () => undefined),
      }));
      try {
        await booted();
        const snapshot = state.handlers.get('tau:updates:snapshot')!;
        await vi.waitFor(async () => {
          expect(await snapshot({ senderFrame: {} })).toEqual(
            expect.objectContaining({
              blockedReason: 'installation-marker',
              downloadPage: 'https://github.com/taucad/tau/releases/latest',
            }),
          );
        });
        const blocked = (await snapshot({ senderFrame: {} })) as { phase: string; detail?: string };
        /* The renderer and the recovery window word "can't update itself" from `blockedReason`; main's raw error stays
           in its log, never in the snapshot (#2557). */
        expect(blocked.phase).toBe('disabled');
        expect(blocked).not.toHaveProperty('detail');
        const check = state.handlers.get('tau:updates:check')!;
        await check({ senderFrame: {} });
        await check({ senderFrame: {} });
        expect(signals('desktop-update-blocked')).toEqual([
          expect.objectContaining({ tags: { reason: 'installation-marker', route: process.platform } }),
        ]);
      } finally {
        vi.doUnmock('#main/update-platform.js');
      }
    },
    bootMilliseconds,
  );
});
/* eslint-enable @typescript-eslint/naming-convention -- End WP7 update path rows. */
