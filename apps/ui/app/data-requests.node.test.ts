// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- TAU_DEBUG mirrors the environment contract. */
/**
 * Loaders called the way a client navigation calls them: through React Router's own request handler, with the
 * `/<path>.data?_routes=…` request the browser sends. React Router 8 passes a loader that raw request as `request.url`
 * (blueprint B4), so each loader here must read the page's URL from its `url` argument.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRequestHandler, requestData } from '#testing/data-request.js';
import type { TestRoute } from '#testing/data-request.js';
import type * as EnvironmentConfig from '#environment.config.js';
// oxlint-disable-next-line eslint/no-restricted-imports -- the build configuration lives one directory above the app alias root.
import config from '../react-router.config.js';

const mocks = vi.hoisted(() => {
  // The server environment the root module's imports read when they load.
  vi.stubEnv('TAU_API_URL', 'https://api.tau.test');
  vi.stubEnv('TAU_WEBSOCKET_URL', 'wss://api.tau.test');
  vi.stubEnv('TAU_FRONTEND_URL', 'https://tau.test');
  return {
    harnessEnabled: true,
    prefetchModelCatalog: vi.fn(async () => ({ models: 'catalog' })),
    getEnvironment: vi.fn(async () => ({ TAU_DEBUG: true })),
  };
});

vi.mock('#lib/model-catalog.server.js', () => ({
  prefetchModelCatalog: mocks.prefetchModelCatalog,
  prefetchShellModelCatalog: mocks.prefetchModelCatalog,
}));
vi.mock('#lib/observability-harness-context.js', () => ({
  isObservabilityHarnessEnabled: () => mocks.harnessEnabled,
}));
vi.mock('#environment.config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof EnvironmentConfig>()),
  getEnvironment: mocks.getEnvironment,
}));

const root = { id: 'root', path: '', module: await import('#root.js') } satisfies TestRoute;

/** A handler holding the root and the given route. */
const handlerFor = (route: Omit<TestRoute, 'parentId'>): ReturnType<typeof createTestRequestHandler> =>
  createTestRequestHandler({ routes: [root, { ...route, parentId: 'root' }] });

beforeEach(() => {
  mocks.harnessEnabled = true;
  mocks.prefetchModelCatalog.mockClear();
  mocks.getEnvironment.mockClear();
});

describe('data requests', () => {
  it('sets no React Router 7 `v8_*` flag, which React Router 8 rejects: raw requests and trailing-slash-aware data names are its defaults', () => {
    expect(Object.keys(config.future)).toEqual(['unstable_optimizeDeps']);
  });

  describe('data request names (RR4)', () => {
    const home = { id: 'routes/_index', index: true, module: { default: () => null } } satisfies Omit<
      TestRoute,
      'parentId'
    >;

    it("answers Home's data at `/_.data`, the name the client now sends", async () => {
      const handler = handlerFor(home);

      const result = await requestData(handler, 'https://tau.new/', ['root']);

      expect(result).toMatchObject({
        kind: 'routes',
        status: 200,
        routes: { root: { data: { queries: { models: 'catalog' } } } },
      });
    });

    it('answers a page with a trailing slash at `<path>/_.data`, with the data of that page', async () => {
      const handler = handlerFor({ id: 'routes/projects', path: 'projects', module: { default: () => null } });

      const result = await requestData(handler, 'https://tau.new/projects/', ['root']);

      expect(result).toMatchObject({
        kind: 'routes',
        status: 200,
        routes: { root: { data: { queries: { models: 'catalog' } } } },
      });
    });
  });

  describe('root loader', () => {
    it('redirects a www data request to the apex page, not to its .data URL', async () => {
      const handler = handlerFor({ id: 'routes/projects', path: 'projects', module: { default: () => null } });

      await expect(requestData(handler, 'https://www.tau.new/projects?tab=recent', ['root'])).resolves.toEqual({
        kind: 'redirect',
        status: 301,
        location: 'https://tau.new/projects?tab=recent',
      });
    });

    it('keeps the offline shell neutral on its .data request, without reading the model catalog', async () => {
      const handler = handlerFor({ id: 'routes/usage', path: 'usage', module: { default: () => null } });

      const result = await requestData(handler, 'https://tau.new/usage', ['root']);

      expect(result).toMatchObject({ kind: 'routes', routes: { root: { data: { queries: undefined } } } });
      expect(mocks.prefetchModelCatalog).not.toHaveBeenCalled();
    });

    it('reads the model catalog on any other page', async () => {
      const handler = handlerFor({ id: 'routes/projects', path: 'projects', module: { default: () => null } });

      const result = await requestData(handler, 'https://tau.new/projects', ['root']);

      expect(result).toMatchObject({ kind: 'routes', routes: { root: { data: { queries: { models: 'catalog' } } } } });
      expect(mocks.prefetchModelCatalog).toHaveBeenCalledOnce();
    });
  });

  it('settings_ carries only its own query into the dialog, never _routes', async () => {
    const handler = handlerFor({
      id: 'routes/settings_',
      path: 'settings',
      module: await import('#routes/settings_/route.js'),
    });

    await expect(
      requestData(handler, 'https://tau.new/settings?payment_action=action_1', ['routes/settings_']),
    ).resolves.toEqual({ kind: 'redirect', status: 302, location: '/?settings=general&payment_action=action_1' });
  });

  it('settings_.$ carries only its own query into the dialog section, never _routes', async () => {
    const handler = handlerFor({
      id: 'routes/settings_.$',
      path: 'settings/*',
      module: await import('#routes/settings_.$/route.js'),
    });

    await expect(
      requestData(handler, 'https://tau.new/settings/billing?payment_action=action_1', ['routes/settings_.$']),
    ).resolves.toEqual({ kind: 'redirect', status: 302, location: '/?settings=billing&payment_action=action_1' });
  });

  it('i.$ redirects to the import page with the query it was given, never _routes', async () => {
    const handler = handlerFor({ id: 'routes/i.$', path: 'i/*', module: await import('#routes/i.$/route.js') });

    await expect(
      requestData(handler, 'https://tau.new/i/github.com/owner/repo?ref=main', ['routes/i.$']),
    ).resolves.toEqual({ kind: 'redirect', status: 302, location: '/import/github.com/owner/repo?ref=main' });
  });

  it('the observability harness reads its trigger from the page query', async () => {
    const handler = handlerFor({
      id: 'routes/[__debug].observability/route',
      path: '__debug/observability',
      module: await import('#routes/[__debug].observability/route.js'),
    });

    await expect(
      requestData(handler, 'https://taucad.dev/__debug/observability?trigger=boundary', [
        'routes/[__debug].observability/route',
      ]),
    ).resolves.toMatchObject({
      kind: 'routes',
      routes: { 'routes/[__debug].observability/route': { data: { trigger: 'boundary' } } },
    });
  });

  it('the project-creation-location fixture reads its fixture name from the page query', async () => {
    const handler = handlerFor({
      id: 'routes/[__e2e].project-creation-location/route',
      path: '__e2e/project-creation-location',
      module: await import('#routes/[__e2e].project-creation-location/route.js'),
    });

    await expect(
      requestData(handler, 'https://tau.test/__e2e/project-creation-location?fixture=browser-workspace-1', [
        'routes/[__e2e].project-creation-location/route',
      ]),
    ).resolves.toMatchObject({
      kind: 'routes',
      routes: { 'routes/[__e2e].project-creation-location/route': { data: { fixture: 'browser-workspace-1' } } },
    });
  });

  it('the remote-host fixture reads its host URL from the page query', async () => {
    const handler = handlerFor({
      id: 'routes/[__e2e].remote-host/route',
      path: '__e2e/remote-host',
      module: await import('#routes/[__e2e].remote-host/route.js'),
    });

    await expect(
      requestData(handler, 'https://tau.test/__e2e/remote-host?url=ws%3A%2F%2F127.0.0.1%3A4100%2F', [
        'routes/[__e2e].remote-host/route',
      ]),
    ).resolves.toMatchObject({
      kind: 'routes',
      routes: { 'routes/[__e2e].remote-host/route': { data: { url: 'ws://127.0.0.1:4100/' } } },
    });
  });
});
