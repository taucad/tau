import * as THREE from 'three';
import { INTERSECTED, NOT_INTERSECTED } from 'three-mesh-bvh';
import type { MeshBVH } from 'three-mesh-bvh';

/**
 * Ordered loop of 3D points in mesh-local space (first point is not repeated at the end).
 * Winding is consistent for {@link mergeTriangulatedContours}.
 */
export type ClosedContour = readonly THREE.Vector3[];

const _inverseMatrix = /* @__PURE__ */ new THREE.Matrix4();
const _localPlane = /* @__PURE__ */ new THREE.Plane();
const _temporaryLine = /* @__PURE__ */ new THREE.Line3();
const _temporaryVector = /* @__PURE__ */ new THREE.Vector3();
const _temporaryTriangleHit0 = /* @__PURE__ */ new THREE.Vector3();
const _temporaryTriangleHit1 = /* @__PURE__ */ new THREE.Vector3();
const _temporaryTriangleHit2 = /* @__PURE__ */ new THREE.Vector3();

/** Preallocated slot for BVH triangle / plane intersections (three-mesh-bvh PR #434 dedupe lane). */
type MutableSegment = {
  a: THREE.Vector3;
  b: THREE.Vector3;
};

/** Segment ring buffer reused across shapecasts (R8b: pre-capacity 50 000 slots, geometric grow). */
export type SegmentScratch = {
  slots: MutableSegment[];
  /** Active segment count — reset by {@link resetSegmentScratch}. */
  count: number;
};

const segmentScratchInitialCapacity = 50_000;

function allocateSegmentSlots(targetCount: number): MutableSegment[] {
  const out: MutableSegment[] = [];
  for (let index = 0; index < targetCount; index++) {
    out.push({ a: new THREE.Vector3(), b: new THREE.Vector3() });
  }
  return out;
}

/** Creates an empty scratch with {@link segmentScratchInitialCapacity} reusable segment slots (R8b). */
export function createSegmentScratch(initialCapacity = segmentScratchInitialCapacity): SegmentScratch {
  return { slots: allocateSegmentSlots(initialCapacity), count: 0 };
}

export function resetSegmentScratch(scratch: SegmentScratch): void {
  scratch.count = 0;
}

function ensureScratchCapacity(scratch: SegmentScratch): void {
  const need = scratch.count + 1;
  if (need <= scratch.slots.length) {
    return;
  }

  const growTo = Math.max(scratch.slots.length * 2, segmentScratchInitialCapacity);
  scratch.slots.push(...allocateSegmentSlots(growTo - scratch.slots.length));
}

/** Appends endpoints as a mutable segment backed by pooled `Vector3`s. */
function pushScratchSegment(scratch: SegmentScratch, pointA: THREE.Vector3, pointB: THREE.Vector3): void {
  ensureScratchCapacity(scratch);
  const slotIndex = scratch.count;
  const slot = scratch.slots[slotIndex]!;
  slot.a.copy(pointA);
  slot.b.copy(pointB);
  scratch.count = slotIndex + 1;
}

function collectPlaneMeshSegments(bvh: MeshBVH, localPlane: THREE.Plane, scratch: SegmentScratch): void {
  // Three-mesh-bvh example/clippedEdges.js:394-460 (incl. PR #434 vertex-on-edge dedupe).

  bvh.shapecast({
    intersectsBounds: (box) => (localPlane.intersectsBox(box) ? INTERSECTED : NOT_INTERSECTED),

    intersectsTriangle(triangle) {
      const hitPoints: THREE.Vector3[] = [];

      _temporaryLine.start.copy(triangle.a);
      _temporaryLine.end.copy(triangle.b);
      if (localPlane.intersectLine(_temporaryLine, _temporaryVector)) {
        hitPoints.push(_temporaryVector.clone());
      }

      _temporaryLine.start.copy(triangle.b);
      _temporaryLine.end.copy(triangle.c);
      if (localPlane.intersectLine(_temporaryLine, _temporaryVector)) {
        hitPoints.push(_temporaryVector.clone());
      }

      _temporaryLine.start.copy(triangle.c);
      _temporaryLine.end.copy(triangle.a);
      if (localPlane.intersectLine(_temporaryLine, _temporaryVector)) {
        hitPoints.push(_temporaryVector.clone());
      }

      if (hitPoints.length === 3) {
        _temporaryTriangleHit0.copy(hitPoints[0]!);
        _temporaryTriangleHit1.copy(hitPoints[1]!);
        _temporaryTriangleHit2.copy(hitPoints[2]!);
        if (
          _temporaryTriangleHit2.equals(_temporaryTriangleHit0) ||
          _temporaryTriangleHit2.equals(_temporaryTriangleHit1)
        ) {
          hitPoints.pop();
        } else if (_temporaryTriangleHit0.equals(_temporaryTriangleHit1)) {
          hitPoints[1]!.copy(_temporaryTriangleHit2);
          hitPoints.pop();
        }
      }

      if (hitPoints.length !== 2) {
        return false;
      }

      pushScratchSegment(scratch, hitPoints[0]!, hitPoints[1]!);
      return false;
    },
  });
}

function pickUniqueNeighborExcludingPrevious(
  adjacency: Map<string, Set<string>>,
  currentKey: string,
  previousKey: string,
): string | undefined {
  const neighbors = adjacency.get(currentKey);
  if (!neighbors) {
    return undefined;
  }

  let candidate: string | undefined;
  for (const neighbor of neighbors) {
    if (neighbor === previousKey) {
      continue;
    }

    if (candidate !== undefined) {
      return undefined;
    }

    candidate = neighbor;
  }

  return candidate;
}

/**
 * Builds a snapped simple graph (parallel edges collapse) and walks each 2-regular connected component as one closed loop.
 * Handles split-triangle cut edges where many colinear sub-segments share vertices but endpoint-only stitching never closes.
 *
 * @internal
 */
export function stitchClosedContoursFromSegments(
  segmentCount: number,
  segments: readonly MutableSegment[],
): ClosedContour[] {
  if (segmentCount === 0) {
    return [];
  }

  const pointKey = (point: THREE.Vector3) => quantizedPointKey(point);
  const keyToPoint = new Map<string, THREE.Vector3>();
  const adjacency = new Map<string, Set<string>>();

  const ensurePoint = (point: THREE.Vector3): string => {
    const key = pointKey(point);
    if (!keyToPoint.has(key)) {
      keyToPoint.set(key, point.clone());
    }

    return key;
  };

  const addUndirectedEdge = (pointA: THREE.Vector3, pointB: THREE.Vector3): void => {
    const keyA = ensurePoint(pointA);
    const keyB = ensurePoint(pointB);
    if (keyA === keyB) {
      return;
    }

    let neighborsA = adjacency.get(keyA);
    if (!neighborsA) {
      neighborsA = new Set<string>();
      adjacency.set(keyA, neighborsA);
    }

    let neighborsB = adjacency.get(keyB);
    if (!neighborsB) {
      neighborsB = new Set<string>();
      adjacency.set(keyB, neighborsB);
    }

    neighborsA.add(keyB);
    neighborsB.add(keyA);
  };

  for (let index = 0; index < segmentCount; index++) {
    const segment = segments[index]!;
    addUndirectedEdge(segment.a, segment.b);
  }

  const visitedGlobal = new Set<string>();
  const contours: THREE.Vector3[][] = [];

  for (const startKey of [...keyToPoint.keys()].sort()) {
    if (visitedGlobal.has(startKey)) {
      continue;
    }

    const component = new Set<string>();
    const stack = [startKey];
    while (stack.length > 0) {
      const key = stack.pop()!;
      if (component.has(key)) {
        continue;
      }

      component.add(key);
      const neighbors = adjacency.get(key);
      if (!neighbors) {
        continue;
      }

      for (const neighbor of neighbors) {
        stack.push(neighbor);
      }
    }

    for (const key of component) {
      visitedGlobal.add(key);
    }

    if (component.size < 3) {
      continue;
    }

    let allDegreeTwo = true;
    for (const key of component) {
      const degree = adjacency.get(key)?.size ?? 0;
      if (degree !== 2) {
        allDegreeTwo = false;
        break;
      }
    }

    if (!allDegreeTwo) {
      continue;
    }

    const sortedComponent = [...component].sort();
    const cycleStart = sortedComponent[0]!;
    const startNeighbors = [...adjacency.get(cycleStart)!].sort();
    const firstHop = startNeighbors[0]!;

    let previousKey = cycleStart;
    let currentKey = firstHop;
    const cycleKeys: string[] = [cycleStart];
    let cycleWalkSucceeded = true;

    while (currentKey !== cycleStart) {
      cycleKeys.push(currentKey);
      const nextKey = pickUniqueNeighborExcludingPrevious(adjacency, currentKey, previousKey);
      if (nextKey === undefined) {
        cycleWalkSucceeded = false;
        break;
      }

      previousKey = currentKey;
      currentKey = nextKey;
    }

    if (!cycleWalkSucceeded) {
      continue;
    }

    if (cycleKeys.length < 3) {
      continue;
    }

    contours.push(cycleKeys.map((key) => keyToPoint.get(key)!.clone()));
  }

  return contours;
}

function dedupePlaneSegments(scratch: SegmentScratch): void {
  const seen = new Set<string>();
  let writeIndex = 0;
  const { slots } = scratch;

  for (let readIndex = 0; readIndex < scratch.count; readIndex++) {
    const segment = slots[readIndex]!;
    const key = quantizedSegmentLookupKey(segment.a, segment.b);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    if (writeIndex !== readIndex) {
      slots[writeIndex]!.a.copy(segment.a);
      slots[writeIndex]!.b.copy(segment.b);
    }

    writeIndex++;
  }

  scratch.count = writeIndex;
}

function snapScratchSegmentEndpoints(scratch: SegmentScratch): void {
  const snapCoordinate = (value: number) => Math.round(value * 1000) / 1000;

  for (let index = 0; index < scratch.count; index++) {
    const segment = scratch.slots[index]!;
    segment.a.set(snapCoordinate(segment.a.x), snapCoordinate(segment.a.y), snapCoordinate(segment.a.z));
    segment.b.set(snapCoordinate(segment.b.x), snapCoordinate(segment.b.y), snapCoordinate(segment.b.z));
  }
}

function roundCoordinateForContourKey(coordinate: number): number {
  return Math.round(coordinate * 1000) / 1000;
}

function quantizedPointKey(point: THREE.Vector3): string {
  return `${roundCoordinateForContourKey(point.x)},${roundCoordinateForContourKey(point.y)},${roundCoordinateForContourKey(point.z)}`;
}

function quantizedSegmentLookupKey(edgeA: THREE.Vector3, edgeB: THREE.Vector3): string {
  // Collapses float noise from neighbouring triangles intersecting the same cut edge.
  const first = quantizedPointKey(edgeA);
  const second = quantizedPointKey(edgeB);
  return first <= second ? `${first}@@${second}` : `${second}@@${first}`;
}

export type ExtractClosedContoursInput = Readonly<{
  geometry: THREE.BufferGeometry;
  bvh: MeshBVH;
  worldPlane: THREE.Plane;
  meshWorldMatrix: THREE.Matrix4;
  segmentScratch: SegmentScratch;
}>;

export function extractClosedContours(input: ExtractClosedContoursInput): ClosedContour[] {
  void input.geometry;
  _inverseMatrix.copy(input.meshWorldMatrix).invert();
  _localPlane.copy(input.worldPlane).applyMatrix4(_inverseMatrix);

  resetSegmentScratch(input.segmentScratch);
  collectPlaneMeshSegments(input.bvh, _localPlane, input.segmentScratch);
  dedupePlaneSegments(input.segmentScratch);
  snapScratchSegmentEndpoints(input.segmentScratch);
  dedupePlaneSegments(input.segmentScratch);

  return stitchClosedContoursFromSegments(input.segmentScratch.count, input.segmentScratch.slots);
}
