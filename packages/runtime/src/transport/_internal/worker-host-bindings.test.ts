import { describe, expect, it } from 'vitest';
import type { Geometry } from '@taucad/types';
import { createWorkerHostBindings } from '#transport/_internal/worker-host-bindings.js';

const transfer = (value: unknown, transferables: readonly Transferable[]): unknown =>
  structuredClone(value, { transfer: [...transferables] });

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
});
