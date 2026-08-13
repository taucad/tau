/**
 * Interface-authoring helpers: placement-aware probe finders.
 *
 * Finders are evaluated by replicad's exportSTEP against the PLACED entry
 * shape, so probes computed in part-local coordinates are mapped through the
 * same Placement as the geometry. All probes use withinDistance rather than
 * containsPoint (1e-6) to absorb transform round-off.
 */
import type { FaceFinder } from 'replicad';
import {
  axis,
  face,
  frame,
  group,
} from '@taucad/runtime/kernels/replicad/annotations';
import type {
  AxisDeclaration,
  DatumDeclaration,
  FaceDeclaration,
} from '@taucad/runtime/kernels/replicad/annotations';
import { Placement } from './frame.js';
import type { Vec3 } from './frame.js';

export type SurfaceKind = Parameters<FaceFinder['ofSurfaceType']>[0];

/** Probe tolerance: on-face probes are within this of their own face. */
const defaultProbeTol = 0.2;

/** Face interface: the unique `surface`-type face within tol of the probe. */
export const faceNear = (
  place: Placement,
  probe: Vec3,
  surface?: SurfaceKind,
  tol = defaultProbeTol,
): FaceDeclaration => {
  const world = place.pt(probe);
  return face((f) => {
    const finder = surface ? f.ofSurfaceType(surface) : f;
    return finder.withinDistance(tol, world);
  });
};

/** Axis interface: unique cylindrical/conical face near the probe. */
export const axisNear = (
  place: Placement,
  probe: Vec3,
  surface: SurfaceKind = 'CYLINDRE',
  tol = defaultProbeTol,
): AxisDeclaration => {
  const world = place.pt(probe);
  return axis((f) => f.ofSurfaceType(surface).withinDistance(tol, world));
};

/** Ordered face group from local probes (members become name[1..N]). */
export const groupNear = (
  place: Placement,
  probes: Vec3[],
  surface?: SurfaceKind,
  tol = defaultProbeTol,
): ReturnType<typeof group> =>
  group(probes.map((probe) => faceNear(place, probe, surface, tol)));

/** Ordered axis group from local probes. */
export const axisGroupNear = (
  place: Placement,
  probes: Vec3[],
  surface: SurfaceKind = 'CYLINDRE',
  tol = defaultProbeTol,
): ReturnType<typeof group> =>
  group(probes.map((probe) => axisNear(place, probe, surface, tol)));

/** Datum frame in world coordinates derived from local origin/axes. */
export const datumAt = (
  place: Placement,
  origin: Vec3,
  xAxis: Vec3,
  zAxis: Vec3,
): DatumDeclaration => {
  const wx = place.dir(xAxis);
  const wz = place.dir(zAxis);
  return frame({ origin: place.pt(origin), xAxis: wx, zAxis: wz });
};

export { Placement };
export type { Vec3 };
