import type * as THREE from 'three';
import { triangulateCapMultiPolygon } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean.js';
import type { SectionCutPlaneBasis } from '#components/geometry/graphics/three/utils/section-cap-region.js';
import {
  colorToComponents,
  sectionCapNormalRegionKind,
  sectionCapOverlapRegionKind,
} from '#components/geometry/graphics/three/utils/section-cap-style.js';
import type { CapMultiPolygon } from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';
import type { SectionCapPackingDebugSink } from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';

export type PackedSectionCapPart = Readonly<{
  multiPolygon: CapMultiPolygon;
  baseColor: number;
  stripeColor: number;
  patternStrength: number;
  stripeAxis: readonly [number, number];
  regionKind: 'normal' | 'overlap';
}>;

export type PackedSectionCapGeometryBuffers = Readonly<{
  positions: Float32Array;
  planeUv: Float32Array;
  baseColors: Float32Array;
  stripeColors: Float32Array;
  patternStrengths: Float32Array;
  stripeAxes: Float32Array;
  regionKinds: Uint8Array;
  indices: Uint32Array;
}>;

export type SectionCapPackedGeometryArena = {
  positions: Float32Array;
  planeUv: Float32Array;
  baseColors: Float32Array;
  stripeColors: Float32Array;
  patternStrengths: Float32Array;
  stripeAxes: Float32Array;
  regionKinds: Uint8Array;
  indices: Uint32Array;
};

type BuildPackedSectionCapGeometryOptions = Readonly<{
  parts: readonly PackedSectionCapPart[];
  basis: SectionCutPlaneBasis;
  meshWorldInverse: THREE.Matrix4;
  arena?: SectionCapPackedGeometryArena;
  debugSink?: SectionCapPackingDebugSink;
}>;

const defaultFloatCapacity = 64;
const defaultIndexCapacity = 128;

export const createSectionCapPackedGeometryArena = (): SectionCapPackedGeometryArena => ({
  positions: new Float32Array(defaultFloatCapacity * 3),
  planeUv: new Float32Array(defaultFloatCapacity * 2),
  baseColors: new Float32Array(defaultFloatCapacity * 3),
  stripeColors: new Float32Array(defaultFloatCapacity * 3),
  patternStrengths: new Float32Array(defaultFloatCapacity),
  stripeAxes: new Float32Array(defaultFloatCapacity * 2),
  regionKinds: new Uint8Array(defaultFloatCapacity),
  indices: new Uint32Array(defaultIndexCapacity),
});

const ensureFloatCapacity = (current: Float32Array, requiredLength: number): Float32Array => {
  if (current.length >= requiredLength) {
    return current;
  }

  let nextLength = Math.max(current.length, 1);
  while (nextLength < requiredLength) {
    nextLength *= 2;
  }

  return new Float32Array(nextLength);
};

const ensureIndexCapacity = (current: Uint32Array, requiredLength: number): Uint32Array => {
  if (current.length >= requiredLength) {
    return current;
  }

  let nextLength = Math.max(current.length, 1);
  while (nextLength < requiredLength) {
    nextLength *= 2;
  }

  return new Uint32Array(nextLength);
};

const ensureUint8Capacity = (current: Uint8Array, requiredLength: number): Uint8Array => {
  if (current.length >= requiredLength) {
    return current;
  }

  let nextLength = Math.max(current.length, 1);
  while (nextLength < requiredLength) {
    nextLength *= 2;
  }

  return new Uint8Array(nextLength);
};

const materializePackedBuffers = (options: {
  arena: SectionCapPackedGeometryArena | undefined;
  positions: readonly number[];
  planeUv: readonly number[];
  baseColors: readonly number[];
  stripeColors: readonly number[];
  patternStrengths: readonly number[];
  stripeAxes: readonly number[];
  regionKinds: readonly number[];
  indices: readonly number[];
}): PackedSectionCapGeometryBuffers => {
  if (!options.arena) {
    return {
      positions: new Float32Array(options.positions),
      planeUv: new Float32Array(options.planeUv),
      baseColors: new Float32Array(options.baseColors),
      stripeColors: new Float32Array(options.stripeColors),
      patternStrengths: new Float32Array(options.patternStrengths),
      stripeAxes: new Float32Array(options.stripeAxes),
      regionKinds: new Uint8Array(options.regionKinds),
      indices: new Uint32Array(options.indices),
    };
  }

  options.arena.positions = ensureFloatCapacity(options.arena.positions, options.positions.length);
  options.arena.planeUv = ensureFloatCapacity(options.arena.planeUv, options.planeUv.length);
  options.arena.baseColors = ensureFloatCapacity(options.arena.baseColors, options.baseColors.length);
  options.arena.stripeColors = ensureFloatCapacity(options.arena.stripeColors, options.stripeColors.length);
  options.arena.patternStrengths = ensureFloatCapacity(options.arena.patternStrengths, options.patternStrengths.length);
  options.arena.stripeAxes = ensureFloatCapacity(options.arena.stripeAxes, options.stripeAxes.length);
  options.arena.regionKinds = ensureUint8Capacity(options.arena.regionKinds, options.regionKinds.length);
  options.arena.indices = ensureIndexCapacity(options.arena.indices, options.indices.length);

  options.arena.positions.set(options.positions, 0);
  options.arena.planeUv.set(options.planeUv, 0);
  options.arena.baseColors.set(options.baseColors, 0);
  options.arena.stripeColors.set(options.stripeColors, 0);
  options.arena.patternStrengths.set(options.patternStrengths, 0);
  options.arena.stripeAxes.set(options.stripeAxes, 0);
  options.arena.regionKinds.set(options.regionKinds, 0);
  options.arena.indices.set(options.indices, 0);

  return {
    positions: options.arena.positions.subarray(0, options.positions.length),
    planeUv: options.arena.planeUv.subarray(0, options.planeUv.length),
    baseColors: options.arena.baseColors.subarray(0, options.baseColors.length),
    stripeColors: options.arena.stripeColors.subarray(0, options.stripeColors.length),
    patternStrengths: options.arena.patternStrengths.subarray(0, options.patternStrengths.length),
    stripeAxes: options.arena.stripeAxes.subarray(0, options.stripeAxes.length),
    regionKinds: options.arena.regionKinds.subarray(0, options.regionKinds.length),
    indices: options.arena.indices.subarray(0, options.indices.length),
  };
};

export const buildPackedSectionCapGeometry = (
  options: BuildPackedSectionCapGeometryOptions,
): PackedSectionCapGeometryBuffers => {
  const positions: number[] = [];
  const planeUv: number[] = [];
  const baseColors: number[] = [];
  const stripeColors: number[] = [];
  const patternStrengths: number[] = [];
  const stripeAxes: number[] = [];
  const regionKinds: number[] = [];
  const indices: number[] = [];

  for (const part of options.parts) {
    const triangulated = triangulateCapMultiPolygon({
      multiPolygon: part.multiPolygon,
      basis: options.basis,
      meshWorldInverse: options.meshWorldInverse,
    });
    if (triangulated.indices.length === 0) {
      continue;
    }

    const vertexBase = positions.length / 3;
    for (const position of triangulated.positions) {
      positions.push(position);
    }
    for (const uv of triangulated.planeUv) {
      planeUv.push(uv);
    }

    const baseColor = colorToComponents(part.baseColor);
    const stripeColor = colorToComponents(part.stripeColor);
    const vertexCount = triangulated.positions.length / 3;
    const regionKind = part.regionKind === 'overlap' ? sectionCapOverlapRegionKind : sectionCapNormalRegionKind;
    for (let index = 0; index < vertexCount; index++) {
      baseColors.push(baseColor[0], baseColor[1], baseColor[2]);
      stripeColors.push(stripeColor[0], stripeColor[1], stripeColor[2]);
      patternStrengths.push(part.patternStrength);
      stripeAxes.push(part.stripeAxis[0], part.stripeAxis[1]);
      regionKinds.push(regionKind);
    }

    for (const index of triangulated.indices) {
      indices.push(vertexBase + index);
    }
  }

  const packedVertexCount = positions.length / 3;
  const packedIndexCount = indices.length;
  const packedByteCount =
    positions.length * Float32Array.BYTES_PER_ELEMENT +
    planeUv.length * Float32Array.BYTES_PER_ELEMENT +
    baseColors.length * Float32Array.BYTES_PER_ELEMENT +
    stripeColors.length * Float32Array.BYTES_PER_ELEMENT +
    patternStrengths.length * Float32Array.BYTES_PER_ELEMENT +
    stripeAxes.length * Float32Array.BYTES_PER_ELEMENT +
    regionKinds.length * Uint8Array.BYTES_PER_ELEMENT +
    indices.length * Uint32Array.BYTES_PER_ELEMENT;
  options.debugSink?.recordPackedGeometry({
    partCount: options.parts.length,
    triangulatedPolygonCount: options.parts.reduce((sum, part) => sum + part.multiPolygon.length, 0),
    packedVertexCount,
    packedIndexCount,
    packedByteCount,
  });

  return materializePackedBuffers({
    arena: options.arena,
    positions,
    planeUv,
    baseColors,
    stripeColors,
    patternStrengths,
    stripeAxes,
    regionKinds,
    indices,
  });
};
