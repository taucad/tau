import { MessageChannel } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import { describe, expect, it, vi } from 'vitest';
import { contentDigest, digestAction } from '@taucad/cache-core';
import type { ActionDigest, ComputeAction } from '@taucad/cache-core';
import { createMemoryComputeEngine } from '#cache/memory-compute-engine.js';
import { createComputeCapabilityHost } from '#cache/kernel-compute-runtime.js';
import {
  createComputeStoreChannelClient,
  exposeComputeStoreChannel,
  fromComputeStoreChannel,
} from '#transport/_internal/compute-store-channel.js';
import { buildComputeStoreBridge } from '#transport/_internal/compute-store-bridge.js';
import type { ComputeStore, ResidentCacheBinding, ResidentExportEntry } from '#types/runtime-compute.types.js';

const implementationDigest = contentDigest({ value: `sha256:${'2'.repeat(64)}` });
const action: ComputeAction = {
  schemaVersion: 1,
  namespace: 'bridge.direct',
  producer: { id: 'bridge', version: '1', implementationAssets: [implementationDigest] },
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

/**
 * A remote authority shaped like the UI file-manager worker: it serves sessions and answers
 * `generation` itself, and holds no host control on the session channel.
 */
const remoteAuthority = () => {
  const store = createMemoryComputeEngine();
  const control = store.control({ workspace: 'trusted' });
  const served: Array<{ readonly port: MessagePort; readonly closed: PromiseWithResolvers<void>; calls: number }> = [];
  const openPort = vi.fn((): MessagePort => {
    const channel = new MessageChannel();
    const entry = { port: channel.port2, closed: Promise.withResolvers<void>(), calls: 0 };
    const server = exposeComputeStoreChannel({
      port: channel.port1,
      engine: {
        open: async (input) => {
          entry.calls += 1;
          return store.engine.open(input);
        },
      },
      workspace: 'trusted',
      generation: async () => {
        entry.calls += 1;
        const report = await control.inspect({});
        return report.generation;
      },
    });
    server.onClose(() => {
      entry.closed.resolve();
    });
    served.push(entry);
    return channel.port2;
  });
  return { store: fromComputeStoreChannel(openPort), openPort, served, control };
};

const publishOne = async (store: ComputeStore, digest: ActionDigest) => {
  const bridge = buildComputeStoreBridge({ mode: 'durable', store });
  const port = bridge.memoryHandle.computeStorePort;
  if (!port) {
    throw new Error('durable bridge did not hand over a port');
  }
  const client = createComputeStoreChannelClient(port);
  const host = createComputeCapabilityHost({ binding: { mode: 'durable', store: client.store }, workspace: 'forged' });
  const capability = host.capability(new AbortController().signal);
  if (capability.status !== 'on') {
    throw new Error('durable capability was off');
  }
  const producer = resident();
  producer.seed(digest);
  const scope = capability.openScope({
    namespace: action.namespace,
    producer: action.producer,
    environment: {},
    resident: producer,
  });
  scope.announce({ entries: [{ kind: 'action', action, digest, computeDuration: 2, estimatedBytes: 5 }] });
  const receipt = scope.close({ outcome: 'delivered' });
  host.permitPublication();
  const settlement = await receipt.settled;
  await host.dispose();
  client.dispose();
  bridge.dispose();
  return settlement;
};

describe('compute store bridge for a port-backed store', () => {
  it('hands the authority port itself to the runtime and serves nothing from the composing realm', async () => {
    const authority = remoteAuthority();
    const bridge = buildComputeStoreBridge({ mode: 'durable', store: authority.store });
    expect(authority.openPort).toHaveBeenCalledTimes(1);
    const minted = authority.served[0]!.port;
    expect(bridge.memoryHandle).toEqual({ computeBindingMode: 'durable', computeStorePort: minted });
    expect(bridge.transfer).toEqual([minted]);
    expect(minted.listenerCount('message')).toBe(0);
    bridge.dispose();
  });

  it('carries constrained-memory sizing with the authority port', () => {
    const authority = remoteAuthority();
    const bridge = buildComputeStoreBridge({ mode: 'durable', store: authority.store, memoryConstrained: true });
    expect(bridge.memoryHandle).toEqual({
      computeBindingMode: 'durable',
      computeStorePort: authority.served[0]!.port,
      computeMemoryConstrained: true,
    });
    bridge.dispose();
  });

  it('mints one fresh authority port per binding and still refuses a foreign store', () => {
    const authority = remoteAuthority();
    const first = buildComputeStoreBridge({ mode: 'durable', store: authority.store });
    const second = buildComputeStoreBridge({ mode: 'durable', store: authority.store });
    expect(authority.openPort).toHaveBeenCalledTimes(2);
    expect(second.memoryHandle.computeStorePort).not.toBe(first.memoryHandle.computeStorePort);
    first.dispose();
    second.dispose();
    expect(() => buildComputeStoreBridge({ mode: 'durable', store: Object.freeze({}) as ComputeStore })).toThrow(
      /unregistered or foreign/u,
    );
  });

  it('closes the authority port when the binding is disposed', async () => {
    const authority = remoteAuthority();
    const bridge = buildComputeStoreBridge({ mode: 'durable', store: authority.store });
    bridge.dispose();
    bridge.dispose();
    await expect(authority.served[0]!.closed.promise).resolves.toBeUndefined();
  });

  it('publishes through the authority, hits after a fresh binding, and invalidates on a generation change', async () => {
    const authority = remoteAuthority();
    const digest = await digestAction({ action });
    await expect(publishOne(authority.store, digest)).resolves.toMatchObject({
      status: 'published',
      published: [digest],
    });
    /* Every session and generation call reached the authority over the port the runtime was given. */
    expect(authority.served[0]!.calls).toBeGreaterThan(1);

    const reopen = async () => {
      const bridge = buildComputeStoreBridge({ mode: 'durable', store: authority.store });
      const client = createComputeStoreChannelClient(bridge.memoryHandle.computeStorePort!);
      const host = createComputeCapabilityHost({
        binding: { mode: 'durable', store: client.store },
        workspace: 'forged',
      });
      const capability = host.capability(new AbortController().signal);
      if (capability.status !== 'on') {
        throw new Error('durable capability was off');
      }
      const consumer = resident();
      const scope = capability.openScope({
        namespace: action.namespace,
        producer: action.producer,
        environment: {},
        resident: consumer,
      });
      const warmed = await scope.warm({ digests: [digest] });
      scope.close({ outcome: 'cancelled' });
      await host.dispose();
      client.dispose();
      bridge.dispose();
      return warmed;
    };
    await expect(reopen()).resolves.toMatchObject({ status: 'imported', imported: [digest] });

    await authority.control.clear({});
    await expect(reopen()).resolves.toMatchObject({ status: 'imported', imported: [] });
  });

  it('is not resolvable as an engine in the composing realm', async () => {
    const authority = remoteAuthority();
    const diagnostics: string[] = [];
    const host = createComputeCapabilityHost({
      binding: { mode: 'durable', store: authority.store },
      workspace: 'trusted',
      onDiagnostic: (message) => diagnostics.push(message),
    });
    expect(diagnostics).toEqual([expect.stringMatching(/degraded to memory/u)]);
    expect(authority.openPort).not.toHaveBeenCalled();
    await host.dispose();
  });
});
