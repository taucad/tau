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
      createLfsClient({ url: 'https://github.com/a/b.git', http: missing }).upload({
        pointers: [{ oid, size: 1 }],
        read: async () => encoder.encode('x'),
      }),
    ).rejects.toThrow(/omitted large object/u);

    const entry = { oid, size: 1 };
    const duplicate: RevisionHttpClient = {
      request: async () => response(JSON.stringify({ objects: [entry, entry] })),
    };
    await expect(
      createLfsClient({ url: 'https://github.com/a/b.git', http: duplicate }).upload({
        pointers: [{ oid, size: 1 }],
        read: async () => encoder.encode('x'),
      }),
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

  /* D53: a renamed GitHub repository serves git at its old path but redirects
   * LFS, so the batch is where the move surfaces. */
  it('should classify a refused batch as the git leg does, so a moved repository reads as moved', async () => {
    const refusing = (statusCode: number, answer: string): RevisionHttpClient => ({
      request: async () => ({ ...response(answer), statusCode, statusMessage: 'Refused' }),
    });
    const upload = async (http: RevisionHttpClient): Promise<readonly string[]> =>
      createLfsClient({ url: 'https://github.com/a/b.git', http, remote: 'origin' }).upload({
        pointers: [{ oid: 'c'.repeat(64), size: 1 }],
        read: async () => encoder.encode('x'),
      });

    const moved = 'The repository moved; confirm its new location before sending the credential there';
    await expect(
      upload(refusing(409, JSON.stringify({ code: 'GIT_PROXY_REDIRECTED_CREDENTIAL', error: moved }))),
    ).rejects.toMatchObject({ code: 'REMOTE_MOVED', message: moved });
    await expect(upload(refusing(401, '{}'))).rejects.toMatchObject({ code: 'REMOTE_REAUTHORIZATION_REQUIRED' });
    await expect(upload(refusing(404, '{}'))).rejects.toMatchObject({ code: 'REMOTE_NOT_FOUND' });
  });
});
