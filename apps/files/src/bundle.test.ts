/* eslint-disable @typescript-eslint/naming-convention -- R2 binding names (tau-cloud's contract) and HTTP header names are spelled by their owners. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeBase64, importFileLinkVerifyKey } from '@taucad/file-links';
import { fileLinkVectors } from '@taucad/file-links/vectors';
import { bundleFilesWorker } from '#scripts/bundle.mts';
import { createFakeBucket } from '#testing/fake-bucket.js';

describe('files-worker.mjs', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should build to the same bytes every time', async () => {
    const [first, second] = await Promise.all([bundleFilesWorker(), bundleFilesWorker()]);
    expect(second.sha256).toBe(first.sha256);
    expect(second.code).toBe(first.code);
    expect(first.sha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('should hold no machine path, timestamp or inline source map', async () => {
    const { code, map } = await bundleFilesWorker();
    expect(code).not.toContain('/home/');
    expect(code).not.toContain('sourceMappingURL');
    expect(code).not.toMatch(/\b20\d\d-\d\d-\d\dT/u);
    expect(JSON.parse(map)).toMatchObject({ version: 3 });
  });

  it('should export only a default fetch handler that serves a golden link', async () => {
    const { code } = await bundleFilesWorker();
    const module = (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)) as Record<
      string,
      unknown
    >;
    expect(Object.keys(module)).toEqual(['default']);
    const handler = module['default'] as { fetch: (request: Request, environment: unknown) => Promise<Response> };

    const [link] = fileLinkVectors.links;
    const [key] = fileLinkVectors.keys;
    if (link === undefined || key === undefined) {
      throw new Error('no vectors');
    }
    const bucket = createFakeBucket();
    bucket.objects.set(link.objectKey, new Uint8Array(link.size));
    const verifyKey = await importFileLinkVerifyKey(decodeBase64(key.keyBase64) ?? new Uint8Array());
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime((link.expiresAt - 600) * 1000);
    const response = await handler.fetch(new Request(link.url), {
      BUCKET: bucket,
      FILES_AUDIENCE: link.audience,
      FILES_LINK_KIDS: { [key.kid]: 'FILES_LINK_KEY_G1' },
      FILES_LINK_KEY_G1: verifyKey,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe(`"${link.location.oid}"`);
    const body = await response.arrayBuffer();
    expect(body.byteLength).toBe(link.size);
  });
});
