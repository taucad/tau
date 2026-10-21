/* eslint-disable @typescript-eslint/naming-convention -- LFS wire fields use expires_in. */
import { describe, expect, it, vi } from 'vitest';
import { lfsPointerFor } from '#lfs.js';
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

describe('bounded private transfers', () => {
  const bytes = encoder.encode('private transfer fixture');
  const { pointer } = lfsPointerFor(bytes);
  const action = { href: 'https://objects.example/opaque', header: { 'x-amz-checksum-sha256': 'bound' } };
  const answer = (extra = {}) => ({
    ...pointer,
    actions: { upload: action, verify: { href: 'https://api.tau.test/verify' } },
    ...extra,
  });
  const batchResponse = (objects: readonly unknown[] = [answer()]) => response(JSON.stringify({ objects }));

  it('cancels and unlocks a response when the declared allocation cannot be supported', async () => {
    const oversized = { ...pointer, size: Number.MAX_SAFE_INTEGER };
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({ cancel });
    const request = vi
      .fn<RevisionHttpClient['request']>()
      .mockResolvedValue(response(JSON.stringify({ objects: [{ ...oversized, actions: { download: action } }] })));
    const transfer = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream));
    await expect(
      createLfsClient({ url: 'https://api.tau.test/git', http: { request }, fetch: transfer }).download(oversized),
    ).rejects.toThrow(RangeError);
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
    expect(transfer).toHaveBeenCalledOnce();
  });

  it('transfers an exactly 100 MiB object without reading ahead into another object', async () => {
    const boundaryBytes = new Uint8Array(104_857_600);
    const { pointer: boundary } = lfsPointerFor(boundaryBytes);
    const request = vi
      .fn<RevisionHttpClient['request']>()
      .mockResolvedValue(batchResponse([{ ...boundary, actions: { upload: action } }]));
    const transfer = vi.fn<typeof fetch>(async (_url, init) => {
      expect(init?.body).toBe(boundaryBytes);
      return new Response('');
    });
    const read = vi.fn(async () => boundaryBytes);
    await expect(
      createLfsClient({
        url: 'https://api.tau.test/git',
        http: { request },
        fetch: transfer,
        maximumUploadBytes: 104_857_600,
      }).upload({
        pointers: [boundary],
        read,
      }),
    ).resolves.toEqual([boundary.oid]);
    expect(read).toHaveBeenCalledOnce();
    expect(transfer).toHaveBeenCalledOnce();
  });

  it('refuses an oversized batch before network or local reads', async () => {
    const request = vi.fn<RevisionHttpClient['request']>();
    const read = vi.fn(async () => bytes);
    await expect(
      createLfsClient({ url: 'https://api.tau.test/git', http: { request }, maximumUploadBytes: 104_857_600 }).upload({
        pointers: [{ ...pointer, size: 104_857_601 }],
        read,
      }),
    ).rejects.toThrow('100 MiB');
    expect(request).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it('defers external-remote size admission to its batch endpoint', async () => {
    const large = { ...pointer, size: 104_857_601 };
    const request = vi.fn<RevisionHttpClient['request']>().mockResolvedValue(batchResponse([large]));
    const read = vi.fn(async () => bytes);
    await expect(
      createLfsClient({ url: 'https://github.com/a/b.git', http: { request } }).upload({ pointers: [large], read }),
    ).resolves.toEqual([]);
    expect(request).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled();
  });

  it('refreshes an expired capability just before transfer without sending session credentials', async () => {
    const request = vi
      .fn<RevisionHttpClient['request']>()
      .mockResolvedValueOnce(batchResponse([answer({ actions: { upload: { ...action, expires_in: 0 } } })]))
      .mockResolvedValueOnce(batchResponse())
      .mockResolvedValueOnce(response(''));
    const transfer = vi.fn<typeof fetch>().mockResolvedValue(new Response(''));
    await createLfsClient({ url: 'https://api.tau.test/git', http: { request }, fetch: transfer }).upload({
      pointers: [pointer],
      read: async () => bytes,
    });
    expect(request).toHaveBeenCalledTimes(3);
    expect(transfer).toHaveBeenCalledTimes(1);
    expect(transfer.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'omit',
      redirect: 'error',
      headers: action.header,
    });
  });

  it('retries ambiguous verification without uploading the object again', async () => {
    const request = vi
      .fn<RevisionHttpClient['request']>()
      .mockResolvedValueOnce(batchResponse())
      .mockRejectedValueOnce(new TypeError('network disconnected'))
      .mockResolvedValueOnce(response(''));
    const transfer = vi.fn<typeof fetch>().mockResolvedValue(new Response(''));
    await createLfsClient({ url: 'https://api.tau.test/git', http: { request }, fetch: transfer }).upload({
      pointers: [pointer],
      read: async () => bytes,
    });
    expect(transfer).toHaveBeenCalledTimes(1);
    expect(request.mock.calls.map(([input]) => input.url.endsWith('/verify'))).toEqual([false, true, true]);
  });

  it('stops after a denied capability refresh', async () => {
    const request = vi
      .fn<RevisionHttpClient['request']>()
      .mockResolvedValueOnce(batchResponse())
      .mockResolvedValueOnce({ ...response('{}'), statusCode: 401 });
    const transfer = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 403 }));
    await expect(
      createLfsClient({ url: 'https://api.tau.test/git', http: { request }, fetch: transfer }).upload({
        pointers: [pointer],
        read: async () => bytes,
      }),
    ).rejects.toMatchObject({ code: 'REMOTE_UNAUTHORIZED' });
    expect(transfer).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not retry a checksum refusal', async () => {
    const request = vi.fn<RevisionHttpClient['request']>().mockResolvedValueOnce(batchResponse());
    const transfer = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 400 }));
    await expect(
      createLfsClient({ url: 'https://api.tau.test/git', http: { request }, fetch: transfer }).upload({
        pointers: [pointer],
        read: async () => bytes,
      }),
    ).rejects.toThrow('400');
    expect(transfer).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('aborts before any refresh after a failed transfer', async () => {
    const controller = new AbortController();
    const request = vi.fn<RevisionHttpClient['request']>().mockResolvedValueOnce(batchResponse());
    const transfer = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      expect(init?.signal).toBe(controller.signal);
      controller.abort();
      throw new TypeError('disconnected');
    });
    await expect(
      createLfsClient({ url: 'https://api.tau.test/git', http: { request }, fetch: transfer }).upload({
        pointers: [pointer],
        read: async () => bytes,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).toHaveBeenCalledTimes(1);
    expect(transfer).toHaveBeenCalledTimes(1);
  });

  it('bounds retryable transfers to three attempts', async () => {
    const request = vi.fn<RevisionHttpClient['request']>().mockImplementation(async () => batchResponse());
    const transfer = vi.fn<typeof fetch>().mockImplementation(async () => new Response('', { status: 503 }));
    await expect(
      createLfsClient({ url: 'https://api.tau.test/git', http: { request }, fetch: transfer }).upload({
        pointers: [pointer],
        read: async () => bytes,
      }),
    ).rejects.toThrow('503');
    expect(transfer).toHaveBeenCalledTimes(3);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('cancels an excessive download before reading its remaining chunks', async () => {
    const cancel = vi.fn();
    const request = vi
      .fn<RevisionHttpClient['request']>()
      .mockResolvedValueOnce(batchResponse([answer({ actions: { download: action } })]));
    const transfer = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(pointer.size + 1));
          },
          cancel,
        }),
      ),
    );
    await expect(
      createLfsClient({ url: 'https://api.tau.test/git', http: { request }, fetch: transfer }).download(pointer),
    ).rejects.toThrow('exceeds its declared size');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('downloads and verifies the exact declared bytes', async () => {
    const request = vi
      .fn<RevisionHttpClient['request']>()
      .mockResolvedValueOnce(batchResponse([answer({ actions: { download: action } })]));
    const transfer = vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes));
    await expect(
      createLfsClient({ url: 'https://api.tau.test/git', http: { request }, fetch: transfer }).download(pointer),
    ).resolves.toEqual(bytes);
  });
  it('refreshes only the next object when earlier work consumed its capability lifetime', async () => {
    const nextBytes = encoder.encode('second fixture');
    const { pointer: next } = lfsPointerFor(nextBytes);
    let now = 1_000_000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const request = vi
      .fn<RevisionHttpClient['request']>()
      .mockResolvedValueOnce(
        batchResponse([
          answer({ actions: { upload: { ...action, expires_in: 900 } } }),
          { ...next, actions: { upload: { ...action, expires_in: 900 } } },
        ]),
      )
      .mockResolvedValueOnce(batchResponse([{ ...next, actions: { upload: action } }]));
    const transfer = vi.fn<typeof fetch>().mockImplementation(async () => {
      now += 901_000;
      return new Response('');
    });
    try {
      await createLfsClient({ url: 'https://api.tau.test/git', http: { request }, fetch: transfer }).upload({
        pointers: [pointer, next],
        read: async (oid) => (oid === pointer.oid ? bytes : nextBytes),
      });
      const refreshBody = request.mock.calls[1]?.[0].body;
      let json = '';
      if (refreshBody !== undefined) {
        for await (const chunk of refreshBody) {
          json += new TextDecoder().decode(chunk);
        }
      }
      expect(JSON.parse(json)).toMatchObject({ objects: [next] });
      expect(request).toHaveBeenCalledTimes(2);
      expect(transfer).toHaveBeenCalledTimes(2);
    } finally {
      clock.mockRestore();
    }
  });

  it('retries a broken download stream with a newly authorized action', async () => {
    const request = vi
      .fn<RevisionHttpClient['request']>()
      .mockImplementation(async () => batchResponse([answer({ actions: { download: action } })]));
    const transfer = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new TypeError('interrupted'));
            },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(bytes));
    await expect(
      createLfsClient({ url: 'https://api.tau.test/git', http: { request }, fetch: transfer }).download(pointer),
    ).resolves.toEqual(bytes);
    expect(request).toHaveBeenCalledTimes(2);
    expect(transfer).toHaveBeenCalledTimes(2);
  });
});
