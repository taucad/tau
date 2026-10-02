import * as THREE from 'three';

export type MeasurementEvidence = 'mesh' | 'fitted';
export type MeasurementFeatureKind = 'edge' | 'circle' | 'face' | 'body';

type FeatureBase = { id: string; evidence: MeasurementEvidence; kind: MeasurementFeatureKind };
export type EdgeFeature = FeatureBase & {
  kind: 'edge';
  points: THREE.Vector3[];
  closed: boolean;
  length: number;
  regionId: string;
  loopRole: 'outer' | 'hole' | 'open';
};
export type CircleFeature = FeatureBase & {
  kind: 'circle';
  points: THREE.Vector3[];
  center: THREE.Vector3;
  radius: number;
  maxResidual: number;
  rmsResidual: number;
  angularCoverage: number;
  normal: THREE.Vector3;
  regionId: string;
  loopRole: 'outer' | 'hole';
};
export type FaceFeature = FeatureBase & {
  kind: 'face';
  normal: THREE.Vector3;
  planar: boolean;
  centroid: THREE.Vector3;
  centroidOnSurface: boolean;
  area: number;
  triangleIndices: number[];
  loopIds: string[];
};
export type BodyFeature = FeatureBase & { kind: 'body'; bounds: THREE.Box3; points: THREE.Vector3[] };
export type MeshFeature = EdgeFeature | CircleFeature | FaceFeature | BodyFeature;
export type MeshFeatureGraph = {
  geometry: THREE.BufferGeometry;
  revision: string;
  features: MeshFeature[];
  triangleRegion: number[];
  triangleBody: number[];
  triangleFeatureId: string[];
};
export type MeasurementTarget = {
  id: string;
  featureId: string;
  kind: 'endpoint' | 'midpoint' | 'nearest' | 'center' | 'centroid' | 'edge' | 'face' | 'body' | 'surface';
  position: THREE.Vector3;
  localPosition: THREE.Vector3;
  evidence: MeasurementEvidence;
  distancePx: number;
  label: string;
  feature: MeshFeature;
  sourceMesh: THREE.Object3D;
  revision: string;
  occurrenceId?: string;
};
export type FeatureMeasurement = {
  operation:
    | 'length'
    | 'radius'
    | 'diameter'
    | 'distance'
    | 'minimum-distance'
    | 'center-distance'
    | 'plane-spacing'
    | 'angle'
    | 'extent';
  value: number;
  evidence: MeasurementEvidence;
  witnesses: THREE.Vector3[];
  label: string;
  fit?: { maxResidual: number; rmsResidual: number; angularCoverage: number };
};

type Triangle = { a: number; b: number; c: number; normal: THREE.Vector3; area: number; centroid: THREE.Vector3 };
type Incidence = { a: number; b: number; triangles: number[] };
type Region = { triangles: number[]; normal: THREE.Vector3; origin: THREE.Vector3 };
type CachedGraph = { signature: string; graph: MeshFeatureGraph };
const graphs = new WeakMap<THREE.BufferGeometry, CachedGraph>();
const occurrenceGraphs = new WeakMap<THREE.Mesh, CachedGraph>();
const objectIds = new WeakMap<THREE.BufferAttribute | THREE.InterleavedBufferAttribute | TopologyAssociation, number>();
let nextObjectId = 0;
const normalAgreement = 0.9995;

function objectId(value: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | TopologyAssociation): number {
  let id = objectIds.get(value);
  if (id === undefined) {
    id = ++nextObjectId;
    objectIds.set(value, id);
  }
  return id;
}

function finite(point: THREE.Vector3): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function geometrySignature(geometry: THREE.BufferGeometry): string {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const positionVersion =
    position instanceof THREE.InterleavedBufferAttribute ? position.data.version : position.version;
  return `${objectId(position)}:${positionVersion}:${position.count}:${index ? objectId(index) : -1}:${index?.version ?? -1}:${index?.count ?? 0}`;
}

function weld(positions: THREE.Vector3[], tolerance: number): number[] {
  const buckets = new Map<string, number[]>();
  const indices: number[] = [];
  const toleranceSquared = tolerance * tolerance;
  for (const [index, point] of positions.entries()) {
    const cell = [Math.floor(point.x / tolerance), Math.floor(point.y / tolerance), Math.floor(point.z / tolerance)];
    let match: number | undefined;
    for (let x = -1; x <= 1 && match === undefined; x++) {
      for (let y = -1; y <= 1 && match === undefined; y++) {
        for (let z = -1; z <= 1 && match === undefined; z++) {
          match = (buckets.get(`${cell[0]! + x}|${cell[1]! + y}|${cell[2]! + z}`) ?? []).find(
            (candidate) => positions[candidate]!.distanceToSquared(point) <= toleranceSquared,
          );
        }
      }
    }
    indices.push(match ?? index);
    if (match === undefined) {
      const key = cell.join('|');
      const bucket = buckets.get(key) ?? [];
      bucket.push(index);
      buckets.set(key, bucket);
    }
  }
  return indices;
}

function planeAxes(normal: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  const reference = Math.abs(normal.x) < 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = reference.addScaledVector(normal, -reference.dot(normal)).normalize();
  return [u, new THREE.Vector3().crossVectors(normal, u).normalize()];
}

function pointInLoop(point: THREE.Vector3, loop: THREE.Vector3[], normal: THREE.Vector3): boolean {
  const [u, v] = planeAxes(normal);
  const x = point.dot(u);
  const y = point.dot(v);
  let inside = false;
  for (let index = 0, previous = loop.length - 1; index < loop.length; previous = index++) {
    const a = loop[previous]!;
    const b = loop[index]!;
    const ax = a.dot(u);
    const ay = a.dot(v);
    const bx = b.dot(u);
    const by = b.dot(v);
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) {
      inside = !inside;
    }
  }
  return inside;
}

// oxlint-disable-next-line max-params -- A point and three triangle corners define the bounded containment query.
function pointOnTriangle(
  point: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  tolerance: number,
): boolean {
  const v0 = c.clone().sub(a);
  const v1 = b.clone().sub(a);
  const v2 = point.clone().sub(a);
  const d00 = v0.dot(v0);
  const d01 = v0.dot(v1);
  const d11 = v1.dot(v1);
  const d20 = v2.dot(v0);
  const d21 = v2.dot(v1);
  const denominator = d00 * d11 - d01 * d01;
  if (!(denominator > 0)) {
    return false;
  }
  const v = (d11 * d20 - d01 * d21) / denominator;
  const w = (d00 * d21 - d01 * d20) / denominator;
  return v >= -tolerance && w >= -tolerance && v + w <= 1 + tolerance;
}

function comparePoints(a: THREE.Vector3, b: THREE.Vector3): number {
  return a.x - b.x || a.y - b.y || a.z - b.z;
}

function boundaryPaths(
  edges: Array<[number, number]>,
  positions: THREE.Vector3[],
): Array<{ indices: number[]; closed: boolean }> {
  const adjacency = new Map<number, number[]>();
  for (const [a, b] of edges) {
    adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
  }
  const used = new Set<string>();
  const paths: Array<{ indices: number[]; closed: boolean }> = [];
  const compareIndices = (a: number, b: number): number => comparePoints(positions[a]!, positions[b]!);
  const starts = [...adjacency.keys()].sort(
    (a, b) =>
      (adjacency.get(a)!.length === 2 ? 1 : 0) - (adjacency.get(b)!.length === 2 ? 1 : 0) || compareIndices(a, b),
  );
  for (const start of starts) {
    for (const first of [...(adjacency.get(start) ?? [])].sort(compareIndices)) {
      if (used.has(edgeKey(start, first))) {
        continue;
      }
      const indices = [start];
      let previous = start;
      let current = first;
      let closed = false;
      for (let step = 0; step <= edges.length; step++) {
        used.add(edgeKey(previous, current));
        if (current === start) {
          closed = true;
          break;
        }
        indices.push(current);
        const neighbors = adjacency.get(current)!;
        if (neighbors.length !== 2) {
          break;
        } // Ambiguous non-manifold junction: retain an open chain.
        const next = neighbors[0] === previous ? neighbors[1]! : neighbors[0]!;
        if (used.has(edgeKey(current, next))) {
          break;
        }
        previous = current;
        current = next;
      }
      if (indices.length > 1 && indices.every((index) => adjacency.get(index)!.length <= 2)) {
        paths.push({ indices, closed });
      }
    }
  }
  return paths.sort((a, b) => compareIndices(a.indices[0]!, b.indices[0]!));
}

function splitPathAtCorners(
  points: THREE.Vector3[],
  closed: boolean,
  tolerance: number,
): Array<{ points: THREE.Vector3[]; closed: boolean }> {
  if (points.length < 3) {
    return [{ points, closed }];
  }
  const corners: number[] = [];
  for (let i = 0; i < points.length; i++) {
    if (!closed && (i === 0 || i === points.length - 1)) {
      corners.push(i);
      continue;
    }
    const previous = points[(i + points.length - 1) % points.length]!;
    const current = points[i]!;
    const next = points[(i + 1) % points.length]!;
    const before = current.clone().sub(previous);
    const after = next.clone().sub(current);
    if (before.lengthSq() <= tolerance * tolerance || after.lengthSq() <= tolerance * tolerance) {
      continue;
    }
    if (before.normalize().dot(after.normalize()) < 0.94) {
      corners.push(i);
    }
  }
  if (corners.length === 0) {
    return [{ points, closed }];
  }
  if (closed && corners.length === 1) {
    return [{ points, closed }];
  }
  const chains: Array<{ points: THREE.Vector3[]; closed: boolean }> = [];
  for (let i = 0; i < corners.length - (closed ? 0 : 1); i++) {
    const start = corners[i]!;
    const end = corners[(i + 1) % corners.length]!;
    const chain = [points[start]!];
    for (let cursor = (start + 1) % points.length; cursor !== end; cursor = (cursor + 1) % points.length) {
      chain.push(points[cursor]!);
    }
    chain.push(points[end]!);
    chains.push({ points: chain, closed: false });
  }
  return chains;
}

function pathLength(points: THREE.Vector3[], closed: boolean): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += points[i - 1]!.distanceTo(points[i]!);
  }
  if (closed) {
    length += points.at(-1)!.distanceTo(points[0]!);
  }
  return length;
}

function halfwayOnPath(points: THREE.Vector3[], closed: boolean): THREE.Vector3 {
  const halfway = pathLength(points, closed) * 0.5;
  let traversed = 0;
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const length = a.distanceTo(b);
    if (traversed + length >= halfway) {
      return a.clone().lerp(b, (halfway - traversed) / (length || 1));
    }
    traversed += length;
  }
  return points.at(-1)!.clone();
}

function fitCircle(
  points: THREE.Vector3[],
  normal: THREE.Vector3,
  tolerance: number,
):
  | { center: THREE.Vector3; radius: number; maxResidual: number; rmsResidual: number; angularCoverage: number }
  | undefined {
  if (points.length < 12) {
    return undefined;
  }
  const origin = new THREE.Vector3();
  for (const point of points) {
    origin.add(point);
  }
  origin.multiplyScalar(1 / points.length);
  const [u, v] = planeAxes(normal);
  const coordinates = points.map((point) => ({
    x: point.clone().sub(origin).dot(u),
    y: point.clone().sub(origin).dot(v),
  }));
  let scale = 0;
  for (const { x, y } of coordinates) {
    scale = Math.max(scale, Math.hypot(x, y));
  }
  if (!(scale > tolerance)) {
    return undefined;
  }
  let xx = 0;
  let xy = 0;
  let yy = 0;
  let xz = 0;
  let yz = 0;
  let zz = 0;
  for (const point of coordinates) {
    const x = point.x / scale;
    const y = point.y / scale;
    const z = x * x + y * y;
    xx += x * x;
    xy += x * y;
    yy += y * y;
    xz += x * z;
    yz += y * z;
    zz += z;
  }
  // Centered coordinates remove the linear row. Solve x²+y² = 2cx*x + 2cy*y + 2c.
  const determinant = xx * yy - xy * xy;
  if (determinant < points.length * points.length * 0.001) {
    return undefined;
  }
  const cx = (xz * yy - yz * xy) / (2 * determinant);
  const cy = (yz * xx - xz * xy) / (2 * determinant);
  const c = zz / (2 * points.length);
  const radius = Math.sqrt(cx * cx + cy * cy + 2 * c) * scale;
  if (!(radius > tolerance) || !Number.isFinite(radius)) {
    return undefined;
  }
  const center = origin
    .clone()
    .addScaledVector(u, cx * scale)
    .addScaledVector(v, cy * scale);
  let maxError = 0;
  let sumSquared = 0;
  let maxStep = 0;
  let angularCoverage = 0;
  let turnSign = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i]!;
    const next = points[(i + 1) % points.length]!;
    const error = Math.abs(current.distanceTo(center) - radius);
    maxError = Math.max(maxError, error);
    sumSquared += error * error;
    const a = current.clone().sub(center);
    const b = next.clone().sub(center);
    const turn = normal.dot(new THREE.Vector3().crossVectors(a, b));
    if (Math.abs(turn) > tolerance * tolerance) {
      const sign = Math.sign(turn);
      if (turnSign && sign !== turnSign) {
        return undefined;
      }
      turnSign = sign;
    }
    const step = a.angleTo(b);
    maxStep = Math.max(maxStep, step);
    angularCoverage += step;
    if (Math.abs(current.clone().sub(origin).dot(normal)) > tolerance * 4) {
      return undefined;
    }
  }
  const rmsResidual = Math.sqrt(sumSquared / points.length);
  if (
    maxStep > Math.PI / 3 ||
    maxError > Math.max(tolerance * 4, radius * 0.005) ||
    rmsResidual > Math.max(tolerance * 2, radius * 0.002)
  ) {
    return undefined;
  }
  return { center, radius, maxResidual: maxError, rmsResidual, angularCoverage };
}

function buildGraph(geometry: THREE.BufferGeometry, revision: string): MeshFeatureGraph {
  const attribute = geometry.getAttribute('position') as
    | THREE.BufferAttribute
    | THREE.InterleavedBufferAttribute
    | undefined;
  if (!attribute || attribute.itemSize < 3) {
    return { geometry, revision, features: [], triangleRegion: [], triangleBody: [], triangleFeatureId: [] };
  }
  const positions = Array.from({ length: attribute.count }, (_, index) =>
    new THREE.Vector3().fromBufferAttribute(attribute, index),
  );
  if (positions.some((point) => !finite(point))) {
    return { geometry, revision, features: [], triangleRegion: [], triangleBody: [], triangleFeatureId: [] };
  }
  const bounds = new THREE.Box3().setFromPoints(positions);
  const size = bounds.getSize(new THREE.Vector3()).length();
  const magnitude = Math.max(
    Math.abs(bounds.min.x),
    Math.abs(bounds.min.y),
    Math.abs(bounds.min.z),
    Math.abs(bounds.max.x),
    Math.abs(bounds.max.y),
    Math.abs(bounds.max.z),
  );
  const storage = attribute.array instanceof Float32Array ? 2 ** -23 : Number.EPSILON;
  const tolerance = Math.max(size, magnitude, Number.MIN_VALUE) * storage * 2;
  const canonical = weld(positions, tolerance);
  const indices = geometry.getIndex()?.array;
  const count = indices?.length ?? positions.length;
  const triangles: Triangle[] = [];
  const incidence = new Map<string, Incidence>();
  for (let offset = 0; offset + 2 < count; offset += 3) {
    const a = canonical[indices?.[offset] ?? offset]!;
    const b = canonical[indices?.[offset + 1] ?? offset + 1]!;
    const c = canonical[indices?.[offset + 2] ?? offset + 2]!;
    const pa = positions[a]!;
    const pb = positions[b]!;
    const pc = positions[c]!;
    const cross = new THREE.Vector3().crossVectors(pb.clone().sub(pa), pc.clone().sub(pa));
    const area = cross.length() * 0.5;
    if (a === b || b === c || c === a || !(area > tolerance * tolerance)) {
      triangles.push({ a, b, c, normal: new THREE.Vector3(), area: 0, centroid: new THREE.Vector3() });
      continue;
    }
    const triangleIndex = triangles.length;
    triangles.push({
      a,
      b,
      c,
      normal: cross.normalize(),
      area,
      centroid: pa
        .clone()
        .add(pb)
        .add(pc)
        .multiplyScalar(1 / 3),
    });
    for (const [from, to] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = edgeKey(from!, to!);
      const edge = incidence.get(key) ?? { a: from!, b: to!, triangles: [] };
      edge.triangles.push(triangleIndex);
      incidence.set(key, edge);
    }
  }
  const neighbors: number[][] = Array.from({ length: triangles.length }, () => []);
  for (const edge of incidence.values()) {
    if (edge.triangles.length === 2) {
      const [a, b] = edge.triangles;
      neighbors[a!]!.push(b!);
      neighbors[b!]!.push(a!);
    }
  }
  const triangleBody = Array.from({ length: triangles.length }, () => -1);
  const bodyVertices: Array<Set<number>> = [];
  for (let start = 0; start < triangles.length; start++) {
    if (!triangles[start]!.area || triangleBody[start] !== -1) {
      continue;
    }
    const bodyIndex = bodyVertices.length;
    const vertices = new Set<number>();
    const queue = [start];
    triangleBody[start] = bodyIndex;
    // oxlint-disable-next-line typescript/prefer-for-of -- The flood-fill queue grows while traversing.
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor]!;
      const triangle = triangles[index]!;
      vertices.add(triangle.a);
      vertices.add(triangle.b);
      vertices.add(triangle.c);
      for (const other of neighbors[index]!) {
        if (triangleBody[other] !== -1) {
          continue;
        }
        triangleBody[other] = bodyIndex;
        queue.push(other);
      }
    }
    bodyVertices.push(vertices);
  }
  const originalBodies = [...bodyVertices];
  const bodyAnchor = (vertices: Set<number>): THREE.Vector3 => {
    let minimum: THREE.Vector3 | undefined;
    for (const vertex of vertices) {
      const point = positions[vertex]!;
      if (!minimum || comparePoints(point, minimum) < 0) {
        minimum = point;
      }
    }
    return minimum!;
  };
  const bodyAnchors = new Map(originalBodies.map((vertices) => [vertices, bodyAnchor(vertices)]));
  bodyVertices.sort((a, b) => comparePoints(bodyAnchors.get(a)!, bodyAnchors.get(b)!));
  const bodyOrder = new Map(bodyVertices.map((vertices, index) => [vertices, index]));
  for (let index = 0; index < triangleBody.length; index++) {
    const previous = triangleBody[index]!;
    if (previous >= 0) {
      triangleBody[index] = bodyOrder.get(originalBodies[previous]!)!;
    }
  }
  const triangleRegion = Array.from({ length: triangles.length }, () => -1);
  const regions: Region[] = [];
  for (let start = 0; start < triangles.length; start++) {
    const seed = triangles[start]!;
    if (!seed.area || triangleRegion[start] !== -1) {
      continue;
    }
    const regionIndex = regions.length;
    const region: Region = { triangles: [], normal: seed.normal, origin: positions[seed.a]! };
    const queue = [start];
    triangleRegion[start] = regionIndex;
    // oxlint-disable-next-line typescript/prefer-for-of -- The flood-fill queue grows while traversing.
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor]!;
      region.triangles.push(index);
      for (const other of neighbors[index]!) {
        if (triangleRegion[other] !== -1) {
          continue;
        }
        const candidate = triangles[other]!;
        if (Math.abs(candidate.normal.dot(region.normal)) < normalAgreement) {
          continue;
        }
        if (
          [candidate.a, candidate.b, candidate.c].some(
            (vertex) => Math.abs(positions[vertex]!.clone().sub(region.origin).dot(region.normal)) > tolerance * 4,
          )
        ) {
          continue;
        }
        triangleRegion[other] = regionIndex;
        queue.push(other);
      }
    }
    regions.push(region);
  }
  const originalRegions = [...regions];
  const regionAnchor = (region: Region): THREE.Vector3 => {
    let minimum = positions[triangles[region.triangles[0]!]!.a]!;
    for (const triangleIndex of region.triangles) {
      const triangle = triangles[triangleIndex]!;
      for (const vertex of [triangle.a, triangle.b, triangle.c]) {
        if (comparePoints(positions[vertex]!, minimum) < 0) {
          minimum = positions[vertex]!;
        }
      }
    }
    return minimum;
  };
  const regionAnchors = new Map(originalRegions.map((region) => [region, regionAnchor(region)]));
  regions.sort((a, b) => comparePoints(regionAnchors.get(a)!, regionAnchors.get(b)!));
  const regionOrder = new Map(regions.map((region, index) => [region, index]));
  for (let index = 0; index < triangleRegion.length; index++) {
    const previous = triangleRegion[index]!;
    if (previous >= 0) {
      triangleRegion[index] = regionOrder.get(originalRegions[previous]!)!;
    }
  }
  const featureBoundaries: Array<Array<[number, number]>> = Array.from({ length: regions.length }, () => []);
  for (const edge of incidence.values()) {
    const memberships = edge.triangles
      .map((triangle) => triangleRegion[triangle])
      .filter((region): region is number => region !== undefined && region !== -1);
    for (const region of new Set(memberships)) {
      if (memberships.filter((membership) => membership === region).length === 1) {
        featureBoundaries[region]!.push([edge.a, edge.b]);
      }
    }
  }
  const features: MeshFeature[] = [];
  const hardEdgeCos = Math.cos(Math.PI / 9);
  for (const [regionIndex, region] of regions.entries()) {
    const regionId = `face:${regionIndex}`;
    const boundary = featureBoundaries[regionIndex]!;
    const supportedBoundary = boundary.some(([a, b]) => {
      const edge = incidence.get(edgeKey(a, b))!;
      return (
        edge.triangles.length === 1 ||
        (edge.triangles.length === 2 &&
          Math.abs(triangles[edge.triangles[0]!]!.normal.dot(triangles[edge.triangles[1]!]!.normal)) < hardEdgeCos)
      );
    });
    // Smooth tessellation islands are not authored faces; retain a surface-point path instead.
    if (!supportedBoundary) {
      continue;
    }
    const loops: string[] = [];
    const paths = boundaryPaths(boundary, positions);
    for (const [pathIndex, path] of paths.entries()) {
      const raw = path.indices.map((index) => positions[index]!);
      const containing = path.closed
        ? paths.filter(
            (other) =>
              other !== path &&
              other.closed &&
              pointInLoop(
                raw[0]!,
                other.indices.map((index) => positions[index]!),
                region.normal,
              ),
          ).length
        : 0;
      const loopRole = path.closed ? (containing % 2 === 1 ? 'hole' : 'outer') : 'open';
      const chains = splitPathAtCorners(raw, path.closed, tolerance);
      for (const [chainIndex, chain] of chains.entries()) {
        const id = `edge:${regionIndex}:${pathIndex}:${chainIndex}`;
        features.push({
          id,
          kind: 'edge',
          evidence: 'mesh',
          points: chain.points,
          closed: chain.closed,
          length: pathLength(chain.points, chain.closed),
          regionId,
          loopRole,
        });
        loops.push(id);
      }
      if (path.closed) {
        const circle = fitCircle(raw, region.normal, tolerance);
        if (circle) {
          features.push({
            id: `circle:${regionIndex}:${pathIndex}`,
            kind: 'circle',
            evidence: 'fitted',
            points: raw,
            ...circle,
            normal: region.normal,
            regionId,
            loopRole: loopRole === 'hole' ? 'hole' : 'outer',
          });
        }
      }
    }
    let area = 0;
    const centroid = new THREE.Vector3();
    for (const index of region.triangles) {
      const triangle = triangles[index]!;
      area += triangle.area;
      centroid.addScaledVector(triangle.centroid, triangle.area);
    }
    if (!(area > 0)) {
      continue;
    }
    centroid.multiplyScalar(1 / area);
    const onSurface = region.triangles.some((index) => {
      const triangle = triangles[index]!;
      return pointOnTriangle(
        centroid,
        positions[triangle.a]!,
        positions[triangle.b]!,
        positions[triangle.c]!,
        tolerance / Math.max(size, Number.MIN_VALUE),
      );
    });
    features.push({
      id: regionId,
      kind: 'face',
      evidence: 'mesh',
      normal: region.normal,
      planar: true,
      centroid,
      centroidOnSurface: onSurface,
      area,
      triangleIndices: region.triangles,
      loopIds: loops,
    });
  }
  for (const [index, vertices] of bodyVertices.entries()) {
    const points = [...vertices].map((vertex) => positions[vertex]!);
    features.push({
      id: `body:${index}`,
      kind: 'body',
      evidence: 'mesh',
      bounds: new THREE.Box3().setFromPoints(points),
      points,
    });
  }
  return {
    geometry,
    revision,
    features,
    triangleRegion,
    triangleBody,
    triangleFeatureId: triangleRegion.map((index) => (index < 0 ? '' : `face:${index}`)),
  };
}

export type TopologyAssociation = {
  occurrenceId?: string;
  componentId?: string;
  kind: 'surface' | 'line';
  faces?: Array<{ id: string; start: number; count: number }>;
  edges?: Array<{ id: string; start: number; count: number }>;
};

type GeometryObject = THREE.Object3D & { geometry: THREE.BufferGeometry };
const lineGraphs = new WeakMap<THREE.Object3D, CachedGraph>();

/** Build source edge polylines from GLTF line spans, including fat-line replacements. */
export function getLineMeasurementFeatures(line: GeometryObject): MeshFeatureGraph {
  const association = line.userData['measurementFeatures'] as TopologyAssociation | undefined;
  const { geometry } = line;
  const start = geometry.getAttribute('instanceStart') as
    | THREE.BufferAttribute
    | THREE.InterleavedBufferAttribute
    | undefined;
  const end = geometry.getAttribute('instanceEnd') as
    | THREE.BufferAttribute
    | THREE.InterleavedBufferAttribute
    | undefined;
  const position = geometry.getAttribute('position') as
    | THREE.BufferAttribute
    | THREE.InterleavedBufferAttribute
    | undefined;
  const indices = start ? undefined : geometry.getIndex();
  const attributeVersion = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined): number =>
    attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.version : (attribute?.version ?? -1);
  const signature = `${association ? objectId(association) : -1}:${start ? objectId(start) : -1}:${attributeVersion(start)}:${end ? objectId(end) : -1}:${attributeVersion(end)}:${position ? objectId(position) : -1}:${attributeVersion(position)}:${indices ? objectId(indices) : -1}:${attributeVersion(indices ?? undefined)}`;
  const cached = lineGraphs.get(line);
  if (cached?.signature === signature) {
    return cached.graph;
  }
  const features: MeshFeature[] = [];
  if (association?.kind === 'line' && association.edges?.length) {
    const read = (segment: number): [THREE.Vector3, THREE.Vector3] | undefined => {
      if (start && end && segment < Math.min(start.count, end.count)) {
        return [
          new THREE.Vector3(start.getX(segment), start.getY(segment), start.getZ(segment)),
          new THREE.Vector3(end.getX(segment), end.getY(segment), end.getZ(segment)),
        ];
      }
      if (position && segment * 2 + 1 < (indices?.count ?? position.count)) {
        const first = indices?.getX(segment * 2) ?? segment * 2;
        const second = indices?.getX(segment * 2 + 1) ?? segment * 2 + 1;
        if (![first, second].every((index) => Number.isInteger(index) && index >= 0 && index < position.count)) {
          return undefined;
        }
        return [
          new THREE.Vector3().fromBufferAttribute(position, first),
          new THREE.Vector3().fromBufferAttribute(position, second),
        ];
      }
      return undefined;
    };
    for (const group of association.edges) {
      const first = Math.ceil(group.start / 2);
      const last = Math.floor((group.start + group.count) / 2);
      const chains: THREE.Vector3[][] = [];
      let current: THREE.Vector3[] = [];
      for (let segment = first; segment < last; segment++) {
        const endpoints = read(segment);
        if (!endpoints || !endpoints.every((point) => finite(point))) {
          continue;
        }
        if (current.length > 0 && current.at(-1)!.distanceToSquared(endpoints[0]) > 1e-16) {
          chains.push(current);
          current = [];
        }
        if (current.length === 0) {
          current.push(endpoints[0]);
        }
        current.push(endpoints[1]);
      }
      if (current.length > 0) {
        chains.push(current);
      }
      for (const [index, chain] of chains.entries()) {
        const closed = chain.length > 2 && chain[0]!.distanceToSquared(chain.at(-1)!) <= 1e-16;
        const points = closed ? chain.slice(0, -1) : chain;
        features.push({
          id: `topology:${association.componentId ?? 'component'}:${group.id}:${index}`,
          kind: 'edge',
          evidence: 'mesh',
          points,
          closed,
          length: pathLength(points, closed),
          regionId: 'line',
          loopRole: closed ? 'outer' : 'open',
        });
      }
    }
  }
  const graph: MeshFeatureGraph = {
    geometry,
    revision: `${geometry.id}:${signature}`,
    features,
    triangleRegion: [],
    triangleBody: [],
    triangleFeatureId: [],
  };
  lineGraphs.set(line, { signature, graph });
  return graph;
}

function addTopologyFaces(base: MeshFeatureGraph, association: TopologyAssociation): MeshFeatureGraph {
  if (association.kind !== 'surface' || !association.faces?.length) {
    return base;
  }
  const { geometry } = base;
  const attribute = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const features = [...base.features];
  const triangleFeatureId = [...base.triangleFeatureId];
  const read = (offset: number): THREE.Vector3 =>
    new THREE.Vector3().fromBufferAttribute(attribute, index?.getX(offset) ?? offset);
  for (const group of association.faces) {
    const first = Math.ceil(group.start / 3);
    const last = Math.min(triangleFeatureId.length, Math.floor((group.start + group.count) / 3));
    const id = `topology:${association.componentId ?? 'component'}:${group.id}`;
    let area = 0;
    const centroid = new THREE.Vector3();
    let normal: THREE.Vector3 | undefined;
    let origin: THREE.Vector3 | undefined;
    let planar = true;
    const triangleIndices: number[] = [];
    for (let triangle = first; triangle < last; triangle++) {
      const a = read(triangle * 3);
      const b = read(triangle * 3 + 1);
      const c = read(triangle * 3 + 2);
      const cross = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
      const weight = cross.length() * 0.5;
      if (!(weight > 0) || !finite(a) || !finite(b) || !finite(c)) {
        continue;
      }
      const direction = cross.normalize();
      normal ??= direction;
      origin ??= a;
      if (
        Math.abs(direction.dot(normal)) < normalAgreement ||
        Math.max(
          Math.abs(a.clone().sub(origin).dot(normal)),
          Math.abs(b.clone().sub(origin).dot(normal)),
          Math.abs(c.clone().sub(origin).dot(normal)),
        ) >
          Math.sqrt(weight) * 1e-5
      ) {
        planar = false;
      }
      area += weight;
      centroid.addScaledVector(
        a
          .add(b)
          .add(c)
          .multiplyScalar(1 / 3),
        weight,
      );
      triangleIndices.push(triangle);
      triangleFeatureId[triangle] = id;
    }
    if (!(area > 0) || !normal) {
      continue;
    }
    centroid.multiplyScalar(1 / area);
    features.push({
      id,
      kind: 'face',
      evidence: 'mesh',
      normal,
      planar,
      centroid,
      centroidOnSurface: false,
      area,
      triangleIndices,
      loopIds: [],
    });
  }
  return {
    ...base,
    revision: `${base.revision}:topology:${association.componentId ?? ''}`,
    features,
    triangleFeatureId,
  };
}

/** Return a prepared graph without running the potentially expensive geometry analysis. */
export function getCachedMeshMeasurementFeatures(mesh: THREE.Mesh): MeshFeatureGraph | undefined {
  const { geometry } = mesh;
  const signature = geometrySignature(geometry);
  const association = mesh.userData['measurementFeatures'] as TopologyAssociation | undefined;
  if (association?.faces?.length) {
    const occurrence = occurrenceGraphs.get(mesh);
    return occurrence?.signature === `${signature}:${objectId(association)}` ? occurrence.graph : undefined;
  }
  const cached = graphs.get(geometry);
  return cached?.signature === signature ? cached.graph : undefined;
}

/** Install a fully received worker graph only if its geometry and occurrence still match. */
export function installMeshMeasurementFeatures(mesh: THREE.Mesh, signature: string, graph: MeshFeatureGraph): boolean {
  if (geometrySignature(mesh.geometry) !== signature || graph.geometry !== mesh.geometry) {
    return false;
  }
  const association = mesh.userData['measurementFeatures'] as TopologyAssociation | undefined;
  if (association?.faces?.length) {
    occurrenceGraphs.set(mesh, { signature: `${signature}:${objectId(association)}`, graph });
  } else {
    graphs.set(mesh.geometry, { signature, graph });
  }
  return true;
}

/** Capture the same revision used by the synchronous cache and worker result. */
export function getMeshMeasurementSignature(mesh: THREE.Mesh): string {
  return geometrySignature(mesh.geometry);
}

/** Analyze local mesh geometry once per attribute/index revision; occurrence transforms remain outside the cache. */
export function getMeshMeasurementFeatures(mesh: THREE.Mesh): MeshFeatureGraph {
  const { geometry } = mesh;
  const signature = geometrySignature(geometry);
  const association = mesh.userData['measurementFeatures'] as TopologyAssociation | undefined;
  const ready = getCachedMeshMeasurementFeatures(mesh);
  if (ready) {
    return ready;
  }
  const cached = graphs.get(geometry);
  const base = cached?.signature === signature ? cached.graph : buildGraph(geometry, `${geometry.id}:${signature}`);
  if (base !== cached?.graph) {
    graphs.set(geometry, { signature, graph: base });
  }
  if (!association?.faces?.length) {
    return base;
  }
  const occurrenceSignature = `${signature}:${objectId(association)}`;
  const occurrence = occurrenceGraphs.get(mesh);
  if (occurrence?.signature === occurrenceSignature) {
    return occurrence.graph;
  }
  const graph = addTopologyFaces(base, association);
  occurrenceGraphs.set(mesh, { signature: occurrenceSignature, graph });
  return graph;
}

function visibleClip(point: THREE.Vector3, matrix: THREE.Matrix4): boolean {
  const { elements } = matrix;
  const { x } = point;
  const { y } = point;
  const { z } = point;
  const cx = elements[0] * x + elements[4] * y + elements[8] * z + elements[12];
  const cy = elements[1] * x + elements[5] * y + elements[9] * z + elements[13];
  const cz = elements[2] * x + elements[6] * y + elements[10] * z + elements[14];
  const w = elements[3] * x + elements[7] * y + elements[11] * z + elements[15];
  return w > 0 && Math.abs(cx) <= w && Math.abs(cy) <= w && Math.abs(cz) <= w;
}

// oxlint-disable-next-line max-params -- Endpoint, projection and viewport coordinates are distinct geometric inputs.
export function nearestProjectedSegment(
  a: THREE.Vector3,
  b: THREE.Vector3,
  matrix: THREE.Matrix4,
  mouse: THREE.Vector2,
  width: number,
  height: number,
): { point: THREE.Vector3; distance: number } | undefined {
  const av = new THREE.Vector4(a.x, a.y, a.z, 1).applyMatrix4(matrix);
  const bv = new THREE.Vector4(b.x, b.y, b.z, 1).applyMatrix4(matrix);
  // Clip against positive w and the near plane before perspective division.
  let lo = 0;
  let hi = 1;
  for (const [fa, fb] of [
    [av.w - 1e-12, bv.w - 1e-12],
    [av.z + av.w, bv.z + bv.w],
  ] as Array<[number, number]>) {
    if (fa < 0 && fb < 0) {
      return undefined;
    }
    if (fa < 0) {
      lo = Math.max(lo, fa / (fa - fb));
    }
    if (fb < 0) {
      hi = Math.min(hi, fa / (fa - fb));
    }
  }
  if (lo > hi) {
    return undefined;
  }
  const ca = av.clone().lerp(bv, lo);
  const clippedEnd = av.clone().lerp(bv, hi);
  const ax = ca.x / ca.w;
  const ay = ca.y / ca.w;
  const bx = clippedEnd.x / clippedEnd.w;
  const by = clippedEnd.y / clippedEnd.w;
  const dx = (bx - ax) * width * 0.5;
  const dy = (by - ay) * height * 0.5;
  const px = (mouse.x - ax) * width * 0.5;
  const py = (mouse.y - ay) * height * 0.5;
  const s = THREE.MathUtils.clamp((px * dx + py * dy) / (dx * dx + dy * dy || 1), 0, 1);
  const correction = s / clippedEnd.w / ((1 - s) / ca.w + s / clippedEnd.w);
  const t = lo + (hi - lo) * correction;
  const point = a.clone().lerp(b, t);
  if (!visibleClip(point, matrix)) {
    return undefined;
  }
  return { point, distance: Math.hypot(px - s * dx, py - s * dy) };
}

// oxlint-disable-next-line max-params -- Polyline support and screen projection require independent coordinates.
function closestOnPolyline(
  points: THREE.Vector3[],
  closed: boolean,
  matrix: THREE.Matrix4,
  mouse: THREE.Vector2,
  width: number,
  height: number,
): { point: THREE.Vector3; distance: number } | undefined {
  let best: { point: THREE.Vector3; distance: number } | undefined;
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    const candidate = nearestProjectedSegment(
      points[i]!,
      points[(i + 1) % points.length]!,
      matrix,
      mouse,
      width,
      height,
    );
    if (candidate && (!best || candidate.distance < best.distance)) {
      best = candidate;
    }
  }
  return best;
}

function virtualSupportSome(
  feature: MeshFeature,
  graph: MeshFeatureGraph,
  predicate: (point: THREE.Vector3) => boolean,
): boolean {
  if (feature.kind === 'circle' || feature.kind === 'edge' || feature.kind === 'body') {
    return feature.points.some(predicate);
  }
  const attribute = graph.geometry.getAttribute('position');
  const index = graph.geometry.getIndex();
  for (const triangle of feature.triangleIndices) {
    const offset = triangle * 3;
    if (predicate(new THREE.Vector3().fromBufferAttribute(attribute, index?.getX(offset) ?? offset))) {
      return true;
    }
  }
  return false;
}

export function findMeasurementTargets(
  graph: MeshFeatureGraph,
  options: {
    mesh: THREE.Object3D;
    camera: THREE.Camera;
    canvas: HTMLCanvasElement;
    mousePos: THREE.Vector2;
    snapDistancePx: number;
    activeId?: string;
    filter?: 'auto' | 'point' | 'edge' | 'face' | 'circle' | 'body';
    surfaceHit?: THREE.Vector3;
    faceIndex?: number;
    isKept?: (world: THREE.Vector3) => boolean;
    isVisible?: (world: THREE.Vector3, feature: MeshFeature, kind: MeasurementTarget['kind']) => boolean;
    maxResults?: number;
  },
): MeasurementTarget[] {
  const {
    mesh,
    camera,
    canvas,
    mousePos,
    snapDistancePx,
    activeId,
    filter = 'auto',
    isKept,
    isVisible,
    surfaceHit,
    faceIndex,
    maxResults = 5,
  } = options;
  if (!mesh.visible || graph.features.length === 0) {
    return [];
  }
  mesh.updateWorldMatrix(true, false);
  camera.updateWorldMatrix(true, false);
  const matrix = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse).multiply(mesh.matrixWorld);
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  const candidates: MeasurementTarget[] = [];
  const isVirtual = (kind: MeasurementTarget['kind']): boolean =>
    kind === 'center' || kind === 'centroid' || kind === 'body';
  // oxlint-disable-next-line max-params -- Target identity, point, score and label remain distinct inputs.
  const add = (
    feature: MeshFeature,
    kind: MeasurementTarget['kind'],
    local: THREE.Vector3,
    distance: number,
    label: string,
    suffix = '',
  ): void => {
    const id = `${mesh.uuid}:${graph.revision}:${feature.id}:${kind}${suffix}`;
    if (distance > snapDistancePx * (id === activeId ? 1.5 : 1)) {
      return;
    }
    const position = local.clone().applyMatrix4(mesh.matrixWorld);
    candidates.push({
      id,
      featureId: feature.id,
      kind,
      position,
      localPosition: local.clone(),
      evidence: feature.evidence,
      distancePx: distance,
      label,
      feature,
      sourceMesh: mesh,
      revision: graph.revision,
      occurrenceId: (mesh.userData['measurementFeatures'] as { occurrenceId?: string } | undefined)?.occurrenceId,
    });
  };
  // oxlint-disable-next-line max-params -- A semantic point carries its feature, kind, position and label.
  const point = (
    feature: MeshFeature,
    kind: MeasurementTarget['kind'],
    local: THREE.Vector3,
    label: string,
    suffix = '',
  ): void => {
    if (!isVirtual(kind) && !visibleClip(local, matrix)) {
      return;
    }
    const ndc = local.clone().applyMatrix4(matrix);
    add(
      feature,
      kind,
      local,
      Math.hypot((ndc.x - mousePos.x) * width * 0.5, (ndc.y - mousePos.y) * height * 0.5),
      label,
      suffix,
    );
  };
  if (surfaceHit && finite(surfaceHit)) {
    const localHit = mesh.worldToLocal(surfaceHit.clone());
    const featureId = faceIndex === undefined ? '' : (graph.triangleFeatureId[faceIndex] ?? '');
    const body = faceIndex === undefined ? -1 : (graph.triangleBody[faceIndex] ?? -1);
    for (const feature of graph.features) {
      if (feature.kind === 'face' && feature.id === featureId && (filter === 'auto' || filter === 'face')) {
        add(feature, 'face', localHit, 0, feature.id.startsWith('topology:') ? 'CAD face tessellation' : 'Mesh face');
      }
      if (feature.kind === 'body' && feature.id === `body:${body}` && filter === 'body') {
        add(feature, 'body', localHit, 0, 'Mesh body');
      }
      if (feature.kind === 'body' && feature.id === `body:${body}` && (filter === 'auto' || filter === 'point')) {
        add(feature, 'surface', localHit, 0, 'Mesh surface point', `:${faceIndex ?? ''}`);
      }
    }
  }
  for (const feature of graph.features) {
    if (feature.kind === 'body') {
      if (filter === 'body') {
        point(feature, 'body', feature.bounds.getCenter(new THREE.Vector3()), 'Mesh body');
      }
      continue;
    }
    if (filter === 'body') {
      continue;
    }
    if (filter === 'circle' && feature.kind !== 'circle') {
      continue;
    }
    if (filter === 'face' && feature.kind !== 'face') {
      continue;
    }
    if (filter === 'edge' && feature.kind !== 'edge' && feature.kind !== 'circle') {
      continue;
    }
    switch (feature.kind) {
      case 'edge': {
        if (!feature.closed) {
          point(feature, 'endpoint', feature.points[0]!, 'Edge endpoint', ':start');
          point(feature, 'endpoint', feature.points.at(-1)!, 'Edge endpoint', ':end');
        }
        const midpoint = halfwayOnPath(feature.points, feature.closed);
        point(feature, 'midpoint', midpoint, 'Edge midpoint');
        const nearest = closestOnPolyline(feature.points, feature.closed, matrix, mousePos, width, height);
        if (nearest) {
          add(
            feature,
            filter === 'point' ? 'nearest' : 'edge',
            nearest.point,
            nearest.distance,
            filter === 'point' ? 'Nearest point on mesh edge' : 'Mesh edge',
          );
        }

        break;
      }
      case 'circle': {
        if (filter !== 'point') {
          point(feature, 'center', feature.center, 'Fitted circle center');
        }
        const nearest = closestOnPolyline(feature.points, true, matrix, mousePos, width, height);
        if (nearest) {
          add(feature, 'nearest', nearest.point, nearest.distance, 'Nearest on mesh boundary');
        }

        break;
      }
      case 'face': {
        if (feature.id.startsWith('face:') && graph.triangleFeatureId[feature.triangleIndices[0]!] !== feature.id) {
          continue;
        }
        if (filter !== 'edge' && filter !== 'point' && !(filter === 'face' && surfaceHit)) {
          point(
            feature,
            'centroid',
            feature.centroid,
            feature.centroidOnSurface ? 'Face centroid' : 'Derived face centroid',
          );
        }

        break;
      }
      // No default
    }
  }
  const priority = (candidate: MeasurementTarget): number =>
    ({ endpoint: 0, center: 1, midpoint: 2, edge: 3, nearest: 4, centroid: 5, face: 6, surface: 7, body: 8 })[
      candidate.kind
    ];
  candidates.sort((a, b) => {
    if (
      a.id === activeId &&
      b.id !== activeId &&
      a.distancePx <= snapDistancePx * 1.5 &&
      a.distancePx - b.distancePx < 2
    ) {
      return -1;
    }
    if (
      b.id === activeId &&
      a.id !== activeId &&
      b.distancePx <= snapDistancePx * 1.5 &&
      b.distancePx - a.distancePx < 2
    ) {
      return 1;
    }
    if (Math.abs(a.distancePx - b.distancePx) > 2) {
      return a.distancePx - b.distancePx;
    }
    return priority(a) - priority(b) || a.id.localeCompare(b.id);
  });
  const eligible = (candidate: MeasurementTarget): boolean => {
    const virtual = isVirtual(candidate.kind);
    const visible = virtual
      ? virtualSupportSome(candidate.feature, graph, (point) => visibleClip(point, matrix))
      : visibleClip(candidate.localPosition, matrix);
    if (!visible) {
      return false;
    }
    const kept =
      isKept === undefined ||
      (virtual
        ? virtualSupportSome(candidate.feature, graph, (point) => isKept(point.clone().applyMatrix4(mesh.matrixWorld)))
        : isKept(candidate.localPosition.clone().applyMatrix4(mesh.matrixWorld)));
    return kept && isVisible?.(candidate.position, candidate.feature, candidate.kind) !== false;
  };
  // A hover needs only a few visible results. Keep raycast-heavy occlusion off the full candidate cloud.
  // The keyboard catalog passes bounded graph slices and checks occlusion between scheduled tasks.
  const visibilityBudget =
    isVisible === undefined || maxResults === Number.MAX_VALUE ? Infinity : Math.max(32, maxResults * 4);
  let checked = 0;
  const collect = (source: MeasurementTarget[], limit = visibilityBudget): MeasurementTarget[] => {
    const visible: MeasurementTarget[] = [];
    for (const candidate of source) {
      if (visible.length >= maxResults || checked >= limit) {
        break;
      }
      checked++;
      if (eligible(candidate)) {
        visible.push(candidate);
      }
    }
    return visible;
  };
  if (filter === 'auto' || filter === 'point') {
    const semantic = candidates.filter((candidate) => candidate.kind !== 'surface' && candidate.kind !== 'face');
    const visible = collect(semantic, visibilityBudget - 2);
    if (visible.length > 0) {
      return visible;
    }
    // A hidden or clipped feature must not suppress the picked face/surface fallback.
    return collect(candidates.filter((candidate) => candidate.kind === 'surface' || candidate.kind === 'face'));
  }
  return collect(candidates);
}

/** Feature catalog for the keyboard chooser; pointer targeting still limits visible markers to five. */
export function listMeasurementTargets(
  graph: MeshFeatureGraph,
  options: {
    mesh: THREE.Object3D;
    camera: THREE.Camera;
    canvas: HTMLCanvasElement;
    filter?: 'auto' | 'point' | 'edge' | 'face' | 'circle' | 'body';
    isKept?: (world: THREE.Vector3) => boolean;
    isVisible?: (world: THREE.Vector3, feature: MeshFeature, kind: MeasurementTarget['kind']) => boolean;
  },
): MeasurementTarget[] {
  return findMeasurementTargets(graph, {
    ...options,
    mousePos: new THREE.Vector2(),
    snapDistancePx: Number.MAX_VALUE,
    maxResults: Number.MAX_VALUE,
  }).filter((target) => target.kind !== 'nearest');
}

export function measureFeature(
  target: MeasurementTarget,
  mesh: THREE.Object3D,
  axes?: [THREE.Vector3, THREE.Vector3, THREE.Vector3],
): FeatureMeasurement[] {
  const { feature } = target;
  mesh.updateWorldMatrix(true, false);
  const world = (point: THREE.Vector3): THREE.Vector3 => point.clone().applyMatrix4(mesh.matrixWorld);
  if (feature.kind === 'edge' && target.kind === 'edge') {
    const points = feature.points.map(world);
    return [
      {
        operation: 'length',
        value: pathLength(points, feature.closed),
        evidence: 'mesh',
        witnesses: points,
        label: 'Mesh edge length',
      },
    ];
  }
  if (feature.kind === 'circle') {
    const sx = new THREE.Vector3().setFromMatrixColumn(mesh.matrixWorld, 0).length();
    const sy = new THREE.Vector3().setFromMatrixColumn(mesh.matrixWorld, 1).length();
    const sz = new THREE.Vector3().setFromMatrixColumn(mesh.matrixWorld, 2).length();
    if (Math.max(sx, sy, sz) - Math.min(sx, sy, sz) > Math.max(sx, sy, sz) * 1e-8) {
      return [];
    }
    const radius = feature.radius * sx;
    const fit = {
      maxResidual: feature.maxResidual * sx,
      rmsResidual: feature.rmsResidual * sx,
      angularCoverage: feature.angularCoverage,
    };
    const center = world(feature.center);
    const direction = feature.points[0]!.clone().sub(feature.center).normalize();
    const positive = world(feature.center.clone().addScaledVector(direction, feature.radius));
    const negative = world(feature.center.clone().addScaledVector(direction, -feature.radius));
    return [
      {
        operation: 'radius',
        value: radius,
        evidence: 'fitted',
        witnesses: [center, positive],
        label: 'Fitted radius construction',
        fit,
      },
      {
        operation: 'diameter',
        value: radius * 2,
        evidence: 'fitted',
        witnesses: [negative, positive],
        label: 'Fitted diameter construction',
        fit,
      },
    ];
  }
  if (feature.kind === 'body' && target.kind === 'body') {
    const points = feature.points.map(world);
    const box = new THREE.Box3().setFromPoints(points);
    const center = box.getCenter(new THREE.Vector3());
    const frame = axes ?? [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
    if (frame.some((axis) => !finite(axis) || axis.lengthSq() === 0)) {
      return [];
    }
    const directions = frame.map((axis) => axis.clone().normalize());
    if (
      Math.abs(directions[0]!.dot(directions[1]!)) > 1e-6 ||
      Math.abs(directions[1]!.dot(directions[2]!)) > 1e-6 ||
      Math.abs(directions[2]!.dot(directions[0]!)) > 1e-6
    ) {
      return [];
    }
    return directions.map((axis, index): FeatureMeasurement => {
      let minimum = Infinity;
      let maximum = -Infinity;
      for (const point of points) {
        const projection = point.dot(axis);
        minimum = Math.min(minimum, projection);
        maximum = Math.max(maximum, projection);
      }
      const centerProjection = center.dot(axis);
      return {
        operation: 'extent',
        value: maximum - minimum,
        evidence: 'mesh',
        witnesses: [
          center.clone().addScaledVector(axis, minimum - centerProjection),
          center.clone().addScaledVector(axis, maximum - centerProjection),
        ],
        label: `${['X', 'Y', 'Z'][index]} extent construction`,
      };
    });
  }
  return [];
}

function closestPointOnSegment(point: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
  const direction = b.clone().sub(a);
  const parameter = THREE.MathUtils.clamp(point.clone().sub(a).dot(direction) / (direction.lengthSq() || 1), 0, 1);
  return a.clone().addScaledVector(direction, parameter);
}

// oxlint-disable-next-line max-params -- Two bounded polylines each carry points and closure.
function closestPolylinePair(
  a: THREE.Vector3[],
  aClosed: boolean,
  b: THREE.Vector3[],
  bClosed: boolean,
): [THREE.Vector3, THREE.Vector3] | undefined {
  let best: [THREE.Vector3, THREE.Vector3] | undefined;
  let bestSquared = Infinity;
  const countA = aClosed ? a.length : a.length - 1;
  const countB = bClosed ? b.length : b.length - 1;
  const accept = (first: THREE.Vector3, second: THREE.Vector3): void => {
    const squared = first.distanceToSquared(second);
    if (squared < bestSquared) {
      best = [first, second];
      bestSquared = squared;
    }
  };
  for (let i = 0; i < countA; i++) {
    const a0 = a[i]!;
    const a1 = a[(i + 1) % a.length]!;
    const u = a1.clone().sub(a0);
    for (let j = 0; j < countB; j++) {
      const b0 = b[j]!;
      const b1 = b[(j + 1) % b.length]!;
      const v = b1.clone().sub(b0);
      accept(a0, closestPointOnSegment(a0, b0, b1));
      accept(a1, closestPointOnSegment(a1, b0, b1));
      accept(closestPointOnSegment(b0, a0, a1), b0);
      accept(closestPointOnSegment(b1, a0, a1), b1);
      const w = a0.clone().sub(b0);
      const uu = u.dot(u);
      const uv = u.dot(v);
      const vv = v.dot(v);
      const determinant = uu * vv - uv * uv;
      if (determinant <= Number.EPSILON * uu * vv) {
        continue;
      }
      const uw = u.dot(w);
      const vw = v.dot(w);
      const s = (uv * vw - vv * uw) / determinant;
      const t = (uu * vw - uv * uw) / determinant;
      if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
        accept(a0.clone().addScaledVector(u, s), b0.clone().addScaledVector(v, t));
      }
    }
  }
  return best;
}

function worldPoints(target: MeasurementTarget): THREE.Vector3[] {
  target.sourceMesh.updateWorldMatrix(true, false);
  if (target.kind !== 'edge' || target.feature.kind !== 'edge') {
    return [];
  }
  return target.feature.points.map((point) => point.clone().applyMatrix4(target.sourceMesh.matrixWorld));
}

function worldTriangles(target: MeasurementTarget): THREE.Triangle[] {
  if (target.feature.kind !== 'face' || !('geometry' in target.sourceMesh)) {
    return [];
  }
  const geometry = target.sourceMesh.geometry as THREE.BufferGeometry;
  const attribute = geometry.getAttribute('position');
  const index = geometry.getIndex();
  target.sourceMesh.updateWorldMatrix(true, false);
  const triangles: THREE.Triangle[] = [];
  for (const triangle of target.feature.triangleIndices) {
    const read = (corner: number): THREE.Vector3 =>
      new THREE.Vector3()
        .fromBufferAttribute(attribute, index?.getX(triangle * 3 + corner) ?? triangle * 3 + corner)
        .applyMatrix4(target.sourceMesh.matrixWorld);
    triangles.push(new THREE.Triangle(read(0), read(1), read(2)));
  }
  return triangles;
}

function nearestSegmentTriangle(
  a: THREE.Vector3,
  b: THREE.Vector3,
  triangle: THREE.Triangle,
): [THREE.Vector3, THREE.Vector3] {
  let best: [THREE.Vector3, THREE.Vector3] = [a, triangle.closestPointToPoint(a, new THREE.Vector3())];
  const accept = (first: THREE.Vector3, second: THREE.Vector3): void => {
    if (first.distanceToSquared(second) < best[0].distanceToSquared(best[1])) {
      best = [first, second];
    }
  };
  accept(b, triangle.closestPointToPoint(b, new THREE.Vector3()));
  for (const vertex of [triangle.a, triangle.b, triangle.c]) {
    accept(closestPointOnSegment(vertex, a, b), vertex);
  }
  const edges: Array<[THREE.Vector3, THREE.Vector3]> = [
    [triangle.a, triangle.b],
    [triangle.b, triangle.c],
    [triangle.c, triangle.a],
  ];
  for (const [start, end] of edges) {
    const pair = closestPolylinePair([a, b], false, [start, end], false);
    if (pair) {
      accept(pair[0], pair[1]);
    }
  }
  const direction = b.clone().sub(a);
  const intersection = new THREE.Ray(a, direction.clone().normalize()).intersectTriangle(
    triangle.a,
    triangle.b,
    triangle.c,
    false,
    new THREE.Vector3(),
  );
  if (intersection && direction.lengthSq() > 0) {
    const parameter = intersection.clone().sub(a).dot(direction) / direction.lengthSq();
    if (parameter >= 0 && parameter <= 1) {
      accept(intersection, intersection.clone());
    }
  }
  return best;
}

function nearestTrianglePair(a: THREE.Triangle, b: THREE.Triangle): [THREE.Vector3, THREE.Vector3] {
  let best: [THREE.Vector3, THREE.Vector3] | undefined;
  const consider = (pair: [THREE.Vector3, THREE.Vector3]): void => {
    if (!best || pair[0].distanceToSquared(pair[1]) < best[0].distanceToSquared(best[1])) {
      best = pair;
    }
  };
  for (const [start, end] of [
    [a.a, a.b],
    [a.b, a.c],
    [a.c, a.a],
  ]) {
    consider(nearestSegmentTriangle(start!, end!, b));
  }
  for (const [start, end] of [
    [b.a, b.b],
    [b.b, b.c],
    [b.c, b.a],
  ]) {
    const pair = nearestSegmentTriangle(start!, end!, a);
    consider([pair[1], pair[0]]);
  }
  return best!;
}

function finiteFeatureDistance(a: MeasurementTarget, b: MeasurementTarget): FeatureMeasurement | undefined {
  const trianglesA = worldTriangles(a);
  const trianglesB = worldTriangles(b);
  const pointsA = worldPoints(a);
  const pointsB = worldPoints(b);
  let best: [THREE.Vector3, THREE.Vector3] | undefined;
  const consider = (pair: [THREE.Vector3, THREE.Vector3]): void => {
    if (!best || pair[0].distanceToSquared(pair[1]) < best[0].distanceToSquared(best[1])) {
      best = pair;
    }
  };
  // ponytail: O(n²) selected face-pair scan; use a triangle BVH if large-face clearance is needed.
  if (
    trianglesA.length * trianglesB.length > 10_000 ||
    trianglesA.length * Math.max(1, pointsB.length - 1) > 10_000 ||
    trianglesB.length * Math.max(1, pointsA.length - 1) > 10_000
  ) {
    return undefined;
  }
  if (trianglesA.length > 0 && trianglesB.length > 0) {
    for (const first of trianglesA) {
      for (const second of trianglesB) {
        consider(nearestTrianglePair(first, second));
      }
    }
  } else if (trianglesA.length > 0 && pointsB.length > 0) {
    const count = b.feature.kind === 'edge' && b.feature.closed ? pointsB.length : pointsB.length - 1;
    for (const triangle of trianglesA) {
      for (let i = 0; i < count; i++) {
        const pair = nearestSegmentTriangle(pointsB[i]!, pointsB[(i + 1) % pointsB.length]!, triangle);
        consider([pair[1], pair[0]]);
      }
    }
  } else if (trianglesB.length > 0 && pointsA.length > 0) {
    const count = a.feature.kind === 'edge' && a.feature.closed ? pointsA.length : pointsA.length - 1;
    for (const triangle of trianglesB) {
      for (let i = 0; i < count; i++) {
        consider(nearestSegmentTriangle(pointsA[i]!, pointsA[(i + 1) % pointsA.length]!, triangle));
      }
    }
  } else if (trianglesA.length > 0) {
    for (const triangle of trianglesA) {
      consider([triangle.closestPointToPoint(b.position, new THREE.Vector3()), b.position]);
    }
  } else if (trianglesB.length > 0) {
    for (const triangle of trianglesB) {
      consider([a.position, triangle.closestPointToPoint(a.position, new THREE.Vector3())]);
    }
  }
  return (
    best && {
      operation: 'minimum-distance',
      value: best[0].distanceTo(best[1]),
      evidence: 'mesh',
      witnesses: best,
      label: 'Bounded mesh feature distance',
    }
  );
}

/** Results are bounded to the selected support; unsupported feature pairs return only the explicit point distance. */
export function measureTargetPair(a: MeasurementTarget, b: MeasurementTarget): FeatureMeasurement[] {
  const evidence = a.evidence === 'fitted' || b.evidence === 'fitted' ? 'fitted' : 'mesh';
  const results: FeatureMeasurement[] = [
    {
      operation: a.kind === 'center' && b.kind === 'center' ? 'center-distance' : 'distance',
      value: a.position.distanceTo(b.position),
      evidence,
      witnesses: [a.position.clone(), b.position.clone()],
      label: a.kind === 'center' && b.kind === 'center' ? 'Center distance' : 'Selected points distance',
    },
  ];
  const aEdge = a.kind === 'edge' && a.feature.kind === 'edge';
  const bEdge = b.kind === 'edge' && b.feature.kind === 'edge';
  const aFace = a.kind === 'face' && a.feature.kind === 'face';
  const bFace = b.kind === 'face' && b.feature.kind === 'face';
  if ((aFace || bFace) && a.kind !== 'body' && b.kind !== 'body') {
    const minimum = finiteFeatureDistance(a, b);
    if (minimum) {
      results.push(minimum);
    }
  }
  if (a.kind === 'edge' && b.kind === 'edge' && a.feature.kind === 'edge' && b.feature.kind === 'edge') {
    const first = worldPoints(a);
    const second = worldPoints(b);
    const pair = closestPolylinePair(first, a.feature.closed, second, b.feature.closed);
    if (pair) {
      results.push({
        operation: 'minimum-distance',
        value: pair[0].distanceTo(pair[1]),
        evidence: 'mesh',
        witnesses: pair,
        label: 'Bounded mesh edge distance',
      });
    }
    if (!a.feature.closed && !b.feature.closed && first.length === 2 && second.length === 2) {
      const va = first[1]!.clone().sub(first[0]!).normalize();
      const vb = second[1]!.clone().sub(second[0]!).normalize();
      if (va.lengthSq() && vb.lengthSq()) {
        results.push({
          operation: 'angle',
          value: Math.atan2(new THREE.Vector3().crossVectors(va, vb).length(), va.dot(vb)),
          evidence: 'mesh',
          witnesses: [],
          label: 'Edge direction angle',
        });
      }
    }
  } else if ((aEdge || bEdge) && !aFace && !bFace) {
    const edge = aEdge ? a : b;
    const point = edge === a ? b.position : a.position;
    const vertices = worldPoints(edge);
    let best: THREE.Vector3 | undefined;
    for (
      let i = 0;
      i < (edge.feature.kind === 'edge' && edge.feature.closed ? vertices.length : vertices.length - 1);
      i++
    ) {
      const candidate = closestPointOnSegment(point, vertices[i]!, vertices[(i + 1) % vertices.length]!);
      if (!best || candidate.distanceToSquared(point) < best.distanceToSquared(point)) {
        best = candidate;
      }
    }
    if (best) {
      results.push({
        operation: 'minimum-distance',
        value: point.distanceTo(best),
        evidence: 'mesh',
        witnesses: [point.clone(), best],
        label: 'Point to bounded mesh edge',
      });
    }
  } else if (
    aFace &&
    bFace &&
    a.feature.kind === 'face' &&
    b.feature.kind === 'face' &&
    a.feature.planar &&
    b.feature.planar
  ) {
    a.sourceMesh.updateWorldMatrix(true, false);
    b.sourceMesh.updateWorldMatrix(true, false);
    const normalA = a.feature.normal
      .clone()
      .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(a.sourceMesh.matrixWorld))
      .normalize();
    const normalB = b.feature.normal
      .clone()
      .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(b.sourceMesh.matrixWorld))
      .normalize();
    if (Math.abs(normalA.dot(normalB)) > normalAgreement) {
      const first = a.feature.centroid.clone().applyMatrix4(a.sourceMesh.matrixWorld);
      const second = b.feature.centroid.clone().applyMatrix4(b.sourceMesh.matrixWorld);
      const offset = second.clone().sub(first).dot(normalA);
      results.push({
        operation: 'plane-spacing',
        value: Math.abs(offset),
        evidence: 'mesh',
        witnesses: [first, first.clone().addScaledVector(normalA, offset)],
        label: 'Supporting plane spacing',
      });
    }
  }
  return results;
}
