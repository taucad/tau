// Derived from LEAP71_RoverWheel — RoverWheel/WheelElements/{RectHoles,TubeStruts,
// EgyptianStruts,RosettaStruts,SpiralStruts}.cs
// Copyright (c) 2023-2026 LEAP 71 — https://leap71.com
// SPDX-License-Identifier: Apache-2.0
// Ported to TypeScript for picovoxel (blueprint R10); see NOTICE.
//
// The C# abstract WheelElements class (three fields + one method) becomes a
// function type; the C# static RoverWheel reads become the explicit ctx
// parameter. Each element keeps the exact construction algorithm.

import type { Pico, Vec3, Voxels } from 'picovoxel';
import { vec3 } from 'picovoxel/numerics';
import { BaseCylinder, localFrame, meshUtility, sh, splineOps, uf, vecOps } from 'picovoxel/shapekernel';
import { WheelContext, type WheelLayer } from './wheelContext.ts';

/** C# `WheelElements.voxConstruct` (session-first, context-explicit). */
export type WheelElementsBuilder = (
  pk: Pico,
  ctx: WheelContext,
  layer: WheelLayer,
  symmetry: number,
  wallThickness: number,
) => Voxels;

const TWO_PI = 2 * Math.PI;

/** C# symmetry override shared by Tube/Egyptian/Spiral: at least one strut per band width. */
function overriddenSymmetry(symmetry: number, refInnerRadius: number, refOuterRadius: number): number {
  const refMidRadius = 0.5 * (refInnerRadius + refOuterRadius);
  const range = refOuterRadius - refInnerRadius;
  return Math.max(symmetry, Math.trunc((TWO_PI * refMidRadius) / range));
}

/** Shared tail: union → flatten between the z planes → per-vertex map into wheel space. */
function projectIntoWheel(pk: Pico, ctx: WheelContext, voxelList: Voxels[], zList: readonly number[]): Voxels {
  const combined = voxelList[0]!
    .union(...voxelList.slice(1))
    .projectZSlice({ startZ: zList[0]!, endZ: zList[zList.length - 1]! });
  return meshUtility.applyTransformation(pk, combined.toMesh(), ctx.wheelLayerTrafo).toVoxels();
}

/** Solid layer minus supershape-profiled cylinder holes (C# `RectHoles`). */
export const rectHoles: WheelElementsBuilder = (pk, ctx, layer, symmetry, wallThickness) => {
  const { refInnerRadius, refOuterRadius } = ctx.layerRadii(layer);

  // C# vecSupershapeTrafo — quad-ish supershape profile on the unit cylinder.
  const supershapeTrafo = (pt: Vec3): Vec3 => {
    const phi = vecOps.phi(pt);
    return vecOps.cylPoint(vecOps.radius(pt) * uf.superShapeRadius(phi, 4, 20, 15, 15), phi, pt[2]);
  };

  const holes: Voxels[] = [];
  for (let i = 0; i < symmetry; i += 1) {
    const phiMid = (TWO_PI / symmetry) * i;
    // C# vecTrafo — uniform cylinder → rect hole → wheel space. The C#
    // unreachable dummy-trafo return after the wheel-space return is dropped.
    const trafo = (rawPt: Vec3): Vec3 => {
      const pt = supershapeTrafo(rawPt);
      const radiusRatio = (pt[1] + 1) / 2; // -1 to 1
      const widthRatio = pt[0]; // -1 to 1
      const innerR = refInnerRadius + wallThickness;
      const outerR = refOuterRadius - wallThickness;
      const newRadius = innerR + radiusRatio * (outerR - innerR);
      const coreGap = 0.5 * wallThickness;
      const maxPhi = Math.PI / symmetry;
      const maxArc = maxPhi * newRadius; // C# "Bogen"
      const arc = maxArc - coreGap;
      const dPhi = arc / newRadius;
      const newPhi = phiMid + dPhi * widthRatio;
      return ctx.wheelLayerTrafo(vecOps.cylPoint(newRadius, newPhi, pt[2]));
    };
    const hole = new BaseCylinder(localFrame.identity, ctx.refWidth, 1);
    hole.setLengthSteps(100);
    hole.setRadialSteps(100);
    hole.setPolarSteps(100);
    hole.setTransformation(trafo);
    holes.push(hole.voxConstruct(pk));
  }
  const voxHoles = holes[0]!.union(...holes.slice(1));
  return ctx.layerVoxels(pk, layer.startLengthRatio, layer.endLengthRatio).subtract(voxHoles);
};

/** Flattened lattice rings spanning the band (C# `TubeStruts`). */
export const tubeStruts: WheelElementsBuilder = (pk, ctx, layer, symmetry, wallThickness) => {
  const { refInnerRadius, refOuterRadius } = ctx.layerRadii(layer);
  const n = overriddenSymmetry(symmetry, refInnerRadius, refOuterRadius);
  const circleSamples = 100;
  const voxelList: Voxels[] = [];
  const zList = [ctx.refWidth - 0.5 * wallThickness, 0.5 * wallThickness];

  for (const z of zList) {
    for (let i = 0; i < n; i += 1) {
      const phiMid = (TWO_PI / n) * i;
      // C# vecTrafo — like RectHoles' band mapping, but without the
      // supershape profile and without the wall inset, and staying in
      // cylindrical design space (the wheel trafo comes via the mesh pass).
      const trafo = (pt: Vec3): Vec3 => {
        const radiusRatio = (pt[1] + 1) / 2;
        const widthRatio = pt[0];
        const newRadius = refInnerRadius + radiusRatio * (refOuterRadius - refInnerRadius);
        const coreGap = 0.5 * wallThickness;
        const maxPhi = Math.PI / n;
        const maxArc = maxPhi * newRadius;
        const arc = maxArc - coreGap;
        const dPhi = arc / newRadius;
        const newPhi = phiMid + dPhi * widthRatio;
        return vecOps.cylPoint(newRadius, newPhi, pt[2]);
      };
      const lattice = pk.createLattice();
      for (let sample = 0; sample < circleSamples; sample += 1) {
        const pt1 = trafo(vecOps.cylPoint(1, (TWO_PI / circleSamples) * (sample - 1), z));
        const pt2 = trafo(vecOps.cylPoint(1, (TWO_PI / circleSamples) * sample, z));
        lattice.addBeam({ start: pt1, end: pt2, radius: 0.5 * wallThickness });
      }
      voxelList.push(lattice.toVoxels());
    }
  }
  return projectIntoWheel(pk, ctx, voxelList, zList);
};

/** Shared driver of the three NURBS-strut elements: per-z, per-strut spline → lattice line. */
function splineStruts(
  pk: Pico,
  ctx: WheelContext,
  layer: WheelLayer,
  symmetry: number,
  wallThickness: number,
  overrideSymmetry: boolean,
  controlPointsFor: (n: number, phi: number, z: number, dR: number, refInnerRadius: number, refOuterRadius: number) => Vec3[],
): Voxels {
  const { refInnerRadius, refOuterRadius } = ctx.layerRadii(layer);
  const n = overrideSymmetry ? overriddenSymmetry(symmetry, refInnerRadius, refOuterRadius) : symmetry;
  const dR = refOuterRadius - refInnerRadius;
  const voxelList: Voxels[] = [];
  const zList = [ctx.refWidth - 0.5 * wallThickness, 0.5 * wallThickness];

  for (const z of zList) {
    for (let i = 0; i < n; i += 1) {
      const phi = (TWO_PI / n) * i;
      const controlPoints = controlPointsFor(n, phi, z, dR, refInnerRadius, refOuterRadius);
      const points = splineOps.nurbsSpline(controlPoints, 500);
      voxelList.push(sh.latFromLine(pk, points, 0.5 * wallThickness).toVoxels());
    }
  }
  return projectIntoWheel(pk, ctx, voxelList, zList);
}

const radialOffset = (pt: Vec3, factor: number, dR: number): Vec3 =>
  vec3.add(pt, vec3.scale(vecOps.planarDir(pt), factor * dR));

/** Angular meander struts (C# `EgyptianStruts`; symmetry overridden). */
export const egyptianStruts: WheelElementsBuilder = (pk, ctx, layer, symmetry, wallThickness) =>
  splineStruts(pk, ctx, layer, symmetry, wallThickness, true, (n, phi, z, dR, refInnerRadius) => {
    const dPhi = TWO_PI / n;
    const pt1 = vecOps.cylPoint(refInnerRadius, phi - 0.5 * dPhi, z);
    // C# computes vecPt2/vecRadial2 at phi and never uses them; dropped.
    // C# quirk kept: pt3 sits at +0.4 dPhi, not the symmetric +0.5.
    const pt3 = vecOps.cylPoint(refInnerRadius, phi + 0.4 * dPhi, z);
    return [
      radialOffset(pt1, 0, dR),
      radialOffset(pt1, 0.3, dR),
      radialOffset(pt3, 0.1, dR),
      radialOffset(pt3, 0.9, dR),
      radialOffset(pt1, 0.7, dR),
      radialOffset(pt1, 1, dR),
    ];
  });

/** Petal-shaped struts meeting at the outer radius (C# `RosettaStruts`; symmetry NOT overridden). */
export const rosettaStruts: WheelElementsBuilder = (pk, ctx, layer, symmetry, wallThickness) =>
  splineStruts(pk, ctx, layer, symmetry, wallThickness, false, (n, phi, z, dR, refInnerRadius, refOuterRadius) => {
    const dPhi = TWO_PI / n;
    const pt1 = vecOps.cylPoint(refInnerRadius, phi - 0.5 * dPhi, z);
    const pt2 = vecOps.cylPoint(refOuterRadius, phi, z);
    const pt3 = vecOps.cylPoint(refInnerRadius, phi + 0.5 * dPhi, z);
    // C# duplicates pt2 to sharpen the petal tip, verbatim.
    return [pt1, radialOffset(pt1, 0.6, dR), pt2, pt2, radialOffset(pt3, 0.6, dR), pt3];
  });

/** Double-pitch spiral struts (C# `SpiralStruts`; symmetry overridden). */
export const spiralStruts: WheelElementsBuilder = (pk, ctx, layer, symmetry, wallThickness) =>
  splineStruts(pk, ctx, layer, symmetry, wallThickness, true, (n, phi, z, dR, refInnerRadius) => {
    // C# quirk kept: dPhi spans TWO symmetry sectors.
    const dPhi = (2 * TWO_PI) / n;
    const pt1 = vecOps.cylPoint(refInnerRadius, phi - 0.5 * dPhi, z);
    const pt2 = vecOps.cylPoint(refInnerRadius, phi, z);
    const pt3 = vecOps.cylPoint(refInnerRadius, phi + 0.5 * dPhi, z);
    return [
      radialOffset(pt1, 0, dR),
      radialOffset(pt1, 0.3, dR),
      radialOffset(pt2, 0.4, dR),
      radialOffset(pt3, 0.7, dR),
      radialOffset(pt3, 1, dR),
    ];
  });
