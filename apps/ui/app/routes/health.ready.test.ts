// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- TAU_API_URL is the env var name and HTTP `Accept` header retains TitleCase on the wire */
import process from 'node:process';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { heapThresholdBytes } from '@taucad/ui-core/constants/health.constants';

const mockGetEnvironment = vi.fn<() => Promise<{ TAU_API_URL: string }>>();
vi.mock('#environment.config.js', () => ({
  getEnvironment: async () => mockGetEnvironment(),
}));

const importLoader = async () => {
  const module_ = await import('#routes/health.ready.js');
  return module_.loader;
};

const callLoader = async (signal?: AbortSignal) => {
  const loader = await importLoader();
  // The ready loader only reads `request.signal`; provide a stub that
  // matches the LoaderFunctionArgs surface.
  const request = new Request('http://localhost/health/ready', { signal });
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal stub for loader signature
  const args = { request } as Parameters<typeof loader>[0];
  return (await loader(args)) as Response;
};

const stubMemoryUsage = (heapUsed: number) => {
  const original = process.memoryUsage;
  const spy = vi.fn(() => ({
    rss: 0,
    heapTotal: heapUsed + 1024,
    heapUsed,
    external: 0,
    arrayBuffers: 0,
  }));
  Object.assign(spy, { rss: () => 0 });
  process.memoryUsage = spy as unknown as typeof process.memoryUsage;
  return () => {
    process.memoryUsage = original;
  };
};

describe('GET /health/ready', () => {
  let restoreMemory: (() => void) | undefined;
  let restoreFetch: (() => void) | undefined;

  beforeEach(() => {
    mockGetEnvironment.mockResolvedValue({ TAU_API_URL: 'https://api.example.test' });
  });

  afterEach(() => {
    restoreMemory?.();
    restoreMemory = undefined;
    restoreFetch?.();
    restoreFetch = undefined;
    vi.clearAllMocks();
  });

  it('should return 200 when API /health/live is reachable and heap is healthy', async () => {
    restoreMemory = stubMemoryUsage(1024);
    const fetchSpy = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 200 }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy;
    restoreFetch = () => {
      globalThis.fetch = originalFetch;
    };

    const response = await callLoader();
    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const calledUrl = fetchSpy.mock.calls[0]![0] as string;
    expect(calledUrl).toBe('https://api.example.test/health/live');

    const body = (await response.json()) as {
      status: string;
      details: { api: { status: string } };
    };
    expect(body.status).toBe('ok');
    expect(body.details.api.status).toBe('up');
  });

  it('should strip trailing slash from TAU_API_URL when probing', async () => {
    mockGetEnvironment.mockResolvedValue({ TAU_API_URL: 'https://api.example.test/' });
    restoreMemory = stubMemoryUsage(1024);
    const fetchSpy = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 200 }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy;
    restoreFetch = () => {
      globalThis.fetch = originalFetch;
    };

    await callLoader();
    expect(fetchSpy.mock.calls[0]![0]).toBe('https://api.example.test/health/live');
  });

  it('should return 503 when API /health/live returns non-2xx', async () => {
    restoreMemory = stubMemoryUsage(1024);
    const fetchSpy = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 502 }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy;
    restoreFetch = () => {
      globalThis.fetch = originalFetch;
    };

    const response = await callLoader();
    expect(response.status).toBe(503);

    const body = (await response.json()) as {
      status: string;
      details: { api: { status: string; message?: string } };
    };
    expect(body.status).toBe('error');
    expect(body.details.api.status).toBe('down');
    expect(body.details.api.message).toContain('502');
  });

  it('should return 503 when API /health/live throws (unreachable)', async () => {
    restoreMemory = stubMemoryUsage(1024);
    const fetchSpy = vi.fn<typeof globalThis.fetch>(async () => {
      throw new TypeError('fetch failed');
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy;
    restoreFetch = () => {
      globalThis.fetch = originalFetch;
    };

    const response = await callLoader();
    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      details: { api: { status: string; message?: string } };
    };
    expect(body.details.api.status).toBe('down');
    expect(body.details.api.message).toBe('fetch failed');
  });

  it('should return 503 when heap is over threshold even if API is up', async () => {
    restoreMemory = stubMemoryUsage(heapThresholdBytes + 1);
    const fetchSpy = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 200 }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy;
    restoreFetch = () => {
      globalThis.fetch = originalFetch;
    };

    const response = await callLoader();
    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      details: { api: { status: string }; memoryHeap: { status: string } };
    };
    expect(body.details.api.status).toBe('up');
    expect(body.details.memoryHeap.status).toBe('down');
  });

  it('should forward caller AbortSignal to upstream fetch (caller cancels propagate)', async () => {
    restoreMemory = stubMemoryUsage(1024);
    const fetchSpy = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      // Simulate upstream that respects the signal: throw if already aborted.
      if (init?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      return new Response(null, { status: 200 });
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy;
    restoreFetch = () => {
      globalThis.fetch = originalFetch;
    };

    const controller = new AbortController();
    controller.abort();
    const response = await callLoader(controller.signal);

    expect(response.status).toBe(503);
    const init = fetchSpy.mock.calls[0]![1];
    expect(init?.signal).toBeDefined();
    expect(init?.signal?.aborted).toBe(true);
  });
});
