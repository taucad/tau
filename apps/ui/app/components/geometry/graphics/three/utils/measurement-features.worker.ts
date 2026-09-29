import * as THREE from 'three';
import { getMeshMeasurementFeatures } from '#components/geometry/graphics/three/utils/measurement-features.js';
import type { MeshFeature, MeshFeatureGraph } from '#components/geometry/graphics/three/utils/measurement-features.js';
import type {
  MeasurementGraphMessage,
  MeasurementGraphRequest,
} from '#components/geometry/graphics/three/utils/measurement-features-worker-client.js';

const messageBudget = 24 * 1024;
const pointSpan = 128;
const triangleSpan = 2048;
const loopSpan = 128;
let sentSinceYield = 0;

async function send(message: MeasurementGraphMessage): Promise<void> {
  self.postMessage(message);
  if (++sentSinceYield >= 32) {
    sentSinceYield = 0;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

function restoreAttribute(
  source: MeasurementGraphRequest['position'],
): THREE.BufferAttribute | THREE.InterleavedBufferAttribute {
  if (source.stride !== undefined) {
    const data = new THREE.InterleavedBuffer(source.array, source.stride);
    return new THREE.InterleavedBufferAttribute(data, source.itemSize, source.offset ?? 0, source.normalized);
  }
  return new THREE.BufferAttribute(source.array, source.itemSize, source.normalized);
}

function featureSize(feature: MeshFeature): number {
  return (
    256 +
    ('points' in feature ? feature.points.length * 32 : 0) +
    (feature.kind === 'face'
      ? feature.triangleIndices.length * 8 + feature.loopIds.reduce((size, id) => size + id.length * 2 + 16, 0)
      : 0)
  );
}

async function streamGraph(graph: MeshFeatureGraph): Promise<void> {
  let batch: MeshFeature[] = [];
  let bytes = 0;
  const flush = async (): Promise<void> => {
    if (batch.length > 0) {
      await send({ type: 'features', values: batch });
      batch = [];
      bytes = 0;
    }
  };
  // oxlint-disable-next-line eslint/no-await-in-loop -- Message order and worker-side pacing are required.
  for (const [index, feature] of graph.features.entries()) {
    const largePoints = 'points' in feature && feature.points.length > pointSpan;
    const largeTriangles = feature.kind === 'face' && feature.triangleIndices.length > triangleSpan;
    const largeLoops = feature.kind === 'face' && feature.loopIds.length > loopSpan;
    const bounded: MeshFeature =
      feature.kind === 'face' && (largeTriangles || largeLoops)
        ? {
            ...feature,
            triangleIndices: largeTriangles ? [] : feature.triangleIndices,
            loopIds: largeLoops ? [] : feature.loopIds,
          }
        : feature.kind === 'edge' || feature.kind === 'circle' || feature.kind === 'body'
          ? largePoints
            ? { ...feature, points: [] }
            : feature
          : feature;
    const size = featureSize(bounded);
    if (bytes + size > messageBudget) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- A bounded message batch precedes the next feature.
      await flush();
    }
    batch.push(bounded);
    bytes += size;
    if (largePoints || largeTriangles || largeLoops) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- The feature skeleton must precede its spans.
      await flush();
      if ('points' in feature && largePoints) {
        for (let offset = 0; offset < feature.points.length; offset += pointSpan) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- Each span is posted in feature order.
          await send({
            type: 'featurePart',
            index,
            field: 'points',
            values: feature.points.slice(offset, offset + pointSpan),
          });
        }
      }
      if (feature.kind === 'face' && largeTriangles) {
        for (let offset = 0; offset < feature.triangleIndices.length; offset += triangleSpan) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- Each span is posted in feature order.
          await send({
            type: 'featurePart',
            index,
            field: 'triangleIndices',
            values: feature.triangleIndices.slice(offset, offset + triangleSpan),
          });
        }
      }
      if (feature.kind === 'face' && largeLoops) {
        for (let offset = 0; offset < feature.loopIds.length; offset += loopSpan) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- Loop IDs must arrive after the feature skeleton.
          await send({
            type: 'featurePart',
            index,
            field: 'loopIds',
            values: feature.loopIds.slice(offset, offset + loopSpan),
          });
        }
      }
    }
  }
  await flush();
  for (const field of ['triangleRegion', 'triangleBody', 'triangleFeatureId'] as const) {
    const values = graph[field];
    const span = field === 'triangleFeatureId' ? 512 : 2048;
    for (let offset = 0; offset < values.length; offset += span) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Triangle maps are transported in deterministic order.
      await send({ type: 'map', field, values: values.slice(offset, offset + span) });
    }
  }
  await send({ type: 'done' });
}

self.addEventListener('message', async (event: MessageEvent<MeasurementGraphRequest>) => {
  try {
    const request = event.data;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', restoreAttribute(request.position));
    if (request.index) {
      geometry.setIndex(restoreAttribute(request.index) as THREE.BufferAttribute);
    }
    const mesh = new THREE.Mesh(geometry);
    if (request.association) {
      mesh.userData['measurementFeatures'] = request.association;
    }
    await streamGraph(getMeshMeasurementFeatures(mesh));
    geometry.dispose();
  } catch (error) {
    await send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
});
