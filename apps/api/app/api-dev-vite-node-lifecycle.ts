import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { RequestAdapter, RequestAdapterParams } from 'vite-plugin-node';
import type { Plugin, ViteDevServer } from 'vite';

type FastifyRouteHandler = {
  ready(): Promise<FastifyRouteHandler>;
  routing(request: IncomingMessage, response: ServerResponse): void;
};

type FunctionRouteHandler = (request: IncomingMessage, response: ServerResponse) => void;

type ApiDevViteNodeLifecycleState = {
  activeApp?: NestFastifyApplication;
  activeTargetApp?: NestFastifyApplication;
  closePromise?: Promise<void>;
  transitionPromise?: Promise<NestFastifyApplication>;
};

type ApiUnhandledRejectionHandlerModule = {
  installApiUnhandledRejectionHandler: () => () => void;
};

export type ApiDevViteNodeLifecycle = {
  adapter: RequestAdapter<NestFastifyApplication>;
  plugin: Plugin;
};

const getRouteHandler = (app: NestFastifyApplication): FastifyRouteHandler | FunctionRouteHandler =>
  app.getHttpAdapter().getInstance() as unknown as FastifyRouteHandler | FunctionRouteHandler;

const routeRequest = async (
  app: NestFastifyApplication,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const instance = getRouteHandler(app);

  if (typeof instance === 'function') {
    instance(request, response);
    return;
  }

  instance.routing(request, response);
};

const toError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }

  return new Error(typeof error === 'string' ? error : 'Unknown API dev server error');
};

const apiUnhandledRejectionHandlerModulePath = '/app/api-unhandled-rejection-handler.ts';

const asApiUnhandledRejectionHandlerModule = (module: Record<string, unknown>): ApiUnhandledRejectionHandlerModule => {
  const { installApiUnhandledRejectionHandler } = module;
  if (typeof installApiUnhandledRejectionHandler !== 'function') {
    throw new TypeError(
      `Expected ${apiUnhandledRejectionHandlerModulePath} to export installApiUnhandledRejectionHandler()`,
    );
  }

  return {
    installApiUnhandledRejectionHandler: installApiUnhandledRejectionHandler as () => () => void,
  };
};

export const createApiDevViteNodeLifecycle = (): ApiDevViteNodeLifecycle => {
  const state: ApiDevViteNodeLifecycleState = {};
  let removeUnhandledRejectionHandler: (() => void) | undefined;
  let unhandledRejectionHandlerQueue = Promise.resolve();
  let viteServer: ViteDevServer | undefined;

  const removeCurrentUnhandledRejectionHandler = (): void => {
    const removeProcessListener = removeUnhandledRejectionHandler;
    removeUnhandledRejectionHandler = undefined;
    removeProcessListener?.();
  };

  const waitForUnhandledRejectionHandlerQueue = async (): Promise<void> => {
    try {
      await unhandledRejectionHandlerQueue;
    } catch {
      // The caller that enqueued the failed install observes the failure. Later
      // requests only need the queue to be unblocked.
    }
  };

  const installUnhandledRejectionHandler = async (server: ViteDevServer): Promise<void> => {
    const previousInstall = unhandledRejectionHandlerQueue;
    let releaseInstall: (() => void) | undefined;
    const currentInstall = new Promise<void>((resolve) => {
      releaseInstall = resolve;
    });
    unhandledRejectionHandlerQueue = currentInstall;

    try {
      try {
        await previousInstall;
      } catch {
        // A failed earlier install should not permanently block later refreshes.
      }

      removeCurrentUnhandledRejectionHandler();

      const module = asApiUnhandledRejectionHandlerModule(
        await server.ssrLoadModule(apiUnhandledRejectionHandlerModulePath),
      );
      const removeProcessListener = module.installApiUnhandledRejectionHandler();
      if (typeof removeProcessListener !== 'function') {
        throw new TypeError('Expected installApiUnhandledRejectionHandler() to return a listener cleanup function');
      }

      removeUnhandledRejectionHandler = removeProcessListener;
    } finally {
      releaseInstall?.();
      if (unhandledRejectionHandlerQueue === currentInstall) {
        unhandledRejectionHandlerQueue = Promise.resolve();
      }
    }
  };

  const closeCurrentActiveApp = async (): Promise<void> => {
    const { closePromise: existingClosePromise } = state;
    if (existingClosePromise) {
      await existingClosePromise;
      return;
    }

    const app = state.activeApp;
    if (!app) {
      return;
    }

    const closePromise = (async () => {
      state.activeApp = undefined;
      if (state.activeTargetApp === app) {
        state.activeTargetApp = undefined;
      }

      await app.close();
    })();

    state.closePromise = closePromise;

    try {
      await closePromise;
    } finally {
      if (state.closePromise === closePromise) {
        state.closePromise = undefined;
      }
    }
  };

  const closeActiveAppAfterTransition = async (): Promise<void> => {
    const { transitionPromise } = state;
    if (transitionPromise) {
      await transitionPromise.catch(() => undefined);
    }

    await closeCurrentActiveApp();
  };

  const transitionToApp = async (app: NestFastifyApplication): Promise<NestFastifyApplication> => {
    if (state.activeApp && state.activeApp !== app) {
      await closeCurrentActiveApp();
    }

    await app.init();

    const instance = getRouteHandler(app);
    if (typeof instance !== 'function') {
      await instance.ready();
    }

    state.activeApp = app;
    state.activeTargetApp = app;

    return app;
  };

  const ensureAppReady = async (app: NestFastifyApplication): Promise<NestFastifyApplication> => {
    if (state.activeApp === app) {
      return app;
    }

    const { transitionPromise } = state;
    if (transitionPromise) {
      if (state.activeTargetApp === app) {
        return transitionPromise;
      }

      await transitionPromise.catch(() => undefined);
      return ensureAppReady(app);
    }

    const nextTransitionPromise = transitionToApp(app);
    state.activeTargetApp = app;
    state.transitionPromise = nextTransitionPromise;

    try {
      return await nextTransitionPromise;
    } finally {
      if (state.transitionPromise === nextTransitionPromise) {
        state.transitionPromise = undefined;
      }
    }
  };

  const adapter = async ({ app, req, res, next }: RequestAdapterParams<NestFastifyApplication>): Promise<void> => {
    try {
      await waitForUnhandledRejectionHandlerQueue();
      const readyApp = await ensureAppReady(app);
      await routeRequest(readyApp, req, res);
    } catch (error) {
      next(toError(error));
    }
  };

  const plugin: Plugin = {
    name: 'vite:api-dev-node-lifecycle',
    apply: 'serve',
    async hotUpdate() {
      await closeActiveAppAfterTransition();
      if (viteServer) {
        await installUnhandledRejectionHandler(viteServer);
      }
    },
    async closeBundle() {
      await closeActiveAppAfterTransition();
    },
    async configureServer(server) {
      viteServer = server;
      await installUnhandledRejectionHandler(server);

      server.httpServer?.once('close', () => {
        const closeDevServer = async (): Promise<void> => {
          await waitForUnhandledRejectionHandlerQueue();
          removeCurrentUnhandledRejectionHandler();
          viteServer = undefined;
          await closeActiveAppAfterTransition();
        };

        void closeDevServer();
      });
    },
  };

  return { adapter, plugin };
};
