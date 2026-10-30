/* eslint-disable @typescript-eslint/naming-convention -- R2 binding names (tau-cloud's contract) and HTTP header names are spelled by their owners. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeBase64, importFileLinkVerifyKey } from '@taucad/file-links';
import { fileLinkVectors } from '@taucad/file-links/vectors';
import type { FileLinkVector } from '@taucad/file-links/vectors';
import worker from '#files-worker.js';
import { createFakeBucket } from '#testing/fake-bucket.js';
import type { FakeBucket } from '#testing/fake-bucket.js';
import { createFilesWorker } from '#worker.js';
import type { FilesLogLine } from '#worker.js';
import type { FilesEnvironment } from '#environment.js';
import type { FileLinkLocation } from '@taucad/file-links';

const vector = (index: number): FileLinkVector => {
  const link = fileLinkVectors.links[index];
  if (link === undefined) {
    throw new Error(`no vector ${String(index)}`);
  }
  return link;
};

const tenant = vector(0);
const tenantLocation = tenant.location as Extract<FileLinkLocation, { layout: 'tenant' }>;
const legacy = vector(1);
const secondGeneration = vector(2);
const allowedOrigin = 'https://taucad.dev';

const verifyKey = async (generation: number): Promise<CryptoKey> => {
  const key = fileLinkVectors.keys.find((entry) => entry.generation === generation);
  const bytes = key === undefined ? undefined : decodeBase64(key.keyBase64);
  if (bytes === undefined) {
    throw new Error('no key');
  }
  return importFileLinkVerifyKey(bytes);
};

const bytesOf = (size: number): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) {
    bytes[index] = index % 251;
  }
  return bytes;
};

let bucket: FakeBucket;
let environment: FilesEnvironment;
let logs: FilesLogLine[];

beforeEach(async () => {
  bucket = createFakeBucket();
  bucket.objects.set(tenant.objectKey, bytesOf(tenant.size));
  bucket.objects.set(legacy.objectKey, bytesOf(legacy.size));
  bucket.objects.set(secondGeneration.objectKey, bytesOf(16));
  const [first, second] = fileLinkVectors.keys;
  environment = {
    BUCKET: bucket,
    FILES_AUDIENCE: tenant.audience,
    FILES_ALLOWED_ORIGINS: [allowedOrigin, 'app://tau'],
    FILES_LINK_KIDS: { [first?.kid ?? '']: 'FILES_LINK_KEY_G1', [second?.kid ?? '']: 'FILES_LINK_KEY_G2' },
    FILES_LINK_KEY_G1: await verifyKey(1),
    FILES_LINK_KEY_G2: await verifyKey(2),
  };
  logs = [];
});

const fetchAt = async (
  url: string,
  init: RequestInit = {},
  options: Readonly<{ at?: number; environment?: FilesEnvironment }> = {},
): Promise<Response> => {
  const handler = createFilesWorker({
    now: () => (options.at ?? tenant.expiresAt - 600) * 1000,
    log: (line) => logs.push(line),
  });
  return handler(new Request(url, init), options.environment ?? environment);
};

const bodyBytes = async (response: Response): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(await response.arrayBuffer());

describe('serving a signed link', () => {
  it('should stream the whole object with its validators and length', async () => {
    const response = await fetchAt(tenant.url);
    expect(response.status).toBe(200);
    expect(Object.fromEntries(response.headers)).toMatchObject({
      'content-type': 'application/octet-stream',
      'content-length': String(tenant.size),
      'cache-control': 'private, max-age=31536000, immutable, no-transform',
      etag: `"${tenant.location.oid}"`,
      'accept-ranges': 'bytes',
    });
    expect(await bodyBytes(response)).toEqual(bytesOf(tenant.size));
    expect(bucket.calls).toEqual([{ method: 'get', key: tenant.objectKey }]);
  });

  it('should serve the legacy layout from its legacy key', async () => {
    const response = await fetchAt(
      legacy.url,
      {},
      { environment: { ...environment, FILES_AUDIENCE: legacy.audience } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe('0');
    expect(bucket.calls).toEqual([{ method: 'get', key: legacy.objectKey }]);
  });

  it('should verify links of both live key generations during a rotation', async () => {
    bucket.objects.set(secondGeneration.objectKey, bytesOf(secondGeneration.size));
    const response = await fetchAt(secondGeneration.url, { method: 'HEAD' }, { at: secondGeneration.expiresAt - 900 });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe(String(secondGeneration.size));
  });

  it('should answer HEAD from a head read, with headers and no body', async () => {
    const response = await fetchAt(tenant.url, { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe(String(tenant.size));
    expect(response.body).toBeNull();
    expect(bucket.calls).toEqual([{ method: 'head', key: tenant.objectKey }]);
  });
});

describe('ranges', () => {
  const last = tenant.size - 1;

  it.each([
    ['bytes=0-0', 0, 0],
    ['bytes=-1', last, last],
    [`bytes=${String(last)}-`, last, last],
    ['bytes=100-199', 100, 199],
    [`bytes=100-${String(tenant.size + 50)}`, 100, last],
    [`bytes=-${String(tenant.size * 2)}`, 0, last],
  ])('should answer %s with 206 and exactly that range', async (range, first, end) => {
    const response = await fetchAt(tenant.url, { headers: { Range: range } });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe(`bytes ${String(first)}-${String(end)}/${String(tenant.size)}`);
    expect(response.headers.get('content-length')).toBe(String(end - first + 1));
    expect(await bodyBytes(response)).toEqual(bytesOf(tenant.size).slice(first, end + 1));
    expect(bucket.calls).toEqual([
      { method: 'get', key: tenant.objectKey, range: { offset: first, length: end - first + 1 } },
    ]);
  });

  it.each([
    `bytes=${String(tenant.size)}-`,
    `bytes=${String(tenant.size + 9)}-${String(tenant.size + 10)}`,
    'bytes=-0',
  ])('should refuse %s with 416 before reading storage', async (range) => {
    const response = await fetchAt(tenant.url, { headers: { Range: range } });
    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe(`bytes */${String(tenant.size)}`);
    expect(response.headers.get('x-tau-files-error')).toBe('range');
    expect(await response.json()).toEqual({ code: 'FILES_RANGE_NOT_SATISFIABLE' });
    expect(bucket.calls).toEqual([]);
  });

  it.each(['bytes=0-0,5-6', 'bytes=abc', 'items=0-1', 'bytes=9-3', 'bytes=-'])(
    'should ignore %s and serve the whole object',
    async (range) => {
      const response = await fetchAt(tenant.url, { headers: { Range: range } });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-length')).toBe(String(tenant.size));
    },
  );

  it('should answer a ranged HEAD with 206 headers', async () => {
    const response = await fetchAt(tenant.url, { method: 'HEAD', headers: { Range: 'bytes=0-9' } });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe(`bytes 0-9/${String(tenant.size)}`);
    expect(bucket.calls).toEqual([{ method: 'head', key: tenant.objectKey }]);
  });

  it('should refuse a range on an empty object', async () => {
    const response = await fetchAt(
      legacy.url,
      { headers: { Range: 'bytes=0-0' } },
      { environment: { ...environment, FILES_AUDIENCE: legacy.audience } },
    );
    expect(response.status).toBe(416);
  });
});

describe('conditional requests', () => {
  it.each([`"${tenant.location.oid}"`, `W/"${tenant.location.oid}"`, `"other", "${tenant.location.oid}"`, '*'])(
    'should answer If-None-Match %s with 304 and no storage call',
    async (tag) => {
      const response = await fetchAt(tenant.url, { headers: { 'If-None-Match': tag } });
      expect(response.status).toBe(304);
      expect(response.headers.get('etag')).toBe(`"${tenant.location.oid}"`);
      expect(bucket.calls).toEqual([]);
    },
  );

  it('should serve the object when If-None-Match names another tag', async () => {
    const response = await fetchAt(tenant.url, { headers: { 'If-None-Match': '"abc"' } });
    expect(response.status).toBe(200);
  });

  it('should not answer 304 to a link that does not verify', async () => {
    const response = await fetchAt(tenant.url, { headers: { 'If-None-Match': '*' } }, { at: tenant.expiresAt + 60 });
    expect(response.status).toBe(403);
  });
});

describe('refusals', () => {
  const expectRefusal = async (
    response: Response,
    [status, reason, code]: readonly [status: number, reason: string, code: string],
  ): Promise<void> => {
    expect(response.status).toBe(status);
    expect(response.headers.get('x-tau-files-error')).toBe(reason);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const text = await response.text();
    expect(text === '' ? { code } : JSON.parse(text)).toEqual({ code });
    for (const secret of [tenantLocation.ownerId, tenant.location.projectId, tenant.location.oid, tenant.path]) {
      expect(text).not.toContain(secret);
    }
  };

  it('should refuse an expired link with 403 before reading storage', async () => {
    await expectRefusal(await fetchAt(tenant.url, {}, { at: tenant.expiresAt + 31 }), [
      403,
      'expired',
      'FILES_EXPIRED',
    ]);
    expect(bucket.calls).toEqual([]);
  });

  it('should refuse a tampered link with 403 signature', async () => {
    const tampered = tenant.url.replace(`n=${String(tenant.size)}`, `n=${String(tenant.size - 1)}`);
    await expectRefusal(await fetchAt(tampered), [403, 'signature', 'FILES_SIGNATURE']);
  });

  it('should refuse a key id this Worker does not hold with 403 key', async () => {
    const withoutKeys = { ...environment, FILES_LINK_KIDS: {} };
    await expectRefusal(await fetchAt(tenant.url, {}, { environment: withoutKeys }), [403, 'key', 'FILES_KEY']);
  });

  it('should ignore a kid mapped to a binding that is not a link key', async () => {
    const [first] = fileLinkVectors.keys;
    const misnamed = { ...environment, FILES_LINK_KIDS: { [first?.kid ?? '']: 'FILES_AUDIENCE' } };
    await expectRefusal(await fetchAt(tenant.url, {}, { environment: misnamed }), [403, 'key', 'FILES_KEY']);
  });

  it('should read FILES_LINK_KIDS and FILES_ALLOWED_ORIGINS given as JSON text', async () => {
    const [first] = fileLinkVectors.keys;
    const textual = {
      ...environment,
      FILES_LINK_KIDS: JSON.stringify({ [first?.kid ?? '']: 'FILES_LINK_KEY_G1' }),
      FILES_ALLOWED_ORIGINS: JSON.stringify([allowedOrigin]),
    };
    const response = await fetchAt(tenant.url, { headers: { Origin: allowedOrigin } }, { environment: textual });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(allowedOrigin);
  });

  it.each([
    ['an unknown parameter', `${tenant.url}&download=1`],
    ['a path outside the two layouts', tenant.url.replace('/v1/lfs/', '/v1/repos/')],
    ['a repeated parameter', `${tenant.url}&n=${String(tenant.size)}`],
    ['an escaped separator', tenant.url.replace(tenantLocation.ownerId, `${tenantLocation.ownerId}%2Fx`)],
    ['a lower-case escaped separator', tenant.url.replace(tenantLocation.ownerId, `${tenantLocation.ownerId}%2fx`)],
    ['an empty segment', tenant.url.replace(`/${tenantLocation.ownerId}/`, `/${tenantLocation.ownerId}//`)],
    ['a traversal out of the layouts', tenant.url.replace('/v1/lfs/', '/v1/lfs/../repos/')],
    ['an escaped traversal', tenant.url.replace('/v1/lfs/', '/v1/lfs/%2e%2e/repos/')],
    ['an escaped dot-dot segment in an id', tenant.url.replace(tenantLocation.ownerId, '%2E%2E%2Fx')],
  ])('should refuse %s with 400 malformed before reading storage', async (_case, url) => {
    await expectRefusal(await fetchAt(url), [400, 'malformed', 'FILES_MALFORMED']);
    expect(bucket.calls).toEqual([]);
  });

  it('should refuse a link on any host but its own custom domain', async () => {
    const elsewhere = tenant.url.replace(tenant.audience, 'tau-files-staging.example.workers.dev');
    await expectRefusal(await fetchAt(elsewhere), [400, 'malformed', 'FILES_MALFORMED']);
  });

  it('should answer 404 missing when the object was retired after the link was minted', async () => {
    bucket.objects.clear();
    await expectRefusal(await fetchAt(tenant.url), [404, 'missing', 'FILES_MISSING']);
    await expectRefusal(await fetchAt(tenant.url, { method: 'HEAD' }), [404, 'missing', 'FILES_MISSING']);
  });

  it('should answer 502 size when storage holds another size than the link signed', async () => {
    bucket.objects.set(tenant.objectKey, bytesOf(tenant.size + 1));
    await expectRefusal(await fetchAt(tenant.url), [502, 'size', 'FILES_SIZE_MISMATCH']);
    await expectRefusal(await fetchAt(tenant.url, { method: 'HEAD' }), [502, 'size', 'FILES_SIZE_MISMATCH']);
  });

  it('should answer 503 storage when the binding throws', async () => {
    bucket.fail(true);
    await expectRefusal(await fetchAt(tenant.url), [503, 'storage', 'FILES_STORAGE_UNAVAILABLE']);
  });

  it.each(['POST', 'PUT', 'DELETE', 'PATCH'])('should refuse %s with 405 and no storage call', async (method) => {
    const response = await fetchAt(tenant.url, { method });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
    expect(await response.json()).toEqual({ code: 'FILES_METHOD_NOT_ALLOWED' });
    expect(bucket.calls).toEqual([]);
  });
});

describe('CORS', () => {
  it('should echo an allowed origin, expose the headers and never allow credentials', async () => {
    const response = await fetchAt(tenant.url, { headers: { Origin: allowedOrigin } });
    expect(response.headers.get('access-control-allow-origin')).toBe(allowedOrigin);
    expect(response.headers.get('access-control-expose-headers')).toBe(
      'ETag, Content-Range, Accept-Ranges, X-Tau-Files-Error',
    );
    expect(response.headers.get('vary')).toBe('Origin');
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('should echo the desktop origin', async () => {
    const response = await fetchAt(tenant.url, { headers: { Origin: 'app://tau' } });
    expect(response.headers.get('access-control-allow-origin')).toBe('app://tau');
  });

  it('should grant nothing to an unknown origin but still vary on it', async () => {
    const response = await fetchAt(tenant.url, { headers: { Origin: 'https://evil.example' } });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('vary')).toBe('Origin');
  });

  it('should carry CORS on refusals, so a script can read why', async () => {
    const response = await fetchAt(tenant.url, { headers: { Origin: allowedOrigin } }, { at: tenant.expiresAt + 60 });
    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBe(allowedOrigin);
  });

  it('should answer a preflight with 204, the two methods and the two headers', async () => {
    const response = await fetchAt(tenant.url, {
      method: 'OPTIONS',
      headers: { Origin: allowedOrigin, 'Access-Control-Request-Method': 'GET' },
    });
    expect(response.status).toBe(204);
    expect(Object.fromEntries(response.headers)).toMatchObject({
      'access-control-allow-origin': allowedOrigin,
      'access-control-allow-methods': 'GET, HEAD',
      'access-control-allow-headers': 'Range, If-None-Match',
      'access-control-max-age': '7200',
      vary: 'Origin',
    });
    expect(bucket.calls).toEqual([]);
  });

  it('should grant no preflight to an unknown origin', async () => {
    const response = await fetchAt(tenant.url, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('should allow no origin when the binding is not a list', async () => {
    const response = await fetchAt(
      tenant.url,
      { headers: { Origin: allowedOrigin } },
      { environment: { ...environment, FILES_ALLOWED_ORIGINS: 'not json' } },
    );
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('health and logs', () => {
  it('should answer /healthz unsigned with the number of live keys', async () => {
    const response = await fetchAt('https://files.taucad.dev/healthz');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', keys: 2 });
    expect(bucket.calls).toEqual([]);
  });

  it('should answer /healthz HEAD with 200, no body and no CORS grant to an unknown origin', async () => {
    const response = await fetchAt('https://files.taucad.dev/healthz', {
      method: 'HEAD',
      headers: { Origin: 'https://evil.example' },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
    expect(response.headers.get('vary')).toBe('Origin');
  });

  it('should log one structured line per request without the URL, signature or ids', async () => {
    await fetchAt(tenant.url, { headers: { Range: 'bytes=0-9' } });
    await fetchAt(tenant.url, {}, { at: tenant.expiresAt + 60 });
    expect(logs).toEqual([
      expect.objectContaining({
        event: 'files.request',
        method: 'GET',
        route: 'lfs',
        status: 206,
        oid: tenant.location.oid.slice(0, 12),
        bytes: 10,
        range: true,
      }),
      expect.objectContaining({ event: 'files.request', status: 403, error: 'expired' }),
    ]);
    const text = JSON.stringify(logs);
    for (const secret of [tenant.signature, tenant.kid, tenantLocation.ownerId, tenant.location.projectId, '?n=']) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toContain(tenant.location.oid);
  });

  describe('the deployed module', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    afterEach(() => {
      log.mockClear();
    });

    it('should export one fetch handler that logs JSON lines to the console', async () => {
      const response = await worker.fetch(new Request('https://files.taucad.dev/healthz'), environment);
      expect(response.status).toBe(200);
      expect(log).toHaveBeenCalledOnce();
      expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({ route: 'healthz', status: 200 });
    });
  });
});
