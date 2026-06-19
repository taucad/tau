/* oxlint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any -- Vite/Nest test doubles intentionally model framework edges */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { HotUpdateOptions, ViteDevServer } from 'vite';
import type { RequestAdapterParams } from 'vite-plugin-node';
import { describe, expect, it, vi } from 'vitest';
import { createApiDevViteNodeLifecycle } from '#api-dev-vite-node-lifecycle.js';

const createDeferred = <T = void>() => {
  let resolveDeferred!: (value: T | PromiseLike<T>) => void;
  let rejectDeferred!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolveDeferred = resolve;
    rejectDeferred = reject;
  });

  return { promise, resolve: resolveDeferred, reject: rejectDeferred };
};

type MockAppOptions = {
  close?: () => Promise<void>;
  init?: () => Promise<void>;
};

type MockFastifyInstance = {
  ready: ReturnType<typeof vi.fn<() => Promise<MockFastifyInstance>>>;
  routing: ReturnType<typeof vi.fn>;
};

type MockApiApp = NestFastifyApplication & {
  close: ReturnType<typeof vi.fn<() => Promise<void>>>;
  fastify: MockFastifyInstance;
  init: ReturnType<typeof vi.fn<() => Promise<void>>>;
};

type MockViteDevServer = ViteDevServer & {
  httpServer: {
    once: ReturnType<typeof vi.fn<(event: string, listener: () => void) => void>>;
  };
  ssrLoadModule: ReturnType<typeof vi.fn<(url: string) => Promise<Record<string, unknown>>>>;
};

type MockViteDevServerOptions = {
  installHandler?: () => () => void;
};

const createIncomingMessage = (): IncomingMessage => Object.create(null) as IncomingMessage;

const createServerResponse = (): ServerResponse => Object.create(null) as ServerResponse;

const createViteDevServer = (): ViteDevServer => Object.create(null) as ViteDevServer;

const createLifecycleViteDevServer = (options: MockViteDevServerOptions = {}): MockViteDevServer => {
  const installHandler = vi.fn(options.installHandler ?? (() => vi.fn()));
  const serverLike = {
    httpServer: {
      once: vi.fn(),
    },
    ssrLoadModule: vi.fn(async () => ({
      installApiUnhandledRejectionHandler: installHandler,
    })),
  };

  return serverLike as unknown as MockViteDevServer;
};

const createMockApp = (options: MockAppOptions = {}) => {
  const fastify: MockFastifyInstance = {
    ready: vi.fn(async () => fastify),
    routing: vi.fn(),
  };

  const appLike = {
    init: vi.fn(options.init ?? (async () => undefined)),
    close: vi.fn(options.close ?? (async () => undefined)),
    getHttpAdapter: vi.fn(() => ({
      getInstance: vi.fn(() => fastify),
    })),
  };

  const app = appLike as unknown as MockApiApp;
  app.fastify = fastify;

  return app;
};

const createAdapterParams = (app: NestFastifyApplication): RequestAdapterParams<NestFastifyApplication> => ({
  app,
  next: vi.fn(),
  req: createIncomingMessage(),
  res: createServerResponse(),
  server: createViteDevServer(),
});

const createHotUpdateOptions = (): HotUpdateOptions => ({
  file: '/Users/rifont/git/tau/apps/api/app/main.ts',
  modules: [],
  read: async () => '',
  server: createViteDevServer(),
  timestamp: Date.now(),
  type: 'update',
});

describe('API dev Vite node lifecycle', () => {
  it('installs the unhandled rejection handler through the Vite SSR app graph', async () => {
    const lifecycle = createApiDevViteNodeLifecycle();
    const configureServer = lifecycle.plugin.configureServer as (server: ViteDevServer) => Promise<void>;
    const removeHandler = vi.fn();
    const server = createLifecycleViteDevServer({
      installHandler: () => removeHandler,
    });

    await configureServer(server);

    expect(server.ssrLoadModule).toHaveBeenCalledOnce();
    expect(server.ssrLoadModule).toHaveBeenCalledWith('/app/api-unhandled-rejection-handler.ts');
    expect(server.httpServer.once).toHaveBeenCalledWith('close', expect.any(Function));
    expect(removeHandler).not.toHaveBeenCalled();
  });

  it('removes the SSR-loaded unhandled rejection handler when Vite closes', async () => {
    const lifecycle = createApiDevViteNodeLifecycle();
    const configureServer = lifecycle.plugin.configureServer as (server: ViteDevServer) => Promise<void>;
    const removeHandler = vi.fn();
    const server = createLifecycleViteDevServer({
      installHandler: () => removeHandler,
    });

    await configureServer(server);

    const closeListener = server.httpServer.once.mock.calls[0]?.[1];
    closeListener?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(removeHandler).toHaveBeenCalledOnce();
  });

  it('refreshes the SSR-loaded unhandled rejection handler during hot update without duplicate listeners', async () => {
    const lifecycle = createApiDevViteNodeLifecycle();
    const configureServer = lifecycle.plugin.configureServer as (server: ViteDevServer) => Promise<void>;
    const hotUpdate = lifecycle.plugin.hotUpdate as (options: HotUpdateOptions) => Promise<void>;
    const firstRemoveHandler = vi.fn();
    const secondRemoveHandler = vi.fn();
    const installHandler = vi
      .fn<() => () => void>()
      .mockReturnValueOnce(firstRemoveHandler)
      .mockReturnValueOnce(secondRemoveHandler);
    const server = createLifecycleViteDevServer({ installHandler });

    await configureServer(server);
    await hotUpdate(createHotUpdateOptions());

    expect(server.ssrLoadModule).toHaveBeenCalledTimes(2);
    expect(installHandler).toHaveBeenCalledTimes(2);
    expect(firstRemoveHandler).toHaveBeenCalledOnce();
    expect(secondRemoveHandler).not.toHaveBeenCalled();

    const closeListener = server.httpServer.once.mock.calls[0]?.[1];
    closeListener?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(secondRemoveHandler).toHaveBeenCalledOnce();
  });

  it('initializes one cold app once across concurrent requests', async () => {
    const lifecycle = createApiDevViteNodeLifecycle();
    const app = createMockApp();

    const firstRequest = createAdapterParams(app);
    const secondRequest = createAdapterParams(app);

    await Promise.all([lifecycle.adapter(firstRequest), lifecycle.adapter(secondRequest)]);

    expect(app.init).toHaveBeenCalledOnce();
    expect(app.fastify.ready).toHaveBeenCalledOnce();
    expect(app.fastify.routing).toHaveBeenCalledTimes(2);
    expect(firstRequest.next).not.toHaveBeenCalled();
    expect(secondRequest.next).not.toHaveBeenCalled();
  });

  it('reuses an initialized app for repeated requests', async () => {
    const lifecycle = createApiDevViteNodeLifecycle();
    const app = createMockApp();

    await lifecycle.adapter(createAdapterParams(app));
    await lifecycle.adapter(createAdapterParams(app));

    expect(app.init).toHaveBeenCalledOnce();
    expect(app.fastify.ready).toHaveBeenCalledOnce();
    expect(app.fastify.routing).toHaveBeenCalledTimes(2);
  });

  it('closes the previous app before initializing a new app instance', async () => {
    const events: string[] = [];
    const lifecycle = createApiDevViteNodeLifecycle();
    const oldApp = createMockApp({
      close: async () => {
        events.push('old-close');
      },
    });
    const newApp = createMockApp({
      init: async () => {
        events.push('new-init');
      },
    });

    await lifecycle.adapter(createAdapterParams(oldApp));
    await lifecycle.adapter(createAdapterParams(newApp));

    expect(oldApp.close).toHaveBeenCalledOnce();
    expect(newApp.init).toHaveBeenCalledOnce();
    expect(events).toEqual(['old-close', 'new-init']);
  });

  it('serializes rapid app transitions without overlapping active apps', async () => {
    const events: string[] = [];
    const initGate = createDeferred();
    const lifecycle = createApiDevViteNodeLifecycle();
    const oldApp = createMockApp({
      close: async () => {
        events.push('old-close');
      },
      init: async () => {
        events.push('old-init-start');
        await initGate.promise;
        events.push('old-init-finish');
      },
    });
    const newApp = createMockApp({
      init: async () => {
        events.push('new-init');
      },
    });

    const oldRequest = lifecycle.adapter(createAdapterParams(oldApp));
    await Promise.resolve();

    const newRequest = lifecycle.adapter(createAdapterParams(newApp));
    await Promise.resolve();

    expect(newApp.init).not.toHaveBeenCalled();

    initGate.resolve();
    await Promise.all([oldRequest, newRequest]);

    expect(events).toEqual(['old-init-start', 'old-init-finish', 'old-close', 'new-init']);
    expect(oldApp.close).toHaveBeenCalledOnce();
    expect(newApp.init).toHaveBeenCalledOnce();
  });

  it('closes the active app during hot update and keeps cleanup idempotent', async () => {
    const lifecycle = createApiDevViteNodeLifecycle();
    const app = createMockApp();
    const hotUpdate = lifecycle.plugin.hotUpdate as (options: HotUpdateOptions) => Promise<void>;

    await lifecycle.adapter(createAdapterParams(app));
    await Promise.all([hotUpdate(createHotUpdateOptions()), hotUpdate(createHotUpdateOptions())]);

    expect(app.close).toHaveBeenCalledOnce();
  });

  it('closes the active app when Vite closes the server bundle', async () => {
    const lifecycle = createApiDevViteNodeLifecycle();
    const app = createMockApp();
    const closeBundle = lifecycle.plugin.closeBundle as () => Promise<void>;

    await lifecycle.adapter(createAdapterParams(app));
    await closeBundle();

    expect(app.close).toHaveBeenCalledOnce();
  });

  it('registers Vite HTTP server close cleanup', async () => {
    const lifecycle = createApiDevViteNodeLifecycle();
    const app = createMockApp();
    const configureServer = lifecycle.plugin.configureServer as (server: ViteDevServer) => Promise<void>;
    const server = createLifecycleViteDevServer();

    await configureServer(server);
    await lifecycle.adapter(createAdapterParams(app));

    const closeListener = server.httpServer.once.mock.calls[0]?.[1];
    closeListener?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(server.httpServer.once).toHaveBeenCalledWith('close', expect.any(Function));
    expect(app.close).toHaveBeenCalledOnce();
  });
});
