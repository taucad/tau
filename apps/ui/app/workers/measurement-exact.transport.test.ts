// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- pointAMeters/pointBMeters are existing exact-measurement response fields. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExactRequest, ExactResponse } from './measurement-exact.worker.js';

type Listener = (event: { data: ExactResponse }) => void;

/** A worker that answers each request with a fixed distance. */
class FakeExactWorker {
  public static readonly created: FakeExactWorker[] = [];
  public readonly terminate = vi.fn();
  public readonly postMessage = vi.fn((request: ExactRequest, _transfer?: Transferable[]) => {
    queueMicrotask(() => {
      for (const listener of this.listeners.get('message') ?? []) {
        listener({
          data: {
            id: request.id,
            status: 'cad-geometry',
            distanceMeters: 1,
            pointAMeters: [0, 0, 0],
            pointBMeters: [1, 0, 0],
            source: 'ap242',
          },
        });
      }
    });
  });

  private readonly listeners = new Map<string, Listener[]>();

  public constructor() {
    FakeExactWorker.created.push(this);
  }

  public addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  public removeEventListener(type: string, listener: Listener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener),
    );
  }
}

const request = (id: number): ExactRequest => ({
  id,
  source: { format: 'ap242', bytes: new TextEncoder().encode(`AP242-${id}`), coordinateSystem: 'y-up' },
  occurrences: [{ name: 'a' }, { name: 'b' }],
});

describe('browser exact measurement transport', () => {
  beforeEach(() => {
    vi.resetModules();
    FakeExactWorker.created.length = 0;
    vi.stubGlobal('Worker', FakeExactWorker);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('should answer consecutive queries from one worker', async () => {
    const { runExactRequest } = await import('./measurement-exact.transport.js');

    await expect(runExactRequest(request(1))).resolves.toMatchObject({ id: 1, status: 'cad-geometry' });
    await expect(runExactRequest(request(2))).resolves.toMatchObject({ id: 2, status: 'cad-geometry' });

    expect(FakeExactWorker.created).toHaveLength(1);
    expect(FakeExactWorker.created[0]?.terminate).not.toHaveBeenCalled();
  });

  it('should transfer a copy of the AP242 bytes and leave the caller buffer attached', async () => {
    const { runExactRequest } = await import('./measurement-exact.transport.js');
    const sent = request(3);

    await runExactRequest(sent);

    const [posted, transfer] = FakeExactWorker.created[0]!.postMessage.mock.calls[0]!;
    expect(transfer).toEqual([posted.source.bytes.buffer]);
    expect(posted.source.bytes.buffer).not.toBe(sent.source.bytes.buffer);
    expect(posted.source.bytes).toEqual(sent.source.bytes);
  });

  it('should terminate the worker once it has been idle', async () => {
    vi.useFakeTimers();
    const { runExactRequest } = await import('./measurement-exact.transport.js');

    await runExactRequest(request(4));
    const [worker] = FakeExactWorker.created;
    await vi.advanceTimersByTimeAsync(29_999);
    expect(worker?.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(worker?.terminate).toHaveBeenCalledOnce();
    await runExactRequest(request(5));
    expect(FakeExactWorker.created).toHaveLength(2);
  });
});
