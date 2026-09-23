/* eslint-disable @typescript-eslint/naming-convention -- mocked Electron exports and environment keys retain production names */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Worker as NodeWorker } from 'node:worker_threads';
import type * as WorkerThreads from 'node:worker_threads';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeControlChannels, quitChannels, servicesPortRelayTag } from '#shared/desktop-bootstrap.js';

const originalTitle = process.title;
const originalUncaught = new Set(process.listeners('uncaughtException'));
const originalUnhandled = new Set(process.listeners('unhandledRejection'));

const state = vi.hoisted(() => ({
  appListeners: new Map<string, Array<(...args: unknown[]) => void>>(),
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  /* Held open by the deep-link cases so a link can arrive before `ready`. */
  ready: undefined as Promise<void> | undefined,
  authHandleCallback: vi.fn(async () => undefined),
  protocolClient: [] as unknown[][],
  resolveFork: undefined as
    | undefined
    | ((context: Record<string, string>) => {
        compute?: unknown;
        env?: Readonly<Record<string, string>>;
        fileSystemPort?: unknown;
      }),
  workers: [] as NodeWorker[],
  userData: '',
  servicesDispose: vi.fn(async () => undefined),
  /* The quit hold's two halves, in the order main runs them (R9, D31). */
  shutdownOrder: [] as string[],
  servicesConnect: vi.fn(() => ({ id: 'services-port' })),
  runtimePrewarm: vi.fn(),
  runtimeMaxUtilities: undefined as number | undefined,
  servicesQuiesce: vi.fn(
    async (): Promise<
      { status: 'quiesced' } | { status: 'failed'; message: string } | { status: 'timeout' } | { status: 'no-utility' }
    > => ({ status: 'quiesced' }),
  ),
  utilityEnvironmentAdditions: [] as NodeJS.ProcessEnv[],
  ipcListeners: new Map<string, Array<(...args: unknown[]) => unknown>>(),
  sentToRenderer: [] as string[],
  /* A renderer that closes its sessions at once, which is what every case but
   * the ordering pin is about. */
  autoQuiesce: true,
  /* Lets a case hold ACP discovery open while the window boots (D17). */
  acpDiscovery: undefined as Promise<{ agents: never[]; refused: never[] }> | undefined,
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
  whenReady: vi.fn(async () => state.ready),
  setAsDefaultProtocolClient: vi.fn((...args: unknown[]) => {
    state.protocolClient.push(args);
    return true;
  }),
  getPath: vi.fn((name: string) => (name === 'userData' ? state.userData : join(state.userData, name))),
  getVersion: vi.fn(() => 'test'),
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
    send: vi.fn((channel: string) => {
      state.sentToRenderer.push(channel);
      if (channel === 'tau:quit:ask' && state.autoQuiesce) {
        queueMicrotask(() => {
          for (const listener of state.ipcListeners.get('tau:quit:quiesced') ?? []) {
            listener(undefined, false);
          }
        });
      }
    }),
    isDestroyed: vi.fn(() => false),
    on: vi.fn(),
    setWindowOpenHandler: vi.fn(),
  },
  isDestroyed: vi.fn(() => false),
  isMinimized: vi.fn(() => false),
  restore: vi.fn(),
  loadURL: vi.fn(async () => undefined),
  show: vi.fn(),
  focus: vi.fn(),
  once: vi.fn(),
  on: vi.fn(),
};

/* The quit hold's only visible surface when it cannot settle (C69). */
const dialog = {
  showOpenDialog: vi.fn(),
  showMessageBox: vi.fn(
    async (_options: Readonly<{ buttons?: readonly string[] }>): Promise<{ response: number }> => ({ response: 0 }),
  ),
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
  registerElectronRuntimeMain: vi.fn((options: { maxUtilities?: number; resolveFork?: typeof state.resolveFork }) => {
    state.resolveFork = options.resolveFork;
    state.runtimeMaxUtilities = options.maxUtilities;
    return { connect: vi.fn(), dispose: vi.fn(), prewarm: state.runtimePrewarm };
  }),
}));
vi.mock('@taucad/host', () => ({
  defaultConfigDirectory: vi.fn(() => join(state.userData, 'config')),
  discoverAcpAgents: vi.fn(async () => state.acpDiscovery ?? { agents: [], refused: [] }),
  externalAgentDescriptors: vi.fn(() => []),
}));
vi.mock('#tau/kernel-host.entry?modulePath', () => ({ default: '/kernel-host.entry.js' }));
vi.mock('#tau/services-host.entry?modulePath', () => ({ default: '/services-host.entry.js' }));
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
  rendererServicesConcerns: ['nodeFs', 'agentHost'],
  createServicesBroker: vi.fn(() => ({
    post: vi.fn(),
    connect: state.servicesConnect,
    quiesce: state.servicesQuiesce,
    dispose: state.servicesDispose,
    computeProjectRoot: (root: string) =>
      root.includes('/.tau/checkouts/') ? root.slice(0, root.indexOf('/.tau/checkouts/')) : undefined,
  })),
}));
vi.mock('#main/utility-environment.js', () => ({
  loginShellEnvironment: vi.fn(async () => undefined),
  packagedEsbuildEnvironment: vi.fn(() => ({})),
  compileCacheEnvironment: vi.fn((userDataPath: string) => ({
    TAU_COMPILE_CACHE_DIR: join(userDataPath, 'compile-cache'),
  })),
  utilityEnvironment: vi.fn((_environment: unknown, additions: NodeJS.ProcessEnv = {}) => {
    state.utilityEnvironmentAdditions.push(additions);
    return {};
  }),
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
  state.ipcListeners.clear();
  state.sentToRenderer.length = 0;
  state.autoQuiesce = true;
  state.acpDiscovery = undefined;
  state.ready = undefined;
  state.protocolClient.length = 0;
  state.authHandleCallback.mockClear();
  state.resolveFork = undefined;
  state.servicesConnect.mockClear();
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
  vi.clearAllMocks();
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
        listener(undefined, false);
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

  /*
   * C69: a quit that cannot settle has to be *visible*.
   *
   * Aborting the quit is right — the projects keep their unrecorded work — but
   * the renderer has already dismissed its overlay by then, so without a dialog
   * Cmd+Q simply does nothing, with no reason and nothing to act on. *Quit
   * anyway* re-enters the same shutdown, forced.
   */
  it(
    'names what could not settle when a quit is held, and quits anyway on request',
    async () => {
      await bootstrap();
      state.servicesQuiesce.mockResolvedValue({ status: 'failed', message: 'utility drain failed' });

      const quit = state.appListeners.get('before-quit')!.at(-1)!;
      quit({ preventDefault: vi.fn() });

      await vi.waitFor(() => {
        expect(dialog.showMessageBox).toHaveBeenCalled();
      });
      expect(dialog.showMessageBox.mock.calls[0]?.[0]).toMatchObject({
        buttons: expect.arrayContaining(['Quit anyway']) as unknown as string[],
      });
      expect(app.quit).not.toHaveBeenCalled();
      expect(state.servicesDispose).not.toHaveBeenCalled();
      /* The outcome itself is logged, not just its name, so what refused to
       * settle is recoverable from the log. */
      expect(state.log).toHaveBeenCalledWith('error', 'main.quiesce', {
        outcome: { status: 'failed', message: 'utility drain failed' },
      });

      dialog.showMessageBox.mockResolvedValue({ response: 1 });
      quit({ preventDefault: vi.fn() });

      await vi.waitFor(() => {
        expect(app.quit).toHaveBeenCalledOnce();
      });
      dialog.showMessageBox.mockResolvedValue({ response: 0 });
      state.servicesQuiesce.mockResolvedValue({ status: 'quiesced' });
    },
    bootMilliseconds,
  );
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
