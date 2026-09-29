import * as THREE from 'three';
import {
  getCachedMeshMeasurementFeatures,
  getMeshMeasurementSignature,
  installMeshMeasurementFeatures,
} from '#components/geometry/graphics/three/utils/measurement-features.js';
import type {
  MeshFeature,
  MeshFeatureGraph,
  TopologyAssociation,
} from '#components/geometry/graphics/three/utils/measurement-features.js';

type AttributeCopy = {
  array: THREE.TypedArray;
  itemSize: number;
  normalized: boolean;
  stride?: number;
  offset?: number;
};

export type MeasurementGraphRequest = {
  signature: string;
  position: AttributeCopy;
  index?: AttributeCopy;
  association?: TopologyAssociation;
};

export type MeasurementGraphMessage =
  | { type: 'features'; values: MeshFeature[] }
  | {
      type: 'featurePart';
      index: number;
      field: 'points' | 'triangleIndices' | 'loopIds';
      values: THREE.Vector3[] | number[] | string[];
    }
  | { type: 'map'; field: 'triangleRegion' | 'triangleBody' | 'triangleFeatureId'; values: number[] | string[] }
  | { type: 'done' }
  | { type: 'error'; message: string };

type Task = {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  signature: string;
  association?: TopologyAssociation;
  waiters: Array<{
    resolve: (graph: MeshFeatureGraph | undefined) => void;
    reject: (error: Error) => void;
  }>;
};

function copyAttribute(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): AttributeCopy {
  if (attribute instanceof THREE.InterleavedBufferAttribute) {
    return {
      // oxlint-disable-next-line unicorn/prefer-spread -- Keep the typed-array constructor for transferable bytes.
      array: attribute.data.array.slice(),
      itemSize: attribute.itemSize,
      normalized: attribute.normalized,
      stride: attribute.data.stride,
      offset: attribute.offset,
    };
  }
  // oxlint-disable-next-line unicorn/prefer-spread -- Keep the typed-array constructor for transferable bytes.
  return { array: attribute.array.slice(), itemSize: attribute.itemSize, normalized: attribute.normalized };
}

function vector(value: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(value.x, value.y, value.z);
}

function hydrate(feature: MeshFeature): MeshFeature {
  switch (feature.kind) {
    case 'edge': {
      return { ...feature, points: feature.points.map((point) => vector(point)) };
    }
    case 'circle': {
      return {
        ...feature,
        points: feature.points.map((point) => vector(point)),
        center: vector(feature.center),
        normal: vector(feature.normal),
      };
    }
    case 'face': {
      return { ...feature, normal: vector(feature.normal), centroid: vector(feature.centroid) };
    }
    case 'body': {
      return {
        ...feature,
        bounds: new THREE.Box3(vector(feature.bounds.min), vector(feature.bounds.max)),
        points: feature.points.map((point) => vector(point)),
      };
    }
  }
}

export type MeasurementFeatureWorkerClient = {
  ready(mesh: THREE.Mesh): MeshFeatureGraph | undefined;
  prepare(mesh: THREE.Mesh): Promise<MeshFeatureGraph | undefined>;
  dispose(): void;
};

/** A single lazy worker serializes cold graph builds and releases itself when the queue drains. */
export function createMeasurementFeatureWorkerClient(
  createWorker: () => Worker = () =>
    new Worker(new URL('measurement-features.worker.ts', import.meta.url), {
      type: 'module',
      name: 'tau-measurement-features',
    }),
): MeasurementFeatureWorkerClient {
  let worker: Worker | undefined;
  let active: Task | undefined;
  let graph: MeshFeatureGraph | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const queue: Task[] = [];
  const pending = new WeakMap<THREE.Mesh, Task>();
  let disposed = false;

  function finish(error?: Error): void {
    const task = active;
    if (!task) {
      return;
    }
    if (pending.get(task.mesh) === task) {
      pending.delete(task.mesh);
    }
    active = undefined;
    if (error) {
      for (const waiter of task.waiters) {
        waiter.reject(error);
      }
    } else if (
      graph &&
      task.mesh.geometry === task.geometry &&
      task.mesh.userData['measurementFeatures'] === task.association &&
      installMeshMeasurementFeatures(task.mesh, task.signature, graph)
    ) {
      for (const waiter of task.waiters) {
        waiter.resolve(graph);
      }
    } else {
      for (const waiter of task.waiters) {
        waiter.resolve(undefined);
      }
    }
    graph = undefined;
    start();
  }

  function onMessage(event: MessageEvent<MeasurementGraphMessage>): void {
    const message = event.data;
    if (!active || !graph) {
      return;
    }
    switch (message.type) {
      case 'features': {
        graph.features.push(...message.values.map((feature) => hydrate(feature)));
        break;
      }
      case 'featurePart': {
        const feature = graph.features[message.index];
        if (!feature) {
          finish(new Error('Measurement graph feature part arrived out of order.'));
          return;
        }
        if (
          message.field === 'points' &&
          (feature.kind === 'edge' || feature.kind === 'circle' || feature.kind === 'body')
        ) {
          feature.points.push(...(message.values as THREE.Vector3[]).map((point) => vector(point)));
        } else if (message.field === 'triangleIndices' && feature.kind === 'face') {
          feature.triangleIndices.push(...(message.values as number[]));
        } else if (message.field === 'loopIds' && feature.kind === 'face') {
          feature.loopIds.push(...(message.values as string[]));
        }
        break;
      }
      case 'map': {
        if (message.field === 'triangleFeatureId') {
          graph.triangleFeatureId.push(...(message.values as string[]));
        } else {
          graph[message.field].push(...(message.values as number[]));
        }
        break;
      }
      case 'done': {
        finish();
        break;
      }
      case 'error': {
        finish(new Error(message.message));
        break;
      }
    }
  }

  function onError(event: ErrorEvent): void {
    const error = new Error(event.message.length > 0 ? event.message : 'Measurement feature worker failed.');
    worker?.terminate();
    worker = undefined;
    finish(error);
  }

  function start(): void {
    if (disposed || active !== undefined || queue.length === 0) {
      if (!disposed && !active && worker && !idleTimer) {
        idleTimer = setTimeout(() => {
          worker?.terminate();
          worker = undefined;
          idleTimer = undefined;
        }, 1000);
      }
      return;
    }
    clearTimeout(idleTimer);
    idleTimer = undefined;
    active = queue.shift()!;
    const { mesh, geometry, signature, association } = active;
    const stillCurrent =
      mesh.geometry === geometry &&
      getMeshMeasurementSignature(mesh) === signature &&
      mesh.userData['measurementFeatures'] === association;
    const sharedReady = getCachedMeshMeasurementFeatures(mesh);
    if (!stillCurrent || sharedReady) {
      const task = active;
      active = undefined;
      if (pending.get(mesh) === task) {
        pending.delete(mesh);
      }
      for (const waiter of task.waiters) {
        waiter.resolve(stillCurrent ? sharedReady : undefined);
      }
      start();
      return;
    }
    const position = geometry.getAttribute('position') as
      | THREE.BufferAttribute
      | THREE.InterleavedBufferAttribute
      | undefined;
    if (!position) {
      finish(new Error('Mesh has no position attribute.'));
      return;
    }
    // Copies preserve the renderer's buffers; transfer only the copies.
    const positionCopy = copyAttribute(position);
    const index = geometry.getIndex();
    const indexCopy = index ? copyAttribute(index) : undefined;
    if (
      mesh.geometry !== geometry ||
      getMeshMeasurementSignature(mesh) !== signature ||
      mesh.userData['measurementFeatures'] !== association
    ) {
      finish();
      return;
    }
    graph = {
      geometry,
      revision: `${geometry.id}:${signature}${association?.faces?.length ? `:topology:${association.componentId ?? ''}` : ''}`,
      features: [],
      triangleRegion: [],
      triangleBody: [],
      triangleFeatureId: [],
    };
    const request: MeasurementGraphRequest = { signature, position: positionCopy, index: indexCopy, association };
    try {
      if (!worker) {
        worker = createWorker();
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
      }
      const transfer: Transferable[] = [positionCopy.array.buffer as ArrayBuffer];
      if (indexCopy) {
        transfer.push(indexCopy.array.buffer as ArrayBuffer);
      }
      worker.postMessage(request, transfer);
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  }

  return {
    ready: getCachedMeshMeasurementFeatures,
    async prepare(mesh) {
      const ready = getCachedMeshMeasurementFeatures(mesh);
      if (ready) {
        return ready;
      }
      if (disposed) {
        return undefined;
      }
      const signature = getMeshMeasurementSignature(mesh);
      const association = mesh.userData['measurementFeatures'] as TopologyAssociation | undefined;
      const existing = pending.get(mesh);
      if (existing && existing.signature === signature && existing.association === association) {
        return new Promise((resolve, reject) => {
          existing.waiters.push({ resolve, reject });
        });
      }
      return new Promise((resolve, reject) => {
        const task: Task = { mesh, geometry: mesh.geometry, signature, association, waiters: [{ resolve, reject }] };
        pending.set(mesh, task);
        queue.push(task);
        start();
      });
    },
    dispose() {
      disposed = true;
      clearTimeout(idleTimer);
      worker?.terminate();
      worker = undefined;
      if (active) {
        for (const waiter of active.waiters) {
          waiter.resolve(undefined);
        }
        if (pending.get(active.mesh) === active) {
          pending.delete(active.mesh);
        }
      }
      for (const task of queue) {
        for (const waiter of task.waiters) {
          waiter.resolve(undefined);
        }
        if (pending.get(task.mesh) === task) {
          pending.delete(task.mesh);
        }
      }
      queue.length = 0;
      active = undefined;
      graph = undefined;
    },
  };
}
