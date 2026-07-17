import { NodeIO } from '@gltf-transform/core';
import { KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { booleans, colors, extrusions, geometries, primitives, transforms } from '@jscad/modeling';
import type { geometries as JscadGeometries } from '@jscad/modeling';
import { describe, expect, it } from 'vitest';
import { jscadToGltf } from '#kernels/jscad/jscad-to-gltf.js';
import { jscadExportSchemas } from '#kernels/jscad/jscad.schemas.js';

const primitiveModeTriangles = 4;
const primitiveModeLines = 1;
const coordinateTolerance = 1e-3;

type Point3 = [number, number, number];
type LineSegment = [Point3, Point3];
type JscadGeom3 = JscadGeometries.geom3.Geom3;
type TriangleTopology = {
  triangles: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
};
type JscadShapeIntrospection = {
  color?: number[];
  isRetesselated?: boolean;
  polygons?: unknown[];
  transforms?: number[];
};

const createNodeIo = (): NodeIO => new NodeIO().registerExtensions([KHRMaterialsUnlit]);

const readGlbExtensionsRequired = (glb: Uint8Array<ArrayBuffer>): string[] | undefined => {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonChunkLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.slice(20, 20 + jsonChunkLength)).trim()) as {
    extensionsRequired?: string[];
  };
  return json.extensionsRequired;
};

const readBoundingBox = async (
  glb: Uint8Array<ArrayBuffer>,
): Promise<{ min: [number, number, number]; max: [number, number, number] }> => {
  const document = await createNodeIo().readBinary(glb);
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];

  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      if (!position) {
        continue;
      }
      const point: [number, number, number] = [0, 0, 0];
      for (let index = 0; index < position.getCount(); index++) {
        position.getElement(index, point);
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis]!, point[axis]!);
          max[axis] = Math.max(max[axis]!, point[axis]!);
        }
      }
    }
  }

  return { min, max };
};

const readPrimitiveModes = async (glb: Uint8Array<ArrayBuffer>): Promise<number[][]> => {
  const document = await createNodeIo().readBinary(glb);
  return document
    .getRoot()
    .listMeshes()
    .map((mesh) => mesh.listPrimitives().map((primitive) => primitive.getMode()));
};

const readNodeMeshNames = async (
  glb: Uint8Array<ArrayBuffer>,
): Promise<{ nodeNames: Array<string | undefined>; meshNames: Array<string | undefined> }> => {
  const document = await createNodeIo().readBinary(glb);
  return {
    nodeNames: document
      .getRoot()
      .listNodes()
      .map((node) => node.getName()),
    meshNames: document
      .getRoot()
      .listMeshes()
      .map((mesh) => mesh.getName()),
  };
};

const readMaterialNamesByPrimitiveMode = async (
  glb: Uint8Array<ArrayBuffer>,
  mode: number,
): Promise<Array<string | undefined>> => {
  const document = await createNodeIo().readBinary(glb);
  return document
    .getRoot()
    .listMeshes()
    .flatMap((mesh) =>
      mesh
        .listPrimitives()
        .filter((primitive) => primitive.getMode() === mode)
        .map((primitive) => primitive.getMaterial()?.getName()),
    );
};

const readLineSegments = async (glb: Uint8Array<ArrayBuffer>): Promise<LineSegment[]> => {
  const document = await createNodeIo().readBinary(glb);
  const segments: LineSegment[] = [];

  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== primitiveModeLines) {
        continue;
      }

      const positionAccessor = primitive.getAttribute('POSITION');
      if (!positionAccessor) {
        continue;
      }

      const indices = primitive.getIndices()?.getArray();
      const indexCount = indices ? indices.length : positionAccessor.getCount();
      const readPoint = (index: number): Point3 => {
        const point: Point3 = [0, 0, 0];
        positionAccessor.getElement(index, point);
        return point;
      };

      for (let index = 0; index < indexCount; index += 2) {
        const index0 = indices ? Number(indices[index] ?? 0) : index;
        const index1 = indices ? Number(indices[index + 1] ?? 0) : index + 1;
        segments.push([readPoint(index0), readPoint(index1)]);
      }
    }
  }

  return segments;
};

const readTriangleTopology = async (glb: Uint8Array<ArrayBuffer>): Promise<TriangleTopology> => {
  const document = await createNodeIo().readBinary(glb);
  const edgeCounts = new Map<string, number>();
  let triangles = 0;

  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== primitiveModeTriangles) {
        continue;
      }

      const positionAccessor = primitive.getAttribute('POSITION');
      if (!positionAccessor) {
        continue;
      }

      const indices = primitive.getIndices()?.getArray();
      const indexCount = indices ? indices.length : positionAccessor.getCount();
      const getPoint = (index: number): Point3 => {
        const point: Point3 = [0, 0, 0];
        positionAccessor.getElement(index, point);
        return point;
      };

      for (let index = 0; index < indexCount; index += 3) {
        const index0 = indices ? Number(indices[index] ?? 0) : index;
        const index1 = indices ? Number(indices[index + 1] ?? 0) : index + 1;
        const index2 = indices ? Number(indices[index + 2] ?? 0) : index + 2;
        const hashes = [getPoint(index0), getPoint(index1), getPoint(index2)].map((point) =>
          point.map((coordinate) => Math.round(coordinate / coordinateTolerance)).join(','),
        );
        if (hashes[0] === hashes[1] || hashes[1] === hashes[2] || hashes[2] === hashes[0]) {
          continue;
        }

        triangles++;
        for (const [left, right] of [
          [hashes[0]!, hashes[1]!],
          [hashes[1]!, hashes[2]!],
          [hashes[2]!, hashes[0]!],
        ] as const) {
          const key = left < right ? `${left}/${right}` : `${right}/${left}`;
          edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
        }
      }
    }
  }

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of edgeCounts.values()) {
    if (count === 1) {
      boundaryEdges++;
    } else if (count > 2) {
      nonManifoldEdges++;
    }
  }

  return { triangles, boundaryEdges, nonManifoldEdges };
};

const pointsMatch = (left: Point3, right: Point3): boolean =>
  left.every((value, index) => Math.abs(value - right[index]!) <= coordinateTolerance);

const segmentMatches = (segment: LineSegment, start: Point3, end: Point3): boolean =>
  (pointsMatch(segment[0], start) && pointsMatch(segment[1], end)) ||
  (pointsMatch(segment[0], end) && pointsMatch(segment[1], start));

const hasSegment = (segments: LineSegment[], start: Point3, end: Point3): boolean =>
  segments.some((segment) => segmentMatches(segment, start, end));

const isOnPlane = (segment: LineSegment, axis: 0 | 1 | 2, value: number): boolean =>
  Math.abs(segment[0][axis] - value) <= coordinateTolerance &&
  Math.abs(segment[1][axis] - value) <= coordinateTolerance;

const pointIsOnSegment2d = (point: Point3, start: Point3, end: Point3): boolean => {
  const crossProduct = (point[0] - start[0]) * (end[1] - start[1]) - (point[1] - start[1]) * (end[0] - start[0]);
  if (Math.abs(crossProduct) > coordinateTolerance) {
    return false;
  }

  return (
    point[0] >= Math.min(start[0], end[0]) - coordinateTolerance &&
    point[0] <= Math.max(start[0], end[0]) + coordinateTolerance &&
    point[1] >= Math.min(start[1], end[1]) - coordinateTolerance &&
    point[1] <= Math.max(start[1], end[1]) + coordinateTolerance
  );
};

const segmentIsOnBoundary2d = (segment: LineSegment, boundary: LineSegment[]): boolean =>
  boundary.some(
    (edge) => pointIsOnSegment2d(segment[0], edge[0], edge[1]) && pointIsOnSegment2d(segment[1], edge[0], edge[1]),
  );

const segmentLength = (segment: LineSegment): number =>
  Math.hypot(segment[1][0] - segment[0][0], segment[1][1] - segment[0][1], segment[1][2] - segment[0][2]);

const roundCoordinate = (value: number): number => Math.round(value * 1000) / 1000;

const serializeSegment = (segment: LineSegment): string => {
  const endpoints = segment.map((point) => point.map((coordinate) => roundCoordinate(coordinate)).join(',')) as [
    string,
    string,
  ];
  endpoints.sort();
  return endpoints.join('|');
};

const serializeSegments = (segments: LineSegment[]): string[] =>
  segments.map((segment) => serializeSegment(segment)).sort();

const namedShape = <T>(name: string, shape: T): T & { name: string } =>
  Object.assign(shape as Record<string, unknown>, { name }) as T & { name: string };

function createPlanetGearProfilePoints(): Array<[number, number]> {
  const teeth = 12;
  const moduleSize = 2;
  const pressureAngleRadians = (20 * Math.PI) / 180;
  const pitchRadius = (moduleSize * teeth) / 2;
  const baseRadius = pitchRadius * Math.cos(pressureAngleRadians);
  const outerRadius = pitchRadius + moduleSize;
  const rootRadius = pitchRadius - 1.25 * moduleSize;
  const startRadius = Math.max(rootRadius, baseRadius);
  const startT = Math.sqrt(Math.max(0, (startRadius / baseRadius) ** 2 - 1));
  const endT = Math.sqrt(Math.max(0, (outerRadius / baseRadius) ** 2 - 1));
  const pitchTheta = Math.tan(pressureAngleRadians) - pressureAngleRadians;
  const points: Array<[number, number]> = [];

  for (let toothIndex = 0; toothIndex < teeth; toothIndex++) {
    const toothCenterAngle = (toothIndex * 2 * Math.PI) / teeth;
    const nextToothCenterAngle = ((toothIndex + 1) * 2 * Math.PI) / teeth;
    const leftPoints: Array<[number, number]> = [];
    const rightPoints: Array<[number, number]> = [];

    if (rootRadius < baseRadius) {
      const rootTheta = -pitchTheta - Math.PI / (2 * teeth) + 0.008 + toothCenterAngle;
      leftPoints.push([rootRadius * Math.cos(rootTheta), rootRadius * Math.sin(rootTheta)]);
    }

    for (let step = 0; step <= 12; step++) {
      const t = startT + (endT - startT) * (step / 12);
      const radius = baseRadius * Math.sqrt(1 + t * t);
      const rawTheta = t - Math.atan(t);
      const theta = rawTheta - pitchTheta - Math.PI / (2 * teeth) + 0.008 + toothCenterAngle;
      leftPoints.push([radius * Math.cos(theta), radius * Math.sin(theta)]);
    }

    const topPoints: Array<[number, number]> = [];
    const leftOuterTheta = endT - Math.atan(endT) - pitchTheta - Math.PI / (2 * teeth) + 0.008 + toothCenterAngle;
    const rightOuterTheta = -(endT - Math.atan(endT)) + pitchTheta + Math.PI / (2 * teeth) - 0.008 + toothCenterAngle;
    for (let step = 1; step < 3; step++) {
      const theta = leftOuterTheta + (rightOuterTheta - leftOuterTheta) * (step / 3);
      topPoints.push([outerRadius * Math.cos(theta), outerRadius * Math.sin(theta)]);
    }

    for (let step = 12; step >= 0; step--) {
      const t = startT + (endT - startT) * (step / 12);
      const radius = baseRadius * Math.sqrt(1 + t * t);
      const rawTheta = t - Math.atan(t);
      const theta = -rawTheta + pitchTheta + Math.PI / (2 * teeth) - 0.008 + toothCenterAngle;
      rightPoints.push([radius * Math.cos(theta), radius * Math.sin(theta)]);
    }

    if (rootRadius < baseRadius) {
      const rootTheta = pitchTheta + Math.PI / (2 * teeth) - 0.008 + toothCenterAngle;
      rightPoints.push([rootRadius * Math.cos(rootTheta), rootRadius * Math.sin(rootTheta)]);
    }

    const currentRightRootTheta =
      rootRadius < baseRadius
        ? pitchTheta + Math.PI / (2 * teeth) - 0.008 + toothCenterAngle
        : -startT + Math.atan(startT) + pitchTheta + Math.PI / (2 * teeth) - 0.008 + toothCenterAngle;
    const nextLeftRootTheta =
      rootRadius < baseRadius
        ? -pitchTheta - Math.PI / (2 * teeth) + 0.008 + nextToothCenterAngle
        : startT - Math.atan(startT) - pitchTheta - Math.PI / (2 * teeth) + 0.008 + nextToothCenterAngle;
    const gapPoints: Array<[number, number]> = [];
    for (let step = 1; step < 4; step++) {
      const theta = currentRightRootTheta + (nextLeftRootTheta - currentRightRootTheta) * (step / 4);
      gapPoints.push([rootRadius * Math.cos(theta), rootRadius * Math.sin(theta)]);
    }

    points.push(...leftPoints, ...topPoints, ...rightPoints, ...gapPoints);
  }

  return points;
}

function createPlanetGearWithSplitCapChains(): JscadGeom3 {
  const gear2d = primitives.polygon({ points: createPlanetGearProfilePoints() });
  const gearBody = extrusions.extrudeLinear({ height: 10 }, gear2d);
  const carrierPinHole = primitives.cylinder({
    center: [0, 0, 0],
    height: 11,
    radius: 3.1,
    segments: 24,
  });

  return booleans.subtract(gearBody, carrierPinHole);
}

describe('jscadToGltf', () => {
  it('should expose coordinate and unit export schema for GLB', () => {
    const parsed = jscadExportSchemas.glb.parse({});

    expect(parsed).toEqual({
      coordinateSystem: 'z-up',
      unit: { length: 'meter' },
    });
  });

  it('should export a 50 mm cuboid as z-up millimeter GLB evidence', async () => {
    const shape = primitives.cuboid({ size: [50, 50, 50] });

    const glb = jscadToGltf(shape, {
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
    });

    const bounds = await readBoundingBox(glb);
    expect(bounds.min).toEqual([-25, -25, -25]);
    expect(bounds.max).toEqual([25, 25, 25]);
  });

  it('should emit owner-local line primitives on the same mesh as JSCAD surfaces', async () => {
    const shape = primitives.cuboid({ size: [10, 10, 10] });

    const glb = jscadToGltf(shape, {
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
      includeEdges: true,
    });

    const primitiveModes = await readPrimitiveModes(glb);
    expect(primitiveModes).toEqual([[primitiveModeTriangles, primitiveModeLines]]);

    const segments = await readLineSegments(glb);
    expect(segments).toHaveLength(12);
    expect(hasSegment(segments, [-5, -5, -5], [5, -5, -5])).toBe(true);

    const document = await createNodeIo().readBinary(glb);
    const linePrimitive = document
      .getRoot()
      .listMeshes()[0]!
      .listPrimitives()
      .find((primitive) => primitive.getMode() === primitiveModeLines)!;
    const material = linePrimitive.getMaterial()!;
    expect(material.getBaseColorFactor()).toEqual([0, 0, 0, 1]);
    expect(material.getMetallicFactor()).toBe(0);
    expect(material.getRoughnessFactor()).toBe(1);
    expect(material.getDoubleSided()).toBe(true);
    expect(material.getAlphaMode()).toBe('OPAQUE');
    expect(material.getExtension('KHR_materials_unlit')).not.toBeNull();
    expect(
      document
        .getRoot()
        .listExtensionsUsed()
        .map((extension) => extension.extensionName),
    ).toEqual(['KHR_materials_unlit']);
    expect(readGlbExtensionsRequired(glb)).toBeUndefined();
  });

  it('should omit line primitives unless edges are requested', async () => {
    const shape = primitives.cuboid({ size: [10, 10, 10] });
    const glb = jscadToGltf(shape, {
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
    });

    expect(await readPrimitiveModes(glb)).toEqual([[primitiveModeTriangles]]);
  });

  it('should name assembly nodes and meshes from JSCAD part names with deterministic fallbacks', async () => {
    const housing = namedShape('Housing', primitives.cuboid({ size: [10, 10, 10] }));
    const firstPlanet = namedShape(
      'Planet Gear',
      transforms.translate([20, 0, 0], primitives.cuboid({ size: [6, 6, 6] })),
    );
    const secondPlanet = namedShape(
      'Planet Gear',
      transforms.translate([30, 0, 0], primitives.cuboid({ size: [6, 6, 6] })),
    );
    const unnamedCarrier = transforms.translate([40, 0, 0], primitives.cuboid({ size: [4, 4, 4] }));

    const glb = jscadToGltf([[housing, [firstPlanet, secondPlanet]], unnamedCarrier], {
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
      includeEdges: true,
    });

    const { nodeNames, meshNames } = await readNodeMeshNames(glb);
    expect(nodeNames).toEqual(['Housing', 'Planet Gear', 'Planet Gear 2', 'Shape 4']);
    expect(meshNames).toEqual(nodeNames);

    const primitiveModes = await readPrimitiveModes(glb);
    expect(primitiveModes).toEqual([
      [primitiveModeTriangles, primitiveModeLines],
      [primitiveModeTriangles, primitiveModeLines],
      [primitiveModeTriangles, primitiveModeLines],
      [primitiveModeTriangles, primitiveModeLines],
    ]);
  });

  it('should suppress the upstream T-junction top chord while preserving real outline edges', async () => {
    const shape = geometries.geom3.fromPoints([
      [
        [-1, -1, -1],
        [-1, -1, 1],
        [-1, 1, 1],
        [-1, 1, -1],
      ],
      [
        [1, -1, -1],
        [1, 1, -1],
        [1, 1, 1],
        [1, -1, 1],
      ],
      [
        [-1, -1, -1],
        [1, -1, -1],
        [1, -1, 1],
        [-1, -1, 1],
      ],
      [
        [-1, 1, -1],
        [-1, 1, 1],
        [1, 1, 1],
        [1, 1, -1],
      ],
      [
        [-1, -1, -1],
        [-1, 1, -1],
        [1, 1, -1],
        [1, -1, -1],
      ],
      [
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
      ],
      [
        [1, 1, 1],
        [-1, 1, 1],
        [0, 0, 1],
      ],
      [
        [-1, 1, 1],
        [-1, -1, 1],
        [0, 0, 1],
      ],
    ]);

    const glb = jscadToGltf(shape, {
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
      includeEdges: true,
    });

    const segments = await readLineSegments(glb);
    expect(hasSegment(segments, [1, 1, 1], [-1, -1, 1])).toBe(false);
    expect(hasSegment(segments, [-1, -1, -1], [1, -1, -1])).toBe(true);
    expect(hasSegment(segments, [-1, -1, -1], [-1, -1, 1])).toBe(true);
  });

  it('should suppress concave extrusion cap-internal chord lines while preserving cap perimeter edges', async () => {
    const outline: Array<[number, number]> = [
      [0, 0],
      [30, 0],
      [30, 10],
      [10, 10],
      [10, 30],
      [0, 30],
    ];
    const shape = extrusions.extrudeLinear({ height: 5 }, geometries.geom2.fromPoints(outline));

    const glb = jscadToGltf(shape, {
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
      includeEdges: true,
    });

    const segments = await readLineSegments(glb);
    const allowedTopPerimeter: LineSegment[] = [
      [
        [0, 0, 5],
        [30, 0, 5],
      ],
      [
        [30, 0, 5],
        [30, 10, 5],
      ],
      [
        [30, 10, 5],
        [10, 10, 5],
      ],
      [
        [10, 10, 5],
        [10, 30, 5],
      ],
      [
        [10, 30, 5],
        [0, 30, 5],
      ],
      [
        [0, 30, 5],
        [0, 0, 5],
      ],
    ];

    const capInternalSegments = segments.filter(
      (segment) => isOnPlane(segment, 2, 5) && !segmentIsOnBoundary2d(segment, allowedTopPerimeter),
    );

    expect(capInternalSegments).toEqual([]);
    expect(hasSegment(segments, [0, 0, 5], [30, 0, 5])).toBe(true);
    expect(hasSegment(segments, [30, 10, 5], [10, 10, 5])).toBe(true);
  });

  it('should suppress planet gear split-chain cap chords while preserving real rim and side edges', async () => {
    const shape = createPlanetGearWithSplitCapChains();

    const glb = jscadToGltf(shape, {
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
      includeEdges: true,
    });

    const primitiveModes = await readPrimitiveModes(glb);
    expect(primitiveModes).toEqual([[primitiveModeTriangles, primitiveModeLines]]);

    const segments = await readLineSegments(glb);
    const longCapSegments = segments.filter(
      (segment) => (isOnPlane(segment, 2, 0) || isOnPlane(segment, 2, 10)) && segmentLength(segment) > 8,
    );
    const [rimX, rimY] = createPlanetGearProfilePoints()[0]!;

    expect(longCapSegments).toEqual([]);
    expect(hasSegment(segments, [rimX, rimY, 0], [rimX, rimY, 10])).toBe(true);
    expect(
      segments.some(
        (segment) =>
          isOnPlane(segment, 2, 10) &&
          segmentLength(segment) > 0.05 &&
          segmentLength(segment) < 4 &&
          Math.hypot(segment[0][0], segment[0][1]) > 9 &&
          Math.hypot(segment[1][0], segment[1][1]) > 9,
      ),
    ).toBe(true);
  });

  it('should preserve watertight topology for valid JSCAD gear extrusions', async () => {
    const gear2d = primitives.polygon({ points: createPlanetGearProfilePoints() });
    const profileWithCenterHole = booleans.subtract(gear2d, primitives.circle({ radius: 3.1, segments: 24 }));
    const shape = extrusions.extrudeLinear({ height: 10 }, profileWithCenterHole);

    const glb = jscadToGltf(shape, {
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
    });

    const topology = await readTriangleTopology(glb);
    expect(topology.triangles).toBeGreaterThan(0);
    expect(topology.boundaryEdges).toBe(0);
    expect(topology.nonManifoldEdges).toBe(0);
  });

  it('should preserve the original JSCAD shape while using fresh export evidence', async () => {
    const originalShape = colors.colorize(
      [0.2, 0.4, 0.8, 1],
      transforms.translate([2, 3, 4], createPlanetGearWithSplitCapChains()),
    ) as JscadShapeIntrospection;
    const originalPolygons = originalShape.polygons;
    const originalPolygonCount = originalPolygons?.length;
    const originalTransforms = [...(originalShape.transforms ?? [])];
    const originalColor = [...(originalShape.color ?? [])];
    const originalRetessellationFlag = originalShape.isRetesselated;

    const glb = jscadToGltf(originalShape, {
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
      includeEdges: true,
    });

    expect(originalShape.isRetesselated).toBe(originalRetessellationFlag);
    expect(originalShape.polygons).toBe(originalPolygons);
    expect(originalShape.polygons).toHaveLength(originalPolygonCount ?? 0);
    expect(originalShape.transforms).toEqual(originalTransforms);
    expect(originalShape.color).toEqual(originalColor);

    const triangleMaterialNames = await readMaterialNamesByPrimitiveMode(glb, primitiveModeTriangles);
    const lineMaterialNames = await readMaterialNamesByPrimitiveMode(glb, primitiveModeLines);
    expect(triangleMaterialNames).toEqual(['']);
    expect(lineMaterialNames).toEqual(['']);

    const bounds = await readBoundingBox(glb);
    expect(bounds.min[0]).toBeGreaterThan(-13);
    expect(bounds.max[0]).toBeGreaterThan(15);
    expect(bounds.min[2]).toBeCloseTo(4, 3);
    expect(bounds.max[2]).toBeCloseTo(14, 3);
  });

  it('should keep boundary lines for open polygon geometry', async () => {
    const shape = geometries.geom3.fromPoints([
      [
        [0, 0, 0],
        [10, 0, 0],
        [10, 10, 0],
        [0, 10, 0],
      ],
    ]);

    const glb = jscadToGltf(shape, {
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
      includeEdges: true,
    });

    const segments = await readLineSegments(glb);
    expect(hasSegment(segments, [0, 0, 0], [10, 0, 0])).toBe(true);
    expect(hasSegment(segments, [10, 0, 0], [10, 10, 0])).toBe(true);
    expect(hasSegment(segments, [10, 10, 0], [0, 10, 0])).toBe(true);
    expect(hasSegment(segments, [0, 10, 0], [0, 0, 0])).toBe(true);
    expect(hasSegment(segments, [0, 0, 0], [10, 10, 0])).toBe(false);
  });

  it('should produce deterministic lines for duplicate coplanar coverage', async () => {
    const shape = geometries.geom3.fromPoints([
      [
        [-1, -1, -1],
        [-1, -1, 1],
        [-1, 1, 1],
        [-1, 1, -1],
      ],
      [
        [1, -1, -1],
        [1, 1, -1],
        [1, 1, 1],
        [1, -1, 1],
      ],
      [
        [-1, -1, -1],
        [1, -1, -1],
        [1, -1, 1],
        [-1, -1, 1],
      ],
      [
        [-1, 1, -1],
        [-1, 1, 1],
        [1, 1, 1],
        [1, 1, -1],
      ],
      [
        [-1, -1, -1],
        [-1, 1, -1],
        [1, 1, -1],
        [1, -1, -1],
      ],
      [
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1],
      ],
      [
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1],
      ],
    ]);

    const firstGlb = jscadToGltf(shape, {
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
      includeEdges: true,
    });
    const secondGlb = jscadToGltf(shape, {
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
      includeEdges: true,
    });
    const firstSegments = await readLineSegments(firstGlb);
    const secondSegments = await readLineSegments(secondGlb);

    expect(serializeSegments(firstSegments)).toEqual(serializeSegments(secondSegments));
    expect(hasSegment(firstSegments, [-1, -1, -1], [1, -1, -1])).toBe(true);
    expect(firstSegments.length).toBeGreaterThan(0);
  });
});
