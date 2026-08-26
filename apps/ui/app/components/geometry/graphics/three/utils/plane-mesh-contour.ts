import * as THREE from 'three';
import { INTERSECTED, NOT_INTERSECTED } from 'three-mesh-bvh';
import type { MeshBVH } from 'three-mesh-bvh';

/**
 * Ordered loop of 3D points in mesh-local space (first point is not repeated at the end).
 * Winding is consistent for {@link mergeTriangulatedContours}.
 */
export type ClosedContour = readonly THREE.Vector3[];
export type OpenPolyline = readonly THREE.Vector3[];

export type ContourExtractionDiagnostic = Readonly<{
  kind: 'branched-component' | 'degenerate-component';
  componentVertexCount: number;
  oddVertexCount: number;
  branchVertexCount: number;
}>;

export type ExtractSectionContoursResult = Readonly<{
  closedContours: ClosedContour[];
  openPolylines: OpenPolyline[];
  diagnostics: ContourExtractionDiagnostic[];
  segmentCount: number;
}>;

const _inverseMatrix = /* @__PURE__ */ new THREE.Matrix4();
const _localPlane = /* @__PURE__ */ new THREE.Plane();
const _temporaryLine = /* @__PURE__ */ new THREE.Line3();
const _temporaryVector = /* @__PURE__ */ new THREE.Vector3();
const _temporaryTriangleHit0 = /* @__PURE__ */ new THREE.Vector3();
const _temporaryTriangleHit1 = /* @__PURE__ */ new THREE.Vector3();
const _temporaryTriangleHit2 = /* @__PURE__ */ new THREE.Vector3();
const defaultPlaneNormal = /* @__PURE__ */ new THREE.Vector3(0, 0, 1);

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
const faceAreaEpsilon = 1e-9;
const directedEdgeSeparator = '->';

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

type TriangleFilter = (triangleIndex: number) => boolean;

type CollectPlaneMeshSegmentsOptions = Readonly<{
  bvh: MeshBVH;
  localPlane: THREE.Plane;
  scratch: SegmentScratch;
  triangleFilter?: TriangleFilter;
}>;

function collectPlaneMeshSegments(options: CollectPlaneMeshSegmentsOptions): void {
  const { bvh, localPlane, scratch, triangleFilter } = options;
  // Three-mesh-bvh example/clippedEdges.js:394-460 (incl. PR #434 vertex-on-edge dedupe).

  bvh.shapecast({
    intersectsBounds: (box) => (localPlane.intersectsBox(box) ? INTERSECTED : NOT_INTERSECTED),

    intersectsTriangle(triangle, triangleIndex) {
      if (triangleFilter && !triangleFilter(triangleIndex)) {
        return false;
      }

      let hitCount = 0;

      _temporaryLine.start.copy(triangle.a);
      _temporaryLine.end.copy(triangle.b);
      if (localPlane.intersectLine(_temporaryLine, _temporaryVector)) {
        _temporaryTriangleHit0.copy(_temporaryVector);
        hitCount++;
      }

      _temporaryLine.start.copy(triangle.b);
      _temporaryLine.end.copy(triangle.c);
      if (localPlane.intersectLine(_temporaryLine, _temporaryVector)) {
        if (hitCount === 0) {
          _temporaryTriangleHit0.copy(_temporaryVector);
        } else {
          _temporaryTriangleHit1.copy(_temporaryVector);
        }
        hitCount++;
      }

      _temporaryLine.start.copy(triangle.c);
      _temporaryLine.end.copy(triangle.a);
      if (localPlane.intersectLine(_temporaryLine, _temporaryVector)) {
        if (hitCount === 0) {
          _temporaryTriangleHit0.copy(_temporaryVector);
        } else if (hitCount === 1) {
          _temporaryTriangleHit1.copy(_temporaryVector);
        } else {
          _temporaryTriangleHit2.copy(_temporaryVector);
        }
        hitCount++;
      }

      if (hitCount === 3) {
        if (
          _temporaryTriangleHit2.equals(_temporaryTriangleHit0) ||
          _temporaryTriangleHit2.equals(_temporaryTriangleHit1)
        ) {
          hitCount = 2;
        } else if (_temporaryTriangleHit0.equals(_temporaryTriangleHit1)) {
          _temporaryTriangleHit1.copy(_temporaryTriangleHit2);
          hitCount = 2;
        }
      }

      if (hitCount !== 2) {
        return false;
      }

      pushScratchSegment(scratch, _temporaryTriangleHit0, _temporaryTriangleHit1);
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

function buildPlaneBasis(normal: THREE.Vector3): Readonly<{ u: THREE.Vector3; v: THREE.Vector3 }> {
  const n = normal.clone().normalize();
  const arbitrary = Math.abs(n.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(arbitrary, n).normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  return { u, v };
}

function directedEdgeKey(fromKey: string, toKey: string): string {
  return `${fromKey}${directedEdgeSeparator}${toKey}`;
}

function faceSignedArea(keys: readonly string[], projectedPoints: ReadonlyMap<string, THREE.Vector2>): number {
  let twiceArea = 0;
  for (let index = 0; index < keys.length; index++) {
    const current = projectedPoints.get(keys[index]!)!;
    const next = projectedPoints.get(keys[(index + 1) % keys.length]!)!;
    twiceArea += current.x * next.y - next.x * current.y;
  }

  return twiceArea / 2;
}

type BoundedFaceExtractionInput = Readonly<{
  component: ReadonlySet<string>;
  adjacency: ReadonlyMap<string, ReadonlySet<string>>;
  keyToPoint: ReadonlyMap<string, THREE.Vector3>;
  planeNormal: THREE.Vector3;
}>;

function extractBoundedFacesFromBranchedComponent(input: BoundedFaceExtractionInput): THREE.Vector3[][] {
  const { component, adjacency, keyToPoint, planeNormal } = input;
  const { u, v } = buildPlaneBasis(planeNormal);
  const projectedPoints = new Map<string, THREE.Vector2>();
  const outgoing = new Map<string, string[]>();

  for (const key of component) {
    const point = keyToPoint.get(key)!;
    projectedPoints.set(key, new THREE.Vector2(point.dot(u), point.dot(v)));
  }

  for (const key of component) {
    const origin = projectedPoints.get(key)!;
    const neighbors = [...(adjacency.get(key) ?? [])]
      .filter((neighbor) => component.has(neighbor))
      .sort((left, right) => {
        const leftPoint = projectedPoints.get(left)!;
        const rightPoint = projectedPoints.get(right)!;
        const leftAngle = Math.atan2(leftPoint.y - origin.y, leftPoint.x - origin.x);
        const rightAngle = Math.atan2(rightPoint.y - origin.y, rightPoint.x - origin.x);
        return leftAngle - rightAngle || left.localeCompare(right);
      });
    outgoing.set(key, neighbors);
  }

  const visitedDirectedEdges = new Set<string>();
  const contours: THREE.Vector3[][] = [];
  const maxStepCount = Math.max(
    1,
    [...component].reduce((sum, key) => sum + (adjacency.get(key)?.size ?? 0), 0),
  );

  for (const fromStart of [...component].sort()) {
    for (const toStart of outgoing.get(fromStart) ?? []) {
      if (visitedDirectedEdges.has(directedEdgeKey(fromStart, toStart))) {
        continue;
      }

      const faceKeys: string[] = [];
      let fromKey = fromStart;
      let toKey = toStart;
      let closed = false;

      for (let step = 0; step <= maxStepCount; step++) {
        const edgeKey = directedEdgeKey(fromKey, toKey);
        if (visitedDirectedEdges.has(edgeKey)) {
          break;
        }

        visitedDirectedEdges.add(edgeKey);
        faceKeys.push(fromKey);

        const neighbors = outgoing.get(toKey);
        const incomingIndex = neighbors?.indexOf(fromKey) ?? -1;
        if (!neighbors || incomingIndex < 0) {
          break;
        }

        const nextIndex = (incomingIndex - 1 + neighbors.length) % neighbors.length;
        const nextKey = neighbors[nextIndex]!;
        fromKey = toKey;
        toKey = nextKey;

        if (fromKey === fromStart && toKey === toStart) {
          closed = true;
          break;
        }
      }

      const uniqueVertexCount = new Set(faceKeys).size;
      if (!closed || faceKeys.length < 3 || uniqueVertexCount !== faceKeys.length) {
        continue;
      }

      if (faceSignedArea(faceKeys, projectedPoints) <= faceAreaEpsilon) {
        continue;
      }

      contours.push(faceKeys.map((key) => keyToPoint.get(key)!.clone()));
    }
  }

  return contours;
}

/**
 * Builds a snapped simple graph (parallel edges collapse) and walks 2-regular connected components as closed loops.
 * Handles split-triangle cut edges where many colinear sub-segments share vertices but endpoint-only stitching never closes.
 *
 * @internal
 */
export function stitchContoursFromSegments(
  segmentCount: number,
  segments: readonly MutableSegment[],
  planeNormal: THREE.Vector3 = defaultPlaneNormal,
): ExtractSectionContoursResult {
  if (segmentCount === 0) {
    return { closedContours: [], openPolylines: [], diagnostics: [], segmentCount };
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
  const closedContours: THREE.Vector3[][] = [];
  const openPolylines: THREE.Vector3[][] = [];
  const diagnostics: ContourExtractionDiagnostic[] = [];

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

    if (component.size < 2) {
      diagnostics.push({
        kind: 'degenerate-component',
        componentVertexCount: component.size,
        oddVertexCount: 0,
        branchVertexCount: 0,
      });
      continue;
    }

    let allDegreeTwo = true;
    let maxDegree = 0;
    const oddDegreeKeys: string[] = [];
    const branchKeys: string[] = [];
    for (const key of component) {
      const degree = adjacency.get(key)?.size ?? 0;
      maxDegree = Math.max(maxDegree, degree);
      if (degree % 2 === 1) {
        oddDegreeKeys.push(key);
      }

      if (degree > 2) {
        branchKeys.push(key);
      }

      if (degree !== 2) {
        allDegreeTwo = false;
      }
    }

    if (allDegreeTwo) {
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

      if (!cycleWalkSucceeded || cycleKeys.length < 3) {
        diagnostics.push({
          kind: 'degenerate-component',
          componentVertexCount: component.size,
          oddVertexCount: oddDegreeKeys.length,
          branchVertexCount: branchKeys.length,
        });
        continue;
      }

      closedContours.push(cycleKeys.map((key) => keyToPoint.get(key)!.clone()));
      continue;
    }

    if (maxDegree <= 2 && oddDegreeKeys.length === 2) {
      const pathStart = oddDegreeKeys.sort()[0]!;
      const pathKeys: string[] = [pathStart];
      let previousKey: string | undefined;
      let currentKey = pathStart;
      let pathWalkSucceeded = true;

      for (;;) {
        const neighbors = [...(adjacency.get(currentKey) ?? [])].sort();
        let nextKey: string | undefined;
        for (const neighbor of neighbors) {
          if (neighbor !== previousKey) {
            nextKey = neighbor;
            break;
          }
        }

        if (nextKey === undefined) {
          break;
        }

        previousKey = currentKey;
        currentKey = nextKey;
        pathKeys.push(currentKey);
      }

      if (pathKeys.length !== component.size) {
        pathWalkSucceeded = false;
      }

      if (pathWalkSucceeded && pathKeys.length >= 2) {
        openPolylines.push(pathKeys.map((key) => keyToPoint.get(key)!.clone()));
      } else {
        diagnostics.push({
          kind: 'degenerate-component',
          componentVertexCount: component.size,
          oddVertexCount: oddDegreeKeys.length,
          branchVertexCount: branchKeys.length,
        });
      }

      continue;
    }

    closedContours.push(
      ...extractBoundedFacesFromBranchedComponent({
        component,
        adjacency,
        keyToPoint,
        planeNormal,
      }),
    );

    diagnostics.push({
      kind: 'branched-component',
      componentVertexCount: component.size,
      oddVertexCount: oddDegreeKeys.length,
      branchVertexCount: branchKeys.length,
    });

    for (const keyA of [...component].sort()) {
      for (const keyB of [...(adjacency.get(keyA) ?? [])].sort()) {
        if (keyB <= keyA) {
          continue;
        }

        openPolylines.push([keyToPoint.get(keyA)!.clone(), keyToPoint.get(keyB)!.clone()]);
      }
    }
  }

  return { closedContours, openPolylines, diagnostics, segmentCount };
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

export type ExtractSectionContoursInput = Readonly<{
  geometry: THREE.BufferGeometry;
  bvh: MeshBVH;
  worldPlane: THREE.Plane;
  meshWorldMatrix: THREE.Matrix4;
  segmentScratch: SegmentScratch;
  triangleFilter?: TriangleFilter;
}>;

export function extractSectionContours(input: ExtractSectionContoursInput): ExtractSectionContoursResult {
  void input.geometry;
  _inverseMatrix.copy(input.meshWorldMatrix).invert();
  _localPlane.copy(input.worldPlane).applyMatrix4(_inverseMatrix);

  resetSegmentScratch(input.segmentScratch);
  collectPlaneMeshSegments({
    bvh: input.bvh,
    localPlane: _localPlane,
    scratch: input.segmentScratch,
    triangleFilter: input.triangleFilter,
  });
  dedupePlaneSegments(input.segmentScratch);
  snapScratchSegmentEndpoints(input.segmentScratch);
  dedupePlaneSegments(input.segmentScratch);

  return stitchContoursFromSegments(input.segmentScratch.count, input.segmentScratch.slots, _localPlane.normal);
}
