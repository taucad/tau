/* eslint-disable @typescript-eslint/naming-convention -- mocked Electron exports and environment keys retain production names */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Worker as NodeWorker } from 'node:worker_threads';
import type * as WorkerThreads from 'node:worker_threads';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeControlChannels } from '#shared/desktop-bootstrap.js';

const originalTitle = process.title;
const originalUncaught = new Set(process.listeners('uncaughtException'));
const originalUnhandled = new Set(process.listeners('unhandledRejection'));

const state = vi.hoisted(() => ({
  appListeners: new Map<string, Array<(event: { preventDefault(): void }) => void>>(),
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  resolveFork: undefined as undefined | ((context: Record<string, string>) => { compute?: unknown }),
  workers: [] as NodeWorker[],
  userData: '',
  servicesDispose: vi.fn(async () => undefined),
  log: vi.fn(),
}));

vi.mock('node:worker_threads', async (importOriginal) => {
  const actual = await importOriginal<typeof WorkerThreads>();
  class ObservedWorker extends actual.Worker {
    public constructor(filename: string | URL, options?: ConstructorParameters<typeof actual.Worker>[1]) {
      super(filename, options);
      state.workers.push(this);
    }
  }
  return { ...actual, Worker: ObservedWorker };
});

const app = {
  isPackaged: false,
  dock: { setIcon: vi.fn() },
  requestSingleInstanceLock: vi.fn(() => true),
  whenReady: vi.fn(async () => undefined),
  getPath: vi.fn((name: string) => (name === 'userData' ? state.userData : join(state.userData, name))),
  getVersion: vi.fn(() => 'test'),
  on: vi.fn((event: string, listener: (event: { preventDefault(): void }) => void) => {
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
    isDestroyed: vi.fn(() => false),
    on: vi.fn(),
    setWindowOpenHandler: vi.fn(),
  },
  isDestroyed: vi.fn(() => false),
  loadURL: vi.fn(async () => undefined),
  show: vi.fn(),
  focus: vi.fn(),
  once: vi.fn(),
  on: vi.fn(),
};

vi.mock('electron', () => ({
  app,
  BrowserWindow: Object.assign(
    vi.fn(function BrowserWindow() {
      return fakeWindow;
    }),
    {
      getAllWindows: vi.fn(() => [fakeWindow]),
      fromWebContents: vi.fn(() => fakeWindow),
    },
  ),
  dialog: { showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => state.handlers.set(channel, handler)),
    on: vi.fn(),
    off: vi.fn(),
  },
  MessageChannelMain: vi.fn(() => ({ port1: {}, port2: {} })),
  net: { fetch: vi.fn() },
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
  safeStorage: { isEncryptionAvailable: vi.fn(() => false), encryptString: vi.fn(), decryptString: vi.fn() },
  session: {
    defaultSession: {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      webRequest: {},
    },
  },
  shell: { openExternal: vi.fn() },
  utilityProcess: { fork: vi.fn() },
}));

vi.mock('@taucad/runtime/electron/main', () => ({
  installElectronRuntimeHeaders: vi.fn(),
  registerElectronRuntimeMain: vi.fn((options: { resolveFork?: typeof state.resolveFork }) => {
    state.resolveFork = options.resolveFork;
    return { connect: vi.fn(), dispose: vi.fn() };
  }),
}));
vi.mock('@taucad/host', () => ({
  discoverAcpAgents: vi.fn(async () => ({ agents: [], refused: [] })),
  externalAgentDescriptors: vi.fn(() => []),
  hostRevisionModes: [],
}));
vi.mock('#tau/kernel-host?modulePath', () => ({ default: '/kernel-host.js' }));
vi.mock('#tau/services-host?modulePath', () => ({ default: '/services-host.js' }));
vi.mock('#main/compute-store.worker?modulePath', () => ({
  default: new URL('compute-store.worker.ts', import.meta.url),
}));
vi.mock('#main/app-protocol.js', () => ({
  appOrigin: 'app://tau',
  appSchemePrivileges: [],
  registerAppProtocol: vi.fn(),
}));
vi.mock('#main/auth-service.js', () => ({
  createAuthService: vi.fn(() => ({
    restore: vi.fn(async () => undefined),
    token: vi.fn(() => undefined),
    onChange: vi.fn(),
    dispose: vi.fn(),
    handleCallback: vi.fn(),
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
vi.mock('#main/environment.js', () => ({
  clientEnvironment: vi.fn(() => ({})),
  desktopAgentGatewayBaseUrl: vi.fn(() => 'http://127.0.0.1:1'),
  desktopAgentSystemPrompt: vi.fn(() => 'test'),
  desktopEnvironment: vi.fn(() => ({
    TAU_API_URL: 'http://127.0.0.1:1',
    TAU_WEBSOCKET_URL: 'ws://127.0.0.1:1',
    TAU_FRONTEND_URL: 'http://127.0.0.1:1',
  })),
}));
vi.mock('#main/header-injection.js', () => ({ installTauHeaderInjection: vi.fn(), originOf: vi.fn(() => undefined) }));
vi.mock('#main/navigation-policy.js', () => ({
  contentSecurityPolicy: vi.fn(() => ''),
  isPermissionGranted: vi.fn(() => false),
  isTrustedSender: vi.fn(() => true),
  navigationDecision: vi.fn(() => 'allow'),
  rendererOrigins: vi.fn(() => []),
}));
vi.mock('#main/services-broker.js', () => ({
  servicesConcerns: ['nodeFs', 'agentHost'],
  createServicesBroker: vi.fn(() => ({
    post: vi.fn(),
    connect: vi.fn(),
    dispose: state.servicesDispose,
    computeProjectRoot: (root: string) =>
      root.includes('/.tau/workspaces/') ? root.slice(0, root.indexOf('/.tau/workspaces/')) : undefined,
  })),
}));
vi.mock('#main/utility-environment.js', () => ({
  loginShellEnvironment: vi.fn(async () => undefined),
  packagedEsbuildEnvironment: vi.fn(() => ({})),
  utilityEnvironment: vi.fn(() => ({})),
}));
vi.mock('#main/quick-look.js', () => ({
  createQuickLookController: vi.fn(() => ({ dispose: vi.fn() })),
  removeStaleQuickLookSessions: vi.fn(),
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
  if (state.userData) {
    await rm(state.userData, { recursive: true, force: true });
  }
  state.appListeners.clear();
  state.handlers.clear();
  state.resolveFork = undefined;
  // Each case bootstraps main afresh; the cached module would otherwise register nothing.
  vi.resetModules();
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
  vi.clearAllMocks();
});

describe('desktop main compute owner', () => {
  const bootstrap = async (): Promise<string> => {
    state.userData = await mkdtemp(join(tmpdir(), 'tau-main-owner-'));
    await import('#main/main.js');
    await vi.waitFor(() => {
      expect(state.resolveFork).toBeDefined();
      expect(fakeWindow.loadURL).toHaveBeenCalledOnce();
    });
    return resolve(join(state.userData, 'home', 'project'));
  };

  it('invalidates a worker immediately on error and restarts through the owner resolver', async () => {
    const projectRoot = await bootstrap();
    state.resolveFork!({ projectRoot, computeMode: 'durable' });
    const first = state.workers[0]!;

    first.emit('error', new Error('fixture worker error'));
    const recovered = state.resolveFork!({ projectRoot, computeMode: 'durable' });

    expect(recovered.compute).toMatchObject({ mode: 'durable' });
    expect(state.workers).toHaveLength(2);
  });

  it('allocates lazily, reuses original identity, invalidates on error, restarts, and awaits quit', async () => {
    const projectRoot = await bootstrap();
    const off = state.resolveFork!({ projectRoot, computeMode: 'off' });
    expect(off.compute).toEqual({ mode: 'off' });
    expect(state.workers).toHaveLength(0);
    expect(() => state.resolveFork!({ purpose: 'ephemeral', computeMode: 'durable' })).toThrow(/durable.*ephemeral/u);
    expect(state.workers).toHaveLength(0);

    const direct = state.resolveFork!({ projectRoot: `${projectRoot}/.`, computeMode: 'durable' });
    const candidate = state.resolveFork!({
      projectRoot: join(projectRoot, '.tau/workspaces/run/tree'),
      computeMode: 'durable',
    });
    expect((candidate.compute as { store: unknown }).store).toBe((direct.compute as { store: unknown }).store);
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
  });
});
