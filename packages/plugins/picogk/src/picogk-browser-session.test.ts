import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { MockProxy } from 'vitest-mock-extended';
import { z } from 'zod';

import { PicogkBrowserSession } from '#picogk-browser-session.js';
import type { PicogkBrowserSnapshot } from '#picogk-browser-session.js';

const snapshot: PicogkBrowserSnapshot = { revision: 'a', files: [{ path: 'main.cs', contents: new Uint8Array([1]) }] };
const sessions: PicogkBrowserSession[] = [];
const harness = (requestTimeout = 1000) => {
  const workers: Array<MockProxy<Worker>> = [];
  const session = new PicogkBrowserSession({
    assets: {
      bootstrapUrl: 'https://example.test/dotnet.js',
      compilerIdentity: '0'.repeat(64),
      references: [],
      runtimeFiles: [],
    },
    startupTimeout: 1000,
    requestTimeout,
    createWorker: () => {
      const worker = mock<Worker>();
      const events = new EventTarget();
      worker.addEventListener.mockImplementation(events.addEventListener.bind(events));
      worker.dispatchEvent.mockImplementation(events.dispatchEvent.bind(events));
      workers.push(worker);
      return worker;
    },
  });
  sessions.push(session);
  return { session, workers };
};
const tick = async () => {
  for (let index = 0; index < 8; index++) {
    // oxlint-disable-next-line no-await-in-loop -- Advance successive microtask turns in the serial request queue.
    await Promise.resolve();
  }
};
const ready = (worker: Worker, generation = 1, heapBytes?: number) =>
  worker.dispatchEvent(
    new MessageEvent('message', {
      data: {
        generation,
        kind: 'ready',
        frame: { protocolVersion: 9, type: 'ready', dotnetVersion: '11', picogkVersion: '2.3' },
        ...(heapBytes === undefined ? {} : { heapBytes }),
      },
    }),
  );
const reply = (
  worker: Worker,
  options: { generation?: number; requestId?: string; result?: unknown; error?: unknown; heapBytes?: number },
) =>
  worker.dispatchEvent(
    new MessageEvent('message', {
      data: {
        generation: options.generation ?? 1,
        kind: 'response',
        frame: {
          protocolVersion: 9,
          requestId: options.requestId ?? '1',
          ...(options.error === undefined ? { result: options.result ?? 7 } : { error: options.error }),
        },
        ...(options.heapBytes === undefined ? {} : { heapBytes: options.heapBytes }),
      },
    }),
  );
const request = async (
  session: PicogkBrowserSession,
  options: { source?: PicogkBrowserSnapshot; signal?: AbortSignal } = {},
) =>
  session.request({
    snapshot: options.source ?? snapshot,
    signal: options.signal ?? new AbortController().signal,
    method: 'build',
    params: {},
    schema: z.number(),
  });

afterEach(() => {
  for (const session of sessions.splice(0)) {
    session.cleanup();
  }
  vi.useRealTimers();
});

describe('PicoGK browser session', () => {
  it('should lazily initialize and serialize warm operations', async () => {
    const { session, workers } = harness();
    expect(workers).toHaveLength(0);
    const first = request(session);
    const second = request(session);
    await tick();
    expect(workers).toHaveLength(1);
    const worker = workers[0]!;
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    ready(worker);
    await tick();
    expect(worker.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'request', generation: 1 }));
    reply(worker, {});
    await expect(first).resolves.toBe(7);
    await tick();
    expect(workers).toHaveLength(1);
    reply(worker, { requestId: '2', result: 9 });
    await expect(second).resolves.toBe(9);
    session.cleanup();
    expect(worker.terminate).toHaveBeenCalledOnce();
    await expect(request(session)).rejects.toThrow('closed');
  });

  it('should destroy a replaced source and ignore its late response', async () => {
    const { session, workers } = harness();
    const old = request(session);
    const rejected = expect(old).rejects.toMatchObject({ name: 'AbortError' });
    await tick();
    const previous = workers[0]!;
    ready(previous);
    await tick();
    const stale = previous.addEventListener.mock.calls.find(([kind]) => kind === 'message')![1];
    const next = request(session, { source: { ...snapshot, revision: 'b' } });
    await rejected;
    await tick();
    expect(previous.terminate).toHaveBeenCalledOnce();
    if (typeof stale === 'function') {
      stale.call(previous, new MessageEvent('message', { data: { generation: 1, kind: 'failed' } }));
    }
    const current = workers[1]!;
    ready(current, 2);
    await tick();
    reply(current, { generation: 1, requestId: '2', result: 0 });
    reply(current, { generation: 2, requestId: '2', result: 11 });
    await expect(next).resolves.toBe(11);
  });

  it('should reject queued requests superseded before startup', async () => {
    const { session, workers } = harness();
    const old = request(session);
    const rejected = expect(old).rejects.toMatchObject({ name: 'AbortError' });
    const next = request(session, { source: { ...snapshot, revision: 'b' } });
    await rejected;
    await tick();
    expect(workers).toHaveLength(1);
    ready(workers[0]!, 2);
    await tick();
    reply(workers[0]!, { generation: 2 });
    await expect(next).resolves.toBe(7);
  });

  it('should abort active work and create a fresh worker for retry', async () => {
    const { session, workers } = harness();
    const controller = new AbortController();
    const active = request(session, { signal: controller.signal });
    const rejected = expect(active).rejects.toMatchObject({ name: 'AbortError' });
    await tick();
    ready(workers[0]!);
    await tick();
    controller.abort();
    await rejected;
    const retry = request(session);
    await tick();
    ready(workers[1]!);
    await tick();
    reply(workers[1]!, { requestId: '2' });
    await expect(retry).resolves.toBe(7);
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
  });

  it('should refuse an already aborted request without starting a worker', async () => {
    const { session, workers } = harness();
    const controller = new AbortController();
    controller.abort();
    await expect(request(session, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers).toHaveLength(0);
  });

  it('should bound startup and terminate an unresponsive worker', async () => {
    vi.useFakeTimers();
    const { session, workers } = harness();
    const pending = request(session);
    const rejected = expect(pending).rejects.toThrow('timed out');
    await tick();
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
  });

  it('should bound an active request and permit an explicit unlimited wait', async () => {
    vi.useFakeTimers();
    const { session, workers } = harness();
    const pending = request(session);
    const rejected = expect(pending).rejects.toThrow('timed out');
    await tick();
    ready(workers[0]!);
    await tick();
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    const unlimited = harness(0);
    const result = request(unlimited.session);
    await tick();
    ready(unlimited.workers[0]!);
    await tick();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(unlimited.workers[0]!.terminate).not.toHaveBeenCalled();
    reply(unlimited.workers[0]!, {});
    await expect(result).resolves.toBe(7);
  });

  it('should preserve authored issues and keep the worker available for recovery', async () => {
    const { session, workers } = harness();
    const pending = request(session);
    const issue = { message: 'Bad source', code: 'CS_TAU_COMPILATION', type: 'syntax', severity: 'error' };
    const rejected = expect(pending).rejects.toMatchObject({ name: 'PicogkWorkerError', issues: [issue] });
    await tick();
    ready(workers[0]!);
    await tick();
    reply(workers[0]!, { error: { issues: [issue] } });
    await rejected;
    expect(workers[0]!.terminate).not.toHaveBeenCalled();
  });

  it.each(['malformed', 'crash', 'message-error', 'reported'])('should terminate on %s', async (failure) => {
    const { session, workers } = harness();
    const pending = request(session);
    const rejected = expect(pending).rejects.toBeInstanceOf(Error);
    await tick();
    const worker = workers[0]!;
    if (failure === 'malformed') {
      worker.dispatchEvent(new MessageEvent('message', { data: null }));
    }
    if (failure === 'crash') {
      worker.dispatchEvent(Object.assign(new Event('error'), { message: 'Crashed' }));
    }
    if (failure === 'message-error') {
      worker.dispatchEvent(new MessageEvent('messageerror'));
    }
    if (failure === 'reported') {
      worker.dispatchEvent(new MessageEvent('message', { data: { generation: 1, kind: 'failed', message: 'Failed' } }));
    }
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('should preserve a validated worker initialization failure for the caller', async () => {
    const { session, workers } = harness();
    const pending = request(session);
    const rejected = expect(pending).rejects.toThrow('PicoGK runtime resource integrity mismatch.');
    await tick();
    workers[0]!.dispatchEvent(
      new MessageEvent('message', {
        data: { generation: 1, kind: 'failed', message: 'PicoGK runtime resource integrity mismatch.' },
      }),
    );
    await rejected;
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
  });

  it('should ignore unrelated responses and fence completion after source replacement', async () => {
    const { session, workers } = harness();
    const old = request(session);
    const rejected = expect(old).rejects.toMatchObject({ name: 'AbortError' });
    await tick();
    ready(workers[0]!);
    await tick();
    reply(workers[0]!, { requestId: 'unknown' });
    reply(workers[0]!, {});
    const next = request(session, { source: { ...snapshot, revision: 'b' } });
    await rejected;
    await tick();
    ready(workers[1]!, 2);
    await tick();
    reply(workers[1]!, { generation: 2, requestId: '2' });
    await expect(next).resolves.toBe(7);
  });

  it('should reject both active and queued work on cleanup', async () => {
    const { session, workers } = harness();
    const first = request(session);
    const second = request(session);
    const rejected = Promise.all([
      expect(first).rejects.toMatchObject({ name: 'AbortError' }),
      expect(second).rejects.toMatchObject({ name: 'AbortError' }),
    ]);
    await tick();
    session.cleanup();
    await rejected;
    expect(workers).toHaveLength(1);
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
  });

  it.each([
    {},
    { result: 7, error: { issues: [{ message: 'bad', code: 'CS_TAU_RUNTIME', type: 'runtime', severity: 'error' }] } },
  ])('should reject ambiguous response payloads %j', async (payload) => {
    const { session, workers } = harness();
    const pending = request(session);
    const rejected = expect(pending).rejects.toThrow('exactly one');
    await tick();
    ready(workers[0]!);
    await tick();
    workers[0]!.dispatchEvent(
      new MessageEvent('message', {
        data: { generation: 1, kind: 'response', frame: { protocolVersion: 9, requestId: '1', ...payload } },
      }),
    );
    await rejected;
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
  });

  it.each([new Error('Send failed'), 'Send failed'])(
    'should reject and terminate when sending fails: %s',
    async (failure) => {
      const { session, workers } = harness();
      const pending = request(session);
      const rejected = expect(pending).rejects.toThrow('Send failed');
      await tick();
      workers[0]!.postMessage.mockImplementation(() => {
        // oxlint-disable-next-line typescript/only-throw-error -- Exercise external non-Error throws.
        throw failure;
      });
      ready(workers[0]!);
      await rejected;
      expect(workers[0]!.terminate).toHaveBeenCalledOnce();
    },
  );

  it.each(['error', 'messageerror'])('should ignore a detached %s callback', async (kind) => {
    const { session, workers } = harness();
    const first = request(session);
    await tick();
    ready(workers[0]!);
    await tick();
    reply(workers[0]!, {});
    await first;
    const old = workers[0]!;
    const callback = old.addEventListener.mock.calls.find(([event]) => event === kind)![1];
    const next = request(session, { source: { ...snapshot, revision: 'b' } });
    await tick();
    if (typeof callback === 'function') {
      callback.call(old, new Event(kind));
    }
    ready(workers[1]!, 2);
    await tick();
    reply(workers[1]!, { generation: 2, requestId: '2' });
    await expect(next).resolves.toBe(7);
  });

  it.each(['error', 'failed'])('should supply a fallback for an empty %s message', async (kind) => {
    const { session, workers } = harness();
    const pending = request(session);
    const rejected = expect(pending).rejects.toThrow('worker');
    await tick();
    workers[0]!.dispatchEvent(
      kind === 'error'
        ? Object.assign(new Event('error'), { message: '' })
        : new MessageEvent('message', { data: { generation: 1, kind: 'failed' } }),
    );
    await rejected;
  });

  it('should handle cancellation during worker allocation without sending initialization', async () => {
    const controller = new AbortController();
    const worker = mock<Worker>();
    const session = new PicogkBrowserSession({
      assets: { bootstrapUrl: '', compilerIdentity: '', references: [], runtimeFiles: [] },
      startupTimeout: 1000,
      requestTimeout: 1000,
      createWorker: () => {
        controller.abort();
        return worker;
      },
    });
    sessions.push(session);
    await expect(request(session, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  // T26 (PR-1b): the observation-only heap is the live worker's `HEAPU8.byteLength` as of its latest reply, and none
  // without a live worker; nothing here feeds the build's own recycling metric.
  it("should observe the live worker's WebAssembly heap as of its latest reply, and none once it is gone", async () => {
    const mebibyte = 2 ** 20;
    const { session, workers } = harness();
    expect(session.observedHeapBytes()).toBeUndefined();
    const first = request(session);
    await tick();
    const worker = workers[0]!;
    expect(session.observedHeapBytes()).toBeUndefined();
    ready(worker, 1, 32 * mebibyte);
    await tick();
    expect(session.observedHeapBytes()).toBe(32 * mebibyte);
    reply(worker, { requestId: '9', heapBytes: 999 * mebibyte });
    reply(worker, { generation: 2, heapBytes: 999 * mebibyte });
    expect(session.observedHeapBytes()).toBe(32 * mebibyte);
    reply(worker, { heapBytes: 48 * mebibyte });
    await expect(first).resolves.toBe(7);
    expect(session.observedHeapBytes()).toBe(48 * mebibyte);
    const second = request(session);
    await tick();
    reply(worker, { requestId: '2' });
    await expect(second).resolves.toBe(7);
    expect(session.observedHeapBytes()).toBe(48 * mebibyte);

    const replaced = request(session, { source: { ...snapshot, revision: 'b' } });
    await tick();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(session.observedHeapBytes()).toBeUndefined();
    const next = workers[1]!;
    ready(next, 2, 16 * mebibyte);
    await tick();
    reply(next, { generation: 2, requestId: '3', heapBytes: 24 * mebibyte });
    await expect(replaced).resolves.toBe(7);
    expect(session.observedHeapBytes()).toBe(24 * mebibyte);
    session.cleanup();
    expect(session.observedHeapBytes()).toBeUndefined();
  });

  it('should reject invalid timeout configuration', () => {
    for (const [startupTimeout, requestTimeout] of [
      [0, 1],
      [Infinity, 1],
      [1, -1],
      [1, Infinity],
    ]) {
      expect(
        () =>
          new PicogkBrowserSession({
            createWorker: () => mock<Worker>(),
            assets: { bootstrapUrl: '', compilerIdentity: '', references: [], runtimeFiles: [] },
            startupTimeout: startupTimeout!,
            requestTimeout: requestTimeout!,
          }),
      ).toThrow('timeouts');
    }
  });
});

describe('PicoGK browser artifact transfer', () => {
  const receipt = (bytes: Uint8Array<ArrayBuffer>) => ({
    artifactPath: '/artifacts/model.tau-mesh',
    byteLength: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  const initialized = async () => {
    const { session, workers } = harness();
    const build = request(session);
    await tick();
    const worker = workers[0]!;
    ready(worker);
    await tick();
    reply(worker, {});
    await build;
    return { session, worker };
  };

  it('should transfer bounded chunks and verify the whole digest', async () => {
    const { session, worker } = await initialized();
    const bytes = new Uint8Array(8 * 1024 * 1024 + 3).fill(7);
    const result = session.readArtifact({ snapshot, artifact: receipt(bytes), signal: new AbortController().signal });
    await tick();
    const range = () =>
      z
        .object({
          frame: z.object({ method: z.string(), params: z.object({ offset: z.number(), length: z.number() }) }),
        })
        .parse(worker.postMessage.mock.calls.at(-1)?.[0]).frame;
    expect(range()).toEqual({ method: '$readArtifact', params: { offset: 0, length: 8 * 1024 * 1024 } });
    reply(worker, { requestId: '2', result: bytes.slice(0, 8 * 1024 * 1024) });
    await tick();
    expect(range()).toEqual({ method: '$readArtifact', params: { offset: 8 * 1024 * 1024, length: 3 } });
    reply(worker, { requestId: '3', result: bytes.slice(-3) });
    const received = await result;
    expect(received.length).toBe(bytes.length);
    expect(received.every((value, index) => value === bytes[index])).toBe(true);
    expect(received === bytes).toBe(false);
  });

  it('should consume empty artifacts with one bounded request', async () => {
    const { session, worker } = await initialized();
    const result = session.readArtifact({
      snapshot,
      artifact: receipt(new Uint8Array()),
      signal: new AbortController().signal,
    });
    await tick();
    reply(worker, { requestId: '2', result: new Uint8Array() });
    expect(await result).toHaveLength(0);
    expect(worker.postMessage).toHaveBeenCalledTimes(3);
  });

  it.each([new Uint8Array([1]), new Uint8Array([1, 3])])(
    'should reject incomplete or changed bytes %j',
    async (chunk) => {
      const { session, worker } = await initialized();
      const result = session.readArtifact({
        snapshot,
        artifact: receipt(new Uint8Array([1, 2])),
        signal: new AbortController().signal,
      });
      const rejected = expect(result).rejects.toThrow(/Incomplete|integrity/iu);
      await tick();
      reply(worker, { requestId: '2', result: chunk });
      await rejected;
    },
  );

  it.each([{ byteLength: -1 }, { byteLength: Number.NaN }, { sha256: 'invalid' }])(
    'should refuse an invalid receipt %j',
    async (change) => {
      const { session } = await initialized();
      await expect(
        session.readArtifact({
          snapshot,
          artifact: { ...receipt(new Uint8Array()), ...change },
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow('receipt');
    },
  );

  it('should refuse old or absent worker generations and explicit aborts', async () => {
    const { session } = harness();
    const options = { snapshot, artifact: receipt(new Uint8Array()), signal: new AbortController().signal };
    await expect(session.readArtifact(options)).rejects.toMatchObject({ name: 'AbortError' });
    const active = await initialized();
    await expect(
      active.session.readArtifact({ ...options, snapshot: { ...snapshot, revision: 'old' } }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await expect(active.session.readArtifact({ ...options, signal: AbortSignal.abort() })).rejects.toMatchObject({
      name: 'AbortError',
    });
    active.session.cleanup();
    await expect(active.session.readArtifact(options)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('should reject an artifact read superseded by a new source', async () => {
    const { session, worker } = await initialized();
    const result = session.readArtifact({
      snapshot,
      artifact: receipt(new Uint8Array([1])),
      signal: new AbortController().signal,
    });
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await tick();
    reply(worker, { requestId: '2', result: new Uint8Array([1]) });
    const replacement = request(session, { source: { ...snapshot, revision: 'new' } });
    const replacementRejected = expect(replacement).rejects.toMatchObject({ name: 'AbortError' });
    session.cleanup();
    await rejected;
    await replacementRejected;
  });
});
