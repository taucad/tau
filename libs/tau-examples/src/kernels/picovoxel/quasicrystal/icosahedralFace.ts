// Port of LEAP71_QuasiCrystals QuasiCrystal/IcosahedralFace.cs (Apache-2.0,
// © 2023 LEAP 71). The upstream CLASS is spelled `IcosehedralFace` [sic] even
// though the file is IcosahedralFace.cs — the typo'd class name is kept for
// traceability against upstream. The viewer-bound Preview method is dropped.

import type { Vec3 } from 'picovoxel';
import { type Frame, frame, vec3 } from 'picovoxel/numerics';
import { vecOps } from 'picovoxel/shapekernel';

export type Connector = 'arrow' | 'triangle' | 'line';
export type FaceDef = 'centre' | 'shortAxis' | 'longAxis';

/** C# `m_fPsi` — acos(1/√5) ≈ 1.10715 rad (63.435°). */
export const PSI = Math.acos(1 / Math.sqrt(5));

/**
 * Rhombic face, known and named after its appearance in regular icosahedrons.
 * The long axis and the short axis follow the golden ratio. Vertices are
 * MUTABLE — inflation and attachment rewrite them in place, as upstream.
 */
export class IcosehedralFace {
  pt1: Vec3;
  pt2: Vec3;
  pt3: Vec3;
  pt4: Vec3;
  longAxis: Vec3;
  shortAxis: Vec3;
  centre: Vec3;
  readonly connector: Connector;

  constructor(oFrame: Frame, def: FaceDef, connector: Connector, side = 20) {
    this.connector = connector;

    const pointer: Vec3 = [side, 0, 0];
    const pointer01 = vecOps.rotateAroundAxis(pointer, -0.5 * PSI, vec3.unitZ);
    const pointer02 = vecOps.rotateAroundAxis(pointer, +0.5 * PSI, vec3.unitZ);

    // vertices
    this.pt1 = [0, 0, 0];
    this.pt2 = vec3.add(this.pt1, pointer01);
    this.pt3 = vec3.add(this.pt2, pointer02);
    this.pt4 = vec3.sub(this.pt3, pointer01);

    // transform onto frame (C# vecTranslatePointOntoFrame ≙ frame.ptToWorld)
    if (def === 'centre') {
      this.centre = vec3.add(this.pt1, vec3.scale(vec3.sub(this.pt3, this.pt1), 0.5));
      this.shiftBy(vec3.neg(this.centre));
      this.ontoFrame(oFrame);
    } else if (def === 'longAxis') {
      this.shiftBy(vec3.neg(this.pt1));
      this.ontoFrame(oFrame);
    } else {
      // shortAxis
      this.centre = vec3.add(this.pt1, vec3.scale(vec3.sub(this.pt3, this.pt1), 0.5));
      this.shiftBy(vec3.neg(this.centre));
      this.pt1 = vecOps.rotateAroundZ(this.pt1, (-90 / 180) * Math.PI);
      this.pt2 = vecOps.rotateAroundZ(this.pt2, (-90 / 180) * Math.PI);
      this.pt3 = vecOps.rotateAroundZ(this.pt3, (-90 / 180) * Math.PI);
      this.pt4 = vecOps.rotateAroundZ(this.pt4, (-90 / 180) * Math.PI);
      this.shiftBy(vec3.neg(this.pt2));
      this.ontoFrame(oFrame);
    }

    this.centre = vec3.add(this.pt1, vec3.scale(vec3.sub(this.pt3, this.pt1), 0.5));
    this.longAxis = vec3.normalized(vec3.sub(this.pt3, this.pt1));
    this.shortAxis = vec3.normalized(vec3.sub(this.pt4, this.pt2));
  }

  private shiftBy(delta: Vec3): void {
    this.pt1 = vec3.add(this.pt1, delta);
    this.pt2 = vec3.add(this.pt2, delta);
    this.pt3 = vec3.add(this.pt3, delta);
    this.pt4 = vec3.add(this.pt4, delta);
  }

  private ontoFrame(oFrame: Frame): void {
    this.pt1 = frame.ptToWorld(oFrame, this.pt1);
    this.pt2 = frame.ptToWorld(oFrame, this.pt2);
    this.pt3 = frame.ptToWorld(oFrame, this.pt3);
    this.pt4 = frame.ptToWorld(oFrame, this.pt4);
  }

  /** Flips the two vertices that make up the long axis (C# `FlipAroundShortAxis`). */
  flipAroundShortAxis(): void {
    [this.pt1, this.pt3] = [this.pt3, this.pt1];
  }

  /** Flips the two vertices that make up the short axis (C# `FlipAroundLongAxis`). */
  flipAroundLongAxis(): void {
    [this.pt2, this.pt4] = [this.pt4, this.pt2];
  }
}
