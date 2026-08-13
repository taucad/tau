import { describe, it, expect } from 'vitest';
import { SharedPool } from '@taucad/memory';
import { materialiseGeometry } from '#transport/_internal/geometry-materialiser.js';
import type { GeometryTransport } from '#types/runtime-protocol.types.js';

const inlineGltf = (hash: string, bytes: Uint8Array<ArrayBuffer> = new Uint8Array([1])): GeometryTransport => ({
  format: 'gltf',
  content: { delivery: 'inline', bytes },
  hash,
});

const pooledGltf = (hash: string, key: string): GeometryTransport => ({
  format: 'gltf',
  content: { delivery: 'pooled', key },
  hash,
});

describe('materialiseGeometry', () => {
  it('passes non-gltf payloads through unchanged', async () => {
    const svg: GeometryTransport = {
      format: 'svg',
      content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0L1 1"/></svg>',
      name: 'test',
      hash: 'h-svg',
    };
    await expect(materialiseGeometry(svg, undefined)).resolves.toBe(svg);
  });

  it('inlines `delivery: inline` gltf payloads without touching the pool', async () => {
    const bytes = new Uint8Array([7, 8, 9]);
    const resolved = await materialiseGeometry(inlineGltf('h-inline', bytes), undefined);
    expect(resolved).toEqual({ format: 'gltf', content: bytes, hash: 'h-inline' });
  });

  it('resolves `delivery: pooled` gltf payloads through the supplied pool', async () => {
    const buffer = new SharedArrayBuffer(64 * 1024);
    const pool = new SharedPool(buffer, { maxEntries: 8 });
    const stored = pool.store('pool-key-a', new Uint8Array([10, 20, 30]));
    expect(stored).toBe(true);

    const resolved = await materialiseGeometry(pooledGltf('h-pool', 'pool-key-a'), pool);
    expect(resolved).toMatchObject({ format: 'gltf', hash: 'h-pool' });
    if (resolved.format === 'gltf') {
      expect(resolved.content).toBeInstanceOf(Uint8Array);
      expect([...resolved.content]).toEqual([10, 20, 30]);
    }
  });

  it('throws `SharedPoolEntryNotFoundError` when a pooled key is missing', async () => {
    const buffer = new SharedArrayBuffer(64 * 1024);
    const pool = new SharedPool(buffer, { maxEntries: 8 });
    await expect(materialiseGeometry(pooledGltf('h-missing', 'no-such-key'), pool)).rejects.toThrow(/no-such-key/);
  });
});
