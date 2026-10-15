import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { MachineClient, MachineDirectorySnapshot } from '@taucad/runtime/machine';
import { machineObservation } from '#services/machine-observation.js';

const snapshot: MachineDirectorySnapshot = {
  cursor: { hostId: 'host', authorityId: 'authority', generation: 'g1', position: 0, revision: 0 },
  entries: [],
};
const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};
const fixture = () => {
  const signals: AbortSignal[] = [];
  const client = mock<MachineClient>();
  client.list.mockResolvedValue(snapshot);
  client.listProviders.mockResolvedValue([]);
  client.watch.mockImplementation(async function* ({ signal }) {
    if (signal === undefined) {
      throw new Error('Expected cancellation');
    }
    signals.push(signal);
    await new Promise<void>((resolve) => {
      signal.addEventListener(
        'abort',
        () => {
          resolve();
        },
        { once: true },
      );
    });
    yield* [];
  });
  return { client, signals };
};
describe('shared machine subscriptions', () => {
  it('shares list/providers/watch across surfaces and aborts only when the final reader leaves', async () => {
    const { client, signals } = fixture();
    const project = machineObservation(client);
    const global = machineObservation(client);
    const releaseProject = project.subscribe(vi.fn());
    const releaseGlobal = global.subscribe(vi.fn());
    await settle();
    expect(client.list).toHaveBeenCalledOnce();
    expect(client.listProviders).toHaveBeenCalledOnce();
    expect(client.watch).toHaveBeenCalledOnce();
    expect(project.getSnapshot()).toBe(global.getSnapshot());
    releaseProject();
    expect(signals[0]?.aborted).toBe(false);
    releaseGlobal();
    expect(signals[0]?.aborted).toBe(true);
    expect(global.getSnapshot().snapshot).toBeUndefined();
  });
  it('shares jobs for one qualified machine and keeps another host separate', async () => {
    const { client } = fixture();
    const signals: AbortSignal[] = [];
    client.listJobs.mockResolvedValue([]);
    client.watchJobs.mockImplementation(async function* ({ signal }) {
      if (signal === undefined) {
        throw new Error('Expected cancellation');
      }
      signals.push(signal);
      await new Promise<void>((resolve) => {
        signal.addEventListener(
          'abort',
          () => {
            resolve();
          },
          { once: true },
        );
      });
      yield* [];
    });
    const first = machineObservation(client, 'same-id', 'host-a').subscribe(vi.fn());
    const second = machineObservation(client, 'same-id', 'host-a').subscribe(vi.fn());
    const third = machineObservation(client, 'same-id', 'host-b').subscribe(vi.fn());
    await settle();
    expect(client.listJobs).toHaveBeenCalledTimes(2);
    expect(client.watchJobs).toHaveBeenCalledTimes(2);
    first();
    expect(signals[0]?.aborted).toBe(false);
    second();
    expect(signals[0]?.aborted).toBe(true);
    third();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
  it('releases all resources over 100 mount cycles', async () => {
    const { client, signals } = fixture();
    const store = machineObservation(client);
    for (let cycle = 0; cycle < 100; cycle += 1) {
      const release = store.subscribe(vi.fn());
      // oxlint-disable-next-line no-await-in-loop -- each mount settles before its cleanup.
      await settle();
      release();
    }
    expect(signals).toHaveLength(100);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(store.getSnapshot().snapshot).toBeUndefined();
  });
  it('ignores a late list after the final consumer releases and a new owner starts', async () => {
    const { client } = fixture();
    const pending = Promise.withResolvers<MachineDirectorySnapshot>();
    client.list.mockReturnValueOnce(pending.promise);
    const store = machineObservation(client);
    store.subscribe(vi.fn())();
    const release = store.subscribe(vi.fn());
    await settle();
    pending.resolve({ ...snapshot, cursor: { ...snapshot.cursor, hostId: 'old' } });
    await settle();
    expect(store.getSnapshot().snapshot?.cursor.hostId).toBe('host');
    release();
  });
});
