import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bvhBuildOptions,
  bvhWorkerIdleMilliseconds,
  createBvhWorkerClient,
} from '#graphics/three/utils/bvh-worker-client.js';
import type { BvhBuildRequest, BvhWorkerMessage, BvhWorkerPort } from '#graphics/three/utils/bvh-worker-client.js';

type Listener = (event: Event) => void;

/** A worker double that records what it is sent and lets the test answer. */
class FakeWorker implements BvhWorkerPort {
  public readonly requests: Array<{ request: BvhBuildRequest; transfer: Transferable[] }> = [];
  public terminated = false;
  private readonly listeners = new Map<string, Listener[]>();

  public postMessage(request: BvhBuildRequest, transfer: Transferable[]): void {
    this.requests.push({ request, transfer });
  }

  public terminate(): void {
    this.terminated = true;
  }

  public addEventListener(type: 'message' | 'error' | 'messageerror', listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  public reply(message: BvhWorkerMessage): void {
    for (const listener of this.listeners.get('message') ?? []) {
      listener(new MessageEvent('message', { data: message }));
    }
  }

  public built(id = this.requests.at(-1)!.request.id): void {
    this.reply({
      type: 'built',
      id,
      version: 1,
      roots: [new ArrayBuffer(8)],
      indirectBuffer: undefined,
      buildMilliseconds: 2,
    });
  }

  public crash(): void {
    for (const listener of this.listeners.get('error') ?? []) {
      listener(new ErrorEvent('error', { message: 'out of memory' }));
    }
  }
}

const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('createBvhWorkerClient', () => {
  let workers: FakeWorker[];
  let createWorker: () => FakeWorker;

  beforeEach(() => {
    vi.useFakeTimers();
    workers = [];
    createWorker = vi.fn(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates the worker on the first build and sends copies of the bytes, never the geometry buffers', async () => {
    const client = createBvhWorkerClient(createWorker);
    expect(createWorker).not.toHaveBeenCalled();
    const geometry = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
    geometry.addGroup(0, 6, 1);
    const built = client.build(geometry, () => true);

    expect(workers).toHaveLength(1);
    const { request, transfer } = workers[0]!.requests[0]!;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(request.options).toEqual(bvhBuildOptions);
    expect(request.position.array).toEqual(position.array);
    expect(request.position.array).not.toBe(position.array);
    expect(request.position.array.buffer).not.toBe(position.array.buffer);
    expect(request.index?.array).toEqual(geometry.index!.array);
    expect(request.index?.array.buffer).not.toBe(geometry.index!.array.buffer);
    expect(transfer).toEqual([request.position.array.buffer, request.index!.array.buffer]);
    expect(request.groups).toEqual(
      geometry.groups.map(({ start, count, materialIndex }) => ({ start, count, materialIndex })),
    );

    workers[0]!.built();
    const outcome = await built;
    expect(outcome.status).toBe('built');
    expect(outcome.status === 'built' && outcome.tree.version).toBe(1);
  });

  it('builds one tree at a time and lets the latest request for a geometry supersede a queued one', async () => {
    const client = createBvhWorkerClient(createWorker);
    const first = new THREE.BoxGeometry();
    const second = new THREE.BoxGeometry();
    const active = client.build(first, () => true);
    const queued = client.build(second, () => true);
    const latest = client.build(second, () => true);
    expect(workers[0]!.requests).toHaveLength(1);

    await expect(queued).resolves.toEqual({ status: 'superseded' });
    workers[0]!.built();
    await expect(active).resolves.toMatchObject({ status: 'built' });
    expect(workers[0]!.requests).toHaveLength(2);
    workers[0]!.built();
    await expect(latest).resolves.toMatchObject({ status: 'built' });
  });

  it('discards a tree whose geometry stopped being current while it built', async () => {
    const client = createBvhWorkerClient(createWorker);
    let isCurrent = true;
    const built = client.build(new THREE.BoxGeometry(), () => isCurrent);
    isCurrent = false;
    workers[0]!.built();
    await expect(built).resolves.toEqual({ status: 'superseded' });
  });

  it('never sends a request that stopped being current while it waited', async () => {
    const client = createBvhWorkerClient(createWorker);
    void client.build(new THREE.BoxGeometry(), () => true);
    let isCurrent = true;
    const waiting = client.build(new THREE.BoxGeometry(), () => isCurrent);
    isCurrent = false;
    workers[0]!.built();
    await expect(waiting).resolves.toEqual({ status: 'superseded' });
    expect(workers[0]!.requests).toHaveLength(1);
  });

  it('terminates a failed worker, retries once on a new one and then fails with the reason', async () => {
    const client = createBvhWorkerClient(createWorker);
    const built = client.build(new THREE.BoxGeometry(), () => true);
    workers[0]!.crash();
    expect(workers[0]!.terminated).toBe(true);
    expect(workers).toHaveLength(2);
    expect(workers[1]!.requests).toHaveLength(1);

    workers[1]!.reply({ type: 'error', id: workers[1]!.requests[0]!.request.id, message: 'bad geometry' });
    await expect(built).resolves.toEqual({ status: 'failed', reason: 'bad geometry' });
    expect(workers[1]!.terminated).toBe(true);
    expect(workers).toHaveLength(2);
  });

  it('succeeds on the retry after one failure', async () => {
    const client = createBvhWorkerClient(createWorker);
    const built = client.build(new THREE.BoxGeometry(), () => true);
    workers[0]!.crash();
    workers[1]!.built();
    await expect(built).resolves.toMatchObject({ status: 'built' });
  });

  it('ignores a message from a terminated worker', async () => {
    const client = createBvhWorkerClient(createWorker);
    const built = client.build(new THREE.BoxGeometry(), () => true);
    const staleId = workers[0]!.requests[0]!.request.id;
    workers[0]!.crash();
    workers[0]!.built(staleId);
    const notYet = Symbol('not yet');
    await settle();
    expect(await Promise.race([built, Promise.resolve(notYet)])).toBe(notYet);
    workers[1]!.built();
    await expect(built).resolves.toMatchObject({ status: 'built' });
  });

  it('terminates the worker after a minute without work and recreates it on the next build', async () => {
    const client = createBvhWorkerClient(createWorker);
    const built = client.build(new THREE.BoxGeometry(), () => true);
    workers[0]!.built();
    await built;
    vi.advanceTimersByTime(bvhWorkerIdleMilliseconds - 1);
    expect(workers[0]!.terminated).toBe(false);
    vi.advanceTimersByTime(1);
    expect(workers[0]!.terminated).toBe(true);

    void client.build(new THREE.BoxGeometry(), () => true);
    expect(workers).toHaveLength(2);
  });

  it('drops a released geometry from the queue and ends every request on dispose', async () => {
    const client = createBvhWorkerClient(createWorker);
    const first = new THREE.BoxGeometry();
    const second = new THREE.BoxGeometry();
    const active = client.build(first, () => true);
    const queued = client.build(second, () => true);
    client.release(second);
    await expect(queued).resolves.toEqual({ status: 'superseded' });

    client.dispose();
    await expect(active).resolves.toEqual({ status: 'disposed' });
    expect(workers[0]!.terminated).toBe(true);
    await expect(client.build(first, () => true)).resolves.toEqual({ status: 'disposed' });
  });
});
