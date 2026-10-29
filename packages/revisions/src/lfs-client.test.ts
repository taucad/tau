/* eslint-disable @typescript-eslint/naming-convention -- LFS wire fields use expires_in. */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { lfsPointerFor } from '#lfs.js';
import type { LfsPointer } from '#lfs.js';
import {
  createLfsClient,
  lfsDownloadBatchSize,
  lfsDownloadConcurrency,
  lfsUploadConcurrency,
  lfsUploadResidentBytes,
} from '#lfs-client.js';
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
      expect(init?.signal?.aborted).toBe(false);
      controller.abort();
      /* The transfer's signal follows the caller's. */
      expect(init?.signal?.aborted).toBe(true);
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
      /* Serial, so the second object's capability is checked after the first object's transfer. */
      await createLfsClient({
        url: 'https://api.tau.test/git',
        http: { request },
        fetch: transfer,
        uploadConcurrency: 1,
      }).upload({
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

/* F5: a push's large objects upload a few at a time, not one after another. */
describe('parallel uploads', () => {
  const objects = Array.from({ length: 7 }, (_, index) => encoder.encode(`object ${String(index)}`));
  const pointers = objects.map((content) => lfsPointerFor(content).pointer);
  const contentOf = new Map(pointers.map((pointer, index) => [pointer.oid, objects[index]!]));
  const batchOf = (listed: ReadonlyArray<{ oid: string; size: number }>): RevisionHttpClient['request'] =>
    vi.fn<RevisionHttpClient['request']>().mockResolvedValue(
      response(
        JSON.stringify({
          objects: listed.map((pointer) => ({
            ...pointer,
            actions: { upload: { href: `https://o.test/${pointer.oid}` } },
          })),
        }),
      ),
    );

  /* Transfers that wait until released, so how many are in flight at once is observable. */
  const heldTransfers = () => {
    const releases: Array<(response: Response) => void> = [];
    let inFlight = 0;
    let peak = 0;
    const transfer = vi.fn<typeof fetch>(
      async () =>
        new Promise<Response>((resolve) => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          releases.push((answer) => {
            inFlight -= 1;
            resolve(answer);
          });
        }),
    );
    return { transfer, releases, peak: () => peak };
  };

  it('uploads at most the bounded number of objects at once, and reports every oid in order', async () => {
    const { transfer, releases, peak } = heldTransfers();
    const uploading = createLfsClient({
      url: 'https://api.tau.test/git',
      http: { request: batchOf(pointers) },
      fetch: transfer,
    }).upload({
      pointers,
      read: async (oid) => contentOf.get(oid)!,
    });
    await vi.waitFor(() => {
      expect(transfer).toHaveBeenCalledTimes(lfsUploadConcurrency);
    });
    expect(peak()).toBe(lfsUploadConcurrency);
    /* Releasing one admits exactly one more. */
    releases.shift()?.(new Response(''));
    await vi.waitFor(() => {
      expect(transfer).toHaveBeenCalledTimes(lfsUploadConcurrency + 1);
    });
    while (transfer.mock.calls.length < pointers.length || releases.length > 0) {
      releases.shift()?.(new Response(''));
      // oxlint-disable-next-line no-await-in-loop -- let the pool admit the next object.
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    }
    await expect(uploading).resolves.toEqual(pointers.map((pointer) => pointer.oid));
    expect(peak()).toBe(lfsUploadConcurrency);
  });

  it('keeps objects whose bytes together exceed the resident budget from uploading side by side', async () => {
    const half = Math.floor(lfsUploadResidentBytes / 2) + 1;
    const large = [new Uint8Array(half), new Uint8Array(half).fill(1)];
    const largePointers = large.map((content) => lfsPointerFor(content).pointer);
    const { transfer, releases, peak } = heldTransfers();
    const uploading = createLfsClient({
      url: 'https://api.tau.test/git',
      http: { request: batchOf(largePointers) },
      fetch: transfer,
    }).upload({ pointers: largePointers, read: async (oid) => large[largePointers.findIndex((p) => p.oid === oid)]! });
    await vi.waitFor(() => {
      expect(transfer).toHaveBeenCalledTimes(1);
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    expect(transfer).toHaveBeenCalledTimes(1);
    releases.shift()?.(new Response(''));
    await vi.waitFor(() => {
      expect(transfer).toHaveBeenCalledTimes(2);
    });
    releases.shift()?.(new Response(''));
    await expect(uploading).resolves.toHaveLength(2);
    expect(peak()).toBe(1);
  });

  it('stops admitting objects after the first failure, aborts the ones in flight and reports that failure', async () => {
    const read = vi.fn(async (oid: string) => contentOf.get(oid)!);
    const signals: AbortSignal[] = [];
    const transfer = vi.fn<typeof fetch>(async (url, init) => {
      signals.push(init!.signal!);
      if ((typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).endsWith(pointers[0]!.oid)) {
        return new Response('', { status: 400 });
      }
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    });
    await expect(
      createLfsClient({
        url: 'https://api.tau.test/git',
        http: { request: batchOf(pointers) },
        fetch: transfer,
        uploadConcurrency: 2,
      }).upload({ pointers, read }),
    ).rejects.toThrow('400');
    /* The failing object and the one beside it; nothing after. */
    expect(read).toHaveBeenCalledTimes(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it('admits one object over the resident budget alone, and holds the ones after it until it is done', async () => {
    const huge = new Uint8Array(lfsUploadResidentBytes + 1);
    const hugePointer = lfsPointerFor(huge).pointer;
    const listed = [hugePointer, pointers[0]!, pointers[1]!];
    const { transfer, releases, peak } = heldTransfers();
    const uploading = createLfsClient({
      url: 'https://api.tau.test/git',
      http: { request: batchOf(listed) },
      fetch: transfer,
    }).upload({ pointers: listed, read: async (oid) => (oid === hugePointer.oid ? huge : contentOf.get(oid)!) });
    await vi.waitFor(() => {
      expect(transfer).toHaveBeenCalledTimes(1);
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    /* Nothing rides beside it, small as it is. */
    expect(transfer).toHaveBeenCalledTimes(1);
    releases.shift()?.(new Response(''));
    await vi.waitFor(() => {
      expect(transfer).toHaveBeenCalledTimes(3);
    });
    for (const release of releases.splice(0)) {
      release(new Response(''));
    }
    await expect(uploading).resolves.toEqual(listed.map((pointer) => pointer.oid));
    expect(peak()).toBe(2);
  });

  it('on an abort from outside, admits nothing more and settles only after the transfers in flight', async () => {
    const controller = new AbortController();
    const read = vi.fn(async (oid: string) => contentOf.get(oid)!);
    const { transfer, releases } = heldTransfers();
    let settled = false;
    const client = createLfsClient({
      url: 'https://api.tau.test/git',
      http: { request: batchOf(pointers) },
      fetch: transfer,
      uploadConcurrency: 2,
    });
    const uploading = (async () => {
      try {
        return await client.upload({ pointers, read, signal: controller.signal });
      } finally {
        settled = true;
      }
    })();
    await vi.waitFor(() => {
      expect(transfer).toHaveBeenCalledTimes(2);
    });
    controller.abort(new Error('closed'));
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    /* The two in flight have not answered yet, so the upload has not either. */
    expect(settled).toBe(false);
    releases.shift()?.(new Response(''));
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    /* One answered: the upload still waits for the other rather than leaving it running. */
    expect(settled).toBe(false);
    releases.shift()?.(new Response(''));
    await expect(uploading).rejects.toThrow('closed');
    expect(read).toHaveBeenCalledTimes(2);
    expect(transfer).toHaveBeenCalledTimes(2);
  });

  it('reports a read that rejects, and aborts the transfer beside it', async () => {
    const signals: AbortSignal[] = [];
    const transfer = vi.fn<typeof fetch>(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          signals.push(init!.signal!);
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const read = vi.fn(async (oid: string) => {
      if (oid === pointers[1]!.oid) {
        await new Promise((resolve) => {
          setTimeout(resolve, 5);
        });
        throw new Error('the object store is gone');
      }
      return contentOf.get(oid)!;
    });
    await expect(
      createLfsClient({
        url: 'https://api.tau.test/git',
        http: { request: batchOf(pointers) },
        fetch: transfer,
        uploadConcurrency: 2,
      }).upload({ pointers, read }),
    ).rejects.toThrow('the object store is gone');
    expect(read).toHaveBeenCalledTimes(2);
    expect(transfer).toHaveBeenCalledTimes(1);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it.each([Number.NaN, 0, -3, 0.5])('treats an upload concurrency of %s as one that still uploads', async (value) => {
    const transfer = vi.fn<typeof fetch>(async () => new Response(''));
    await expect(
      createLfsClient({
        url: 'https://api.tau.test/git',
        http: { request: batchOf(pointers.slice(0, 2)) },
        fetch: transfer,
        uploadConcurrency: value,
      }).upload({ pointers: pointers.slice(0, 2), read: async (oid) => contentOf.get(oid)! }),
    ).resolves.toHaveLength(2);
    expect(transfer).toHaveBeenCalledTimes(2);
  });
});

/* Load-path audit fix 1: an open's large objects arrive in a few batch calls and several transfers at once. */
describe('downloadMany', () => {
  /* Hashed when this block runs, not when the file is collected: hundreds of tiny digests ahead of the 100 MiB one above slow it several times over. */
  const pointers: LfsPointer[] = [];
  const contentOf = new Map<string, Uint8Array<ArrayBuffer>>();
  beforeAll(() => {
    for (let index = 0; index < 205; index += 1) {
      const content = encoder.encode(`download ${String(index)}`);
      const { pointer } = lfsPointerFor(content);
      pointers.push(pointer);
      contentOf.set(pointer.oid, content);
    }
  });
  const hrefOf = (oid: string): string => `https://o.test/${oid}`;
  const oidOf = (url: Parameters<typeof fetch>[0]): string =>
    (typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).slice('https://o.test/'.length);
  const requestedOids = async (request: Parameters<RevisionHttpClient['request']>[0]): Promise<string[]> => {
    let json = '';
    for await (const chunk of request.body ?? []) {
      json += new TextDecoder().decode(chunk);
    }
    return (JSON.parse(json) as { objects: Array<{ oid: string }> }).objects.map((object) => object.oid);
  };
  /* A batch endpoint that answers whatever it was asked, with `extra` on each action; `asked` is what each call named. */
  const batchEndpoint = (extra: Readonly<Record<string, unknown>> = {}) => {
    const asked: string[][] = [];
    const request = vi.fn<RevisionHttpClient['request']>(async (call) => {
      const oids = await requestedOids(call);
      asked.push(oids);
      return response(
        JSON.stringify({
          objects: oids.map((oid) => ({
            oid,
            size: contentOf.get(oid)!.byteLength,
            actions: { download: { href: hrefOf(oid), ...extra } },
          })),
        }),
      );
    });
    return { request, asked };
  };

  it('asks for at most a hundred objects per batch call, once each, and verifies every one', async () => {
    const { request, asked } = batchEndpoint();
    const transfer = vi.fn<typeof fetch>(async (url) => new Response(contentOf.get(oidOf(url))));
    const received = new Map<string, Uint8Array<ArrayBuffer>>();
    await createLfsClient({ url: 'https://api.tau.test/git', http: { request }, fetch: transfer }).downloadMany({
      /* A repeated pointer is fetched once. */
      pointers: [...pointers, pointers[0]!],
      received: async (pointer, content) => {
        received.set(pointer.oid, content);
      },
    });
    expect(request).toHaveBeenCalledTimes(Math.ceil(pointers.length / lfsDownloadBatchSize));
    expect(asked.map((oids) => oids.length)).toEqual([100, 100, 5]);
    expect(asked.flat()).toEqual(pointers.map((pointer) => pointer.oid));
    expect(transfer).toHaveBeenCalledTimes(pointers.length);
    expect(received).toEqual(contentOf);
  });

  it('transfers at most the bounded number of objects at once', async () => {
    const releases: Array<() => void> = [];
    let inFlight = 0;
    let peak = 0;
    const transfer = vi.fn<typeof fetch>(
      async (url) =>
        new Promise<Response>((resolve) => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          releases.push(() => {
            inFlight -= 1;
            resolve(new Response(contentOf.get(oidOf(url))));
          });
        }),
    );
    const subset = pointers.slice(0, 20);
    const downloading = createLfsClient({
      url: 'https://api.tau.test/git',
      http: { request: batchEndpoint().request },
      fetch: transfer,
    }).downloadMany({ pointers: subset, received: async () => undefined });
    await vi.waitFor(() => {
      expect(transfer).toHaveBeenCalledTimes(lfsDownloadConcurrency);
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    expect(transfer).toHaveBeenCalledTimes(lfsDownloadConcurrency);
    while (transfer.mock.calls.length < subset.length || releases.length > 0) {
      releases.shift()?.();
      // oxlint-disable-next-line no-await-in-loop -- let the pool admit the next object.
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    }
    await downloading;
    expect(peak).toBe(lfsDownloadConcurrency);
  });

  it('re-requests an action that expired while the objects ahead of it transferred', async () => {
    let now = 1_000_000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const { request, asked } = batchEndpoint({ expires_in: 900 });
    const transfer = vi.fn<typeof fetch>(async (url) => {
      now += 901_000;
      return new Response(contentOf.get(oidOf(url)));
    });
    try {
      await createLfsClient({
        url: 'https://api.tau.test/git',
        http: { request },
        fetch: transfer,
        downloadConcurrency: 1,
      }).downloadMany({ pointers: pointers.slice(0, 3), received: async () => undefined });
      /* One batch for all three, then one refresh each for the two whose action outlived its lifetime. */
      expect(request).toHaveBeenCalledTimes(3);
      expect(asked).toEqual([
        pointers.slice(0, 3).map((pointer) => pointer.oid),
        [pointers[1]!.oid],
        [pointers[2]!.oid],
      ]);
      expect(transfer).toHaveBeenCalledTimes(3);
    } finally {
      clock.mockRestore();
    }
  });

  it('on an abort, starts nothing more and settles only after the transfers in flight', async () => {
    const controller = new AbortController();
    const signals: AbortSignal[] = [];
    const transfer = vi.fn<typeof fetch>(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          signals.push(init!.signal!);
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const { request } = batchEndpoint();
    const received = vi.fn(async () => undefined);
    const downloading = createLfsClient({
      url: 'https://api.tau.test/git',
      http: { request },
      fetch: transfer,
      downloadConcurrency: 2,
    }).downloadMany({ pointers: pointers.slice(0, 150), received, signal: controller.signal });
    await vi.waitFor(() => {
      expect(transfer).toHaveBeenCalledTimes(2);
    });
    controller.abort(new Error('closed'));
    await expect(downloading).rejects.toThrow('closed');
    expect(transfer).toHaveBeenCalledTimes(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    /* The second hundred was never asked for. */
    expect(request).toHaveBeenCalledOnce();
    expect(received).not.toHaveBeenCalled();
  });

  it('stops at the first object the remote refused, and reports it', async () => {
    const [refused, ...rest] = pointers.slice(0, 4);
    const request = vi.fn<RevisionHttpClient['request']>(async () =>
      response(
        JSON.stringify({
          objects: [
            { ...refused, error: { code: 404, message: 'Object does not exist' } },
            ...rest.map((pointer) => ({ ...pointer, actions: { download: { href: hrefOf(pointer.oid) } } })),
          ],
        }),
      ),
    );
    const transfer = vi.fn<typeof fetch>(async (url) => new Response(contentOf.get(oidOf(url))));
    await expect(
      createLfsClient({
        url: 'https://api.tau.test/git',
        http: { request },
        fetch: transfer,
        downloadConcurrency: 1,
      }).downloadMany({ pointers: pointers.slice(0, 4), received: async () => undefined }),
    ).rejects.toThrow(`The remote refused large object ${refused!.oid}.`);
    expect(transfer).not.toHaveBeenCalled();
  });

  it('reports a store that rejects, and aborts the transfer beside it', async () => {
    const signals: AbortSignal[] = [];
    const transfer = vi.fn<typeof fetch>(async (url, init) => {
      signals.push(init!.signal!);
      if (oidOf(url) === pointers[0]!.oid) {
        return new Response(contentOf.get(oidOf(url)));
      }
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    });
    await expect(
      createLfsClient({
        url: 'https://api.tau.test/git',
        http: { request: batchEndpoint().request },
        fetch: transfer,
        downloadConcurrency: 2,
      }).downloadMany({
        pointers: pointers.slice(0, 5),
        received: async () => {
          throw new Error('quota exceeded');
        },
      }),
    ).rejects.toThrow('quota exceeded');
    expect(transfer).toHaveBeenCalledTimes(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it('asks nothing for nothing', async () => {
    const request = vi.fn<RevisionHttpClient['request']>();
    await createLfsClient({ url: 'https://api.tau.test/git', http: { request } }).downloadMany({
      pointers: [],
      received: async () => undefined,
    });
    expect(request).not.toHaveBeenCalled();
  });
});
