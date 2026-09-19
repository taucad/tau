/**
 * The close flush's last POST (A32, S41) — and **red pin (b)**: a `pagehide`
 * pack over 64 KiB is refused by the client and lands in the queue, not
 * dropped.
 *
 * | # | What it proves |
 * | --- | --- |
 * | 1 | a request nobody asked to record is not recorded |
 * | 2 | a push is recorded *and* still reaches the wrapped client intact |
 * | 2b | **pin (f)**: a chat ref's push never displaces the recorded history pack (review 2 R3) |
 * | 3 | nothing built = nothing offered, and no request is made |
 * | 4 | a body inside the bound is sent with `keepalive: true` |
 * | 5 | **pin (b)**: a body over the bound is refused with both numbers, and no request leaves |
 * | 6 | the refusal is an outcome a scheduler records, not a throw it can drop |
 */

import { describe, expect, it } from 'vitest';

import { createRevisionHttpClient, keepaliveLimitBytes } from '#http-client.js';
import type { RevisionHttpClient, RevisionHttpRequest } from '#http-client.js';
import { recordLastPush, sendKeepalivePush } from '#sync-keepalive.js';

const pushUrl = 'https://api.tau.new/v1/git/p1.git/git-receive-pack';
const fetchUrl = 'https://api.tau.new/v1/git/p1.git/git-upload-pack';

const bodyOf = (bytes: Uint8Array<ArrayBuffer>): AsyncIterableIterator<Uint8Array<ArrayBuffer>> =>
  (async function* iterate(): AsyncGenerator<Uint8Array<ArrayBuffer>> {
    yield bytes;
  })();

/** A client that records what it was asked and answers 200. */
const spyClient = (): Readonly<{ client: RevisionHttpClient; seen: RevisionHttpRequest[]; bodies: number[] }> => {
  const seen: RevisionHttpRequest[] = [];
  const bodies: number[] = [];
  return {
    seen,
    bodies,
    client: {
      request: async (request) => {
        seen.push(request);
        let size = 0;
        if (request.body !== undefined) {
          for await (const chunk of request.body) {
            size += chunk.byteLength;
          }
        }
        bodies.push(size);
        return {
          url: request.url,
          method: request.method ?? 'GET',
          headers: {},
          body: bodyOf(new Uint8Array(0)),
          statusCode: 200,
          statusMessage: 'OK',
        };
      },
    },
  };
};

describe('recordLastPush', () => {
  it('row 1: records nothing nobody asked it to record', async () => {
    const spy = spyClient();
    const recorder = recordLastPush(spy.client);

    await recorder.client.request({ url: fetchUrl, method: 'POST', body: bodyOf(new Uint8Array([1, 2, 3])) });
    await recorder.client.request({ url: pushUrl, method: 'POST', body: bodyOf(new Uint8Array([1, 2, 3])) });

    expect(recorder.last()).toBeUndefined();
  });

  it('row 2b (red pin f): a chat ref’s push never displaces the recorded history pack', async () => {
    /* D28/S41: the keepalive body is the **history-set** pack. A chat ref is
     * pushed to the same `/git-receive-pack` endpoint, so nothing in a request
     * says which set it carries — the scheduler does, by arming the recorder
     * around the history push only. */
    const spy = spyClient();
    const recorder = recordLastPush(spy.client);
    const historyPack = new Uint8Array([1, 1, 1, 1]);
    const chatPack = new Uint8Array([2, 2, 2, 2, 2, 2]);

    await recorder.record(async () =>
      recorder.client.request({ url: pushUrl, method: 'POST', body: bodyOf(historyPack) }),
    );
    await recorder.client.request({ url: pushUrl, method: 'POST', body: bodyOf(chatPack) });

    expect(recorder.last()?.body).toEqual(historyPack);
    /* Both pushes still reached the remote; only what is *remembered* narrows. */
    expect(spy.bodies).toEqual([historyPack.byteLength, chatPack.byteLength]);
  });

  it('row 2: the recorded push still reaches the wrapped client intact', async () => {
    const spy = spyClient();
    const recorder = recordLastPush(spy.client);
    const pack = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);

    await recorder.record(async () =>
      recorder.client.request({
        url: pushUrl,
        method: 'POST',
        headers: { 'content-type': 'application/x-git-receive-pack-request' },
        body: bodyOf(pack),
      }),
    );

    /* Both halves, because collecting an async iterator consumes it: a recorder
     * that forgot to hand back a fresh one would push an empty pack. */
    expect(recorder.last()?.body).toEqual(pack);
    expect(recorder.last()?.headers).toEqual({ 'content-type': 'application/x-git-receive-pack-request' });
    expect(spy.bodies).toEqual([pack.byteLength]);
  });
});

describe('sendKeepalivePush', () => {
  it('row 3: nothing built is nothing offered', async () => {
    let calls = 0;
    const outcome = await sendKeepalivePush(undefined, {
      fetch: async () => {
        calls += 1;
        return new Response('', { status: 200 });
      },
    });

    expect(outcome).toEqual({ status: 'nothingToSend' });
    expect(calls).toBe(0);
  });

  it('row 4: a body inside the bound is sent under keepalive', async () => {
    const seen: RequestInit[] = [];
    const body = new Uint8Array(1024).fill(7);

    const outcome = await sendKeepalivePush(
      { url: pushUrl, headers: {}, body },
      {
        credentials: 'include',
        fetch: async (_input, init) => {
          seen.push(init ?? {});
          return new Response('', { status: 200 });
        },
      },
    );

    expect(outcome).toEqual({ status: 'sent', bytes: 1024 });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.keepalive).toBe(true);
    expect(seen[0]?.credentials).toBe('include');
  });

  it('row 5 + 6 (red pin b): a pack over 64 KiB is refused with both numbers and never leaves', async () => {
    let calls = 0;
    const body = new Uint8Array(keepaliveLimitBytes + 1).fill(3);

    const outcome = await sendKeepalivePush(
      { url: pushUrl, headers: {}, body },
      {
        fetch: async () => {
          calls += 1;
          return new Response('', { status: 200 });
        },
      },
    );

    /* Refused, not thrown: the scheduler turns this into `pushFailed`, which is
     * a queue entry and `Not backed up · 1` — never a silent drop. */
    expect(outcome).toMatchObject({
      status: 'refused',
      bytes: keepaliveLimitBytes + 1,
      limitBytes: keepaliveLimitBytes,
      overBound: true,
    });
    expect(outcome.status === 'refused' ? outcome.reason : '').toContain(String(keepaliveLimitBytes));
    expect(calls).toBe(0);
  });

  it('row 6: the bound is the client’s own, not a second copy of the number', async () => {
    /* The refusal comes from `createRevisionHttpClient`, so the cap has exactly
     * one definition; this asserts the wiring rather than re-deriving it. */
    const client = createRevisionHttpClient({ keepalive: true, fetch: async () => new Response('', { status: 200 }) });

    await expect(
      client.request({ url: pushUrl, method: 'POST', body: bodyOf(new Uint8Array(keepaliveLimitBytes + 1)) }),
    ).rejects.toThrow(String(keepaliveLimitBytes));
  });
});
