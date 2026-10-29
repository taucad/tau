import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createMeasurementFeatureWorkerClient } from '#graphics/three/utils/measurement-features-worker-client.js';
import type { MeasurementGraphRequest } from '#graphics/three/utils/measurement-features-worker-client.js';

/** A worker stub that records each graph request and finishes the one it is building when the test says. */
function createRecordingWorker(): Readonly<{
  worker: Worker;
  /** Vertex counts of the meshes whose graphs were requested, in the order the client sent them. */
  requested: number[];
  finish: () => Promise<void>;
}> {
  const requested: number[] = [];
  const target = new EventTarget();
  const worker = Object.assign(target, {
    postMessage(message: MeasurementGraphRequest | { type: 'ack' }) {
      if ('position' in message) {
        requested.push(message.position.array.length / message.position.itemSize);
      }
    },
    terminate() {
      // This protocol stub owns no worker thread.
    },
  });
  return {
    worker: worker as unknown as Worker,
    requested,
    async finish() {
      target.dispatchEvent(new MessageEvent('message', { data: { type: 'done' } }));
      await Promise.resolve();
    },
  };
}

/** A plane whose vertex count names it in the requests the worker saw. */
const planeWithSegments = (segments: number): THREE.Mesh => new THREE.Mesh(new THREE.PlaneGeometry(1, 1, segments, 1));
const vertexCount = (mesh: THREE.Mesh): number => mesh.geometry.getAttribute('position').count;

describe('measurement feature worker client priority', () => {
  it('builds a prioritized mesh next, ahead of the meshes queued before it', async () => {
    const stub = createRecordingWorker();
    const client = createMeasurementFeatureWorkerClient(() => stub.worker);
    const [first, second, third, clicked] = [1, 2, 3, 4].map((segments) => planeWithSegments(segments)) as [
      THREE.Mesh,
      THREE.Mesh,
      THREE.Mesh,
      THREE.Mesh,
    ];
    const graphs = [first, second, third, clicked].map(async (mesh) => client.prepare(mesh));
    expect(stub.requested).toEqual([vertexCount(first)]);

    client.prioritize(clicked);
    await stub.finish();
    expect(stub.requested).toEqual([vertexCount(first), vertexCount(clicked)]);

    await stub.finish();
    await stub.finish();
    await stub.finish();
    expect(stub.requested).toEqual([vertexCount(first), vertexCount(clicked), vertexCount(second), vertexCount(third)]);
    await Promise.all(graphs);
    client.dispose();
  });

  it('leaves the queue alone for the mesh already being built or one never queued', async () => {
    const stub = createRecordingWorker();
    const client = createMeasurementFeatureWorkerClient(() => stub.worker);
    const [first, second, stranger] = [1, 2, 3].map((segments) => planeWithSegments(segments)) as [
      THREE.Mesh,
      THREE.Mesh,
      THREE.Mesh,
    ];
    const graphs = [first, second].map(async (mesh) => client.prepare(mesh));

    client.prioritize(first);
    client.prioritize(stranger);
    await stub.finish();
    await stub.finish();
    expect(stub.requested).toEqual([vertexCount(first), vertexCount(second)]);
    await Promise.all(graphs);
    client.dispose();
  });
});
