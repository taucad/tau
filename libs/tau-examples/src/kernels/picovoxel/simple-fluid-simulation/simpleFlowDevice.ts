// Port of PicoGK_SimulationExample src/SimpleFlowDevice.cs (CC0-1.0; LEAP 71
// waived copyright — see the upstream file header).
// A modulated cylinder with a gyroid section as the fluid domain, a modulated
// pipe around it as the solid domain, and a flat cylinder on the top end as
// the (oversized) inlet patch. The preview-only pieces — voxGetSegmentCut and
// every Sh.Preview* call — are viewer-bound and dropped for the headless port.

import type { Pico, Voxels } from 'picovoxel';
import { vec3 } from 'picovoxel/numerics';
import { BaseCylinder, ImplicitGyroid, localFrame, SurfaceModulation, uf } from 'picovoxel/shapekernel';

/** C# `Uf.fLimitValue` (obsolete upstream, not on the ported `uf` surface). */
const limit01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Outer radius of the fluid domain (C# `fGetInnerRadius`). */
export function innerRadius(_phi: number, lengthRatio: number): number {
  const inletRadius = 20;
  const maxRadius = 30;
  const outletRadius = 15;
  const lr1 = limit01((lengthRatio - 0.0) / 0.5);
  const lr2 = limit01((lengthRatio - 0.5) / 0.5);
  const radius = uf.transFixed(inletRadius, maxRadius, lr1);
  return uf.transFixed(radius, outletRadius, lr2);
}

/** Outer radius of the solid domain (C# `fGetOuterRadius`). */
export function outerRadius(phi: number, lengthRatio: number): number {
  const flangeRadius = 10;
  const wallRadius = 2;
  const lr1 = limit01((lengthRatio - 0.0) / 0.1);
  const lr2 = limit01((lengthRatio - 0.9) / 0.1);
  const delta = uf.transFixed(uf.transFixed(flangeRadius, wallRadius, lr1), flangeRadius, lr2);
  return innerRadius(phi, lengthRatio) + delta;
}

export interface FlowDeviceDomains {
  fluidDomain: Voxels;
  solidDomain: Voxels;
  /** Oversized boundary for the inlet patch. */
  inletPatch: Voxels;
}

/** The geometric input data for the simulation (C# `SimpleFlowDevice` ctor). */
export function createSimpleFlowDevice(pk: Pico): FlowDeviceDomains {
  // fluid domain: inner pipe
  const pipeLength = 150;
  const pipeFrame = localFrame.create([0, 0, 0]);
  const innerPipe = new BaseCylinder(localFrame.create([0, 0, 0]), pipeLength);
  innerPipe.setRadius(new SurfaceModulation(innerRadius));
  const voxInnerPipe = innerPipe.voxConstruct(pk);

  // fluid domain: gyroid section
  const gyroidUnitSize = 10;
  const gyroidWallThickness = 1;
  const gyroid = new ImplicitGyroid(gyroidUnitSize, ImplicitGyroid.thicknessRatio(gyroidWallThickness, gyroidUnitSize));
  const gyroidBoundRadius = innerRadius(0, 0.5) + 10;
  const gyroidBoundHeight = 0.5 * pipeLength;
  const gyroidFrame = localFrame.translated(pipeFrame, vec3.scale(pipeFrame.lz, 0.5 * (pipeLength - gyroidBoundHeight)));
  const gyroidBound = new BaseCylinder(gyroidFrame, gyroidBoundHeight, gyroidBoundRadius);
  // C# Sh.voxIntersectImplicit — the facade form is maskedByImplicit (tape path).
  const voxGyroid = gyroidBound.voxConstruct(pk).maskedByImplicit({ sdf: gyroid.expression });
  const fluidDomain = voxInnerPipe.subtract(voxGyroid);

  // oversized inlet patch bounding
  const patchThickness = 4;
  const patchRadius = innerRadius(0, 1) + 5;
  const patchFrame = localFrame.translated(pipeFrame, vec3.scale(pipeFrame.lz, pipeLength - 0.5 * patchThickness));
  const inletPatch = new BaseCylinder(patchFrame, patchThickness, patchRadius).voxConstruct(pk);

  // solid part domain
  const outerPipe = new BaseCylinder(localFrame.create([0, 0, 0]), pipeLength);
  outerPipe.setRadius(new SurfaceModulation(outerRadius));
  const solidDomain = outerPipe.voxConstruct(pk).subtract(fluidDomain);

  return { fluidDomain, solidDomain, inletPatch };
}
