import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { SerializedBVH } from 'three-mesh-bvh';
import type { BvhAttributeCopy, BvhBuildRequest, BvhWorkerMessage } from '#graphics/three/utils/bvh-worker-client.js';

type BvhWorkerGlobal = Readonly<{
  addEventListener(type: 'message', listener: (event: MessageEvent<BvhBuildRequest>) => void): void;
  postMessage(message: BvhWorkerMessage, transfer?: Transferable[]): void;
}>;

const context = globalThis as unknown as BvhWorkerGlobal;

const restoreAttribute = (source: BvhAttributeCopy): THREE.BufferAttribute | THREE.InterleavedBufferAttribute => {
  if (source.stride !== undefined) {
    const data = new THREE.InterleavedBuffer(source.array, source.stride);
    return new THREE.InterleavedBufferAttribute(data, source.itemSize, source.offset ?? 0, source.normalized);
  }
  return new THREE.BufferAttribute(source.array, source.itemSize, source.normalized);
};

/*
 * Builds one tree from the copies it was sent and posts it back serialised without cloning, so the roots and the
 * indirect buffer are transferred, not copied; the index is never posted back. Nothing outlives the message.
 */
context.addEventListener('message', (event) => {
  const request = event.data;
  try {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', restoreAttribute(request.position));
    if (request.index) {
      geometry.setIndex(new THREE.BufferAttribute(request.index.array, 1));
    }
    for (const group of request.groups) {
      geometry.addGroup(group.start, group.count, group.materialIndex);
    }
    geometry.setDrawRange(request.drawRange.start, request.drawRange.count);
    const startedAt = performance.now();
    const bvh = new MeshBVH(geometry, request.options);
    const buildMilliseconds = performance.now() - startedAt;
    // `version` is on the serialised object although the library's type omits it; deserialising needs it.
    const serialized = MeshBVH.serialize(bvh, { cloneBuffers: false }) as SerializedBVH & { version: number };
    const { roots } = serialized;
    const indirectBuffer = serialized.indirectBuffer ?? undefined;
    const transfer: Transferable[] = [...roots];
    if (indirectBuffer) {
      transfer.push(indirectBuffer.buffer as ArrayBuffer);
    }
    context.postMessage(
      { type: 'built', id: request.id, version: serialized.version, roots, indirectBuffer, buildMilliseconds },
      transfer,
    );
  } catch (error) {
    context.postMessage({
      type: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : 'The BVH build failed.',
    });
  }
});
