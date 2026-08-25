import { describe, expect, it } from 'vitest';
import type { Geometry } from '@taucad/types';
import { SharedPool } from '@taucad/memory';
import { createWorkerHostBindings } from '#transport/_internal/worker-host-bindings.js';
import { materialiseGeometry } from '#transport/_internal/geometry-materialiser.js';
import { materialiseExportResult } from '#transport/_internal/export-materialiser.js';
import type { GeometryTransport } from '#types/runtime-protocol.types.js';

const transfer = (value: unknown, transferables: readonly Transferable[]): unknown =>
  structuredClone(value, { transfer: [...transferables] });

const bytesEqual = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength &&
  Buffer.from(left.buffer, left.byteOffset, left.byteLength).equals(
    Buffer.from(right.buffer, right.byteOffset, right.byteLength),
  );

describe('createWorkerHostBindings', () => {
  it('publishes transfer-tier geometry through wire-owned buffers', () => {
    const bindings = createWorkerHostBindings({});
    const sourceBytes = new Uint8Array([1, 2, 3, 4]);
    const geometry = { format: 'gltf', content: sourceBytes, hash: 'same-geometry' } satisfies Geometry;

    const first = bindings.geometryDelivery.publish(geometry);
    const firstTransfer = first.transferables[0] as ArrayBuffer;

    expect(first.tier).toBe('transfer');
    expect(firstTransfer).not.toBe(sourceBytes.buffer);
    expect(transfer(first.value, first.transferables)).toMatchObject({
      format: 'gltf',
      content: { delivery: 'inline' },
      hash: 'same-geometry',
    });
    expect(sourceBytes).toEqual(new Uint8Array([1, 2, 3, 4]));

    const second = bindings.geometryDelivery.publish(geometry);
    const secondTransfer = second.transferables[0] as ArrayBuffer;

    expect(secondTransfer).not.toBe(sourceBytes.buffer);
    expect(secondTransfer).not.toBe(firstTransfer);
    expect(transfer(second.value, second.transferables)).toMatchObject({
      format: 'gltf',
      content: { delivery: 'inline' },
      hash: 'same-geometry',
    });
    expect(sourceBytes).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('reclaims pooled geometry after the reader acknowledges materialisation', () => {
    const buffer = new SharedArrayBuffer(256 * 1024);
    const bindings = createWorkerHostBindings({ geometryPoolBuffer: buffer });
    const reader = new SharedPool(buffer);
    const geometry = {
      format: 'gltf',
      content: new Uint8Array([1, 2, 3, 4]),
      hash: 'pooled-geometry',
    } satisfies Geometry;

    const published = bindings.geometryDelivery.publish(geometry);
    expect(published.tier).toBe('pool');
    expect(reader.resolveCopy('pooled-geometry')).toEqual(geometry.content);

    bindings.geometryDelivery.acknowledge('pooled-geometry');
    expect(reader.resolve('pooled-geometry')).toBeUndefined();
  });

  it('keeps 50 MB geometry and export bytes identical across pooled and fallback delivery', async () => {
    const source = new Uint8Array(50 * 1024 * 1024);
    source.fill(0xa5);
    source[source.byteLength - 1] = 0x5a;
    const buffer = new SharedArrayBuffer(source.byteLength + 1024 * 1024);
    const pooledBindings = createWorkerHostBindings({ geometryPoolBuffer: buffer });
    const reader = new SharedPool(buffer);

    const pooledGeometry = pooledBindings.geometryDelivery.publish({
      format: 'gltf',
      content: source,
      hash: 'large-geometry',
    });
    expect(pooledGeometry.tier).toBe('pool');
    const geometry = await materialiseGeometry(
      pooledGeometry.value as GeometryTransport,
      reader,
      pooledBindings.geometryDelivery.acknowledge,
    );
    expect(geometry.format === 'gltf' && bytesEqual(geometry.content, source)).toBe(true);

    const pooledExport = pooledBindings.geometryDelivery.publishBytes('large-export', source);
    expect(pooledExport.tier).toBe('pool');
    const exportResult = materialiseExportResult(
      {
        success: true,
        data: [{ name: 'model.step', mimeType: 'application/step', bytes: pooledExport.value }],
        issues: [],
      },
      reader,
      pooledBindings.geometryDelivery.acknowledge,
    );
    expect(exportResult.success && bytesEqual(exportResult.data[0]!.bytes, source)).toBe(true);

    const fallbackBindings = createWorkerHostBindings({});
    const fallbackGeometry = fallbackBindings.geometryDelivery.publish({
      format: 'gltf',
      content: source,
      hash: 'large-fallback-geometry',
    });
    expect(fallbackGeometry.tier).toBe('transfer');
    const receivedGeometry = transfer(fallbackGeometry.value, fallbackGeometry.transferables) as GeometryTransport;
    const materialisedFallbackGeometry = await materialiseGeometry(receivedGeometry, undefined);
    expect(
      materialisedFallbackGeometry.format === 'gltf' && bytesEqual(materialisedFallbackGeometry.content, source),
    ).toBe(true);

    const fallbackExport = fallbackBindings.geometryDelivery.publishBytes('large-fallback-export', source);
    expect(fallbackExport.tier).toBe('transfer');
    const receivedExportBytes = transfer(
      fallbackExport.value,
      fallbackExport.transferables,
    ) as typeof fallbackExport.value;
    const materialisedFallbackExport = materialiseExportResult(
      {
        success: true,
        data: [{ name: 'model.step', mimeType: 'application/step', bytes: receivedExportBytes }],
        issues: [],
      },
      undefined,
    );
    expect(materialisedFallbackExport.success && bytesEqual(materialisedFallbackExport.data[0]!.bytes, source)).toBe(
      true,
    );
  });

  it('falls back without overwriting an unacknowledged publication', async () => {
    const buffer = new SharedArrayBuffer(256 * 1024);
    const bindings = createWorkerHostBindings({ geometryPoolBuffer: buffer });
    const reader = new SharedPool(buffer);
    const firstBytes = new Uint8Array(80 * 1024).fill(1);
    const secondBytes = new Uint8Array(80 * 1024).fill(2);
    const first = bindings.geometryDelivery.publish({ format: 'gltf', content: firstBytes, hash: 'first' });
    const second = bindings.geometryDelivery.publish({ format: 'gltf', content: secondBytes, hash: 'second' });

    expect(first.tier).toBe('pool');
    expect(second.tier).toBe('transfer');
    const receivedSecond = transfer(second.value, second.transferables) as GeometryTransport;
    const materialisedSecond = await materialiseGeometry(receivedSecond, undefined);
    const materialisedFirst = await materialiseGeometry(
      first.value as GeometryTransport,
      reader,
      bindings.geometryDelivery.acknowledge,
    );
    expect(materialisedSecond.format === 'gltf' && bytesEqual(materialisedSecond.content, secondBytes)).toBe(true);
    expect(materialisedFirst.format === 'gltf' && bytesEqual(materialisedFirst.content, firstBytes)).toBe(true);
  });
});
