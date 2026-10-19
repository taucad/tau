import * as THREE from 'three';
import { INTERSECTED, MeshBVH, NOT_INTERSECTED } from 'three-mesh-bvh';
import { bvhBuildOptions } from '#graphics/three/utils/bvh-worker-client.js';
import { sliceSectionLoops } from '#graphics/three/utils/section-loop-slice.js';
import type { SectionLoopSlice } from '#graphics/three/utils/section-loop-slice.js';

/** One mesh of a source: its vertices and the triangles it shows, and where it sits in the source frame. */
export type SectionLoopParticipantInput = Readonly<{
  positions: Float32Array;
  /** Three vertices per shown triangle. */
  index: Uint32Array;
  /** Column-major 4×4 matrix from the mesh into the source frame. */
  localToSource: readonly number[];
}>;

/** A source's triangle soup, kept by the slicer under its key until the signature changes. */
export type SectionLoopSourceInput = Readonly<{
  sourceKey: string;
  /** Changes whenever the triangles or the shown subset change. */
  signature: string;
  participants: readonly SectionLoopParticipantInput[];
}>;

export type SectionLoopSliceRequest = Readonly<{
  sourceKey: string;
  signature: string;
  /** The plane in the source frame, as `(normal, constant)`: a point's distance is `dot(normal, p) - constant`. */
  plane: readonly [number, number, number, number];
}>;

export type SectionLoopSliceResult =
  | Readonly<{
      status: 'ready';
      slice: SectionLoopSlice;
      /** Triangles the tree found near the plane. */
      candidateCount: number;
      broadphaseMilliseconds: number;
    }>
  /** The slicer does not hold this source at this signature: send it first. */
  | Readonly<{ status: 'missing' }>;

type PreparedSource = Readonly<{
  signature: string;
  geometry: THREE.BufferGeometry;
  bvh: MeshBVH;
  weldTolerance: number;
  /** Bounds of a tree node grown by this, so a triangle in the plane is never missed. */
  boundsTolerance: number;
}>;

export type SectionLoopSlicer = Readonly<{
  /** Keeps a source's triangles and builds their tree; returns the milliseconds it took. */
  prepare: (input: SectionLoopSourceInput) => number;
  slice: (request: SectionLoopSliceRequest) => SectionLoopSliceResult;
  release: (sourceKey: string) => void;
}>;

/**
 * The realm-neutral half of per-loop caps: it holds each uncertified source's triangles in the source frame with a
 * bounding volume tree, and slices them by a plane on request. It runs in the section worker, or in-process where no
 * worker can start.
 */
export const createSectionLoopSlicer = (): SectionLoopSlicer => {
  const sources = new Map<string, PreparedSource>();

  const prepare = (input: SectionLoopSourceInput): number => {
    const startedAt = performance.now();
    let vertexCount = 0;
    let indexCount = 0;
    for (const participant of input.participants) {
      vertexCount += participant.positions.length / 3;
      indexCount += participant.index.length;
    }
    const positions = new Float32Array(vertexCount * 3);
    const index = new Uint32Array(indexCount);
    const matrix = new THREE.Matrix4();
    const point = new THREE.Vector3();
    let vertexBase = 0;
    let indexBase = 0;
    for (const participant of input.participants) {
      matrix.fromArray(participant.localToSource);
      const count = participant.positions.length / 3;
      for (let vertex = 0; vertex < count; vertex++) {
        point.fromArray(participant.positions, vertex * 3).applyMatrix4(matrix);
        point.toArray(positions, (vertexBase + vertex) * 3);
      }
      for (const [offset, value] of participant.index.entries()) {
        index[indexBase + offset] = vertexBase + value;
      }
      vertexBase += count;
      indexBase += participant.index.length;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.computeBoundingBox();
    const box = geometry.boundingBox ?? new THREE.Box3();
    const diagonal = box.isEmpty() ? 0 : box.min.distanceTo(box.max);
    sources.get(input.sourceKey)?.geometry.dispose();
    sources.set(input.sourceKey, {
      signature: input.signature,
      geometry,
      bvh: new MeshBVH(geometry, bvhBuildOptions),
      weldTolerance: Math.max(diagonal * 1e-6, Number.MIN_VALUE),
      boundsTolerance: diagonal * 1e-6,
    });
    return performance.now() - startedAt;
  };

  const slice = (request: SectionLoopSliceRequest): SectionLoopSliceResult => {
    const source = sources.get(request.sourceKey);
    if (source?.signature !== request.signature) {
      return { status: 'missing' };
    }
    const startedAt = performance.now();
    const [nx, ny, nz, constant] = request.plane;
    const plane = new THREE.Plane(new THREE.Vector3(nx, ny, nz), -constant);
    const positions = source.geometry.getAttribute('position').array as Float32Array;
    const index = source.geometry.getIndex()!.array as Uint32Array;
    let triangles = new Float64Array(9 * 1024);
    let count = 0;
    const grown = new THREE.Box3();
    source.bvh.shapecast({
      intersectsBounds: (box) =>
        plane.intersectsBox(grown.copy(box).expandByScalar(source.boundsTolerance)) ? INTERSECTED : NOT_INTERSECTED,
      intersectsTriangle: (_triangle, triangleIndex) => {
        if ((count + 1) * 9 > triangles.length) {
          const next = new Float64Array(triangles.length * 2);
          next.set(triangles);
          triangles = next;
        }
        for (let corner = 0; corner < 3; corner++) {
          const vertex = index[triangleIndex * 3 + corner]! * 3;
          triangles[count * 9 + corner * 3] = positions[vertex]!;
          triangles[count * 9 + corner * 3 + 1] = positions[vertex + 1]!;
          triangles[count * 9 + corner * 3 + 2] = positions[vertex + 2]!;
        }
        count++;
        return false;
      },
    });
    const broadphaseMilliseconds = performance.now() - startedAt;
    return {
      status: 'ready',
      slice: sliceSectionLoops({
        triangles: triangles.subarray(0, count * 9),
        plane: request.plane,
        weldTolerance: source.weldTolerance,
      }),
      candidateCount: count,
      broadphaseMilliseconds,
    };
  };

  return {
    prepare,
    slice,
    release(sourceKey) {
      sources.get(sourceKey)?.geometry.dispose();
      sources.delete(sourceKey);
    },
  };
};
