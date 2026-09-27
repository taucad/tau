// Derived from LEAP71_RoverWheel — RoverWheel/Wheels/RandomWheel.cs
// Copyright (c) 2023-2026 LEAP 71 — https://leap71.com
// SPDX-License-Identifier: Apache-2.0
// Ported to TypeScript for picovoxel (blueprint R10); see NOTICE.
//
// C# draws from an ambient `Random`; here every draw comes from ONE explicit
// mulberry32 stream seeded per wheel (`createRandom(seed)`), in the exact C#
// call order. The seeded corpus is therefore SELF-REFERENTIAL — it pins this
// port's sequence, it does not match any C# Random sequence. Screenshot /
// viewer / Wait calls are dropped (headless).

import type { Pico, Voxels } from 'picovoxel';
import { ControlPointSpline, createRandom, type RandomSource, uf } from 'picovoxel/shapekernel';
import { treadPattern01, treadPattern02, treadPattern03 } from './treadPatterns.ts';
import { WheelContext, type WheelLayer } from './wheelContext.ts';
import {
  egyptianStruts,
  rectHoles,
  rosettaStruts,
  spiralStruts,
  tubeStruts,
  type WheelElementsBuilder,
} from './wheelElements.ts';
import { WheelTread } from './wheelTread.ts';

/** Randomized upper contour (C# `RandomWheel.aGetFullUpperHeightPoints`). */
function randomUpperHeightPoints(refWidth: number, rng: RandomSource) {
  const hubRatio = uf.randomLinear(0.4, 0.9, rng);
  const roundRatio = uf.randomLinear(0.5, 0.9, rng);
  return new ControlPointSpline([
    [hubRatio * refWidth, 0, 0],
    [1 * refWidth, 0, roundRatio],
    [1 * refWidth, 0, 1],
    [0 * refWidth, 0, 1],
  ]).points(100);
}

/** Random tread: random pattern, profile vs. solid layer (C# `voxGetRandomTread` + `xGetRandomTreadPattern`). */
function randomTread(pk: Pico, ctx: WheelContext, rng: RandomSource): Voxels {
  const patternIndex = Math.min(2, Math.trunc(uf.randomLinear(0, 3, rng)));
  const pattern = [treadPattern01, treadPattern02, treadPattern03][patternIndex]!;
  const tread = new WheelTread(ctx.outerRadiusFrames, pattern);
  const profile = uf.randomBool(rng);
  if (profile) {
    return tread.profileVoxels(pk);
  }
  const outwardsThickness = uf.randomLinear(1, 4, rng);
  const inwardsThickness = uf.randomLinear(1, 2, rng);
  return tread.treadLayerVoxels(pk, outwardsThickness, inwardsThickness);
}

/** Random elements for a layer (C# `oGetRandomWheelElements`, same draw order and index mapping). */
function randomElements(pk: Pico, ctx: WheelContext, layer: WheelLayer, rng: RandomSource): Voxels {
  const symmetry = Math.trunc(uf.randomLinear(8, 30, rng));
  const wallThickness = uf.randomLinear(1, 3, rng);
  const elementIndex = Math.min(4, Math.trunc(uf.randomLinear(0, 5, rng)));
  const builders: WheelElementsBuilder[] = [egyptianStruts, rectHoles, rosettaStruts, spiralStruts, tubeStruts];
  return builders[elementIndex]!(pk, ctx, layer, symmetry, wallThickness);
}

/**
 * A randomized rover wheel: random key dimensions, contour, layers and
 * elements (C# `RandomWheel` ctor + `voxConstruct`).
 */
export function randomWheel(pk: Pico, seed: number): Voxels {
  const rng = createRandom(seed);

  // C# ctor: dimensions first, then the contour draws.
  const outerRadius = uf.randomLinear(80, 200, rng);
  const hubRadius = uf.randomLinear(30, 50, rng);
  const refWidth = uf.randomLinear(40, 90, rng);
  const ctx = new WheelContext(hubRadius, outerRadius, refWidth, randomUpperHeightPoints(refWidth, rng));

  const voxTread = randomTread(pk, ctx, rng);

  // Random layers from 0.05 outward until one lands on 0.97
  // (C# `sGetRandomLayer` while-loop; the C# end-ratio clamp mutates a struct
  // COPY after it was stored, but sGetRandomLayer already caps at 0.97, so it
  // was a no-op — not reproduced).
  const layers: WheelLayer[] = [];
  let startRatio = 0.05;
  const endRatio = 0.97;
  const voxSolidInnerLayer = ctx.layerVoxels(pk, 0, startRatio);
  const voxSolidOuterLayer = ctx.layerVoxels(pk, endRatio, 1);
  for (;;) {
    const layer: WheelLayer = {
      startLengthRatio: startRatio,
      endLengthRatio: Math.min(0.97, startRatio + uf.randomLinear(0.05, 0.55, rng)),
    };
    layers.push(layer);
    if (layer.endLengthRatio >= endRatio) break;
    startRatio = layer.endLengthRatio;
  }

  const elementVoxels = layers.map((layer) => randomElements(pk, ctx, layer, rng));

  // C# assembly order: solid inner + tread, then all elements, then solid outer.
  return voxSolidInnerLayer.union(voxTread, ...elementVoxels, voxSolidOuterLayer);
}
