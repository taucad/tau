// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LoaderFunctionArgs } from 'react-router';
import { publicationApiCode } from '@taucad/types/constants';
import {
  loadPublication as loader,
  PublicationInteractiveSurface,
  publicationMeta as meta,
} from '#components/share/tau-publication.js';
import type { PublicationRouteLoaderData } from '#components/share/tau-publication.js';
import type { PublicationLockReason } from '#components/share/publication-lock-screen.js';
import { parsePublicationRecord } from '#components/share/parsed-publication.js';
import { getEnvironment } from '#environment.config.js';
import type { Environment } from '#environment.config.js';
import type * as EnvironmentConfigModule from '#environment.config.js';

const loaderJson = async (args: LoaderFunctionArgs): Promise<Record<string, unknown>> => {
  const result = await loader(args);
  if (result instanceof Response) {
    return (await result.json()) as Record<string, unknown>;
  }

  return (result as { data: Record<string, unknown> }).data;
};

const loaderHeaders = (result: unknown): Headers => {
  if (result instanceof Response) {
    return result.headers;
  }

  // oxlint-disable-next-line typescript-eslint/no-restricted-types -- ResponseInit.headers can be null
  const { init } = result as { init?: ResponseInit | null };
  return new Headers(init?.headers);
};

vi.mock('#environment.config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof EnvironmentConfigModule>();
  return {
    ...actual,
    getEnvironment: vi.fn(),
  };
});

const useViewPingMock = vi.hoisted(() => vi.fn());
vi.mock('#components/share/use-view-ping.js', () => ({ useViewPing: useViewPingMock }));
// eslint-disable-next-line @typescript-eslint/naming-convention -- mock mirrors the module's exported component.
vi.mock('#components/ui/utils/client-only.js', () => ({ ClientOnly: () => null }));

const mockedGetEnvironment = vi.mocked(getEnvironment);
const originalClientEnvironment = globalThis.window.ENV;
const thumbnailPath = 'thumbnail.webp';

const sampleLoaderData: PublicationRouteLoaderData = {
  publication: {
    id: 'pub_1',
    title: 'Demo Pub',
    entryPath: 'main.ts',
    visibility: 'private',
    forkCount: 0,
    viewCount: 0,
    ownerSnapshot: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  viewerRole: 'public',
  urls: {
    view: 'https://tau.example/s/tau~pub_1',
    share: 'https://tau.example/s/tau~pub_1',
    og: 'https://cdn.example/defaults/og.png',
    thumbnail: 'https://cdn.example/defaults/thumb.webp',
  },
  manifest: {
    version: 1,
    projectId: 'proj_x',
    entryPath: 'main.ts',
    files: { 'main.ts': 'sha256:abc' },
    kernels: ['jscad'],
    runtime: '~1.0.0',
    parameters: { width: 1 },
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  files: { 'main.ts': 'sha256:abc' },
};

const loaderArgs = (partial: Pick<LoaderFunctionArgs, 'request' | 'params'>): LoaderFunctionArgs => {
  // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- LoaderFunctionArgs has internal fields we don't need in tests
  return { context: {}, ...partial } as LoaderFunctionArgs;
};

const expectThrowsPublicationLock = async (
  call: () => Promise<unknown>,
  expectedStatus: number,
  expectedReason: PublicationLockReason,
): Promise<void> => {
  try {
    await call();
    throw new Error('expected Response rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    const response = error as Response;
    expect(response.status).toBe(expectedStatus);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const body = (await response.json()) as { reason: PublicationLockReason };
    expect(body).toEqual({ reason: expectedReason });
  }
};

describe('Tau publication loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetEnvironment.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable keys are UPPER_SNAKE_CASE
      { TAU_API_URL: 'http://api.test/' } as Environment,
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(sampleLoaderData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  afterEach(() => {
    cleanup();
    globalThis.window.ENV = originalClientEnvironment;
    vi.restoreAllMocks();
  });

  it('throws lock payload when publication id param is missing', async () => {
    await expectThrowsPublicationLock(
      async () =>
        loader(
          loaderArgs({
            request: new Request('http://localhost/s/tau~xyz'),
            params: {},
          }),
        ),
      404,
      'not-found',
    );
  });

  it('returns JSON from GET /v1/publications/:id', async () => {
    const data = await loaderJson(
      loaderArgs({
        request: new Request('http://localhost/s/tau~pub_1'),
        params: { id: 'pub_1' },
      }),
    );

    expect(data['publication']).toEqual(sampleLoaderData.publication);
  });

  it('marks private publication responses as private and non-cacheable', async () => {
    const result = await loader(
      loaderArgs({
        request: new Request('http://localhost/s/tau~pub_1'),
        params: { id: 'pub_1' },
      }),
    );

    expect(loaderHeaders(result).get('Cache-Control')).toBe('private, no-store');
  });

  it('keeps public publication responses on the CDN-backed cache path', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ...sampleLoaderData,
          publication: { ...sampleLoaderData.publication, visibility: 'public' },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const result = await loader(
      loaderArgs({
        request: new Request('http://localhost/s/tau~pub_1'),
        params: { id: 'pub_1' },
      }),
    );

    const headers = loaderHeaders(result);
    expect(headers.get('Cache-Control')).not.toBe('private, no-store');
    expect(headers.get('Cache-Tag')).toBe('publication-viewer');
  });

  it('forwards upstream Set-Cookie (tau_view_id) to the browser', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(sampleLoaderData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'set-cookie': 'tau_view_id=abc.def; HttpOnly; Path=/',
        },
      }),
    );

    const result = await loader(
      loaderArgs({
        request: new Request('http://localhost/s/tau~pub_1'),
        params: { id: 'pub_1' },
      }),
    );

    expect(loaderHeaders(result).get('Set-Cookie')).toContain('tau_view_id=abc.def');
  });

  it('propagates 404 / 410 / 429 as typed lock reasons', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));
    await expectThrowsPublicationLock(
      async () =>
        loader(
          loaderArgs({
            request: new Request('http://localhost/s/tau~pub_1'),
            params: { id: 'pub_1' },
          }),
        ),
      404,
      'not-found',
    );

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 410 }));
    await expectThrowsPublicationLock(
      async () =>
        loader(
          loaderArgs({
            request: new Request('http://localhost/s/tau~pub_1'),
            params: { id: 'pub_1' },
          }),
        ),
      410,
      'unpublished',
    );

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 429 }));
    await expectThrowsPublicationLock(
      async () =>
        loader(
          loaderArgs({
            request: new Request('http://localhost/s/tau~pub_1'),
            params: { id: 'pub_1' },
          }),
        ),
      429,
      'rate-limited',
    );
  });

  it('maps 401 to sign-in-required without leaking API bodies', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Authentication required', requestId: 'secret' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    try {
      await loader(
        loaderArgs({
          request: new Request('http://localhost/s/tau~pub_1'),
          params: { id: 'pub_1' },
        }),
      );
      throw new Error('expected Response rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(401);
      const text = await response.text();
      expect(JSON.parse(text) as { reason: PublicationLockReason }).toEqual({ reason: 'sign-in-required' });
      expect(text).not.toContain('requestId');
      expect(text).not.toContain('Authentication required');
    }
  });

  it('maps 403 to forbidden', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: publicationApiCode.FORBIDDEN }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expectThrowsPublicationLock(
      async () =>
        loader(
          loaderArgs({
            request: new Request('http://localhost/s/tau~pub_1'),
            params: { id: 'pub_1' },
          }),
        ),
      403,
      'forbidden',
    );
  });

  it('maps 5xx responses to service-unavailable with status 503', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 502 }));

    await expectThrowsPublicationLock(
      async () =>
        loader(
          loaderArgs({
            request: new Request('http://localhost/s/tau~pub_1'),
            params: { id: 'pub_1' },
          }),
        ),
      503,
      'service-unavailable',
    );
  });

  it('maps fetch rejection to service-unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('network down'));

    await expectThrowsPublicationLock(
      async () =>
        loader(
          loaderArgs({
            request: new Request('http://localhost/s/tau~pub_1'),
            params: { id: 'pub_1' },
          }),
        ),
      503,
      'service-unavailable',
    );
  });

  it('maps malformed JSON on 200 to service-unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not-json', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expectThrowsPublicationLock(
      async () =>
        loader(
          loaderArgs({
            request: new Request('http://localhost/s/tau~pub_1'),
            params: { id: 'pub_1' },
          }),
        ),
      503,
      'service-unavailable',
    );
  });
});

describe('Tau publication client environment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable key is uppercase by contract.
    globalThis.window.ENV = { ...originalClientEnvironment, TAU_API_URL: 'https://client-api.tau.test' };
  });

  afterEach(() => {
    cleanup();
    globalThis.window.ENV = originalClientEnvironment;
  });

  it('mounts the view ping without reading the server environment', () => {
    const publication = parsePublicationRecord(sampleLoaderData.publication, 'public');
    if (!publication) {
      throw new Error('Expected the publication fixture to parse.');
    }
    render(
      createElement(PublicationInteractiveSurface, {
        data: sampleLoaderData,
        publication,
        hydratedFiles: {},
      }),
    );

    expect(mockedGetEnvironment).not.toHaveBeenCalled();
    expect(useViewPingMock).toHaveBeenCalledWith({
      publicationId: 'pub_1',
      apiBaseUrl: 'https://client-api.tau.test',
    });
  });
});

describe('Tau publication metadata', () => {
  it('emits social image metadata only when the canonical thumbnail is present in files', () => {
    const thumbnail = 'https://cdn.example/blobs/thumb.webp';
    const loaderData = {
      ...sampleLoaderData,
      files: { ...sampleLoaderData.files, [thumbnailPath]: thumbnail },
    };

    const tags = meta({
      data: loaderData,
      loaderData,
      params: { id: 'pub_1' },
      location: {} as unknown as Parameters<typeof meta>[0]['location'],
      matches: [],
    });

    expect(tags).toEqual(
      expect.arrayContaining([
        { property: 'og:image', content: thumbnail },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:image', content: thumbnail },
      ]),
    );
  });

  it('does not treat the API fallback thumbnail URL as evidence of a published thumbnail', () => {
    const tags = meta({
      data: sampleLoaderData,
      loaderData: sampleLoaderData,
      params: { id: 'pub_1' },
      location: {} as unknown as Parameters<typeof meta>[0]['location'],
      matches: [],
    });

    expect(tags?.some((tag) => 'property' in tag && tag.property === 'og:image')).toBe(false);
    expect(tags?.some((tag) => 'name' in tag && typeof tag.name === 'string' && tag.name.startsWith('twitter:'))).toBe(
      false,
    );
  });

  it('adds noindex and no-referrer for private publications', () => {
    const tags = meta({
      data: sampleLoaderData,
      loaderData: sampleLoaderData,
      params: { id: 'pub_1' },
      location: {} as unknown as Parameters<typeof meta>[0]['location'],
      matches: [],
    });

    expect(tags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'robots', content: 'noindex' }),
        expect.objectContaining({ name: 'referrer', content: 'no-referrer' }),
      ]),
    );
  });

  it('does not emit noindex for public publications', () => {
    const loaderData = {
      ...sampleLoaderData,
      publication: { ...sampleLoaderData.publication, visibility: 'public' },
    };

    const tags = meta({
      data: loaderData,
      loaderData,
      params: { id: 'pub_1' },
      location: {} as unknown as Parameters<typeof meta>[0]['location'],
      matches: [],
    });

    expect(tags?.some((t) => 'name' in t && t.name === 'robots')).toBe(false);
  });
});
