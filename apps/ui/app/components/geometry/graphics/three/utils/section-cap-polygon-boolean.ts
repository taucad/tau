import * as THREE from 'three';
import {
  capPointToWorld,
  denormalizeCapPoint,
  measureCapMultiPolygonArea as measureSectionCapMultiPolygonArea,
} from '#components/geometry/graphics/three/utils/section-cap-region.js';
import { createClipper2TsBackend } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-clipper2-ts.js';
import { createSectionCapBooleanOperations } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-backend.js';
import type { SectionCutPlaneBasis } from '#components/geometry/graphics/three/utils/section-cap-region.js';
import type {
  CapMultiPolygon,
  CapPolygon,
} from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';
import type { SectionCapBooleanDebugSink } from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';
import type { SectionCapBooleanResult } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-backend.js';

export type TriangulatedCapMultiPolygon = Readonly<{
  positions: Float32Array;
  planeUv: Float32Array;
  indices: Uint32Array;
}>;

type TriangulateCapMultiPolygonOptions = Readonly<{
  multiPolygon: CapMultiPolygon;
  basis: SectionCutPlaneBasis;
  meshWorldInverse: THREE.Matrix4;
}>;

export const defaultSectionCapBooleanBackend = createClipper2TsBackend();
export const defaultSectionCapBooleanOperations = createSectionCapBooleanOperations(defaultSectionCapBooleanBackend);

export const intersectCapPolygons = (
  first: CapMultiPolygon,
  second: CapMultiPolygon,
  debugSink?: SectionCapBooleanDebugSink,
): SectionCapBooleanResult => defaultSectionCapBooleanOperations.intersectCapPolygons(first, second, debugSink);

export const unionCapPolygons = (
  polygons: readonly CapMultiPolygon[],
  debugSink?: SectionCapBooleanDebugSink,
): SectionCapBooleanResult => defaultSectionCapBooleanOperations.unionCapPolygons(polygons, debugSink);

export const differenceCapPolygon = (
  source: CapMultiPolygon,
  subtractors: readonly CapMultiPolygon[],
  debugSink?: SectionCapBooleanDebugSink,
): SectionCapBooleanResult => defaultSectionCapBooleanOperations.differenceCapPolygon(source, subtractors, debugSink);

const appendTriangulatedPolygon = (
  polygon: CapPolygon,
  options: {
    basis: SectionCutPlaneBasis;
    meshWorldInverse: THREE.Matrix4;
    positions: number[];
    planeUv: number[];
    indices: number[];
  },
): void => {
  const outer = polygon[0];
  if (!outer || outer.length < 3) {
    return;
  }

  const contour = outer.map((point) => new THREE.Vector2(point[0], point[1]));
  const holes = polygon.slice(1).map((ring) => ring.map((point) => new THREE.Vector2(point[0], point[1])));
  const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
  if (faces.length === 0) {
    return;
  }

  const vertexBase = options.positions.length / 3;
  const allRings = [outer, ...polygon.slice(1)];
  for (const ring of allRings) {
    for (const point of ring) {
      const world = capPointToWorld(point, options.basis).applyMatrix4(options.meshWorldInverse);
      const planeUv = denormalizeCapPoint(point, options.basis);
      options.positions.push(world.x, world.y, world.z);
      options.planeUv.push(planeUv.u, planeUv.v);
    }
  }

  for (const face of faces) {
    options.indices.push(vertexBase + face[0]!, vertexBase + face[1]!, vertexBase + face[2]!);
  }
};

export const triangulateCapMultiPolygon = (options: TriangulateCapMultiPolygonOptions): TriangulatedCapMultiPolygon => {
  const positions: number[] = [];
  const planeUv: number[] = [];
  const indices: number[] = [];

  for (const polygon of options.multiPolygon) {
    appendTriangulatedPolygon(polygon, {
      basis: options.basis,
      meshWorldInverse: options.meshWorldInverse,
      positions,
      planeUv,
      indices,
    });
  }

  return {
    positions: new Float32Array(positions),
    planeUv: new Float32Array(planeUv),
    indices: new Uint32Array(indices),
  };
};

export const measureCapMultiPolygonArea = (multiPolygon: CapMultiPolygon): number =>
  measureSectionCapMultiPolygonArea(multiPolygon);
