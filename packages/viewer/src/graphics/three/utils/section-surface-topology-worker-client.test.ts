import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSectionTopologyWorkerClient } from '#graphics/three/utils/section-surface-topology-worker-client.js';
import type { SectionClosureCensus } from '#graphics/three/utils/section-surface-closure.js';
import type { SectionClosureWorkerInput } from '#graphics/three/utils/section-surface-topology.js';

type PostedRequest = Readonly<{ id: number; input: SectionClosureWorkerInput }>;

/** A worker double that records requests and answers them only when the test says so. */
class FakeTopologyWorker extends EventTarget {
  public readonly requests: PostedRequest[] = [];
  public terminated = false;

  public postMessage(message: PostedRequest): void {
    this.requests.push(message);
  }

  public terminate(): void {
    this.terminated = true;
  }

  public answer(index: number, result: SectionClosureCensus): void {
    this.dispatchEvent(new MessageEvent('message', { data: { id: this.requests[index]!.id, result } }));
  }

  public fail(message: string): void {
    this.dispatchEvent(new ErrorEvent('error', { message }));
  }
}

const input: SectionClosureWorkerInput = {
  sourceKey: 'source',
  positions: new Float64Array(9),
  triangleVertices: new Uint32Array([0, 1, 2]),
};

const openCensus: SectionClosureCensus = {
  isClosed: false,
  unbalancedEdgeCount: 3,
  indexUnbalancedEdgeCount: 3,
  milliseconds: 0,
};

const createHarness = () => {
  const workers: FakeTopologyWorker[] = [];
  const client = createSectionTopologyWorkerClient(() => {
    const worker = new FakeTopologyWorker();
    workers.push(worker);
    return worker;
  });
  return { client, workers };
};

describe('section topology worker client', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not create a worker until a topology build is requested', () => {
    const { workers } = createHarness();

    expect(workers).toHaveLength(0);
  });

  it('should terminate the worker once it has been idle for a second', async () => {
    const { client, workers } = createHarness();
    const result = client.build(input);
    workers[0]!.answer(0, openCensus);

    await expect(result).resolves.toEqual(openCensus);
    expect(workers[0]!.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(999);
    expect(workers[0]!.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(workers[0]!.terminated).toBe(true);
  });

  it('should keep the worker while another build is still in flight', async () => {
    const { client, workers } = createHarness();
    const first = client.build(input);
    const second = client.build(input);
    workers[0]!.answer(0, openCensus);
    await first;
    await vi.advanceTimersByTimeAsync(5000);

    expect(workers).toHaveLength(1);
    expect(workers[0]!.terminated).toBe(false);
    workers[0]!.answer(1, openCensus);
    await expect(second).resolves.toEqual(openCensus);
    await vi.advanceTimersByTimeAsync(1000);
    expect(workers[0]!.terminated).toBe(true);
  });

  it('should start a fresh worker for a build after an idle termination', async () => {
    const { client, workers } = createHarness();
    const first = client.build(input);
    workers[0]!.answer(0, openCensus);
    await first;
    await vi.advanceTimersByTimeAsync(1000);
    const second = client.build(input);

    expect(workers).toHaveLength(2);
    workers[1]!.answer(0, openCensus);
    await expect(second).resolves.toEqual(openCensus);
  });

  it('should terminate an idle worker immediately when the viewer releases it', async () => {
    const { client, workers } = createHarness();
    const result = client.build(input);
    workers[0]!.answer(0, openCensus);
    await result;

    client.release();

    expect(workers[0]!.terminated).toBe(true);
  });

  it('should leave an in-flight build running when released and terminate once it settles', async () => {
    const { client, workers } = createHarness();
    const result = client.build(input);

    client.release();
    expect(workers[0]!.terminated).toBe(false);
    workers[0]!.answer(0, openCensus);

    await expect(result).resolves.toEqual(openCensus);
    await vi.advanceTimersByTimeAsync(1000);
    expect(workers[0]!.terminated).toBe(true);
  });

  it('should reject pending builds and terminate the worker when it fails', async () => {
    const { client, workers } = createHarness();
    const result = client.build(input);

    workers[0]!.fail('worker crashed');

    await expect(result).rejects.toThrow('worker crashed');
    expect(workers[0]!.terminated).toBe(true);
  });

  it('should report no worker when the platform cannot create one', () => {
    const client = createSectionTopologyWorkerClient(() => undefined);

    expect(client.build(input)).toBeUndefined();
  });
});
