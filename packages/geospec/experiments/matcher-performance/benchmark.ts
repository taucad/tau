#!/usr/bin/env tsx
import { Accessor, Document, WebIO } from '@gltf-transform/core';
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import nativeFactory from '../../native/opencascade/dist/init.js';
import { analyzeChamferDistance } from '#mesh/distance.js';
import { analyzeGltfDocument } from '#mesh/analyze-glb.js';
import { analyseConnectedComponents, collectPrimitiveRecords } from '#mesh/connected-components.js';
import { analyzeMeshQuality } from '#mesh/mesh-quality.js';
import { loadMesh } from '#mesh/load-mesh.js';
import { createOpenCascadeMeshBackend } from '#mesh/native.js';
import { analyseWatertight } from '#mesh/watertight.js';
import { weldPositions } from '#mesh/_internal/spatial-welding.js';
import type { GeoSpecOpenCascadeMeshModule } from '#mesh/native.js';
import type { BrepEvidence, GeometrySubject, MeshTriangle, PrimitiveRecord, Vec3 } from '#mesh/types.js';
import { loadStep } from '#step/load-step.js';

type TimedSample = {
  name: string;
  iterations: number;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  last: unknown;
};

type BoxMesh = {
  name: string;
  positions: Float32Array<ArrayBuffer>;
  indices: Uint32Array<ArrayBuffer>;
};

type Aabb = { min: Vec3; max: Vec3 };

const now = (): number => performance.now();

const percentile = (values: readonly number[], p: number): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
};

const time = async (name: string, iterations: number, run: () => unknown | Promise<unknown>): Promise<TimedSample> => {
  const values: number[] = [];
  let last: unknown;
  for (let index = 0; index < iterations; index++) {
    const started = now();
    last = await run();
    values.push(now() - started);
  }
  return {
    name,
    iterations,
    medianMs: percentile(values, 50),
    p95Ms: percentile(values, 95),
    minMs: Math.min(...values),
    maxMs: Math.max(...values),
    last,
  };
};

const subjectSummary = (subject: GeometrySubject): Record<string, unknown> => ({
  loader: subject.provenance.loader,
  format: subject.provenance.source.format,
  triangleCount: subject.mesh.stats.triangleCount,
  meshCount: subject.mesh.stats.meshCount,
  vertexCount: subject.mesh.stats.vertexCount,
  watertight: subject.mesh.stats.watertight,
  hasBrep: Boolean(subject.brep),
  brepFaces: subject.brep?.topologyCounts?.faces,
});

const boxIndices = new Uint32Array([
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
]);

const createBoxMesh = (options: { name: string; min: Vec3; size: Vec3 }): BoxMesh => {
  const [x, y, z] = options.min;
  const [sx, sy, sz] = options.size;
  return {
    name: options.name,
    positions: new Float32Array([
      x,
      y,
      z,
      x + sx,
      y,
      z,
      x + sx,
      y + sy,
      z,
      x,
      y + sy,
      z,
      x,
      y,
      z + sz,
      x + sx,
      y,
      z + sz,
      x + sx,
      y + sy,
      z + sz,
      x,
      y + sy,
      z + sz,
    ]),
    indices: new Uint32Array(boxIndices),
  };
};

const createSparseBoxes = (count: number): BoxMesh[] =>
  Array.from({ length: count }, (_, index) =>
    createBoxMesh({
      name: `box-${index}`,
      min: [(index % 50) * 20, Math.floor(index / 50) * 20, 0],
      size: [5, 5, 5],
    }),
  );

const createBoxDocument = (boxes: readonly BoxMesh[]): Document => {
  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene('matcher-performance');
  for (const box of boxes) {
    const positionAccessor = document
      .createAccessor()
      .setType(Accessor.Type['VEC3']!)
      .setBuffer(buffer)
      .setArray(box.positions);
    const indexAccessor = document
      .createAccessor()
      .setType(Accessor.Type['SCALAR']!)
      .setBuffer(buffer)
      .setArray(box.indices);
    const primitive = document
      .createPrimitive()
      .setMode(4)
      .setAttribute('POSITION', positionAccessor)
      .setIndices(indexAccessor);
    const mesh = document.createMesh(box.name).addPrimitive(primitive);
    scene.addChild(document.createNode(box.name).setMesh(mesh));
  }
  return document;
};

const loadSubjectFromDocument = async (document: Document, name: string): Promise<GeometrySubject> => {
  const bytes = await new WebIO().writeBinary(document);
  const result = await loadMesh({
    source: bytes,
    path: `/matcher-performance/${name}.glb`,
    sourceUnit: 'mm',
    unit: 'mm',
  });
  if (!result.success) {
    throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
  }
  return result.subject;
};

const edgeKey = (a: number, b: number, vertexCount: number): number => {
  const left = Math.min(a, b);
  const right = Math.max(a, b);
  return left * vertexCount + right;
};

const fastWatertightFromTriangles = (
  triangles: readonly MeshTriangle[],
): {
  irregularEdges: number;
  openBoundaryEdges: number;
  totalEdges: number;
} => {
  const positions: Array<[number, number, number]> = [];
  for (const triangle of triangles) {
    positions.push([...triangle.a], [...triangle.b], [...triangle.c]);
  }
  const welded = weldPositions(positions);
  const edgeCounts = new Map<number, number>();
  const vertexCount = positions.length;
  for (let triangleIndex = 0; triangleIndex < triangles.length; triangleIndex++) {
    const a = welded[triangleIndex * 3]!;
    const b = welded[triangleIndex * 3 + 1]!;
    const c = welded[triangleIndex * 3 + 2]!;
    for (const key of [edgeKey(a, b, vertexCount), edgeKey(b, c, vertexCount), edgeKey(a, c, vertexCount)]) {
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }
  let irregularEdges = 0;
  let openBoundaryEdges = 0;
  for (const count of edgeCounts.values()) {
    if (count !== 2) {
      irregularEdges++;
    }
    if (count === 1) {
      openBoundaryEdges++;
    }
  }
  return { irregularEdges, openBoundaryEdges, totalEdges: edgeCounts.size };
};

const classifyPositionTopology = (
  positions: ReadonlyArray<[number, number, number]>,
  triangles: ReadonlyArray<[number, number, number]>,
): { irregularEdges: number; openBoundaryEdges: number; totalEdges: number } => {
  const welded = weldPositions(positions);
  const edgeCounts = new Map<number, number>();
  for (const triangle of triangles) {
    const a = welded[triangle[0]]!;
    const b = welded[triangle[1]]!;
    const c = welded[triangle[2]]!;
    for (const key of [
      edgeKey(a, b, positions.length),
      edgeKey(b, c, positions.length),
      edgeKey(a, c, positions.length),
    ]) {
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }
  let irregularEdges = 0;
  let openBoundaryEdges = 0;
  for (const count of edgeCounts.values()) {
    if (count !== 2) {
      irregularEdges++;
    }
    if (count === 1) {
      openBoundaryEdges++;
    }
  }
  return { irregularEdges, openBoundaryEdges, totalEdges: edgeCounts.size };
};

const fastWatertightGlobalDocument = (
  document: Document,
): { irregularEdges: number; openBoundaryEdges: number; totalEdges: number } => {
  const positions: Array<[number, number, number]> = [];
  const triangles: Array<[number, number, number]> = [];
  let vertexOffset = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) {
        continue;
      }
      const positionAccessor = primitive.getAttribute('POSITION');
      if (!positionAccessor) {
        continue;
      }
      const indexAccessor = primitive.getIndices();
      const vertexCount = positionAccessor.getCount();
      const indexCount = indexAccessor?.getCount() ?? vertexCount;
      for (let index = 0; index < vertexCount; index++) {
        const position = positionAccessor.getElement(index, [0, 0, 0]);
        positions.push([position[0] ?? 0, position[1] ?? 0, position[2] ?? 0]);
      }
      for (let index = 0; index < indexCount; index += 3) {
        triangles.push([
          (indexAccessor?.getScalar(index) ?? index) + vertexOffset,
          (indexAccessor?.getScalar(index + 1) ?? index + 1) + vertexOffset,
          (indexAccessor?.getScalar(index + 2) ?? index + 2) + vertexOffset,
        ]);
      }
      vertexOffset += vertexCount;
    }
  }
  return classifyPositionTopology(positions, triangles);
};

const primitiveAabb = (record: PrimitiveRecord): Aabb => record.aabb;

const overlaps = (left: Aabb, right: Aabb, toleranceMm: number): boolean =>
  left.min[0] <= right.max[0] + toleranceMm &&
  left.max[0] + toleranceMm >= right.min[0] &&
  left.min[1] <= right.max[1] + toleranceMm &&
  left.max[1] + toleranceMm >= right.min[1] &&
  left.min[2] <= right.max[2] + toleranceMm &&
  left.max[2] + toleranceMm >= right.min[2];

const clusterCachedQuadratic = (records: readonly PrimitiveRecord[], toleranceMm: number): number => {
  const parent = records.map((_, index) => index);
  const find = (value: number): number => {
    let current = value;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]!]!;
      current = parent[current]!;
    }
    return current;
  };
  const union = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parent[leftRoot] = rightRoot;
    }
  };
  for (let left = 0; left < records.length; left++) {
    for (let right = left + 1; right < records.length; right++) {
      if (overlaps(primitiveAabb(records[left]!), primitiveAabb(records[right]!), toleranceMm)) {
        union(left, right);
      }
    }
  }
  return new Set(records.map((_, index) => find(index))).size;
};

const clusterCachedSweep = (records: readonly PrimitiveRecord[], toleranceMm: number): number => {
  const order = records
    .map((record, index) => ({ record, index }))
    .sort((left, right) => left.record.aabb.min[0] - right.record.aabb.min[0]);
  const parent = records.map((_, index) => index);
  const find = (value: number): number => {
    let current = value;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]!]!;
      current = parent[current]!;
    }
    return current;
  };
  const union = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parent[leftRoot] = rightRoot;
    }
  };
  const active: Array<{ record: PrimitiveRecord; index: number }> = [];
  for (const entry of order) {
    for (let cursor = active.length - 1; cursor >= 0; cursor--) {
      if (active[cursor]!.record.aabb.max[0] + toleranceMm < entry.record.aabb.min[0]) {
        active.splice(cursor, 1);
      }
    }
    for (const candidate of active) {
      if (overlaps(candidate.record.aabb, entry.record.aabb, toleranceMm)) {
        union(candidate.index, entry.index);
      }
    }
    active.push(entry);
  }
  return new Set(records.map((_, index) => find(index))).size;
};

const rawMeshQuality = (
  meshes: readonly BoxMesh[],
): { triangleCount: number; surfaceArea: number; signedVolume: number } => {
  let triangleCount = 0;
  let surfaceArea = 0;
  let signedVolume = 0;
  const get = (positions: Float32Array<ArrayBuffer>, index: number): Vec3 => [
    positions[index * 3]!,
    positions[index * 3 + 1]!,
    positions[index * 3 + 2]!,
  ];
  for (const mesh of meshes) {
    for (let index = 0; index < mesh.indices.length; index += 3) {
      const a = get(mesh.positions, mesh.indices[index]!);
      const b = get(mesh.positions, mesh.indices[index + 1]!);
      const c = get(mesh.positions, mesh.indices[index + 2]!);
      const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cross: Vec3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      surfaceArea += Math.hypot(cross[0], cross[1], cross[2]) / 2;
      signedVolume +=
        (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) /
        6;
      triangleCount++;
    }
  }
  return { triangleCount, surfaceArea, signedVolume };
};

const triangleGeometry = (triangles: readonly MeshTriangle[]): BufferGeometry => {
  const positions = new Float32Array(triangles.length * 9);
  let offset = 0;
  for (const triangle of triangles) {
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      positions[offset++] = point[0];
      positions[offset++] = point[1];
      positions[offset++] = point[2];
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(Array.from({ length: triangles.length * 3 }, (_value, index) => index));
  return geometry;
};

const samplePoints = (triangles: readonly MeshTriangle[], sampleLimit: number): Vec3[] => {
  const points: Vec3[] = [];
  for (const triangle of triangles) {
    points.push(triangle.a, triangle.b, triangle.c, triangle.center);
    if (points.length >= sampleLimit) {
      break;
    }
  }
  return points.slice(0, sampleLimit);
};

const summarize = (values: readonly number[]): { min: number; max: number; mean: number; p95: number } => ({
  min: Math.min(...values),
  max: Math.max(...values),
  mean: values.reduce((sum, value) => sum + value, 0) / values.length,
  p95: percentile(values, 95),
});

const bvhChamfer = (actual: readonly MeshTriangle[], expected: readonly MeshTriangle[], samples: number) => {
  const expectedGeometry = triangleGeometry(expected);
  const actualGeometry = triangleGeometry(actual);
  try {
    const expectedBvh = new MeshBVH(expectedGeometry);
    const actualBvh = new MeshBVH(actualGeometry);
    const actualSamples = samplePoints(actual, Math.ceil(samples / 2));
    const expectedSamples = samplePoints(expected, Math.floor(samples / 2));
    const distances: number[] = [];
    const point = new Vector3();
    for (const sample of actualSamples) {
      const hit = expectedBvh.closestPointToPoint(point.set(sample[0], sample[1], sample[2]));
      distances.push(hit?.distance ?? Number.POSITIVE_INFINITY);
    }
    for (const sample of expectedSamples) {
      const hit = actualBvh.closestPointToPoint(point.set(sample[0], sample[1], sample[2]));
      distances.push(hit?.distance ?? Number.POSITIVE_INFINITY);
    }
    return { ...summarize(distances), samples: distances.length };
  } finally {
    expectedGeometry.dispose();
    actualGeometry.dispose();
  }
};

const syntheticBrep = (count: number): BrepEvidence => ({
  validity: { valid: true },
  topologyCounts: {
    faces: count,
    edges: count * 2,
    vertices: count * 2,
    wires: count,
    shells: 1,
    solids: 1,
    compounds: 0,
  },
  massProperties: { volume: 1, surfaceArea: 1, centerOfMass: [0, 0, 0], mass: 1 },
  boundingBox: {
    min: [0, 0, 0],
    max: [count, count, count],
    size: [count, count, count],
    center: [count / 2, count / 2, count / 2],
  },
  planarFaces: Array.from({ length: count }, (_, index) => ({
    normal: [0, 0, index % 2 === 0 ? 1 : -1] as Vec3,
    offset: index,
    area: 100 + index,
    center: [0, 0, index] as Vec3,
  })),
  cylindricalFaces: Array.from({ length: count }, (_, index) => ({
    radius: index + 1,
    axis: 'z' as const,
  })),
  circularHoles: Array.from({ length: count }, (_, index) => ({
    diameter: index + 1,
    through: index % 2 === 0,
    axis: 'z' as const,
    center: [index, index, 0] as Vec3,
  })),
  circularHolePatterns: Array.from({ length: count }, (_, index) => ({
    count: index + 1,
    holeDiameter: index + 1,
    boltCircleDiameter: index + 10,
    axis: 'z' as const,
    center: [0, 0, 0] as Vec3,
  })),
  chamferFeatures: Array.from({ length: count }, (_, index) => ({ distance: index + 1, selection: `edge-${index}` })),
  filletFeatures: Array.from({ length: count }, (_, index) => ({ radius: index + 1, selection: `edge-${index}` })),
  minimumWallThickness: { value: 2, location: [0, 0, 0] },
});

const scanCylindrical = (brep: BrepEvidence, radius: number): boolean =>
  Boolean(brep.cylindricalFaces?.find((face) => face.axis === 'z' && Math.abs(face.radius - radius) <= 0.001));

const indexedCylindrical = (brep: BrepEvidence, radius: number): boolean => {
  const byAxis = new Map<string, number[]>();
  for (const face of brep.cylindricalFaces ?? []) {
    const radii = byAxis.get(face.axis) ?? [];
    radii.push(face.radius);
    byAxis.set(face.axis, radii);
  }
  const radii = (byAxis.get('z') ?? []).sort((left, right) => left - right);
  let low = 0;
  let high = radii.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const value = radii[mid]!;
    if (Math.abs(value - radius) <= 0.001) {
      return true;
    }
    if (value < radius) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return false;
};

const buildCylindricalIndex = (brep: BrepEvidence): Map<string, number[]> => {
  const byAxis = new Map<string, number[]>();
  for (const face of brep.cylindricalFaces ?? []) {
    const radii = byAxis.get(face.axis) ?? [];
    radii.push(face.radius);
    byAxis.set(face.axis, radii);
  }
  for (const radii of byAxis.values()) {
    radii.sort((left, right) => left - right);
  }
  return byAxis;
};

const queryCylindricalIndex = (index: ReadonlyMap<string, readonly number[]>, radius: number): boolean => {
  const radii = index.get('z') ?? [];
  let low = 0;
  let high = radii.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const value = radii[mid]!;
    if (Math.abs(value - radius) <= 0.001) {
      return true;
    }
    if (value < radius) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return false;
};

const main = async (): Promise<void> => {
  const iterations = Number(process.argv[2] ?? 10);
  const boxes100 = createSparseBoxes(100);
  const boxes1000 = createSparseBoxes(1000);
  const doc100 = createBoxDocument(boxes100);
  const doc1000 = createBoxDocument(boxes1000);
  const subject100 = await loadSubjectFromDocument(doc100, 'boxes-100');
  const subject1000 = await loadSubjectFromDocument(doc1000, 'boxes-1000');
  const records1000 = collectPrimitiveRecords(doc1000);
  subject1000.mesh.stats.analyseConnectedComponents(0.1);
  const shiftedSubject100 = await loadSubjectFromDocument(
    createBoxDocument(
      boxes100.map((box, index) =>
        createBoxMesh({
          name: box.name,
          min: [(index % 50) * 20 + 0.5, Math.floor(index / 50) * 20, 0],
          size: [5, 5, 5],
        }),
      ),
    ),
    'boxes-100-shifted',
  );
  const nativeModule = (await nativeFactory()) as unknown as GeoSpecOpenCascadeMeshModule;
  const backend = createOpenCascadeMeshBackend(nativeModule);
  const brep = syntheticBrep(10_000);
  const cylindricalIndex = buildCylindricalIndex(brep);
  const stepPath = new URL('../../../runtime/src/kernels/replicad/__fixtures__/cube.step', import.meta.url);

  const samples = [
    await time('loadMesh GLB 100 boxes', iterations, async () =>
      subjectSummary(await loadSubjectFromDocument(doc100, 'boxes-100-load')),
    ),
    await time('loadMesh GLB 1000 boxes', Math.max(3, Math.ceil(iterations / 2)), () =>
      loadSubjectFromDocument(doc1000, 'boxes-1000-load').then(subjectSummary),
    ),
    await time('analyzeGltfDocument 1000 boxes', iterations, () => analyzeGltfDocument(doc1000).triangleCount),
    await time(
      'analyzeMeshQuality current accessor 1000 boxes',
      iterations,
      () => analyzeMeshQuality(doc1000).triangleCount,
    ),
    await time('meshQuality raw typed arrays 1000 boxes', iterations, () => rawMeshQuality(boxes1000).triangleCount),
    await time(
      'watertight current full diagnostics 1000 boxes',
      iterations,
      () => analyseWatertight(doc1000).irregularEdges,
    ),
    await time(
      'watertight PoC numeric global from document 1000 boxes',
      iterations,
      () => fastWatertightGlobalDocument(doc1000).irregularEdges,
    ),
    await time(
      'watertight PoC numeric global from cached triangles 1000 boxes',
      iterations,
      () => fastWatertightFromTriangles(subject1000.mesh.stats.meshQuality.triangles).irregularEdges,
    ),
    await time(
      'connected current analyseConnectedComponents 1000 boxes',
      Math.max(3, Math.ceil(iterations / 2)),
      () => analyseConnectedComponents(doc1000, 0.1).count,
    ),
    await time('connected PoC cached records quadratic 1000 boxes', iterations, () =>
      clusterCachedQuadratic(records1000, 0.1),
    ),
    await time('connected PoC cached records sweep 1000 boxes', iterations, () => clusterCachedSweep(records1000, 0.1)),
    await time(
      'connected cached subject warm 1000 boxes',
      iterations,
      () => subject1000.mesh.stats.analyseConnectedComponents(0.1).count,
    ),
    await time('distance native-unavailable diagnostic 100 boxes samples 1000', iterations, () =>
      analyzeChamferDistance({
        actual: shiftedSubject100.mesh.stats.meshQuality.triangles,
        expected: subject100.mesh.stats.meshQuality.triangles,
        samples: 1000,
        resolveDefaultBackend: false,
      }),
    ),
    await time(
      'distance three-mesh-bvh PoC 100 boxes samples 1000',
      iterations,
      () =>
        bvhChamfer(
          shiftedSubject100.mesh.stats.meshQuality.triangles,
          subject100.mesh.stats.meshQuality.triangles,
          1000,
        ).p95,
    ),
    await time('distance native OCCT BVH 100 boxes samples 1000', iterations, () =>
      analyzeChamferDistance({
        actual: shiftedSubject100.mesh.stats.meshQuality.triangles,
        expected: subject100.mesh.stats.meshQuality.triangles,
        samples: 1000,
        backend,
      }),
    ),
    await time('BRep scan cylindrical 10000 faces', iterations * 100, () => scanCylindrical(brep, 10_000)),
    await time('BRep indexed cylindrical 10000 faces', iterations * 100, () => indexedCylindrical(brep, 10_000)),
    await time('BRep prebuilt index query cylindrical 10000 faces', iterations * 100, () =>
      queryCylindricalIndex(cylindricalIndex, 10_000),
    ),
    await time('loadStep cube shared module mesh true', Math.max(3, Math.ceil(iterations / 2)), () =>
      loadStep({ source: stepPath, openCascade: nativeModule, mesh: true }).then(subjectSummary),
    ),
    await time('loadStep cube shared module mesh false', Math.max(3, Math.ceil(iterations / 2)), () =>
      loadStep({ source: stepPath, openCascade: nativeModule, mesh: false }).then(subjectSummary),
    ),
  ];

  console.log(
    JSON.stringify(
      {
        iterations,
        fixtures: {
          boxes100: { components: 100, triangles: subject100.mesh.stats.triangleCount },
          boxes1000: { components: 1000, triangles: subject1000.mesh.stats.triangleCount },
          shiftedBoxes100: { triangles: shiftedSubject100.mesh.stats.triangleCount },
          syntheticBrepFaces: 10_000,
        },
        samples,
      },
      null,
      2,
    ),
  );
};

await main();
