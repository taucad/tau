/**
 * T5 read-cache sizing: the tier `evaluate` keeps in front of the store session is sized by
 * binding and device (geometry cache result-path blueprint, Finding 7 and WP4).
 */
import { describe, expect, it, vi } from 'vitest';
import type { ActionDigest, CacheCodec, ComputeAction } from '@taucad/cache-core';
import { createMemoryComputeEngine } from '#cache/memory-compute-engine.js';
import { createComputeCapabilityHost, _registerComputeStore } from '#cache/kernel-compute-runtime.js';
import type {
  ComputeBinding,
  ComputeStore,
  ComputeStoreEngine,
  KernelComputeCapability,
} from '#types/runtime-compute.types.js';

const mebibyte = 1024 * 1024;
const { signal } = new AbortController();

const action = (value: number): ComputeAction => ({
  schemaVersion: 1,
  namespace: 'test.read-cache',
  producer: { id: 'test-kernel', version: '1', implementationAssets: [] },
  operation: 'make-mesh',
  inputs: [],
  arguments: { value },
  environment: {},
  codec: { id: 'test.bytes', version: '1' },
});

/** A result of `size` bytes whose every byte is `value`, so distinct values have distinct digests. */
const bytesCodec: CacheCodec<{ readonly value: number; readonly size: number }> = {
  id: 'test.bytes',
  version: '1',
  mediaType: 'application/octet-stream',
  encode: ({ value }) => new Uint8Array(value.size).fill(value.value),
  decode: ({ bytes }) => ({ value: bytes[0]!, size: bytes.byteLength }),
};

const onCapability = (capability: KernelComputeCapability): Extract<KernelComputeCapability, { status: 'on' }> => {
  if (capability.status !== 'on') {
    throw new Error('Expected an on capability.');
  }
  return capability;
};

/** Count every lookup that reaches the store session, and the bytes it hands back. */
const countingEngine = (
  engine: ComputeStoreEngine,
): { readonly engine: ComputeStoreEngine; readonly gets: { count: number; bytes: number } } => {
  const gets = { count: 0, bytes: 0 };
  return {
    gets,
    engine: {
      open: async (input) => {
        const session = await engine.open(input);
        return {
          ...session,
          get generation() {
            return session.generation;
          },
          get: async (request) => {
            const result = await session.get(request);
            gets.count += 1;
            if (result.status === 'ok') {
              gets.bytes += result.entries.reduce((total, entry) => total + entry.bytes.byteLength, 0);
            }
            return result;
          },
        };
      },
    },
  };
};

const createHost = (binding: ComputeBinding) => {
  const settled: ActionDigest[] = [];
  const host = createComputeCapabilityHost({
    binding,
    workspace: 'w',
    onPublicationSettled: ({ actionDigest, status }) => {
      if (status === 'stored') {
        settled.push(actionDigest);
      }
    },
  });
  /** Evaluate one best-effort result, deliver it and wait for its publication to store. */
  const evaluate = async (value: number, size: number) => {
    const before = settled.length;
    const result = await onCapability(host.capability(signal)).evaluate({
      action: action(value),
      codec: bytesCodec,
      policy: 'best-effort',
      compute: async () => ({ value, size }),
    });
    if (result.source === 'computed') {
      host.permitPublication();
      await vi.waitFor(() => {
        expect(settled.length).toBe(before + 1);
      });
    }
    return result;
  };
  return { host, evaluate };
};

const durableBinding = (memoryConstrained: boolean) => {
  const backing = createMemoryComputeEngine({ maxBytes: 256 * mebibyte });
  const counted = countingEngine(backing.engine);
  const store = _registerComputeStore({
    spec: Object.freeze({}) as ComputeStore,
    engine: counted.engine,
    workspace: 'w',
    control: backing.control({ workspace: 'w' }),
  });
  return { binding: { mode: 'durable', store, memoryConstrained } as const, gets: counted.gets };
};

describe('compute read-cache sizing', () => {
  it('should construct no read-cache tier for a memory binding, and still serve its hits', async () => {
    const { host, evaluate } = createHost({ mode: 'memory' });
    for (let value = 1; value <= 4; value += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each edit publishes before the next.
      await evaluate(value, 4 * mebibyte);
    }
    for (let value = 1; value <= 4; value += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each revisit reads the published result.
      await expect(evaluate(value, 4 * mebibyte)).resolves.toMatchObject({
        source: 'cache',
        value: { value, size: 4 * mebibyte },
      });
    }
    const report = await host.control!.inspect({});
    expect(report.logicalBytes).toBe(16 * mebibyte);
    expect(await host.readCacheBytes(), 'the engine is the only holder').toBe(0);
  });

  it.each([
    { memoryConstrained: true, bound: 16 },
    { memoryConstrained: false, bound: 64 },
  ])(
    'should bound the Durable read cache at $bound MiB when memoryConstrained is $memoryConstrained',
    async ({ memoryConstrained, bound }) => {
      const { binding, gets } = durableBinding(memoryConstrained);
      const { host, evaluate } = createHost(binding);
      // Five 4 MiB results (20 MiB) overflow a 16 MiB tier and fit a 64 MiB one.
      for (let value = 1; value <= 5; value += 1) {
        // oxlint-disable-next-line no-await-in-loop -- each edit publishes before the next.
        await evaluate(value, 4 * mebibyte);
      }
      // The content tier holds the bound; the action records beside it are a few hundred bytes each.
      expect(await host.readCacheBytes()).toBeLessThanOrEqual(bound * mebibyte + 64 * 1024);
      expect(await host.readCacheBytes()).toBeGreaterThan(memoryConstrained ? 12 * mebibyte : 20 * mebibyte);
      const before = gets.count;
      await expect(evaluate(1, 4 * mebibyte)).resolves.toMatchObject({ source: 'cache', value: { value: 1 } });
      if (memoryConstrained) {
        expect(gets.count, 'the oldest result was evicted from the 16 MiB tier').toBeGreaterThan(before);
      } else {
        expect(gets.count, 'the 64 MiB tier still holds the oldest result').toBe(before);
      }
    },
  );

  it.each([
    { memoryConstrained: true, retained: 32 },
    { memoryConstrained: false, retained: 40 },
  ])(
    'should retain $retained MiB in the memory engine when memoryConstrained is $memoryConstrained',
    async ({ memoryConstrained, retained }) => {
      const { host, evaluate } = createHost({ mode: 'memory', memoryConstrained });
      for (let value = 1; value <= 10; value += 1) {
        // oxlint-disable-next-line no-await-in-loop -- each edit publishes before the next.
        await evaluate(value, 4 * mebibyte);
      }
      const report = await host.control!.inspect({});
      expect(report.logicalBytes).toBe(retained * mebibyte);
    },
  );
});
