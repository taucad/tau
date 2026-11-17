import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

type Link = { rel: string; href: string; getAttribute: (name: string) => string | undefined };

const manifest = {
  version: 1,
  classes: {
    home: [
      '/assets/entry.client-a.js',
      '/assets/root-b.css',
      '/assets/new-project-chat-composer-c.js',
      '/assets/replicad_single-d.wasm',
      '/assets/kernel.worker-e.js',
      'https://cdn.example/assets/f.js',
      '/fonts/inter.woff2',
    ],
    project: ['/assets/project-live-sessions-g.js'],
  },
};

const fakeHost = ({
  idle = true,
  readyState = 'loading',
  saveData = false,
  body = manifest,
  ok = true,
  present = [],
  hostname = 'tau.new',
}: {
  idle?: boolean;
  readyState?: DocumentReadyState;
  saveData?: boolean;
  body?: unknown;
  ok?: boolean;
  present?: readonly string[];
  hostname?: string;
} = {}) => {
  const head: Link[] = present.map((href) => ({ rel: 'modulepreload', href, getAttribute: () => href }));
  const loadListeners = new Set<() => void>();
  const idleCallbacks = new Map<number, () => void>();
  let nextHandle = 1;
  const document = {
    readyState,
    head: {
      append: (link: Link) => {
        head.push(link);
      },
    },
    createElement: () => {
      const link: Link = {
        rel: '',
        href: '',
        getAttribute: (name) => (name === 'href' ? link.href : undefined),
      };
      return link;
    },
    querySelectorAll: () => head,
  };
  const connection = { saveData };
  const fetch = vi.fn(async (_input: string, _init?: RequestInit) => ({ ok, json: async () => body }));
  // The module reads the window's globals, as on a page; each is stubbed for one test.
  vi.stubGlobal('location', { hostname });
  vi.stubGlobal('document', document);
  vi.stubGlobal('navigator', { connection });
  vi.stubGlobal('addEventListener', (_type: 'load', listener: () => void) => {
    loadListeners.add(listener);
  });
  vi.stubGlobal('removeEventListener', (_type: 'load', listener: () => void) => {
    loadListeners.delete(listener);
  });
  vi.stubGlobal(
    'requestIdleCallback',
    idle
      ? (callback: () => void) => {
          const handle = nextHandle++;
          idleCallbacks.set(handle, callback);
          return handle;
        }
      : undefined,
  );
  vi.stubGlobal('cancelIdleCallback', (handle: number) => {
    idleCallbacks.delete(handle);
  });
  vi.stubGlobal('fetch', fetch);
  return {
    fetch,
    connection,
    prefetched: () => head.filter((link) => link.rel === 'prefetch').map((link) => link.href),
    fireLoad: () => {
      document.readyState = 'complete';
      for (const listener of loadListeners) {
        loadListeners.delete(listener);
        listener();
      }
    },
    runIdle: () => {
      for (const [handle, callback] of idleCallbacks) {
        idleCallbacks.delete(handle);
        callback();
      }
    },
  };
};

const settle = async () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

// The warm-up runs once per document, so each test loads a fresh module.
const load = async () => import('#www/app-warm.client.js');

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('servesAppWarmManifest', () => {
  test('should hold to the app hosts, where the manifest exists', async () => {
    const { servesAppWarmManifest } = await load();
    expect(servesAppWarmManifest('tau.new')).toBe(true);
    expect(servesAppWarmManifest('taucad.dev')).toBe(true);
  });

  test("should refuse the marketing deploy's own host, previews and local servers, where the request would 404", async () => {
    const { servesAppWarmManifest } = await load();
    for (const hostname of ['tau-www.pages.dev', 'www.tau.new', '127.0.0.1', 'localhost']) {
      expect(servesAppWarmManifest(hostname)).toBe(false);
    }
  });
});

describe('homeTierHrefs', () => {
  test("lists the app Home's scripts and stylesheets and never a wasm, worker, font or foreign URL", async () => {
    const { homeTierHrefs } = await load();
    expect(homeTierHrefs(manifest)).toEqual([
      '/assets/entry.client-a.js',
      '/assets/root-b.css',
      '/assets/new-project-chat-composer-c.js',
    ]);
  });

  test.each([null, 'text', { version: 2, classes: manifest.classes }, { version: 1 }, { version: 1, classes: [] }])(
    'reads nothing from %j',
    async (body) => {
      const { homeTierHrefs } = await load();
      expect(homeTierHrefs(body)).toEqual([]);
    },
  );
});

describe('scheduleAppWarm', () => {
  test('should request nothing away from an app host, where the manifest request would 404', async () => {
    const page = fakeHost({ hostname: '127.0.0.1', readyState: 'complete' });
    const { scheduleAppWarm } = await load();
    expect(scheduleAppWarm(new AbortController().signal)).toBe(false);
    page.runIdle();
    await settle();
    expect(page.fetch).not.toHaveBeenCalled();
  });

  test('prefetches the app Home tier once the page has loaded and is idle', async () => {
    const { scheduleAppWarm, appWarmManifestPath } = await load();
    const page = fakeHost();
    expect(scheduleAppWarm(new AbortController().signal)).toBe(true);
    page.runIdle();
    await settle();
    expect(page.fetch).not.toHaveBeenCalled();
    page.fireLoad();
    await settle();
    expect(page.fetch).not.toHaveBeenCalled();
    page.runIdle();
    await settle();
    expect(page.fetch).toHaveBeenCalledExactlyOnceWith(appWarmManifestPath, {
      credentials: 'same-origin',
      priority: 'low',
    });
    expect(page.prefetched()).toEqual([
      '/assets/entry.client-a.js',
      '/assets/root-b.css',
      '/assets/new-project-chat-composer-c.js',
    ]);
  });

  test('never runs under Save-Data', async () => {
    const { scheduleAppWarm } = await load();
    const page = fakeHost({ saveData: true, readyState: 'complete' });
    expect(scheduleAppWarm(new AbortController().signal)).toBe(false);
    page.runIdle();
    await settle();
    expect(page.fetch).not.toHaveBeenCalled();
  });

  test('skips the warm-up when Save-Data is turned on before the page is idle', async () => {
    const { scheduleAppWarm } = await load();
    const page = fakeHost({ readyState: 'complete' });
    scheduleAppWarm(new AbortController().signal);
    page.connection.saveData = true;
    page.runIdle();
    await settle();
    expect(page.fetch).not.toHaveBeenCalled();
  });

  test('falls back to a timer after load without requestIdleCallback', async () => {
    vi.useFakeTimers();
    try {
      const { scheduleAppWarm, idleFallbackDelay } = await load();
      const page = fakeHost({ idle: false });
      scheduleAppWarm(new AbortController().signal);
      await vi.advanceTimersByTimeAsync(idleFallbackDelay * 10);
      expect(page.fetch).not.toHaveBeenCalled();
      page.fireLoad();
      await vi.advanceTimersByTimeAsync(idleFallbackDelay - 1);
      expect(page.fetch).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(page.fetch).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  test('warms once per document, and again after a page change aborted a waiting warm-up', async () => {
    const { scheduleAppWarm } = await load();
    const page = fakeHost({ readyState: 'complete' });
    const first = new AbortController();
    scheduleAppWarm(first.signal);
    first.abort();
    page.runIdle();
    await settle();
    expect(page.fetch).not.toHaveBeenCalled();

    expect(scheduleAppWarm(new AbortController().signal)).toBe(true);
    page.runIdle();
    await settle();
    expect(page.fetch).toHaveBeenCalledOnce();
    expect(scheduleAppWarm(new AbortController().signal)).toBe(false);
  });

  test.each([
    ['an absent manifest', { ok: false }],
    ['another shape', { body: { version: 1, classes: { home: 'x' } } }],
  ])('warms nothing for %s', async (_label, options) => {
    const { scheduleAppWarm } = await load();
    const page = fakeHost({ readyState: 'complete', ...options });
    scheduleAppWarm(new AbortController().signal);
    page.runIdle();
    await settle();
    expect(page.prefetched()).toEqual([]);
  });

  test('skips a file the page already references', async () => {
    const { scheduleAppWarm } = await load();
    const page = fakeHost({ readyState: 'complete', present: ['/assets/entry.client-a.js'] });
    scheduleAppWarm(new AbortController().signal);
    page.runIdle();
    await settle();
    expect(page.prefetched()).toEqual(['/assets/root-b.css', '/assets/new-project-chat-composer-c.js']);
  });
});
