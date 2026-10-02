import { describe, expect, it } from 'vitest';
import { SharedPool } from '@taucad/memory';
import { createWorkerHostBindings } from '#transport/_internal/worker-host-bindings.js';
import { materialiseBinaryContent } from '#transport/_internal/export-materialiser.js';
import type { BinaryContentDelivery } from '#types/runtime-wire.types.js';

const transfer = (value: unknown, transferables: readonly Transferable[]): BinaryContentDelivery =>
  structuredClone(value, { transfer: [...transferables] }) as BinaryContentDelivery;

const bytesEqual = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength &&
  Buffer.from(left.buffer, left.byteOffset, left.byteLength).equals(
    Buffer.from(right.buffer, right.byteOffset, right.byteLength),
  );

describe('createWorkerHostBindings', () => {
  it('publishes transfer-tier bytes through fresh wire-owned buffers', () => {
    const bindings = createWorkerHostBindings({});
    const sourceBytes = new Uint8Array([1, 2, 3, 4]);
    const first = bindings.binaryDelivery.publishBytes('first', sourceBytes);
    const firstTransfer = first.transferables[0] as ArrayBuffer;

    expect(first.tier).toBe('transfer');
    expect(firstTransfer).not.toBe(sourceBytes.buffer);
    expect(materialiseBinaryContent(transfer(first.value, first.transferables), undefined)).toEqual(sourceBytes);
    expect(sourceBytes).toEqual(new Uint8Array([1, 2, 3, 4]));

    const second = bindings.binaryDelivery.publishBytes('second', sourceBytes);
    const secondTransfer = second.transferables[0] as ArrayBuffer;
    expect(secondTransfer).not.toBe(sourceBytes.buffer);
    expect(secondTransfer).not.toBe(firstTransfer);
    expect(materialiseBinaryContent(transfer(second.value, second.transferables), undefined)).toEqual(sourceBytes);
  });

  it('reclaims pooled bytes after reader acknowledgement', () => {
    const buffer = new SharedArrayBuffer(256 * 1024);
    const bindings = createWorkerHostBindings({ geometryPoolBuffer: buffer });
    const reader = new SharedPool(buffer);
    const source = new Uint8Array([1, 2, 3, 4]);
    const published = bindings.binaryDelivery.publishBytes('pooled-bytes', source);

    expect(published.tier).toBe('pool');
    expect(materialiseBinaryContent(published.value, reader, bindings.binaryDelivery.acknowledge)).toEqual(source);
    expect(reader.resolve('pooled-bytes')).toBeUndefined();
  });

  it('keeps 50 MB render and export bytes identical across pooled and fallback delivery', () => {
    const source = new Uint8Array(50 * 1024 * 1024);
    source.fill(0xa5);
    source[source.byteLength - 1] = 0x5a;
    const buffer = new SharedArrayBuffer(source.byteLength + 1024 * 1024);
    const pooledBindings = createWorkerHostBindings({ geometryPoolBuffer: buffer });
    const reader = new SharedPool(buffer);

    for (const key of ['large-render', 'large-export']) {
      const published = pooledBindings.binaryDelivery.publishBytes(key, source);
      expect(published.tier).toBe('pool');
      const bytes = materialiseBinaryContent(published.value, reader, pooledBindings.binaryDelivery.acknowledge);
      expect(bytesEqual(bytes, source)).toBe(true);
      expect(reader.resolve(key)).toBeUndefined();
    }

    const fallbackBindings = createWorkerHostBindings({});
    const fallback = fallbackBindings.binaryDelivery.publishBytes('large-fallback', source);
    expect(fallback.tier).toBe('transfer');
    const received = transfer(fallback.value, fallback.transferables);
    expect(bytesEqual(materialiseBinaryContent(received, undefined), source)).toBe(true);
    expect(source[source.byteLength - 1]).toBe(0x5a);
  });

  it('falls back without overwriting an unacknowledged pooled publication', () => {
    const buffer = new SharedArrayBuffer(256 * 1024);
    const bindings = createWorkerHostBindings({ geometryPoolBuffer: buffer });
    const reader = new SharedPool(buffer);
    const firstBytes = new Uint8Array(80 * 1024).fill(1);
    const secondBytes = new Uint8Array(80 * 1024).fill(2);
    const first = bindings.binaryDelivery.publishBytes('first', firstBytes);
    const second = bindings.binaryDelivery.publishBytes('second', secondBytes);

    expect(first.tier).toBe('pool');
    expect(second.tier).toBe('transfer');
    expect(materialiseBinaryContent(transfer(second.value, second.transferables), undefined)).toEqual(secondBytes);
    expect(materialiseBinaryContent(first.value, reader, bindings.binaryDelivery.acknowledge)).toEqual(firstBytes);
  });
});
