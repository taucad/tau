import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createMeasurementFeatureWorkerClient } from '#components/geometry/graphics/three/utils/measurement-features-worker-client.js';
import {
  getMeshMeasurementFeatures,
  listMeasurementTargets,
} from '#components/geometry/graphics/three/utils/measurement-features.js';

const fixture = new URL(
  '../../../../../../../../packages/geospec-engine-native/bench/fixtures/performance-lab/generated/flanged-housing.glb',
  import.meta.url,
);

describe('cold mesh measurement graph worker', () => {
  it('keeps the event loop live and preserves the checked-in housing graph', async () => {
    const response = await fetch(fixture);
    expect(response.ok).toBe(true);
    const loaded = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
    const { scene } = loaded;
    let mesh: THREE.Mesh | undefined;
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        mesh = object;
      }
    });
    expect(mesh).toBeDefined();
    const source = mesh!;
    const client = createMeasurementFeatureWorkerClient();
    let ticks = 0;
    let largestTickGap = 0;
    let lastTick = performance.now();
    const heartbeatInterval = setInterval(() => {
      const now = performance.now();
      largestTickGap = Math.max(largestTickGap, now - lastTick);
      lastTick = now;
      ticks++;
    }, 10);
    const start = performance.now();
    const pending = client.prepare(source);
    const callMilliseconds = performance.now() - start;
    const workerGraph = await pending;
    const workerMilliseconds = performance.now() - start;
    clearInterval(heartbeatInterval);
    expect(workerGraph).toBeDefined();
    expect(callMilliseconds).toBeLessThan(100);
    expect(ticks).toBeGreaterThan(10);
    expect(largestTickGap).toBeLessThan(250);
    const baseline = getMeshMeasurementFeatures(new THREE.Mesh(source.geometry.clone()));
    expect(workerGraph!.features.map(({ id, kind }) => [id, kind])).toEqual(
      baseline.features.map(({ id, kind }) => [id, kind]),
    );
    expect(workerGraph!.triangleRegion).toEqual(baseline.triangleRegion);
    expect(workerGraph!.triangleBody).toEqual(baseline.triangleBody);
    expect(workerGraph!.triangleFeatureId).toEqual(baseline.triangleFeatureId);
    expect(getMeshMeasurementFeatures(source)).toBe(workerGraph);
    const bounds = new THREE.Box3().setFromBufferAttribute(
      source.geometry.getAttribute('position') as THREE.BufferAttribute,
    );
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3()).length();
    const scanCamera = new THREE.OrthographicCamera(-size, size, size, -size, 0.1, size * 10);
    scanCamera.position.copy(center).add(new THREE.Vector3(0, 0, size * 2));
    scanCamera.lookAt(center);
    scanCamera.updateMatrixWorld();
    scanCamera.updateProjectionMatrix();
    const scanCanvas = document.createElement('canvas');
    scanCanvas.width = 800;
    scanCanvas.height = 600;
    const sliceDurations: number[] = [];
    const scanBatch = async (offset: number): Promise<void> => {
      if (offset >= 10_000) {
        return;
      }
      const scanStart = performance.now();
      listMeasurementTargets(
        { ...workerGraph!, features: workerGraph!.features.slice(offset, offset + 32) },
        {
          mesh: source,
          camera: scanCamera,
          canvas: scanCanvas,
        },
      );
      sliceDurations.push(performance.now() - scanStart);
      // Match the catalog's timer boundary between feature batches.
      // oxlint-disable-next-line no-await-in-loop -- each batch needs its own event-loop turn to measure blocking.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      await scanBatch(offset + 32);
    };
    await scanBatch(0);
    const orderedSlices = sliceDurations.toSorted((a, b) => a - b);
    const sliceP95 = orderedSlices[Math.floor(orderedSlices.length * 0.95)]!;
    const largestSlice = orderedSlices.at(-1)!;
    expect(sliceP95).toBeLessThan(8);
    console.info(
      JSON.stringify({
        fixture: 'flanged-housing.glb',
        triangles: workerGraph!.triangleRegion.length,
        features: workerGraph!.features.length,
        copyAndPost: callMilliseconds,
        workerAndHydration: workerMilliseconds,
        intervalTicks: ticks,
        largestTickGap,
        firstTenThousandSliceP95: sliceP95,
        firstTenThousandLargestSlice: largestSlice,
      }),
    );
    client.dispose();
  }, 120_000);

  it('matches an interleaved normalized mesh with authored topology faces', async () => {
    const array = new Uint16Array([0, 0, 0, 0, 0, 65_535, 0, 0, 0, 65_535, 65_535, 0, 0, 0, 65_535, 0]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(array, 4), 3, 1, true),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const association = {
      kind: 'surface',
      componentId: 'component:panel',
      faces: [{ id: 'face:panel', start: 0, count: 6 }],
    };
    const workerMesh = new THREE.Mesh(geometry);
    workerMesh.userData['measurementFeatures'] = association;
    const baselineMesh = new THREE.Mesh(geometry.clone());
    baselineMesh.userData['measurementFeatures'] = association;
    const baseline = getMeshMeasurementFeatures(baselineMesh);
    const client = createMeasurementFeatureWorkerClient();
    const result = await client.prepare(workerMesh);
    expect(result?.features).toEqual(baseline.features);
    expect(result?.triangleFeatureId).toEqual(baseline.triangleFeatureId);
    expect(result?.revision).toContain(':topology:component:panel');
    client.dispose();
  }, 30_000);

  it('discards a graph after its position revision changes during work', async () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 8, 8));
    const client = createMeasurementFeatureWorkerClient();
    const result = client.prepare(mesh);
    mesh.geometry.getAttribute('position').needsUpdate = true;
    expect(await result).toBeUndefined();
    expect(client.ready(mesh)).toBeUndefined();
    client.dispose();
  }, 30_000);

  it('reuses one prepared graph for queued meshes sharing a geometry', async () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const first = new THREE.Mesh(geometry);
    const second = new THREE.Mesh(geometry);
    const client = createMeasurementFeatureWorkerClient();
    const [firstGraph, secondGraph] = await Promise.all([client.prepare(first), client.prepare(second)]);
    expect(firstGraph).toBeDefined();
    expect(secondGraph).toBe(firstGraph);
    client.dispose();
  }, 30_000);

  it('rehydrates an oversized face loop-ID payload before publishing', async () => {
    const loopIds = Array.from({ length: 1000 }, (_, index) => `loop:${index}`);
    const fakeWorker = Object.assign(new EventTarget(), {
      postMessage() {
        queueMicrotask(() => {
          fakeWorker.dispatchEvent(
            new MessageEvent('message', {
              data: {
                type: 'features',
                values: [
                  {
                    id: 'topology:face',
                    kind: 'face',
                    evidence: 'mesh',
                    normal: new THREE.Vector3(0, 0, 1),
                    planar: true,
                    centroid: new THREE.Vector3(),
                    centroidOnSurface: true,
                    area: 1,
                    triangleIndices: [],
                    loopIds: [],
                  },
                ],
              },
            }),
          );
          for (let offset = 0; offset < loopIds.length; offset += 128) {
            fakeWorker.dispatchEvent(
              new MessageEvent('message', {
                data: { type: 'featurePart', index: 0, field: 'loopIds', values: loopIds.slice(offset, offset + 128) },
              }),
            );
          }
          fakeWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'done' } }));
        });
      },
      terminate() {
        // This protocol stub owns no worker thread.
      },
    });
    const client = createMeasurementFeatureWorkerClient(() => fakeWorker as unknown as Worker);
    const result = await client.prepare(new THREE.Mesh(new THREE.PlaneGeometry(1, 1)));
    expect(result?.features[0]?.kind).toBe('face');
    expect(result?.features[0]?.kind === 'face' ? result.features[0].loopIds : []).toEqual(loopIds);
    client.dispose();
  });
});
