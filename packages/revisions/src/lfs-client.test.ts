import { describe, expect, it } from 'vitest';
import { createLfsClient } from '#lfs-client.js';
import type { RevisionHttpClient, RevisionHttpResponse } from '#http-client.js';

const encoder = new TextEncoder();
const bodyOf = (value: string | Uint8Array<ArrayBuffer>): RevisionHttpResponse['body'] => {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  let sent = false;
  const iterator: RevisionHttpResponse['body'] = {
    next: async () => {
      await Promise.resolve();
      if (sent) {
        return { done: true, value: undefined };
      }
      sent = true;
      return { done: false, value: bytes };
    },
    [Symbol.asyncIterator]: () => iterator,
  };
  return iterator;
};
const response = (body: string | Uint8Array<ArrayBuffer>): RevisionHttpResponse => ({
  url: 'https://api.tau.test/lfs',
  method: 'POST',
  headers: {},
  body: bodyOf(body),
  statusCode: 200,
  statusMessage: 'OK',
});

describe('createLfsClient batch validation', () => {
  it('refuses missing and duplicate object answers', async () => {
    const oid = 'a'.repeat(64);
    const missing: RevisionHttpClient = { request: async () => response('{"objects":[]}') };
    await expect(
      createLfsClient({ url: 'https://github.com/a/b.git', http: missing }).upload(
        new Map([[oid, encoder.encode('x')]]),
      ),
    ).rejects.toThrow(/omitted large object/u);

    const entry = { oid, size: 1 };
    const duplicate: RevisionHttpClient = {
      request: async () => response(JSON.stringify({ objects: [entry, entry] })),
    };
    await expect(
      createLfsClient({ url: 'https://github.com/a/b.git', http: duplicate }).upload(
        new Map([[oid, encoder.encode('x')]]),
      ),
    ).rejects.toThrow(/invalid LFS batch entry/u);
  });

  it('checks both the declared size and hash of a downloaded object', async () => {
    const oid = 'b'.repeat(64);
    const http: RevisionHttpClient = {
      request: async (request) =>
        request.url.endsWith('/batch')
          ? response(
              JSON.stringify({
                objects: [{ oid, size: 3, actions: { download: { href: 'https://api.tau.test/object' } } }],
              }),
            )
          : response(encoder.encode('xx')),
    };
    await expect(
      createLfsClient({ url: 'https://github.com/a/b.git', http }).download({ oid, size: 3 }),
    ).rejects.toThrow(/did not hash to its own id/u);
  });
});
