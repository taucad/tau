// Derived from LEAP71_RoverWheel — RoverWheel/Wheels/Wheel_{01,02,03,04}.cs
// Copyright (c) 2023-2026 LEAP 71 — https://leap71.com
// SPDX-License-Identifier: Apache-2.0
// Ported to TypeScript for picovoxel (blueprint R10); see NOTICE.
//
// Each C# preset class (ctor writes the statics, voxConstruct assembles)
// becomes one function building an explicit WheelContext and assembling from
// it. All four presets share identical key dimensions and upper contour.

import type { Pico, Vec3, Voxels } from 'picovoxel';
import { ControlPointSpline } from 'picovoxel/shapekernel';
import { treadPattern02, treadPattern03 } from './treadPatterns.ts';
import { WheelContext, type WheelLayer } from './wheelContext.ts';
import {
  egyptianStruts,
  rectHoles,
  rosettaStruts,
  spiralStruts,
  tubeStruts,
} from './wheelElements.ts';
import { WheelTread } from './wheelTread.ts';

/**
 * The preset upper-surface modulation contour (identical across Wheel_01..04,
 * C# `aGetFullUpperHeightPoints`). The C# GetRange(0, 100) of the 100 sampled
 * points is a no-op and not reproduced.
 */
export function presetUpperHeightPoints(refWidth: number, hubRatio = 0.6, roundRatio = 0.6): Vec3[] {
  const controlPoints: Vec3[] = [
    [hubRatio * refWidth, 0, 0],
    [1 * refWidth, 0, roundRatio],
    [1 * refWidth, 0, 1],
    [0 * refWidth, 0, 1],
  ];
  return new ControlPointSpline(controlPoints).points(100);
}

/** The shared preset context: outer 120, hub 30, width 60 (C# preset ctor "Step 1/2"). */
function presetContext(): WheelContext {
  const refWidth = 60;
  return new WheelContext(30, 120, refWidth, presetUpperHeightPoints(refWidth));
}

const layer = (startLengthRatio: number, endLengthRatio: number): WheelLayer => ({
  startLengthRatio,
  endLengthRatio,
});

/** First preset variant (C# `Wheel_01`). */
export function wheel01(pk: Pico): Voxels {
  const ctx = presetContext();
  const voxTread = new WheelTread(ctx.outerRadiusFrames, treadPattern02).treadLayerVoxels(pk);
  return ctx
    .layerVoxels(pk, 0, 0.05)
    .union(
      spiralStruts(pk, ctx, layer(0.05, 0.2), 16, 2.5),
      rectHoles(pk, ctx, layer(0.2, 0.6), 20, 4),
      tubeStruts(pk, ctx, layer(0.6, 0.8), 36, 2),
      tubeStruts(pk, ctx, layer(0.8, 0.9), 72, 1),
      rosettaStruts(pk, ctx, layer(0.9, 1), 60, 2),
      voxTread,
    );
}

/** Second preset variant — the C# showcase default (C# `Wheel_02`). */
export function wheel02(pk: Pico): Voxels {
  const ctx = presetContext();
  const voxTread = new WheelTread(ctx.outerRadiusFrames, treadPattern03).profileVoxels(pk);
  return ctx
    .layerVoxels(pk, 0, 0.02)
    .union(
      rectHoles(pk, ctx, layer(0.02, 0.2), 20, 4),
      rosettaStruts(pk, ctx, layer(0.2, 0.6), 10, 4),
      rectHoles(pk, ctx, layer(0.6, 0.8), 10, 2),
      rosettaStruts(pk, ctx, layer(0.8, 0.9), 50, 2),
      rectHoles(pk, ctx, layer(0.9, 1), 20, 2),
      voxTread,
    );
}

/** Third preset variant (C# `Wheel_03`). */
export function wheel03(pk: Pico): Voxels {
  const ctx = presetContext();
  const voxTread = new WheelTread(ctx.outerRadiusFrames, treadPattern03).profileVoxels(pk);
  return ctx
    .layerVoxels(pk, 0, 0.1)
    .union(
      egyptianStruts(pk, ctx, layer(0.1, 0.5), 16, 5),
      rectHoles(pk, ctx, layer(0.5, 0.85), 20, 4),
      tubeStruts(pk, ctx, layer(0.85, 1), 50, 2),
      voxTread,
    );
}

/** Fourth preset variant (C# `Wheel_04`). */
export function wheel04(pk: Pico): Voxels {
  const ctx = presetContext();
  const voxTread = new WheelTread(ctx.outerRadiusFrames, treadPattern02).profileVoxels(pk);
  return ctx
    .layerVoxels(pk, 0, 0.1)
    .union(
      rectHoles(pk, ctx, layer(0.1, 0.5), 40, 2),
      egyptianStruts(pk, ctx, layer(0.5, 0.85), 20, 4),
      rectHoles(pk, ctx, layer(0.85, 1), 30, 3),
      voxTread,
    );
}
