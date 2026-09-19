import { MessageChannel } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { contentDigest, digestAction } from '@taucad/cache-core';
import type { ActionDigest, ComputeAction } from '@taucad/cache-core';
import { createMemoryComputeEngine } from '#cache/memory-compute-engine.js';
import {
  createComputeStoreChannelClient,
  connectComputeStoreChannel,
  exposeComputeStoreChannel,
} from '#transport/_internal/compute-store-channel.js';
import { buildComputeStoreBridge } from '#transport/_internal/compute-store-bridge.js';
import { _registerComputeStore, createComputeCapabilityHost } from '#cache/kernel-compute-runtime.js';
import type { ComputeStore, ResidentCacheBinding, ResidentExportEntry } from '#types/runtime-compute.types.js';

const implementationDigest = contentDigest({ value: `sha256:${'1'.repeat(64)}` });
const action: ComputeAction = {
  schemaVersion: 1,
  namespace: 'channel.lifecycle',
  producer: { id: 'channel', version: '1', implementationAssets: [implementationDigest] },
  operation: 'solve',
  inputs: [],
  arguments: {},
  environment: {},
  codec: { id: 'test.bytes', version: '1' },
};

const resident = (): ResidentCacheBinding & { seed(digest: ActionDigest): void } => {
  const entries = new Map<ActionDigest, Uint8Array<ArrayBuffer>>();
  return {
    seed: (digest) => {
      entries.set(digest, new TextEncoder().encode('shape'));
    },
    contains: ({ digest }) => entries.has(digest),
    importEntries: async ({ entries: imported }) => {
      for (const entry of imported) {
        entries.set(entry.actionDigest, new Uint8Array(entry.bytes));
      }
      return { imported: imported.map((entry) => entry.actionDigest), omitted: [] };
    },
    exportEntries: async ({ digests }) => ({
      entries: digests.flatMap((digest): ResidentExportEntry[] => {
        const bytes = entries.get(digest);
        return bytes ? [{ action, bytes, mediaType: 'application/octet-stream', determinism: 'byte-exact' }] : [];
      }),
      omitted: digests.filter((digest) => !entries.has(digest)),
    }),
    stats: () => ({
      entries: entries.size,
      logicalBytes: 0,
      encodedBytes: { status: 'unsupported' },
      evictions: 0,
      omissions: 0,
    }),
    clear: () => {
      entries.clear();
    },
  };
};

describe('compute store channel', () => {
  it('does not grant host control to a runtime bridge', async () => {
    const authority = createMemoryComputeEngine();
    const store = _registerComputeStore({
      spec: Object.freeze({}) as ComputeStore,
      engine: authority.engine,
      workspace: 'trusted',
      control: authority.control({ workspace: 'trusted' }),
    });
    const bridge = buildComputeStoreBridge({ mode: 'durable', store });
    const port = bridge.memoryHandle.computeStorePort;
    if (!port) {
      throw new Error('durable bridge did not mint a port');
    }
    const rawClient = createComputeStoreChannelClient(port);
    await expect(rawClient.control.clear({})).rejects.toThrow(/control is unavailable/u);
    const secondBridge = buildComputeStoreBridge({ mode: 'durable', store: rawClient.store });
    const secondPort = secondBridge.memoryHandle.computeStorePort;
    if (!secondPort) {
      throw new Error('second durable bridge did not mint a port');
    }
    const client = connectComputeStoreChannel(secondPort);
    const host = createComputeCapabilityHost({
      binding: { mode: 'durable', store: client.store },
      workspace: 'forged',
    });
    const capability = host.capability(new AbortController().signal);
    expect(capability.status).toBe('on');
    if (capability.status === 'on') {
      const digest = await digestAction({ action });
      const firstResident = resident();
      firstResident.seed(digest);
      const scope = capability.openScope({
        namespace: 'channel.lifecycle',
        producer: action.producer,
        environment: {},
        resident: firstResident,
      });
      scope.announce({ entries: [{ kind: 'action', action, digest, computeDuration: 2, estimatedBytes: 5 }] });
      const receipt = scope.close({ outcome: 'delivered' });
      host.permitPublication();
      const settlement = await receipt.settled;
      expect(settlement.status, settlement.reason).toBe('published');
      const secondResident = resident();
      const reopened = capability.openScope({
        namespace: 'channel.lifecycle',
        producer: action.producer,
        environment: {},
        resident: secondResident,
      });
      await expect(reopened.warm({ digests: [digest] })).resolves.toMatchObject({
        status: 'imported',
        imported: [digest],
      });
      reopened.close({ outcome: 'cancelled' });

      const racingBase = resident();
      racingBase.seed(digest);
      let clearOnExport = true;
      const racingResident = {
        ...racingBase,
        exportEntries: async (input: Parameters<ResidentCacheBinding['exportEntries']>[0]) => {
          const exported = await racingBase.exportEntries(input);
          if (clearOnExport) {
            clearOnExport = false;
            await authority.control({ workspace: 'trusted' }).clear({});
          }
          return exported;
        },
      };
      const racingCapability = host.capability(new AbortController().signal);
      if (racingCapability.status !== 'on') {
        throw new Error('racing durable capability was off');
      }
      const racing = racingCapability.openScope({
        namespace: 'channel.lifecycle',
        producer: action.producer,
        environment: {},
        resident: racingResident,
      });
      racing.announce({ entries: [{ kind: 'action', action, digest, computeDuration: 2, estimatedBytes: 5 }] });
      const racingReceipt = racing.close({ outcome: 'delivered' });
      host.permitPublication();
      await expect(racingReceipt.settled).resolves.toMatchObject({ status: 'abandoned', reason: 'stale-generation' });

      const cleared = await authority.control({ workspace: 'trusted' }).inspect({});
      const freshCapability = host.capability(new AbortController().signal);
      const fresh =
        freshCapability.status === 'on'
          ? freshCapability.openScope({
              namespace: 'channel.lifecycle',
              producer: action.producer,
              environment: {},
              resident: racingResident,
            })
          : undefined;
      if (!fresh) {
        throw new Error('fresh durable capability was off');
      }
      await expect(fresh.warm({ digests: [digest] })).resolves.toMatchObject({ status: 'imported', imported: [] });
      expect(racingBase.contains({ digest })).toBe(false);
      racingBase.seed(digest);
      fresh.announce({ entries: [{ kind: 'action', action, digest, computeDuration: 2, estimatedBytes: 5 }] });
      const freshReceipt = fresh.close({ outcome: 'delivered' });
      host.permitPublication();
      await expect(freshReceipt.settled).resolves.toMatchObject({ status: 'published' });
      expect(fresh.generation).toBe(cleared.generation);

      const warmCapability = host.capability(new AbortController().signal);
      racingBase.clear({ generation: cleared.generation });
      if (warmCapability.status !== 'on') {
        throw new Error('warm durable capability was off');
      }
      const warm = warmCapability.openScope({
        namespace: 'channel.lifecycle',
        producer: action.producer,
        environment: {},
        resident: racingResident,
      });
      await expect(warm.warm({ digests: [digest] })).resolves.toMatchObject({ status: 'imported', imported: [digest] });
      expect(warm.generation).toBeGreaterThan(1);
      warm.close({ outcome: 'cancelled' });
    }
    await host.dispose();
    client.dispose();
    secondBridge.dispose();
    rawClient.dispose();
    bridge.dispose();
  });
  it('mints independent remote sessions and keeps control at the authority', async () => {
    const store = createMemoryComputeEngine();
    const first = new MessageChannel();
    const second = new MessageChannel();
    const control = store.control({ workspace: 'trusted' });
    const authority1 = exposeComputeStoreChannel({
      port: first.port1,
      engine: store.engine,
      workspace: 'trusted',
      control,
    });
    const authority2 = exposeComputeStoreChannel({
      port: second.port1,
      engine: store.engine,
      workspace: 'trusted',
      control,
    });
    const client1 = createComputeStoreChannelClient(first.port2);
    const client2 = createComputeStoreChannelClient(second.port2);

    const session1 = await client1.engine.open({ workspace: 'forged' });
    const session2 = await client2.engine.open({ workspace: 'other-forged' });
    expect(session1.generation).toBe(session2.generation);
    const firstReport = await client1.control.inspect({});
    expect(firstReport.generation).toBe(session1.generation);

    await session1.close();
    const cleared = await client2.control.clear({});
    const secondReport = await client1.control.inspect({});
    expect(cleared.status).toBe('cleared');
    expect(secondReport.generation).toBeGreaterThan(session1.generation);

    client1.dispose();
    client2.dispose();
    authority1.dispose();
    authority2.dispose();
  });
});
