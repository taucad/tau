// Derived from LEAP71_RoverWheel — RoverWheel/{RoverWheel,WheelLayer}.cs
// Copyright (c) 2023-2026 LEAP 71 — https://leap71.com
// SPDX-License-Identifier: Apache-2.0
// Ported to TypeScript for picovoxel (blueprint R10); see NOTICE.
//
// The C# abstract RoverWheel keeps its key dimensions and contour frames as
// PUBLIC STATIC fields, written by each preset constructor (and read back by
// every WheelElements/WheelTread via `RoverWheel.m_f...`). That static-state
// landmine is killed here: everything lives on an explicit WheelContext built
// once per wheel and passed to whoever needs it. The construction algorithms
// are otherwise ported verbatim. The C# instance fields m_oWheel (only used
// during construction), m_xTreadPattern and m_oTread (declared, never
// assigned) are not reproduced. Viewer calls (ShowPlaneGrid, Preview*,
// RemoveAllObjects) are dropped — headless.

import type { Pico, Vec3, Voxels } from 'picovoxel';
import { vec3 } from 'picovoxel/numerics';
import {
  BaseLens,
  BasePipe,
  Frames,
  LineModulation,
  localFrame,
  splineOps,
  SurfaceModulation,
  vecOps,
} from 'picovoxel/shapekernel';

/** A radial band of the wheel between two 0..1 length ratios (C# `WheelLayer` struct, wheel ref → context). */
export interface WheelLayer {
  startLengthRatio: number;
  endLengthRatio: number;
}

/**
 * Per-wheel construction context (the de-static-ed C# `RoverWheel` base):
 * key dimensions plus the four contour frame chains that define the curved
 * wheel coordinate space.
 */
export class WheelContext {
  readonly hubRadius: number;
  readonly outerRadius: number;
  readonly refWidth: number;
  readonly upperHeightFrames: Frames;
  readonly lowerHeightFrames: Frames;
  readonly innerRadiusFrames: Frames;
  readonly outerRadiusFrames: Frames;

  constructor(hubRadius: number, outerRadius: number, refWidth: number, fullUpperHeightPoints: readonly Vec3[]) {
    this.hubRadius = hubRadius;
    this.outerRadius = outerRadius;
    this.refWidth = refWidth;

    // C# aGetFullLowerHeightPoints: mirror the upper modulation at the z-plane.
    const fullLowerHeightPoints: Vec3[] = fullUpperHeightPoints.map((pt) => [-pt[0], pt[1], pt[2]]);

    // C# ctor body: bounding BaseLens with modulated faces; only used to
    // sample the inner radius contour below.
    const wheel = new BaseLens(localFrame.identity, refWidth, hubRadius, outerRadius);
    wheel.setHeight(widthModulation(fullLowerHeightPoints), widthModulation(fullUpperHeightPoints));

    // C# SetInnerRadiusPoints: the hub contour at phi = 0, radius ratio 0.
    const samples = 100;
    const innerRadiusPoints: Vec3[] = [];
    for (let i = 0; i < samples; i += 1) {
      innerRadiusPoints.push(wheel.surfacePoint((1 / (samples - 1)) * i, 0, 0));
    }
    this.innerRadiusFrames = Frames.ofType(innerRadiusPoints, 'minRotation');

    // C# SetOuterPoints: split the modulated upper/lower surfaces into the
    // upper-height, outer-radius (tread) and lower-height 2D contours.
    const toWheelPlane = (pt: Vec3): Vec3 => [pt[2] * (outerRadius - hubRadius) + hubRadius, 0, pt[0]];
    // C# GetRange(0, Count - 2) — the last TWO points are dropped, verbatim.
    const upperContour = splineOps.reparametrizedBySpacing(
      fullUpperHeightPoints.slice(0, fullUpperHeightPoints.length - 2).map(toWheelPlane),
      1,
    );
    const lowerContour = splineOps.reparametrizedBySpacing(
      fullLowerHeightPoints.slice(0, fullLowerHeightPoints.length - 2).map(toWheelPlane),
      1,
    );

    const treadDir = vec3.unitZ;
    const rimDir = vec3.unitX;
    const outerRadiusPoints: Vec3[] = [];
    const upperHeightPoints: Vec3[] = [];
    const lowerHeightPoints: Vec3[] = [];
    let inTread = false;

    for (let i = 1; i < upperContour.length - 1; i += 1) {
      const contour = vec3.safeNormalized(vec3.sub(upperContour[i - 1]!, upperContour[i + 1]!));
      const rimAlign = Math.abs(vec3.dot(contour, rimDir));
      const treadAlign = Math.abs(vec3.dot(contour, treadDir));
      if (treadAlign > rimAlign) inTread = true;
      (inTread ? outerRadiusPoints : upperHeightPoints).push(upperContour[i]!);
    }

    // C# reuses the SAME bTread flag entering the lower sweep (still latched
    // true from the upper pass) and only unlatches after 20 samples, verbatim.
    let counter = 0;
    for (let i = lowerContour.length - 2; i > 0; i -= 1) {
      const contour = vec3.safeNormalized(vec3.sub(lowerContour[i + 1]!, lowerContour[i - 1]!));
      const rimAlign = Math.abs(vec3.dot(contour, rimDir));
      const treadAlign = Math.abs(vec3.dot(contour, treadDir));
      if (counter > 20 && treadAlign < rimAlign) inTread = false;
      if (inTread) {
        outerRadiusPoints.push(lowerContour[i]!);
      } else {
        lowerHeightPoints.unshift(lowerContour[i]!);
      }
      counter += 1;
    }

    this.lowerHeightFrames = Frames.ofType(splineOps.reparametrizedBySpacing(lowerHeightPoints, 1), 'minRotation');
    this.upperHeightFrames = Frames.ofType(splineOps.reparametrizedBySpacing(upperHeightPoints, 1), 'minRotation');
    this.outerRadiusFrames = Frames.ofType(splineOps.reparametrizedBySpacing(outerRadiusPoints, 1), 'minRotation');
  }

  /**
   * Coordinate transformation from the simple cylindrical design space to the
   * curved wheel space (C# static `vecGetWheelLayerTrafo`; arrow property so
   * it passes straight into `setTransformation`).
   */
  readonly wheelLayerTrafo = (pt: Vec3): Vec3 => {
    const radius = vecOps.radius(pt);
    const phi = vecOps.phi(pt);
    const heightRatio = pt[2] / this.refWidth;
    const lengthRatio = (radius - this.hubRadius) / (this.outerRadius - this.hubRadius);
    return vecOps.rotateAroundZ(this.innerPt(heightRatio, lengthRatio), phi);
  };

  /** Conformal point inside the wheel's bounding shape (C# `vecGetInnerPt`). */
  private innerPt(heightRatio: number, lengthRatio: number): Vec3 {
    const upper = this.upperHeightFrames.spineAt(lengthRatio);
    const lower = this.lowerHeightFrames.spineAt(lengthRatio);
    const outer = this.outerRadiusFrames.spineAt(heightRatio);
    const inner = this.innerRadiusFrames.spineAt(heightRatio);

    const inner0 = this.innerRadiusFrames.spineAt(0);
    const inner1 = this.innerRadiusFrames.spineAt(1);
    const outer0 = this.outerRadiusFrames.spineAt(0);
    const outer1 = this.outerRadiusFrames.spineAt(1);
    const innerRef = vec3.add(inner0, vec3.scale(vec3.sub(inner1, inner0), heightRatio));
    const outerRef = vec3.add(outer0, vec3.scale(vec3.sub(outer1, outer0), heightRatio));

    const dInner = vec3.sub(inner, innerRef);
    const dOuter = vec3.sub(outer, outerRef);
    const d = vec3.add(dInner, vec3.scale(vec3.sub(dOuter, dInner), lengthRatio));
    const ref = vec3.add(lower, vec3.scale(vec3.sub(upper, lower), heightRatio));
    return vec3.add(ref, d);
  }

  /** A wheel layer band as a voxel field (C# static `voxGetLayer`). */
  layerVoxels(pk: Pico, startLengthRatio: number, endLengthRatio: number): Voxels {
    const refInnerRadius = this.hubRadius + startLengthRatio * (this.outerRadius - this.hubRadius);
    const refOuterRadius = this.hubRadius + endLengthRatio * (this.outerRadius - this.hubRadius);
    const layer = new BasePipe(localFrame.identity, this.refWidth, refInnerRadius, refOuterRadius);
    layer.setLengthSteps(100);
    layer.setRadialSteps(100);
    layer.setPolarSteps(100);
    layer.setTransformation(this.wheelLayerTrafo);
    return layer.voxConstruct(pk);
  }

  /** Reference radii of a layer band (shared elements prelude, C# per-element locals). */
  layerRadii(layer: WheelLayer): { refInnerRadius: number; refOuterRadius: number } {
    return {
      refInnerRadius: this.hubRadius + layer.startLengthRatio * (this.outerRadius - this.hubRadius),
      refOuterRadius: this.hubRadius + layer.endLengthRatio * (this.outerRadius - this.hubRadius),
    };
  }
}

/** Surface modulation from contour points (C# `oGetWidthModulation`; values = X over axis = Z). */
function widthModulation(points: readonly Vec3[]): SurfaceModulation {
  return SurfaceModulation.fromLineModulation(LineModulation.fromPoints(points, 'x', 'z'));
}
