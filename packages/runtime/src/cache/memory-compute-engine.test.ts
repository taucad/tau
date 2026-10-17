/* oxlint-disable no-await-in-loop -- each put is observed after the one before it; the order is the LRU under test. */

import { digestAction, digestContent } from '@taucad/cache-core';
import type { ComputeAction, ContentDigest } from '@taucad/cache-core';
import { describe, expect, it } from 'vitest';
import { createMemoryComputeEngine } from '#cache/memory-compute-engine.js';
import type { ComputeStoreEntry, ComputeStoreSession } from '#types/runtime-compute.types.js';

const makeEntry = async (input: {
  readonly operation: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly requiredContent?: readonly ContentDigest[];
}): Promise<ComputeStoreEntry> => {
  const action: ComputeAction = {
    schemaVersion: 1,
    namespace: 'memory-bound',
    producer: { id: 'memory-bound-test', version: '1.0.0', implementationAssets: [] },
    operation: input.operation,
    inputs: [],
    arguments: { operation: input.operation },
    environment: {},
    codec: { id: 'raw', version: '1' },
  };
  return {
    action,
    actionDigest: await digestAction({ action }),
    contentDigest: await digestContent({ bytes: input.bytes }),
    mediaType: 'application/octet-stream',
    bytes: input.bytes,
    determinism: 'byte-exact',
    ...(input.requiredContent === undefined ? {} : { requiredContent: input.requiredContent }),
  };
};

const filled = (byteLength: number, value: number): Uint8Array<ArrayBuffer> => new Uint8Array(byteLength).fill(value);

const put = async (session: ComputeStoreSession, entries: readonly ComputeStoreEntry[]) =>
  session.put({ entries, generation: session.generation, durability: 'disposable' });

const resident = async (session: ComputeStoreSession, entry: ComputeStoreEntry): Promise<boolean> => {
  const result = await session.get({
    digests: [entry.actionDigest],
    maxEntries: 1,
    maxBytes: Number.MAX_SAFE_INTEGER,
    generation: session.generation,
  });
  return result.status === 'ok' && result.entries.length === 1;
};

describe('memory compute engine byte bound', () => {
  it('should evict the least recently used entries once the workspace exceeds its byte bound', async () => {
    const { engine, control } = createMemoryComputeEngine({ maxBytes: 16 });
    const session = await engine.open({ workspace: 'bounded' });
    const [first, second, third] = await Promise.all(
      [1, 2, 3].map(async (value) => makeEntry({ operation: `op-${value}`, bytes: filled(8, value) })),
    );
    await put(session, [first!]);
    await put(session, [second!]);
    // Reading the first makes the second the least recently used.
    expect(await resident(session, first!)).toBe(true);
    await put(session, [third!]);

    const report = await control({ workspace: 'bounded' }).inspect({});
    expect(report).toMatchObject({ entries: 2, logicalBytes: 16 });
    expect(await resident(session, first!)).toBe(true);
    expect(await resident(session, second!)).toBe(false);
    expect(await resident(session, third!)).toBe(true);
  });

  it('should evict an entry whose required content was evicted', async () => {
    const { engine, control } = createMemoryComputeEngine({ maxBytes: 16 });
    const session = await engine.open({ workspace: 'closure' });
    const leaf = await makeEntry({ operation: 'leaf', bytes: filled(8, 1) });
    const root = await makeEntry({ operation: 'root', bytes: filled(4, 2), requiredContent: [leaf.contentDigest] });
    await put(session, [leaf, root]);
    // Touch the root so the leaf is the least recently used entry.
    expect(await resident(session, root)).toBe(true);
    await put(session, [await makeEntry({ operation: 'other', bytes: filled(8, 3) })]);

    expect(await resident(session, leaf)).toBe(false);
    expect(await resident(session, root)).toBe(false);
    expect(await control({ workspace: 'closure' }).inspect({})).toMatchObject({ entries: 1, logicalBytes: 8 });
  });

  it('should refuse to publish an entry larger than the whole bound', async () => {
    const { engine, control } = createMemoryComputeEngine({ maxBytes: 16 });
    const session = await engine.open({ workspace: 'oversized' });
    const kept = await makeEntry({ operation: 'kept', bytes: filled(8, 1) });
    const oversized = await makeEntry({ operation: 'oversized', bytes: filled(32, 2) });
    await put(session, [kept]);

    const result = await put(session, [oversized]);

    expect(result).toEqual({ status: 'committed', published: [], conflicts: [] });
    expect(await resident(session, kept)).toBe(true);
    expect(await control({ workspace: 'oversized' }).inspect({})).toMatchObject({ entries: 1, logicalBytes: 8 });
  });

  it('should bound a default engine at 64 MiB', async () => {
    const defaultMemoryComputeBytes = 64 * 1024 * 1024;
    const { engine, control } = createMemoryComputeEngine();
    const session = await engine.open({ workspace: 'default' });
    const half = defaultMemoryComputeBytes / 2;
    for (const value of [1, 2, 3]) {
      await put(session, [await makeEntry({ operation: `op-${value}`, bytes: filled(half, value) })]);
    }

    const report = await control({ workspace: 'default' }).inspect({});
    expect(report.logicalBytes).toBeLessThanOrEqual(defaultMemoryComputeBytes);
    expect(report.entries).toBe(2);
  });
});
