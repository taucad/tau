// Derived from LEAP71_RoverWheel — RoverWheel/TreadPatterns/TreadPattern_{01,02,03}.cs
// Copyright (c) 2023-2026 LEAP 71 — https://leap71.com
// SPDX-License-Identifier: Apache-2.0
// Ported to TypeScript for picovoxel (blueprint R10); see NOTICE.
//
// The C# ITreadPattern interface (one method, per-call state) becomes a plain
// function type; the patterns' instance fields become closures.

import type { Pico, Voxels } from 'picovoxel';
import type { Vec3 } from 'picovoxel';
import {
  BasePipe,
  localFrame,
  splineOps,
  SurfaceModulation,
  uf,
  vecOps,
  type VertexTransformation,
} from 'picovoxel/shapekernel';

/** C# `ITreadPattern.voxConstruct` (session-first). */
export type TreadPattern = (
  pk: Pico,
  refRadius: number,
  contourHeight: number,
  treadTrafo: VertexTransformation,
) => Voxels;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * Shared body of patterns 01 and 03 — a modulated pipe pushed through the
 * tread trafo. The C# originals voxelize the UNtransformed profile first and
 * discard the result; that dead voxelization is not reproduced.
 */
function profilePattern(
  pk: Pico,
  contourHeight: number,
  refRadius: number,
  profileHeight: (phi: number, lengthRatio: number) => number,
  treadTrafo: VertexTransformation,
): Voxels {
  const profile = new BasePipe(localFrame.identity, contourHeight);
  profile.setRadius(new SurfaceModulation(refRadius), new SurfaceModulation(profileHeight));
  profile.setTransformation(treadTrafo);
  return profile.voxConstruct(pk);
}

/** Crossed cosine-rib profile (C# `TreadPattern_01`). */
export const treadPattern01: TreadPattern = (pk, refRadius, contourHeight, treadTrafo) =>
  profilePattern(
    pk,
    contourHeight,
    refRadius,
    (phi, lengthRatio) =>
      refRadius + clamp(10 * Math.cos(50 * lengthRatio), 0, 8) + clamp(10 * Math.cos(50 * phi), 0, 8),
    treadTrafo,
  );

/** Zig-zag stud lattice (C# `TreadPattern_02`). */
export const treadPattern02: TreadPattern = (pk, refRadius, contourHeight, treadTrafo) => {
  const ribs = 50;
  const lattice = pk.createLattice();
  for (let i = 0; i < ribs; i += 1) {
    const phi = ((2 * Math.PI) / ribs) * i;
    const zigZags = 7;
    const dPhi = 0.2;
    let points: Vec3[] = [];
    for (let j = 0; j < zigZags; j += 1) {
      const z = (contourHeight / (zigZags - 1)) * j;
      // C# tracks a separate iCounter that always equals j.
      points.push(vecOps.cylPoint(refRadius, j % 2 === 1 ? phi + dPhi : phi, z));
    }
    points = splineOps.reparametrizedBySpacing(points, 1);

    for (let dRadiusRatio = 0; dRadiusRatio < 1; dRadiusRatio += 0.01) {
      for (const pt of points) {
        // C# computes a clamped fLengthRatio here and never uses it; dropped.
        let maxRadius = uf.transSmooth(2, 8, pt[2], 15, 3);
        maxRadius = uf.transSmooth(maxRadius, 2, pt[2], contourHeight - 15, 3);
        const dRadius = dRadiusRatio * maxRadius;
        lattice.addSphere({ center: treadTrafo(vecOps.updateRadius(pt, dRadius)), radius: 2 });
      }
    }
  }
  return lattice.toVoxels();
};

/** Combined-then-clamped cosine-rib profile (C# `TreadPattern_03`). */
export const treadPattern03: TreadPattern = (pk, refRadius, contourHeight, treadTrafo) =>
  profilePattern(
    pk,
    contourHeight,
    refRadius,
    (phi, lengthRatio) =>
      refRadius +
      clamp(clamp(10 * Math.cos(50 * lengthRatio), 0, 8) + clamp(10 * Math.cos(50 * phi), 0, 8), 0, 8),
    treadTrafo,
  );
