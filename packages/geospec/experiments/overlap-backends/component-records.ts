import { weldPositions } from '../../src/mesh/_internal/spatial-welding.js';
import type { GeoSpecNativeTriangleSoup } from '../../src/mesh/native.js';
import type { GeometrySubject, MeshTriangle } from '../../src/mesh/types.js';
import type {
  OverlapExperimentAabb,
  OverlapExperimentComponent,
  OverlapExperimentPair,
  OverlapExperimentRecordSet,
} from './types.js';

export type OverlapExperimentNativeMeshComponent = {
  id: number;
  label: string;
  color?: string;
  triangleCount: number;
};

const emptyAabb = (): OverlapExperimentAabb => ({
  min: [Infinity, Infinity, Infinity],
  max: [-Infinity, -Infinity, -Infinity],
});

export const expandAabb = (aabb: OverlapExperimentAabb, point: readonly [number, number, number]): void => {
  for (let axis = 0; axis < 3; axis++) {
    aabb.min[axis] = Math.min(aabb.min[axis]!, point[axis]!);
    aabb.max[axis] = Math.max(aabb.max[axis]!, point[axis]!);
  }
};

export const triangleAabb = (triangles: readonly MeshTriangle[]): OverlapExperimentAabb => {
  const aabb = emptyAabb();
  for (const triangle of triangles) {
    expandAabb(aabb, triangle.a);
    expandAabb(aabb, triangle.b);
    expandAabb(aabb, triangle.c);
  }
  return aabb;
};

export const aabbsOverlap = (left: OverlapExperimentAabb, right: OverlapExperimentAabb, tolerance: number): boolean =>
  left.min[0] <= right.max[0] + tolerance &&
  left.max[0] + tolerance >= right.min[0] &&
  left.min[1] <= right.max[1] + tolerance &&
  left.max[1] + tolerance >= right.min[1] &&
  left.min[2] <= right.max[2] + tolerance &&
  left.max[2] + tolerance >= right.min[2];

export const aabbCenter = (aabb: OverlapExperimentAabb): [number, number, number] => [
  (aabb.min[0] + aabb.max[0]) / 2,
  (aabb.min[1] + aabb.max[1]) / 2,
  (aabb.min[2] + aabb.max[2]) / 2,
];

export const intersectAabb = (left: OverlapExperimentAabb, right: OverlapExperimentAabb): OverlapExperimentAabb => ({
  min: [Math.max(left.min[0], right.min[0]), Math.max(left.min[1], right.min[1]), Math.max(left.min[2], right.min[2])],
  max: [Math.min(left.max[0], right.max[0]), Math.min(left.max[1], right.max[1]), Math.min(left.max[2], right.max[2])],
});

const primitiveColorMap = (subject: GeometrySubject): Map<string, string> => {
  const colors = new Map<string, string>();
  for (const primitive of subject.mesh.stats.boundingBox?.primitives ?? []) {
    if (primitive.color) {
      colors.set(primitive.name, primitive.color);
      colors.set(`${primitive.name}#0`, primitive.color);
    }
  }
  return colors;
};

const makeComponent = (
  id: number,
  label: string,
  triangles: MeshTriangle[],
  colors: ReadonlyMap<string, string>,
): OverlapExperimentComponent => ({
  id,
  label,
  color: colors.get(label),
  triangles,
  triangleCount: triangles.length,
  aabb: triangleAabb(triangles),
});

const namedComponents = (
  triangles: readonly MeshTriangle[],
  colors: ReadonlyMap<string, string>,
): OverlapExperimentComponent[] | undefined => {
  const groups = new Map<string, MeshTriangle[]>();
  for (const triangle of triangles) {
    const label = triangle.primitive.trim();
    if (!label) {
      return undefined;
    }
    groups.set(label, [...(groups.get(label) ?? []), triangle]);
  }
  if (groups.size < 2) {
    return undefined;
  }
  return [...groups.entries()].map(([label, group], id) => makeComponent(id, label, group, colors));
};

const connectedComponents = (
  triangles: readonly MeshTriangle[],
  colors: ReadonlyMap<string, string>,
): OverlapExperimentComponent[] | undefined => {
  const positions: Array<[number, number, number]> = [];
  for (const triangle of triangles) {
    positions.push([...triangle.a], [...triangle.b], [...triangle.c]);
  }
  const welded = weldPositions(positions);
  const parent = new Int32Array(triangles.length);
  for (let index = 0; index < triangles.length; index++) {
    parent[index] = index;
  }

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

  const vertexToTriangles = new Map<number, number[]>();
  for (let triangleIndex = 0; triangleIndex < triangles.length; triangleIndex++) {
    for (let corner = 0; corner < 3; corner++) {
      const canonical = welded[triangleIndex * 3 + corner]!;
      vertexToTriangles.set(canonical, [...(vertexToTriangles.get(canonical) ?? []), triangleIndex]);
    }
  }
  for (const incidentTriangles of vertexToTriangles.values()) {
    for (let index = 1; index < incidentTriangles.length; index++) {
      union(incidentTriangles[0]!, incidentTriangles[index]!);
    }
  }

  const rootToTriangles = new Map<number, MeshTriangle[]>();
  for (const [triangleIndex, triangle] of triangles.entries()) {
    const root = find(triangleIndex);
    rootToTriangles.set(root, [...(rootToTriangles.get(root) ?? []), triangle]);
  }
  if (rootToTriangles.size < 2) {
    return undefined;
  }

  return [...rootToTriangles.values()].map((group, id) =>
    makeComponent(id, `connected-component-${id}`, group, colors),
  );
};

export const buildComponentRecords = (subject: GeometrySubject): OverlapExperimentRecordSet => {
  const triangles = subject.mesh.stats.meshQuality.triangles;
  const colors = primitiveColorMap(subject);
  const named = namedComponents(triangles, colors);
  const components = named ?? connectedComponents(triangles, colors);
  if (!components || components.length < 2) {
    throw new Error('Expected at least two mesh components for overlap backend experiments.');
  }

  const pairs: OverlapExperimentPair[] = [];
  for (let left = 0; left < components.length; left++) {
    for (let right = left + 1; right < components.length; right++) {
      pairs.push({
        leftComponentId: components[left]!.id,
        rightComponentId: components[right]!.id,
        leftLabel: components[left]!.label,
        rightLabel: components[right]!.label,
      });
    }
  }

  return {
    source: named ? 'named' : 'connected',
    components,
    pairs,
    totalTriangles: triangles.length,
  };
};

export const aabbCandidatePairs = (records: OverlapExperimentRecordSet, tolerance: number): OverlapExperimentPair[] =>
  records.pairs.filter((pair) =>
    aabbsOverlap(
      records.components[pair.leftComponentId]!.aabb,
      records.components[pair.rightComponentId]!.aabb,
      tolerance,
    ),
  );

export const toTriangleSoup = (
  records: OverlapExperimentRecordSet,
): {
  subject: GeoSpecNativeTriangleSoup;
  componentIds: Int32Array<ArrayBuffer>;
  components: OverlapExperimentNativeMeshComponent[];
} => {
  const triangles = new Float64Array(records.totalTriangles * 9);
  const componentIds = new Int32Array(records.totalTriangles);
  let triangleOffset = 0;
  let coordinateOffset = 0;
  for (const component of records.components) {
    for (const triangle of component.triangles) {
      componentIds[triangleOffset] = component.id;
      triangles[coordinateOffset++] = triangle.a[0];
      triangles[coordinateOffset++] = triangle.a[1];
      triangles[coordinateOffset++] = triangle.a[2];
      triangles[coordinateOffset++] = triangle.b[0];
      triangles[coordinateOffset++] = triangle.b[1];
      triangles[coordinateOffset++] = triangle.b[2];
      triangles[coordinateOffset++] = triangle.c[0];
      triangles[coordinateOffset++] = triangle.c[1];
      triangles[coordinateOffset++] = triangle.c[2];
      triangleOffset++;
    }
  }

  return {
    subject: { triangles, triangleCount: records.totalTriangles },
    componentIds,
    components: records.components.map((component) => ({
      id: component.id,
      label: component.label,
      color: component.color,
      triangleCount: component.triangleCount,
    })),
  };
};
