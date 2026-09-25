/**
 * The client half of a project's `revision` stream (D13), against a scripted API.
 *
 * | Row | What it proves |
 * | --- | --- |
 * | contract | the stream id is the API's own spelling (`revision:<projectId>`) |
 * | tail | the first read learns the tail and reports nothing; each later page is one wake-up from the tail on |
 * | watching | the tail's settling is announced once, success or failure, so an open pull can wait for it (W5b a1b) |
 * | stopped | a refusal whose body settles after `stop` reports nothing (RV-W5b F3) |
 * | timeout | a poll the server never answers is abandoned and asked again (RV-W5b F6) |
 * | refusal | a 404 stops the loop and hands the server's sentence to the classifier (rule 19) |
 * | backoff | a 5xx waits and asks again; `stop` aborts the poll in flight |
 * | auth | the page's cookie and a disk host's bearer are both honoured |
 */

import { describe, expect, it, vi } from 'vitest';

import { revisionStreamId, watchRevisionStream } from '#revision-stream.js';
import type { RevisionStreamMove } from '#revision-stream.js';
import type { RevisionPortError } from '#revision-port.js';

const page = (nextSequence: number, events: ReadonlyArray<Readonly<{ generation: number; refs: string[] }>> = []) =>
  Response.json({
    found: true,
    snapshot: { streamId: 'revision:p1', kind: 'revision', subjectId: 'p1', sequence: nextSequence, data: {} },
    events: events.map((payload, index) => ({
      streamId: 'revision:p1',
      sequence: nextSequence - events.length + index + 1,
      eventId: `e${String(index)}`,
      type: 'revision.committed',
      occurredAt: '2026-09-26T00:00:00.000Z',
      payload,
    })),
    nextSequence,
  });

type Scripted = Readonly<{
  fetch: typeof globalThis.fetch;
  requests: Array<Readonly<{ url: URL; init: RequestInit | undefined }>>;
}>;

/* A fetch that answers from a script, then parks until aborted. */
const scripted = (answers: ReadonlyArray<() => Response>): Scripted => {
  const requests: Array<Readonly<{ url: URL; init: RequestInit | undefined }>> = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    requests.push({ url: new URL(input instanceof Request ? input.url : input), init });
    const answer = answers[requests.length - 1];
    if (answer !== undefined) {
      return answer();
    }
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  });
  return { fetch, requests };
};

const watch = (
  fetch: typeof globalThis.fetch,
  auth: 'cookie' | 'bearer' = 'cookie',
  extra: Readonly<{ requestTimeoutMilliseconds?: number }> = {},
) => {
  const moves: RevisionStreamMove[] = [];
  const refusals: RevisionPortError[] = [];
  /* How many requests had been made each time the tail was announced. */
  const watchings: number[] = [];
  const stop = watchRevisionStream(
    {
      projectId: 'p1',
      apiBaseUrl: () => 'https://api.tau.test/',
      auth: () => (auth === 'cookie' ? { kind: 'cookie' } : { kind: 'bearer', authorization: 'Bearer t0k' }),
      fetch,
      retryMilliseconds: 1,
      ...extra,
    },
    {
      watching: () => watchings.push(vi.mocked(fetch).mock.calls.length),
      moved: (move) => moves.push(move),
      refused: (error) => refusals.push(error),
    },
  );
  return { moves, refusals, watchings, stop };
};

describe('the revision stream reader', () => {
  it('spells the stream id as the API does (apps/api durable-events.types.ts `revisionStreamId`)', () => {
    expect(revisionStreamId('prj_abc')).toBe('revision:prj_abc');
  });

  it('learns the tail without reporting, then reports one wake-up per page from the tail on', async () => {
    const api = scripted([
      () => page(7, [{ generation: 7, refs: ['refs/heads/main'] }]),
      () =>
        page(9, [
          { generation: 8, refs: ['refs/heads/main'] },
          { generation: 9, refs: ['refs/heads/main', 'refs/tau/chats/c1'] },
        ]),
    ]);
    const stream = watch(api.fetch);

    await vi.waitFor(() => {
      expect(api.requests).toHaveLength(3);
    });
    stream.stop();

    const [tail, poll, next] = api.requests;
    expect(tail?.url.pathname).toBe('/v1/streams/revision%3Ap1/events');
    expect(Object.fromEntries(tail?.url.searchParams ?? [])).toEqual({
      afterSequence: '0',
      limit: '1',
      longPollDuration: '0',
    });
    expect(Object.fromEntries(poll?.url.searchParams ?? [])).toEqual({
      afterSequence: '7',
      longPollDuration: '25000',
    });
    expect(next?.url.searchParams.get('afterSequence')).toBe('9');
    /* The entries before the tail are the open pull's; the page after it is one wake-up. */
    expect(stream.moves).toEqual([{ generation: 9, refs: ['refs/heads/main', 'refs/tau/chats/c1'] }]);
    expect(tail?.init).toMatchObject({ credentials: 'include' });
    /* Announced once, after the tail read and before the first long poll. */
    expect(stream.watchings).toEqual([1]);
  });

  it('stops at a 404 and hands the server’s sentence to the refusal classifier (rule 19)', async () => {
    const api = scripted([
      () => page(0),
      () => Response.json({ code: 'PROJECT_NOT_FOUND', error: 'Project not found.' }, { status: 404 }),
    ]);
    const stream = watch(api.fetch);

    await vi.waitFor(() => {
      expect(stream.refusals).toHaveLength(1);
    });
    expect(stream.refusals[0]).toMatchObject({ code: 'REMOTE_NOT_FOUND', message: 'Project not found.' });
    /* Nothing asks again on its own. */
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(api.requests).toHaveLength(2);
    stream.stop();
  });

  it('backs off after a server failure and asks again, and stop aborts the poll in flight', async () => {
    const api = scripted([() => new Response('busy', { status: 503 }), () => page(3)]);
    const stream = watch(api.fetch, 'bearer');

    await vi.waitFor(() => {
      expect(api.requests).toHaveLength(3);
    });
    expect(api.requests[0]?.url.searchParams.get('afterSequence')).toBe('0');
    expect(api.requests[1]?.url.searchParams.get('afterSequence')).toBe('0');
    expect(api.requests[2]?.url.searchParams.get('afterSequence')).toBe('3');
    expect(new Headers(api.requests[0]?.init?.headers).get('authorization')).toBe('Bearer t0k');
    expect(api.requests[0]?.init).not.toHaveProperty('credentials');

    stream.stop();
    expect(api.requests[2]?.init?.signal?.aborted).toBe(true);
    /* A failed tail read still lets the open pull go ahead, and only once. */
    expect(stream.watchings).toEqual([1]);
    expect(stream.refusals).toEqual([]);
  });

  it('reports nothing from a refusal whose body settles after stop (RV-W5b F3)', async () => {
    let releaseBody = (_text: string): void => undefined;
    const body = new Promise<string>((resolve) => {
      releaseBody = resolve;
    });
    const api = scripted([() => page(0), () => new Response(new ReadableStream(), { status: 404 })]);
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const response = await api.fetch(input, init);
      return response.status === 404 ? Object.assign(response, { text: async () => body }) : response;
    });
    const stream = watch(fetch);
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    stream.stop();
    releaseBody('Project not found.');
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(stream.refusals).toEqual([]);
  });

  it('abandons a poll the server never answers and asks again (RV-W5b F6)', async () => {
    /* After the tail, every request parks until its own signal aborts: a half-open connection. */
    const api = scripted([() => page(4)]);
    const stream = watch(api.fetch, 'cookie', { requestTimeoutMilliseconds: 20 });

    await vi.waitFor(() => {
      expect(api.requests.length).toBeGreaterThanOrEqual(3);
    });
    expect(api.requests[1]?.url.searchParams.get('afterSequence')).toBe('4');
    expect(api.requests[2]?.url.searchParams.get('afterSequence')).toBe('4');
    stream.stop();
  });
});
