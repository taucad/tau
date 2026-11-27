/* eslint-disable @typescript-eslint/naming-convention -- client environment keys are an external contract. */
import { createStaticHandler, RouterContextProvider } from 'react-router';
import type { EntryContext } from 'react-router';
import { rootMiddleware } from '#lib/root-middleware.server.js';
import { mock, mockDeep } from 'vitest-mock-extended';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as EnvironmentConfig from '#environment.config.js';
import type * as ModelCatalogServer from '#lib/model-catalog.server.js';
import type { ModelCatalogCacheState } from '#lib/model-catalog.server.js';
import { catalogFreshness } from '#lib/model-catalog.js';
import type { Model } from '#lib/model-catalog.js';
import { createInstanceMark, formatServerTiming, startDocumentTiming } from '#lib/server-timing.server.js';
import handleRequest from '#entry.server.js';
import { loader } from '#root.js';

/** The fake API and clock behind the root loader's model catalog. */
const catalogApi = vi.hoisted(() => ({
  time: 1_000_000,
  fetchCatalog: vi.fn<() => Promise<readonly Model[]>>(),
}));

vi.mock('#environment.config.js', async (loadOriginal) => ({
  ...(await loadOriginal<typeof EnvironmentConfig>()),
  getClientEnvironment: async () => ({
    NODE_ENV: 'test',
    POSTHOG_API_HOST: 'https://analytics.test',
    POSTHOG_ASSET_HOST: 'assets.test',
    POSTHOG_UI_HOST: 'https://analytics.test',
    TAU_API_URL: 'https://api.test',
    TAU_DEBUG: false,
    TAU_MACHINES_ENABLED: false,
    TAU_FRONTEND_URL: 'https://tau.test',
    TAU_GIT_REMOTE_ALLOW_PRIVATE: false,
    TAU_WEBSOCKET_URL: 'wss://api.test',
  }),
}));

/* The real per-process cache, fed by a fake API and clock instead of `fetch` and `Date.now`. */
vi.mock('#lib/model-catalog.server.js', async (loadOriginal) => {
  const original = await loadOriginal<typeof ModelCatalogServer>();
  const read = original.createModelCatalogCache({
    fetchCatalog: catalogApi.fetchCatalog,
    now: () => catalogApi.time,
  });
  return {
    ...original,
    getServerModelCatalog: read,
    prefetchModelCatalog: async (reportState?: ModelCatalogServer.ModelCatalogStateReporter) => {
      const cached = await read(reportState);
      return cached === undefined ? undefined : original.dehydrateModelCatalog(cached);
    },
    // `/` is the Home shell's path (PL4), whose root loader stamps the same cache's catalog.
    prefetchShellModelCatalog: async (reportState?: ModelCatalogServer.ModelCatalogStateReporter) => {
      const cached = await read(reportState);
      return cached === undefined ? undefined : original.dehydrateModelCatalog({ ...cached, fetchedAt: 0 });
    },
  };
});

/** The catalog's rows do not matter to its timing. */
const catalog: readonly Model[] = [];

/** What a visitor's request carries that no `Server-Timing` entry may repeat. */
const workspace = 'acme-workspace';
const project = 'secret-project-name';
const sessionValue = 'synthetic-session-value';
const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36';
const botAgent = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/** Fixed names, each with an optional fixed state and a one-decimal duration: nothing else may be written. */
const entryGrammar =
  /^(?:instance|catalog|shell|all-ready)(?:;desc=(?:cold|warm|stale|cold-fetch|backoff))?(?:;dur=\d+\.\d)?$/u;

const entriesOf = (header: string): string[] => header.split(', ').filter(Boolean);

const entryContextFor = async (request: Request): Promise<EntryContext> => {
  const staticHandlerContext = await createStaticHandler([{ id: 'root', path: '*' }]).query(request);
  if (staticHandlerContext instanceof Response) {
    throw new TypeError('Expected a document context');
  }
  const context = mock<EntryContext>({
    staticHandlerContext,
    serverHandoffStream: undefined,
    isSpaMode: false,
    branches: undefined,
    manifest: mockDeep<EntryContext['manifest']>({
      entry: { module: '/entry.js', imports: [] },
      routes: {
        root: {
          id: 'root',
          parentId: undefined,
          path: '*',
          index: false,
          module: '/root.js',
          hasLoader: true,
          hasClientLoader: false,
        },
      },
    }),
    future: mock<EntryContext['future']>(),
  });
  context.routeModules = { root: { default: () => <p>Home fixture</p> } };
  return context;
};

/**
 * Serve one document as React Router does: the root middleware around the root loader and the entry, with one router
 * context between them.
 *
 * @param pathname - The document's path and query.
 * @param options - The method and user agent.
 * @returns The response's `Server-Timing` value, after the stream drained.
 */
const serve = async (pathname: string, options: { method?: string; userAgent?: string } = {}): Promise<string> => {
  const url = new URL(`https://taucad.dev${pathname}`);
  const request = new Request(url, {
    method: options.method ?? 'GET',
    headers: { cookie: `better-auth.session_token=${sessionValue}`, 'user-agent': options.userAgent ?? userAgent },
  });
  const loadContext = new RouterContextProvider();
  // The root middleware wraps the loader and the render, and starts the request's record.
  const response = (await rootMiddleware(
    { request, params: {}, context: loadContext, url, pattern: '/*' },
    async () => {
      await loader({ request, params: {}, context: loadContext, url, pattern: '/*' });
      return handleRequest(request, 200, new Headers(), await entryContextFor(request), loadContext);
    },
  )) as Response;
  // Drain the stream, as a browser would.
  await response.text();
  return response.headers.get('Server-Timing') ?? '';
};

/* This file is one server process: the first document served here is the process's first, so the lifecycle test
 * comes first and the catalog cache carries over between tests. */
describe('document Server-Timing (LB0a)', () => {
  beforeEach(() => {
    catalogApi.fetchCatalog.mockResolvedValue(catalog);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should mark the first document cold and the catalog fetched, then warm, then stale', async () => {
    const first = entriesOf(await serve('/'));
    const second = entriesOf(await serve('/'));
    catalogApi.time += catalogFreshness;
    const third = entriesOf(await serve('/'));

    expect(first).toHaveLength(3);
    expect(first[0]).toMatch(/^instance;desc=cold;dur=\d+\.\d$/u);
    expect(first[1]).toMatch(/^catalog;desc=cold-fetch;dur=\d+\.\d$/u);
    expect(first[2]).toMatch(/^shell;dur=\d+\.\d$/u);
    expect(second).toHaveLength(3);
    expect(second[0]).toBe('instance;desc=warm');
    expect(second[1]).toMatch(/^catalog;desc=warm;dur=\d+\.\d$/u);
    expect(second[2]).toMatch(/^shell;dur=\d+\.\d$/u);
    expect(third[1]).toMatch(/^catalog;desc=stale;dur=\d+\.\d$/u);
    expect(catalogApi.fetchCatalog).toHaveBeenCalledTimes(2);
  });

  it('should time all-ready instead of the shell when the headers wait for it (a bot)', async () => {
    const entries = entriesOf(await serve('/', { userAgent: botAgent }));

    expect(entries.map((entry) => entry.split(';')[0])).toStrictEqual(['instance', 'catalog', 'all-ready']);
  });

  it('should send the instance and catalog entries, with no render time, on a HEAD request', async () => {
    const entries = entriesOf(await serve('/', { method: 'HEAD' }));

    expect(entries.map((entry) => entry.split(';')[0])).toStrictEqual(['instance', 'catalog']);
  });

  it('should write only fixed names, state names and durations, never anything of the request', async () => {
    const headers = [
      await serve(`/w/${workspace}/${project}?prompt=${project}`),
      await serve('/', { userAgent: botAgent }),
      await serve(`/w/${workspace}/${project}`, { method: 'HEAD' }),
    ];

    for (const header of headers) {
      expect(entriesOf(header).length).toBeGreaterThan(0);
      for (const entry of entriesOf(header)) {
        expect(entry).toMatch(entryGrammar);
      }
      for (const identifying of [workspace, project, sessionValue, 'session_token', 'Mozilla', 'Googlebot', 'taucad']) {
        expect(header).not.toContain(identifying);
      }
    }
  });
});

describe('server-timing helpers', () => {
  it('should format names, states and one-decimal durations in order', () => {
    expect(
      formatServerTiming([
        { name: 'instance', state: 'cold', duration: 812.345 },
        { name: 'catalog', state: 'warm', duration: 0.04 },
        { name: 'shell', duration: 41 },
      ]),
    ).toBe('instance;desc=cold;dur=812.3, catalog;desc=warm;dur=0.0, shell;dur=41.0');
  });

  it('should mark only the first document of a process cold, with its age', () => {
    const mark = createInstanceMark(() => 900);

    expect(mark()).toStrictEqual({ name: 'instance', state: 'cold', duration: 900 });
    expect(mark()).toStrictEqual({ name: 'instance', state: 'warm' });
  });

  it('should time the shell from the start of the document render', () => {
    let time = 100;
    const timing = startDocumentTiming(
      {},
      () => time,
      () => ({ name: 'instance', state: 'warm' }),
    );
    time = 142.5;

    expect(timing.atReady('onShellReady')).toBe('instance;desc=warm, shell;dur=42.5');
    expect(timing.atReady('onAllReady')).toBe('instance;desc=warm, all-ready;dur=42.5');
    expect(timing.withoutRender()).toBe('instance;desc=warm');
  });

  it('should report a catalog fetch, then a backoff after it failed', async () => {
    const { createModelCatalogCache } =
      await vi.importActual<typeof ModelCatalogServer>('#lib/model-catalog.server.js');
    const read = createModelCatalogCache({
      fetchCatalog: async () => {
        throw new Error('The model catalog answered 502.');
      },
      now: () => 0,
    });
    const reported: ModelCatalogCacheState[] = [];
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      await read((value) => reported.push(value));
      await read((value) => reported.push(value));
    } finally {
      warned.mockRestore();
    }

    expect(reported).toStrictEqual(['cold-fetch', 'backoff']);
  });

  it.each<[string, ModelCatalogCacheState]>([
    ['a fresh', 'warm'],
    ['an expired', 'stale'],
  ])('should report %s cached catalog as %s', async (_label, state) => {
    let time = 0;
    const { createModelCatalogCache } =
      await vi.importActual<typeof ModelCatalogServer>('#lib/model-catalog.server.js');
    const read = createModelCatalogCache({ fetchCatalog: async () => catalog, now: () => time });
    await read();
    time = state === 'stale' ? catalogFreshness : catalogFreshness - 1;
    const reported: ModelCatalogCacheState[] = [];

    await read((value) => reported.push(value));

    expect(reported).toStrictEqual([state]);
  });
});
