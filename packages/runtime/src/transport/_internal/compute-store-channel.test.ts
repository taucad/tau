import { MessageChannel } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { contentDigest, digestAction, digestContent } from '@taucad/cache-core';
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

  it('reopens one logical session on a new channel without carrying its old physical id', async () => {
    const firstStore = createMemoryComputeEngine();
    const secondStore = createMemoryComputeEngine();
    const first = new MessageChannel();
    const second = new MessageChannel();
    let firstOpens = 0;
    let secondOpens = 0;
    const firstServer = exposeComputeStoreChannel({
      port: first.port1,
      engine: {
        open: async (input) => {
          firstOpens += 1;
          return firstStore.engine.open(input);
        },
      },
      workspace: 'trusted',
      control: firstStore.control({ workspace: 'trusted' }),
    });
    const secondControl = secondStore.control({ workspace: 'trusted' });
    const secondServer = exposeComputeStoreChannel({
      port: second.port1,
      engine: {
        open: async (input) => {
          secondOpens += 1;
          return secondStore.engine.open(input);
        },
      },
      workspace: 'trusted',
      control: secondControl,
    });
    const client = createComputeStoreChannelClient(first.port2);
    try {
      const ignored = await client.engine.open({ workspace: 'forged' });
      const session = await client.engine.open({ workspace: 'also-forged' });
      const registeredStore = client.store;
      const initialGeneration = session.generation;
      expect(firstOpens).toBe(2);
      const cleared = await secondControl.clear({});
      expect(cleared.generation).toBeGreaterThan(initialGeneration);

      client.rebind(second.port2);
      expect(client.store).toBe(registeredStore);
      const inspected = await client.control.inspect({});
      const nextGeneration = inspected.generation;
      await expect(
        session.get({ digests: [], maxEntries: 1, maxBytes: 128, generation: nextGeneration }),
      ).resolves.toMatchObject({ status: 'ok', entries: [], omitted: [] });
      expect(session.generation).toBe(initialGeneration);
      expect(firstOpens).toBe(2);
      expect(secondOpens).toBe(1);

      await ignored.close();
      await session.close();
      await expect(
        session.get({ digests: [], maxEntries: 1, maxBytes: 128, generation: nextGeneration }),
      ).rejects.toMatchObject({ code: 'CHANNEL_CLOSED' });
      expect(secondOpens).toBe(1);
    } finally {
      client.dispose();
      firstServer.dispose();
      secondServer.dispose();
    }
  });

  it('reads new authority bytes and clears shared residency after a generation change', async () => {
    const firstStore = createMemoryComputeEngine();
    const secondStore = createMemoryComputeEngine();
    const digest = await digestAction({ action });
    const seed = async (engine: ReturnType<typeof createMemoryComputeEngine>, value: string): Promise<void> => {
      const session = await engine.engine.open({ workspace: 'trusted' });
      const bytes = new TextEncoder().encode(value);
      await expect(
        session.put({
          entries: [
            {
              action,
              actionDigest: digest,
              contentDigest: await digestContent({ bytes }),
              mediaType: 'application/octet-stream',
              bytes,
              determinism: 'byte-exact',
            },
          ],
          generation: session.generation,
          durability: 'disposable',
        }),
      ).resolves.toMatchObject({ status: 'committed', published: [digest] });
      await session.close();
    };
    await seed(firstStore, 'old-bytes');
    const secondControl = secondStore.control({ workspace: 'trusted' });
    const cleared = await secondControl.clear({});
    expect(cleared.generation).toBeGreaterThan(1);
    await seed(secondStore, 'new-bytes');

    const first = new MessageChannel();
    const second = new MessageChannel();
    const firstServer = exposeComputeStoreChannel({
      port: first.port1,
      engine: firstStore.engine,
      workspace: 'trusted',
      control: firstStore.control({ workspace: 'trusted' }),
    });
    const secondServer = exposeComputeStoreChannel({
      port: second.port1,
      engine: secondStore.engine,
      workspace: 'trusted',
      control: secondControl,
    });
    const client = createComputeStoreChannelClient(first.port2);
    const host = createComputeCapabilityHost({
      binding: { mode: 'durable', store: client.store },
      workspace: 'forged',
    });
    const capability = host.capability(new AbortController().signal);
    if (capability.status !== 'on') {
      throw new Error('durable compute capability was off');
    }
    const baseResident = resident();
    const imported: string[] = [];
    let clears = 0;
    const sharedResident: ResidentCacheBinding = {
      ...baseResident,
      importEntries: async (input) => {
        imported.push(...input.entries.map((entry) => new TextDecoder().decode(entry.bytes)));
        return baseResident.importEntries(input);
      },
      clear: (input) => {
        clears += 1;
        baseResident.clear(input);
      },
    };
    const evaluation = {
      action,
      codec: {
        id: action.codec.id,
        version: action.codec.version,
        mediaType: 'application/octet-stream',
        encode: ({ value }: { readonly value: string }) => new TextEncoder().encode(value),
        decode: ({ bytes }: { readonly bytes: Uint8Array<ArrayBuffer> }) => new TextDecoder().decode(bytes),
      },
      compute: async () => {
        throw new Error('seeded action must not recompute');
      },
      policy: 'best-effort',
    } as const;
    const warm = async () => {
      const scope = capability.openScope({
        namespace: 'channel.lifecycle',
        producer: action.producer,
        environment: {},
        resident: sharedResident,
      });
      const result = await scope.warm({ digests: [digest] });
      scope.close({ outcome: 'cancelled' });
      return result;
    };
    try {
      await expect(capability.evaluate(evaluation)).resolves.toMatchObject({ source: 'cache', value: 'old-bytes' });
      await expect(warm()).resolves.toMatchObject({ status: 'imported', imported: [digest] });
      expect(imported).toEqual(['old-bytes']);
      expect(clears).toBe(0);

      client.rebind(second.port2);
      await expect(capability.evaluate(evaluation)).resolves.toMatchObject({ source: 'cache', value: 'new-bytes' });
      await expect(warm()).resolves.toMatchObject({ status: 'imported', imported: [digest] });
      expect(imported).toEqual(['old-bytes', 'new-bytes']);
      expect(clears).toBe(1);
      expect(baseResident.contains({ digest })).toBe(true);
    } finally {
      await host.dispose();
      client.dispose();
      firstServer.dispose();
      secondServer.dispose();
    }
  });

  it('settles an old in-flight get without replaying it on the replacement channel', async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const firstStore = createMemoryComputeEngine();
    const secondStore = createMemoryComputeEngine();
    const first = new MessageChannel();
    const second = new MessageChannel();
    const firstServer = exposeComputeStoreChannel({
      port: first.port1,
      engine: {
        open: async (input) => {
          const session = await firstStore.engine.open(input);
          return {
            ...session,
            get: async (request) => {
              entered.resolve();
              await release.promise;
              return session.get(request);
            },
          };
        },
      },
      workspace: 'trusted',
      control: firstStore.control({ workspace: 'trusted' }),
    });
    let secondGets = 0;
    const secondServer = exposeComputeStoreChannel({
      port: second.port1,
      engine: {
        open: async (input) => {
          const session = await secondStore.engine.open(input);
          return {
            ...session,
            get: async (request) => {
              secondGets += 1;
              return session.get(request);
            },
          };
        },
      },
      workspace: 'trusted',
      control: secondStore.control({ workspace: 'trusted' }),
    });
    const client = createComputeStoreChannelClient(first.port2);
    try {
      const session = await client.engine.open({ workspace: 'forged' });
      const request = { digests: [], maxEntries: 1, maxBytes: 128, generation: session.generation };
      const oldCall = session.get(request);
      await entered.promise;
      client.rebind(second.port2);
      await expect(oldCall).rejects.toMatchObject({ code: 'CHANNEL_CLOSED' });
      expect(secondGets).toBe(0);
      release.resolve();
      const inspected = await client.control.inspect({});
      const nextGeneration = inspected.generation;
      await expect(session.get({ ...request, generation: nextGeneration })).resolves.toMatchObject({ status: 'ok' });
      expect(secondGets).toBe(1);
    } finally {
      release.resolve();
      client.dispose();
      firstServer.dispose();
      secondServer.dispose();
    }
  });

  it('closes a physical session whose open completes after its channel closed', async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const first = new MessageChannel();
    const authority = createMemoryComputeEngine();
    let closes = 0;
    let openSignal: AbortSignal | undefined;
    const server = exposeComputeStoreChannel({
      port: first.port1,
      engine: {
        open: async (input) => {
          openSignal = input.signal;
          entered.resolve();
          await release.promise;
          const session = await authority.engine.open({ workspace: input.workspace });
          return {
            ...session,
            close: async () => {
              closes += 1;
              await session.close();
            },
          };
        },
      },
      workspace: 'trusted',
      control: authority.control({ workspace: 'trusted' }),
    });
    const peerClosed = Promise.withResolvers<void>();
    server.onClose(() => {
      peerClosed.resolve();
    });
    const client = createComputeStoreChannelClient(first.port2);
    try {
      const opening = client.engine.open({ workspace: 'forged' });
      await entered.promise;
      client.dispose();
      await expect(opening).rejects.toMatchObject({ code: 'CHANNEL_CLOSED' });
      await peerClosed.promise;
      expect(openSignal?.aborted).toBe(true);
      release.resolve();
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      expect(closes).toBe(1);
    } finally {
      release.resolve();
      client.dispose();
      server.dispose();
    }
  });

  it('recovers a later host use after an initial physical open is closed during rebind', async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const firstStore = createMemoryComputeEngine();
    const secondStore = createMemoryComputeEngine();
    const first = new MessageChannel();
    const second = new MessageChannel();
    let firstOpens = 0;
    let secondOpens = 0;
    const firstServer = exposeComputeStoreChannel({
      port: first.port1,
      engine: {
        open: async (input) => {
          firstOpens += 1;
          if (firstOpens === 2) {
            entered.resolve();
          }
          await release.promise;
          return firstStore.engine.open(input);
        },
      },
      workspace: 'trusted',
      control: firstStore.control({ workspace: 'trusted' }),
    });
    const secondServer = exposeComputeStoreChannel({
      port: second.port1,
      engine: {
        open: async (input) => {
          secondOpens += 1;
          return secondStore.engine.open(input);
        },
      },
      workspace: 'trusted',
      control: secondStore.control({ workspace: 'trusted' }),
    });
    const client = createComputeStoreChannelClient(first.port2);
    const oldOpen = client.engine.open({ workspace: 'forged' });
    const host = createComputeCapabilityHost({
      binding: { mode: 'durable', store: client.store },
      workspace: 'forged',
    });
    const capability = host.capability(new AbortController().signal);
    expect(capability.status).toBe('on');
    if (capability.status !== 'on') {
      throw new Error('durable compute capability was off');
    }
    const evaluation = {
      action,
      codec: {
        id: action.codec.id,
        version: action.codec.version,
        mediaType: 'application/octet-stream',
        encode: ({ value }: { readonly value: string }) => new TextEncoder().encode(value),
        decode: ({ bytes }: { readonly bytes: Uint8Array<ArrayBuffer> }) => new TextDecoder().decode(bytes),
      },
      compute: async () => 'shape',
      policy: 'best-effort',
    } as const;
    const oldEvaluation = capability.evaluate(evaluation);
    try {
      await entered.promise;
      client.rebind(second.port2);
      await expect(oldOpen).rejects.toMatchObject({ code: 'CHANNEL_CLOSED' });
      await expect(oldEvaluation).rejects.toMatchObject({ code: 'CHANNEL_CLOSED' });
      release.resolve();
      await expect(capability.evaluate(evaluation)).resolves.toMatchObject({ source: 'computed', value: 'shape' });
      expect(secondOpens).toBe(1);
    } finally {
      release.resolve();
      await host.dispose().catch(() => undefined);
      client.dispose();
      firstServer.dispose();
      secondServer.dispose();
    }
  });

  it('observes an eager scope generation failure until warm consumes it', async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const first = new MessageChannel();
    const authority = createMemoryComputeEngine();
    const server = exposeComputeStoreChannel({
      port: first.port1,
      engine: {
        open: async (input) => {
          entered.resolve();
          await release.promise;
          return authority.engine.open(input);
        },
      },
      workspace: 'trusted',
      control: authority.control({ workspace: 'trusted' }),
    });
    const client = createComputeStoreChannelClient(first.port2);
    const host = createComputeCapabilityHost({
      binding: { mode: 'durable', store: client.store },
      workspace: 'trusted',
    });
    const capability = host.capability(new AbortController().signal);
    if (capability.status !== 'on') {
      throw new Error('durable compute capability was off');
    }
    const scope = capability.openScope({
      namespace: 'channel.lifecycle',
      producer: action.producer,
      environment: {},
      resident: resident(),
    });
    try {
      await entered.promise;
      client.dispose();
      release.resolve();
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      await expect(scope.warm({ digests: [] })).resolves.toMatchObject({
        status: 'unavailable',
        reason: 'Channel closed',
      });
      scope.close({ outcome: 'cancelled' });
    } finally {
      release.resolve();
      await host.dispose().catch(() => undefined);
      client.dispose();
      server.dispose();
    }
  });

  it('never reconnects a finally disposed connection or a closed logical session', async () => {
    const first = new MessageChannel();
    const replacement = new MessageChannel();
    const authority = createMemoryComputeEngine();
    const firstServer = exposeComputeStoreChannel({
      port: first.port1,
      engine: authority.engine,
      workspace: 'trusted',
      control: authority.control({ workspace: 'trusted' }),
    });
    const replacementServer = exposeComputeStoreChannel({
      port: replacement.port1,
      engine: authority.engine,
      workspace: 'trusted',
      control: authority.control({ workspace: 'trusted' }),
    });
    const connection = connectComputeStoreChannel(first.port2);
    const registeredStore = connection.store;
    connection.dispose();
    expect(() => {
      connection.rebind(replacement.port2);
    }).toThrow(/Channel closed/u);
    expect(connection.store).toBe(registeredStore);
    connection.dispose();
    firstServer.dispose();
    replacementServer.dispose();
  });
});
