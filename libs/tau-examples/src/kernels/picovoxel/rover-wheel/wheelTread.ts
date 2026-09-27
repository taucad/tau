// Derived from LEAP71_RoverWheel — RoverWheel/WheelTread.cs
// Copyright (c) 2023-2026 LEAP 71 — https://leap71.com
// SPDX-License-Identifier: Apache-2.0
// Ported to TypeScript for picovoxel (blueprint R10); see NOTICE.

import type { Pico, Vec3, Voxels } from 'picovoxel';
import { vec3 } from 'picovoxel/numerics';
import { BaseRevolve, Frames, localFrame, splineOps, vecOps } from 'picovoxel/shapekernel';
import type { TreadPattern } from './treadPatterns.ts';

/**
 * Generates the tread of a wheel by revolving the outer radius contour.
 * The specified tread pattern can either be added as an exposed profile or
 * subtracted from a solid tread layer (C# `WheelTread`).
 */
export class WheelTread {
  private readonly frames: Frames;
  private readonly pattern: TreadPattern;
  private refRadius = 0;
  private contourHeight = 0;

  constructor(outerWheelFrames: Frames, treadPattern: TreadPattern) {
    this.frames = outerWheelFrames;
    this.pattern = treadPattern;
  }

  /** The tread pattern as an exposed profile (C# `voxGetProfile`). */
  profileVoxels(pk: Pico): Voxels {
    this.refRadius = 140;
    this.contourHeight = splineOps.totalLength(this.frames.points(100));
    return this.pattern(pk, this.refRadius, this.contourHeight, this.treadTrafo);
  }

  /** Solid revolved layer minus the pattern (C# `voxGetTreadLayer`). */
  treadLayerVoxels(pk: Pico, outwardsThickness = 3, inwardsThickness = 2): Voxels {
    const treadBase = new BaseRevolve(localFrame.identity, this.frames, inwardsThickness, outwardsThickness);
    const voxTreadBase = treadBase.voxConstruct(pk);

    this.refRadius = 140;
    this.contourHeight = splineOps.totalLength(this.frames.points(100));
    const voxProfile = this.pattern(pk, this.refRadius, this.contourHeight, this.treadTrafo);
    return voxTreadBase.subtract(voxProfile);
  }

  /**
   * Maps a shape on a reference cylinder onto the outer wheel contour
   * (C# `vecTreadTrafo`; the unused local-Z sample is dropped).
   */
  private readonly treadTrafo = (pt: Vec3): Vec3 => {
    const radius = vecOps.radius(pt);
    const phi = vecOps.phi(pt);
    const lengthRatio = pt[2] / this.contourHeight;
    const frame = this.frames.frameAt(lengthRatio);
    const newZ = frame.pos[2];
    const newRadius = vecOps.radius(frame.pos);
    const radial = frame.lx;
    const dRadius = radius - this.refRadius;
    return vecOps.rotateAroundZ(vec3.add([newRadius, 0, newZ], vec3.scale(radial, dRadius)), phi);
  };
}
