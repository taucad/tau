/* eslint-disable @typescript-eslint/naming-convention -- Physical wire units use the published valueGPerCm3 spelling. */
import { CompSolid, Compound, Solid, iterTopo, measureVolume } from 'replicad';
import type { AnyShape, MeshShape } from 'replicad';
import type { OpenCascadeInstance } from 'replicad-opencascadejs';
import { digestContent } from '@taucad/cache-core';
import type { TauCadPhysical } from '@taucad/geometry-core';

const encoder = new TextEncoder();
const digestPrefix = 'replicad|occt-brep-serialize-v1|unit=millimeter|volume=occt-solid-volume\n';
const volumeCache = new WeakMap<OpenCascadeInstance, Map<string, number>>();
const maxCachedVolumes = 64;

const cachedVolume = (openCascade: OpenCascadeInstance, digest: string): number | undefined => {
  const cache = volumeCache.get(openCascade);
  const value = cache?.get(digest);
  if (value !== undefined) {
    cache?.delete(digest);
    cache?.set(digest, value);
  }
  return value;
};

const rememberVolume = (openCascade: OpenCascadeInstance, digest: string, value: number): void => {
  let cache = volumeCache.get(openCascade);
  if (!cache) {
    cache = new Map();
    volumeCache.set(openCascade, cache);
  }
  cache.set(digest, value);
  if (cache.size > maxCachedVolumes) {
    cache.delete(cache.keys().next().value!);
  }
};

const countTopo = (shape: AnyShape['wrapped'], kind: 'face' | 'edge' | 'vertex'): number => {
  const items = [...iterTopo(shape, kind)];
  try {
    return items.length;
  } finally {
    for (const item of items) {
      item.delete();
    }
  }
};

const isOneSolid = (shape: AnyShape | MeshShape): shape is Solid | CompSolid | Compound => {
  if (shape instanceof Solid) {
    return true;
  }
  if (!(shape instanceof Compound || shape instanceof CompSolid)) {
    return false;
  }
  const solids = [...iterTopo(shape.wrapped, 'solid')];
  try {
    if (solids.length !== 1) {
      return false;
    }
    // Replicad booleans commonly wrap one solid in a Compound. Reject extra free
    // faces/edges/vertices rather than treating a mixed compound as one solid.
    for (const kind of ['face', 'edge', 'vertex'] as const) {
      if (countTopo(shape.wrapped, kind) !== countTopo(solids[0]!, kind)) {
        return false;
      }
    }
    return true;
  } finally {
    for (const solid of solids) {
      solid.delete();
    }
  }
};

/**
 * Measure only a checked native solid; a display mesh is never a volume oracle.
 * @param config - Authored native shape and optional density assignment.
 * @param openCascade - The producer's initialized native OCCT instance.
 * @param measure - Native measurement function; injectable for work-count verification.
 * @returns Measured or unavailable physical evidence.
 * @internal
 */
export const measureReplicadPhysical = async (
  config: Readonly<{ shape: AnyShape | MeshShape; density?: number }>,
  openCascade: OpenCascadeInstance,
  measure: typeof measureVolume = measureVolume,
): Promise<TauCadPhysical> => {
  const { shape, density } = config;
  if (density !== undefined && (!Number.isFinite(density) || density <= 0)) {
    throw new TypeError('Replicad physical density must be a finite positive value in g/cm³.');
  }
  const assignment =
    density === undefined ? {} : { density: { valueGPerCm3: density, provenance: 'authored-shape-config' } as const };
  if (!isOneSolid(shape)) {
    return { volume: { state: 'unavailable', reason: 'not-solid' }, ...assignment };
  }

  try {
    // The serialized native shape is the completed geometry closure. Cache only
    // within this OCCT instance, which also binds the measuring implementation.
    const geometryDigest = await digestContent({ bytes: encoder.encode(`${digestPrefix}${shape.serialize()}`) });
    const volume = cachedVolume(openCascade, geometryDigest);
    if (volume !== undefined) {
      return {
        volume: {
          state: 'measured',
          valueMm3: volume,
          geometryDigest,
          method: 'occt-solid-volume',
          validity: 'closed-solid',
        },
        ...assignment,
      };
    }
    const analyzer = new openCascade.BRepCheck_Analyzer(shape.wrapped, true);
    let valid: boolean;
    try {
      // oxlint-disable-next-line new-cap -- OCCT's generated binding names this instance method IsValid.
      valid = analyzer.IsValid();
    } finally {
      analyzer.delete();
    }
    if (!valid) {
      return { volume: { state: 'unavailable', reason: 'invalid-solid' }, ...assignment };
    }
    const valueMm3 = measure(shape);
    if (!Number.isFinite(valueMm3) || valueMm3 <= 0) {
      return { volume: { state: 'unavailable', reason: 'invalid-solid' }, ...assignment };
    }
    rememberVolume(openCascade, geometryDigest, valueMm3);
    return {
      volume: { state: 'measured', valueMm3, geometryDigest, method: 'occt-solid-volume', validity: 'closed-solid' },
      ...assignment,
    };
  } catch {
    return { volume: { state: 'unavailable', reason: 'native-unavailable' }, ...assignment };
  }
};
