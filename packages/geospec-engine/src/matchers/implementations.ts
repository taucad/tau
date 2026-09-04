/**
 * The matcher bodies this engine build registers.
 *
 * The record type is PARTIAL and that remains a first-class state (D-S0):
 * capability discovery reports exactly what a build can execute, and the
 * substrate answers everything else with `GEOSPEC_ENGINE_UNAVAILABLE`. THIS
 * build is complete — all 24 registry matchers have bodies — and
 * `register.test.ts` pins the missing list at `[]` so a future build cannot
 * quietly drop one.
 *
 * @module
 */

import type { GeoSpecMatcherImplementations } from '#matchers/types.js';
import { toHaveNoDiagnostics } from '#matchers/diagnostic-matchers.js';
import {
  toBeValidBrep,
  toHaveAssemblyOccurrences,
  toHaveChamferFeature,
  toHaveCircularHole,
  toHaveCircularHolePattern,
  toHaveCylindricalFace,
  toHaveFilletFeature,
  toHaveMinimumWallThickness,
  toHavePlanarFace,
  toHaveProductStructure,
  toHaveStepUnits,
  toHaveTopologyCounts,
} from '#matchers/brep-matchers.js';
import {
  toBeWatertight,
  toHaveBoundingBox,
  toHaveCenterOfMass,
  toHaveConnectedComponents,
  toHaveMass,
  toHaveMeshIntegrity,
  toHaveNoComponentInterference,
  toHaveSurfaceArea,
  toHaveVolume,
} from '#matchers/mesh-matchers.js';
import { toHaveSpatialRelationships, toHaveVoidContinuity } from '#matchers/proof-matchers.js';

/**
 * Every matcher body this build provides, in the registry's own order.
 *
 * @public
 */
export const geoSpecMatcherImplementations: GeoSpecMatcherImplementations = {
  toHaveBoundingBox,
  toHaveConnectedComponents,
  toBeWatertight,
  toHaveNoComponentInterference,
  toHaveAssemblyOccurrences,
  toHaveSpatialRelationships,
  toHaveMeshIntegrity,
  toHaveNoDiagnostics,
  toHaveSurfaceArea,
  toHaveVolume,
  toHaveMass,
  toHaveCenterOfMass,
  toBeValidBrep,
  toHaveTopologyCounts,
  toHaveStepUnits,
  toHaveProductStructure,
  toHavePlanarFace,
  toHaveCylindricalFace,
  toHaveCircularHole,
  toHaveCircularHolePattern,
  toHaveChamferFeature,
  toHaveFilletFeature,
  toHaveMinimumWallThickness,
  toHaveVoidContinuity,
};
