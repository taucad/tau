// Derived from LEAP71_HelixHeatX — src/{ScrewHole,ThreadCutter,ThreadReinforcement}.cs
// Copyright (c) 2023-2026 LEAP 71 — https://leap71.com
// SPDX-License-Identifier: Apache-2.0
// Ported to TypeScript for picovoxel (blueprint R11); see NOTICE.
// The three standalone construction modules the heat exchanger composes.

import type { Pico, Vec3, Voxels } from 'picovoxel';
import { frame, type Frame, BaseCylinder, BasePipe, SurfaceModulation, vecOps } from 'picovoxel/shapekernel';
import { vec3 } from 'picovoxel/numerics';

/** Dummy screw shape cut out where screws land after printing (C# `ScrewHole`). */
export class ScrewHole {
  private readonly frame: Frame;
  private readonly length: number;
  private readonly coreRadius: number;
  private readonly headLength: number;
  private readonly headRadius: number;

  constructor(f: Frame, length: number, coreRadius: number, headLength: number, headRadius: number) {
    this.frame = f;
    this.length = length;
    this.coreRadius = coreRadius;
    this.headLength = headLength;
    this.headRadius = headRadius;
  }

  voxConstruct(pk: Pico): Voxels {
    const lattice = pk.createLattice();
    const dir = this.frame.lz;
    const pt1 = this.frame.pos;
    const pt0 = vec3.add(pt1, vec3.scale(dir, this.headLength));
    const pt2 = vec3.sub(this.frame.pos, vec3.scale(dir, this.length));
    const pt3 = vec3.sub(pt2, vec3.scale(dir, 2 * this.coreRadius));
    lattice.addBeam({ start: pt0, end: pt1, radius: this.headRadius, roundCap: false });
    lattice.addBeam({ start: pt2, end: pt1, radius: this.coreRadius, roundCap: false });
    lattice.addBeam({ start: pt2, end: pt3, startRadius: this.coreRadius, endRadius: 0.1, roundCap: true });
    return lattice.toVoxels();
  }
}

/** Helical thread cutter simulating a post-production thread cut (C# `ThreadCutter`). */
export class ThreadCutter {
  private readonly frame: Frame;
  private readonly length: number;
  private readonly slope: number;
  private readonly coreRadius: number;
  private readonly maxRadius: number;

  constructor(f: Frame, length: number, maxRadius: number, coreRadius: number, slope: number) {
    this.frame = f;
    this.length = length;
    this.slope = slope;
    this.coreRadius = coreRadius;
    this.maxRadius = maxRadius;
  }

  voxConstruct(pk: Pico): Voxels {
    const voxCore = new BaseCylinder(this.frame, this.length, this.coreRadius).voxConstruct(pk);
    const voxBounding = new BaseCylinder(this.frame, this.length, this.maxRadius).voxConstruct(pk);
    const turns = this.length / this.slope;
    const beam1 = 0.5 * this.slope;
    const beam2 = 0.1;
    const lattice = pk.createLattice();
    for (let phi = 0; phi <= turns * 2 * Math.PI; phi += 0.005) {
      const s = (phi / (2 * Math.PI)) * this.slope;
      const pt1 = frame.ptToWorld(this.frame, vecOps.cylPoint(this.coreRadius, phi, s));
      const pt2 = frame.ptToWorld(this.frame, vecOps.cylPoint(this.maxRadius, phi, s));
      lattice.addBeam({ start: pt1, end: pt2, startRadius: beam1, endRadius: beam2, roundCap: false });
    }
    return voxCore.union(lattice.toVoxels()).intersect(voxBounding);
  }
}

/** Thread reinforcement pipe with a tapered outlet end (C# `ThreadReinforcement`). */
export class ThreadReinforcement {
  private readonly frame: Frame;
  private readonly length: number;
  private readonly innerRadius: number;
  private readonly outerRadius: number;

  constructor(f: Frame, length: number, innerRadius: number, outerRadius: number) {
    this.frame = f;
    this.length = length;
    this.innerRadius = innerRadius;
    this.outerRadius = outerRadius;
  }

  voxConstruct(pk: Pico): Voxels {
    const pipe = new BasePipe(this.frame, this.length);
    pipe.setRadius(
      new SurfaceModulation(() => this.innerRadius),
      new SurfaceModulation((_phi: number, lengthRatio: number) => {
        if (lengthRatio > 0.75) {
          return this.outerRadius - (this.outerRadius - this.innerRadius + 1) * (lengthRatio - 0.75);
        }
        return this.outerRadius;
      }),
    );
    return pipe.voxConstruct(pk);
  }
}
