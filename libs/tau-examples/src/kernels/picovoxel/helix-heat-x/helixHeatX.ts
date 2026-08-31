// Derived from LEAP71_HelixHeatX — src/HelixHeatX/*.cs (the 11-file partial
// class merged into one module, out-params → returned objects)
// Copyright (c) 2023-2026 LEAP 71 — https://leap71.com
// SPDX-License-Identifier: Apache-2.0
// Ported to TypeScript for picovoxel (blueprint R11); see NOTICE.
//
// The flagship benchmark subject: ~10^5 lattice beams (20,000 z-samples with
// fin bursts), boolean assembly, and the full finishing family (offset,
// fillet, smoothen, projectZSlice). Viewer previews/screenshots are dropped;
// C# mutating voxel calls map to the pure copy-first facade. The `authorMs`
// stopwatch accumulates pure-JS authoring time (lattice/point loops) so the
// benchmark can report the Finding 8 authoring-vs-kernel phase split.

import type { Lattice, Pico, Vec3, Voxels } from 'picovoxel';
import { vec3 } from 'picovoxel/numerics';
import {
  BaseBox,
  BaseCylinder,
  frame,
  type Frame,
  LatticeManifold,
  localFrame,
  sh,
  TangentialControlSpline,
  uf,
  vecOps,
} from 'picovoxel/shapekernel';
import { ScrewHole, ThreadCutter, ThreadReinforcement } from './helpers.ts';

type Fluid = 'hot' | 'cool';

export interface HeatXKernelTiming {
  readonly stage: string;
  readonly ms: number;
}

export class HelixHeatX {
  private readonly pk: Pico;
  private readonly firstInletFrame: Frame;
  private readonly secondInletFrame: Frame;
  private readonly firstOutletFrame: Frame;
  private readonly secondOutletFrame: Frame;
  private readonly centreBottomFrame: Frame;
  private readonly ioRadius: number;
  private readonly voxBounding: Voxels;
  private readonly plateThickness: number;
  private readonly wallThickness: number;

  /** Pure-JS authoring milliseconds accumulated across the lattice loops. */
  authorMs = 0;

  private readonly timingRecords: HeatXKernelTiming[] = [];

  get kernelTimings(): readonly HeatXKernelTiming[] {
    return Object.freeze(this.timingRecords.map((timing) => Object.freeze({ ...timing })));
  }

  /** C# `Task()` — construct with preset defaults and return the result. */
  static task(pk: Pico): Voxels {
    return new HelixHeatX(pk).voxConstruct();
  }

  constructor(pk: Pico) {
    this.pk = pk;
    const halfIOLengthSpacing = 75;
    const halfIOWidthSpacing = 26.5;
    this.firstInletFrame = localFrame.createZ([-halfIOLengthSpacing, -halfIOWidthSpacing, 50], [-1, 0, 0]);
    this.secondInletFrame = localFrame.createZ([-halfIOLengthSpacing, halfIOWidthSpacing, 50], [-1, 0, 0]);
    this.firstOutletFrame = localFrame.createZ([halfIOLengthSpacing, -halfIOWidthSpacing, 50], [1, 0, 0]);
    this.secondOutletFrame = localFrame.createZ([halfIOLengthSpacing, halfIOWidthSpacing, 50], [1, 0, 0]);
    // (The C# ctor also builds wireframe preview boxes/cylinders — viewer-only.)
    this.centreBottomFrame = localFrame.createZX([-50, 0, 50], [1, 0, 0], [0, 0, 1]);
    const outerBox = new BaseBox(localFrame.create([0, 0, -4]), 107, 2 * halfIOLengthSpacing + 24, 104);
    this.voxBounding = this.measureKernel('bounding.create', () => outerBox.voxConstruct(pk));
    this.plateThickness = 3.5;
    this.wallThickness = 0.8;
    this.ioRadius = 7;
  }

  /** C# `voxConstruct` — the whole assembly; screenshots dropped. */
  voxConstruct(): Voxels {
    const hotCornerFins = this.measureKernel('turning-fins.hot', () => this.turningFins('hot'));
    const coolCornerFins = this.measureKernel('turning-fins.cool', () => this.turningFins('cool'));
    const allCornerFins = this.measureKernel('corner-fins.union', () => hotCornerFins.union(coolCornerFins));

    const hotStraightFins = this.measureKernel('straight-fins.hot', () => this.straightFins('hot'));
    const coolStraightFins = this.measureKernel('straight-fins.cool', () => this.straightFins('cool'));
    const allStraightFins = this.measureKernel('straight-fins.union', () => hotStraightFins.union(coolStraightFins));

    const fins = this.measureKernel('fins.union', () => allCornerFins.union(allStraightFins));

    const structure = this.measureKernel('outer-structure.create', () => this.outerStructure());

    const hot = this.measureKernel('helical-void.hot', () => this.helicalVoid('hot'));
    const cool = this.measureKernel('helical-void.cool', () => this.helicalVoid('cool'));

    const coolInner = this.measureKernel('cool-inner.offset', () =>
      cool.innerVolume.offset({ distance: this.wallThickness }),
    );
    const hotFluidVoid = this.measureKernel('hot-fluid-void.subtract', () => hot.innerVolume.subtract(coolInner));
    const hotInner = this.measureKernel('hot-inner.offset', () =>
      hot.innerVolume.offset({ distance: this.wallThickness }),
    );
    const coolFluidVoid = this.measureKernel('cool-fluid-void.subtract', () => cool.innerVolume.subtract(hotInner));

    const innerVolume = this.measureKernel('inner-volume.union', () => hotFluidVoid.union(coolFluidVoid));
    const splitters = this.measureKernel('splitters.union', () => hot.splitters.union(cool.splitters));
    let outerVolume = this.measureKernel('outer-volume.offset', () => innerVolume.offset({ distance: 0.9 }));

    const { flange, screwHoles } = this.measureKernel('flange.create', () => this.flange());
    // (voxFlangeScrewCutters is preview-only in the C# Task.)

    const filletedFlange = this.measureKernel('finished-flange.fillet', () => flange.fillet({ rounding: 5 }));
    const finishedFlange = this.measureKernel('finished-flange.smoothen', () =>
      filletedFlange.smoothen({ distance: 0.5 }),
    );

    outerVolume = this.measureKernel('outer-volume.union-flange', () => outerVolume.union(finishedFlange));
    const ioSupports = this.measureKernel('io-supports.create', () => this.ioSupports());
    outerVolume = this.measureKernel('outer-volume.union-supports', () => outerVolume.union(ioSupports));
    outerVolume = this.measureKernel('outer-volume.fillet', () => outerVolume.fillet({ rounding: 5 }));
    outerVolume = this.measureKernel('outer-volume.smoothen', () => outerVolume.smoothen({ distance: 0.5 }));

    outerVolume = this.measureKernel('centre-piece.add', () => this.withCentrePiece(outerVolume));

    outerVolume = this.measureKernel('outer-volume.union-structure', () => outerVolume.union(structure));
    outerVolume = this.measureKernel('outer-volume.subtract-screw-holes', () => outerVolume.subtract(screwHoles));
    outerVolume = this.measureKernel('outer-volume.project-z-slice', () =>
      outerVolume.projectZSlice({ startZ: 4, endZ: -4 }),
    );
    const printWeb = this.measureKernel('print-web.create', () => this.printWeb());
    outerVolume = this.measureKernel('outer-volume.subtract-print-web', () => outerVolume.subtract(printWeb));

    let result = this.measureKernel('result.subtract-inner-volume', () => outerVolume.subtract(innerVolume));
    result = this.measureKernel('result.union-fins', () => result.union(fins));
    result = this.measureKernel('result.union-splitters', () => result.union(splitters));
    result = this.measureKernel('result.intersect-bounding', () => result.intersect(this.voxBounding));

    const threads = this.measureKernel('io-threads.create', () => this.ioThreads());
    result = this.measureKernel('result.union-threads', () => result.union(threads));
    const ioCuts = this.measureKernel('io-cuts.create', () => this.ioCuts());
    result = this.measureKernel('result.subtract-io-cuts', () => result.subtract(ioCuts));
    return result;
  }

  private measureKernel<T>(stage: string, run: () => T): T {
    const authorBefore = this.authorMs;
    const started = performance.now();
    const result = run();
    const authorMs = this.authorMs - authorBefore;
    this.timingRecords.push({ stage, ms: Math.max(0, performance.now() - started - authorMs) });
    return result;
  }

  // ── Misc.cs ────────────────────────────────────────────────────────────────

  private trafo(pt: Vec3): Vec3 {
    return frame.ptToWorld(this.centreBottomFrame, pt);
  }

  private innerRadius(_phi: number, _lengthRatio: number): number {
    return 10 * uf.superShapeRadiusPreset(_phi, 'round');
  }

  private outerRadius(phi: number, _lengthRatio: number): number {
    return 50 * uf.superShapeRadiusPreset(phi, 'quad');
  }

  private withCentrePiece(outerVolume: Voxels): Voxels {
    const firstBox = new BaseBox(this.centreBottomFrame, 100, 20, 2);
    return outerVolume.union(firstBox.voxConstruct(this.pk));
  }

  // ── InternalFins.cs ────────────────────────────────────────────────────────

  /** Rooftop fins along the helix corners (C# `voxGetTurningFins`). */
  private turningFins(fluid: Fluid): Voxels {
    const phiStart = fluid === 'cool' ? 0 : Math.PI;
    const wallThickness = 0.4;
    const beam = 0.5 * wallThickness;
    const startZ = 0;
    const endZ = 100;
    const totalLength = endZ - startZ;
    const interPlateThickness = 0.8;
    const turns = Math.trunc(totalLength / (2 * this.plateThickness + 2 * interPlateThickness)) - 0.5;
    const slope = (turns * 2 * Math.PI) / totalLength;

    const started = performance.now();
    const lattice = this.pk.createLattice();
    const samples = Math.trunc(totalLength / 0.005);
    for (let i = 0; i < samples; i += 1) {
      const lengthRatio = i / samples;
      const z = startZ + lengthRatio * (endZ - startZ);
      const phi = phiStart + slope * (z - startZ);
      const phiDeg = ((phi / Math.PI) * 180) % 360;
      const dAngle = 20;
      if (
        (phiDeg > 45 - dAngle && phiDeg < 45 + dAngle) ||
        (phiDeg > 135 - dAngle && phiDeg < 135 + dAngle) ||
        (phiDeg > 225 - dAngle && phiDeg < 225 + dAngle) ||
        (phiDeg > 315 - dAngle && phiDeg < 315 + dAngle)
      ) {
        this.addFinBurst(lattice, 20, phi, lengthRatio, z, beam);
      }
    }
    this.authorMs += performance.now() - started;
    return lattice.toVoxels();
  }

  /** Fins on the straight sections; the vertical set twists for mixing (C# `voxGetStraightFins`). */
  private straightFins(fluid: Fluid): Voxels {
    const phiStart = fluid === 'cool' ? 0 : Math.PI;
    const wallThickness = 0.4;
    const beam = 0.5 * wallThickness;
    const startZ = 0;
    const endZ = 100;
    const totalLength = endZ - startZ;
    const interPlateThickness = 0.8;
    const turns = Math.trunc(totalLength / (2 * this.plateThickness + 2 * interPlateThickness)) - 0.5;
    const slope = (turns * 2 * Math.PI) / totalLength;

    const started = performance.now();
    const lattice = this.pk.createLattice();
    const samples = Math.trunc(totalLength / 0.005);
    for (let i = 0; i < samples; i += 1) {
      const lengthRatio = i / samples;
      const z = startZ + lengthRatio * (endZ - startZ);
      const phi = phiStart + slope * (z - startZ);
      const phiDeg = ((phi / Math.PI) * 180) % 360;
      const dAngle = 15;
      if (
        (phiDeg > 0 - dAngle && phiDeg < 0 + dAngle) ||
        (phiDeg > 360 - dAngle && phiDeg < 360 + dAngle) ||
        (phiDeg > 180 - dAngle && phiDeg < 180 + dAngle)
      ) {
        this.addFinBurst(lattice, 8, phi, lengthRatio, z, beam);
      } else if ((phiDeg > 90 - dAngle && phiDeg < 90 + dAngle) || (phiDeg > 270 - dAngle && phiDeg < 270 + dAngle)) {
        this.addFinBurst(lattice, 8, phi, lengthRatio, z, beam, phiDeg, dAngle);
      }
    }
    this.authorMs += performance.now() - started;
    return lattice.toVoxels();
  }

  /**
   * One radial burst of rooftop fins. When `twistPhiDeg` is given, the fin
   * endpoints are additionally rotated about their midpoint (the C# vertical
   * mixing twist; note upstream computes the twist from `fPhiDeg - 270` in
   * BOTH the 90° and 270° branches — ported verbatim).
   */
  private addFinBurst(
    lattice: Lattice,
    finCount: number,
    phi: number,
    lengthRatio: number,
    z: number,
    beam: number,
    twistPhiDeg?: number,
    twistDAngle?: number,
  ): void {
    for (let j = 0; j < finCount; j += 1) {
      const phiFin = phi - (15 / 180) * Math.PI * Math.cos(3 * (j / finCount - 0.5));
      const inner = this.innerRadius(phiFin, lengthRatio);
      const outer = this.outerRadius(phiFin, lengthRatio) - beam;
      const radius = inner + 5 + (j / (finCount - 1)) * (outer - 10 - inner);
      let pt1 = this.trafo(vecOps.cylPoint(radius, phiFin, z - 0.5 * this.plateThickness));
      let pt2 = this.trafo(vecOps.cylPoint(radius, phiFin, z + 0.5 * this.plateThickness));
      pt1 = [pt1[0], pt1[1], pt1[2] - 1.5];
      pt2 = [pt2[0], pt2[1], pt2[2] - 1.5];
      const pt3 = vec3.scale(vec3.add(pt1, pt2), 0.5);
      if (twistPhiDeg !== undefined && twistDAngle !== undefined) {
        const turnPhi = ((twistPhiDeg - 270 + twistDAngle) / (2 * twistDAngle)) * 2 * Math.PI;
        pt1 = vecOps.rotateAroundZ(pt1, turnPhi, pt3);
        pt2 = vecOps.rotateAroundZ(pt2, turnPhi, pt3);
      }
      const pt4 = vec3.add(pt3, [0, 0, 3]);
      lattice.addBeam({ start: pt1, end: pt4, radius: beam });
      lattice.addBeam({ start: pt2, end: pt4, radius: beam });
    }
  }

  // ── HelicalVoids.cs ────────────────────────────────────────────────────────

  /** The helical fluid volume + inlet/outlet splitter walls (C# `GetHelicalVoid`). */
  private helicalVoid(fluid: Fluid): { innerVolume: Voxels; splitters: Voxels } {
    const phiStart = fluid === 'cool' ? 0 : Math.PI;
    const beam = 0.5 * this.plateThickness;
    const startZ = 0;
    const endZ = 100;
    const totalLength = endZ - startZ;
    const interPlateThickness = this.wallThickness;
    const turns = Math.trunc(totalLength / (2 * this.plateThickness + 2 * interPlateThickness)) - 0.5;
    const slope = (turns * 2 * Math.PI) / totalLength;

    const started = performance.now();
    const lattice = this.pk.createLattice();
    let firstPt1: Vec3 = vec3.zero;
    let firstPt2: Vec3 = vec3.zero;
    let lastPt1: Vec3 = vec3.zero;
    let lastPt2: Vec3 = vec3.zero;

    const samples = Math.trunc(totalLength / 0.005);
    for (let i = 0; i < samples; i += 1) {
      const lengthRatio = i / samples;
      const z = startZ + lengthRatio * (endZ - startZ);
      const phi = phiStart + slope * (z - startZ);
      const inner = this.innerRadius(phi, lengthRatio);
      const outer = this.outerRadius(phi, lengthRatio) - beam;
      const pt1 = this.trafo(vecOps.cylPoint(inner, phi, z));
      const pt2 = this.trafo(vecOps.cylPoint(outer, phi, z));
      const pt3 = vec3.add(pt1, [0, 0, 3]);
      const pt4 = vec3.add(pt2, [0, 0, 3]);
      lattice.addBeam({ start: pt1, end: pt2, radius: beam });
      lattice.addBeam({ start: pt1, end: pt3, startRadius: beam, endRadius: 0.2 });
      lattice.addBeam({ start: pt2, end: pt4, startRadius: beam, endRadius: 0.2 });
      if (i === 0) {
        firstPt1 = pt1;
        firstPt2 = pt2;
      }
      if (i === samples - 1) {
        lastPt1 = pt1;
        lastPt2 = pt2;
      }
    }
    this.authorMs += performance.now() - started;
    const helicalVoid = lattice.toVoxels();

    const inlet = this.ioPipe('inlet', fluid, firstPt1, firstPt2, beam);
    const outlet = this.ioPipe('outlet', fluid, lastPt1, lastPt2, beam);
    const innerVolume = inlet.voxels.union(outlet.voxels).union(helicalVoid);
    const splitters = inlet.splitter.union(outlet.splitter);
    return { innerVolume, splitters };
  }

  // ── IOPipes.cs ─────────────────────────────────────────────────────────────

  /**
   * Inlet/outlet transition pipe + internal splitter wall (C# `GetInlet` /
   * `GetOutlet` — identical bodies except the target frame, end direction and
   * the HOT normal's sign; merged with a `kind` switch).
   */
  private ioPipe(
    kind: 'inlet' | 'outlet',
    fluid: Fluid,
    pt1In: Vec3,
    pt2In: Vec3,
    beam: number,
  ): { voxels: Voxels; splitter: Voxels } {
    let end: Vec3;
    let endDir: Vec3;
    const lengthDir = vec3.safeNormalized(vec3.sub(pt2In, pt1In));
    let normal: Vec3;
    if (kind === 'inlet') {
      end = this.secondInletFrame.pos;
      endDir = [-1, 0, 0];
      normal = vec3.cross([0, 1, 0], lengthDir);
      if (fluid === 'hot') {
        end = this.firstInletFrame.pos;
        normal = vec3.cross([0, 0, -1], lengthDir);
      }
    } else {
      end = this.secondOutletFrame.pos;
      endDir = [1, 0, 0];
      normal = vec3.cross([0, 1, 0], lengthDir);
      if (fluid === 'hot') {
        end = this.firstOutletFrame.pos;
        normal = vec3.cross([0, 0, 1], lengthDir);
      }
    }
    const startDir = vec3.cross(lengthDir, normal);

    const inletRadius = this.ioRadius;
    const start = vec3.scale(vec3.add(pt1In, pt2In), 0.5);
    const startOri = vec3.safeNormalized(vec3.sub(pt2In, pt1In));
    const startLength = vec3.length(vec3.sub(pt2In, start));
    const spline = new TangentialControlSpline(start, end, startDir, endDir, {
      startTangentStrength: 20,
      endTangentStrength: 10,
    });

    const started = performance.now();
    const latPipe = this.pk.createLattice();
    const latSplitter = this.pk.createLattice();
    const points = spline.points(500);
    for (let i = 0; i < points.length; i += 1) {
      const lengthRatio = i / points.length;
      const pt = points[i]!;
      const beam2 = uf.transFixed(beam, inletRadius, lengthRatio);
      const length2 = uf.transFixed(startLength, 0, lengthRatio);
      const tipExtension = uf.transFixed(3, 10, lengthRatio);
      const pt1 = vec3.sub(pt, vec3.scale(startOri, length2));
      const pt2 = vec3.add(pt, vec3.scale(startOri, length2));
      const [upper, lower] = pt1[2] > pt2[2] ? [pt1, pt2] : [pt2, pt1];
      const pt3 = vec3.add(upper, [0, 0, tipExtension]);
      latPipe.addBeam({ start: upper, end: pt3, startRadius: beam2, endRadius: 0.2 });

      const splitterPt0 = vec3.sub(lower, [0, 0, 10]);
      const splitterPt1 = vec3.add(pt3, [0, 0, beam2]);
      const splitterPt2 = vec3.add(pt3, [0, 0, beam2 + 5]);
      const splitterPt3 = vec3.add(pt3, [0, 0, beam2 + 10]);
      const topSplitterBeam = uf.transFixed(0.4, 1, lengthRatio);
      latSplitter.addBeam({ start: splitterPt0, end: splitterPt1, radius: 0.4 });
      latSplitter.addBeam({ start: splitterPt1, end: splitterPt2, startRadius: 0.4, endRadius: topSplitterBeam });
      latSplitter.addBeam({ start: splitterPt2, end: splitterPt3, radius: topSplitterBeam });

      latPipe.addBeam({ start: pt1, end: pt2, radius: beam2 });
    }
    this.authorMs += performance.now() - started;
    const voxels = latPipe.toVoxels();
    const splitter = latSplitter.toVoxels().intersect(voxels);
    return { voxels, splitter };
  }

  // ── OuterStructure.cs ──────────────────────────────────────────────────────

  /** Shell wall + reinforcement ribs (C# `voxGetOuterStructure`). */
  private outerStructure(): Voxels {
    const totalLength = 100;
    const beam = 1;
    const started = performance.now();
    const lattice = this.pk.createLattice();
    const sidePhis = [0, 0.5 * Math.PI, Math.PI, 1.5 * Math.PI];
    for (let z = 0; z < totalLength; z += 0.3) {
      for (const sidePhi of sidePhis) {
        for (const sign of [1, -1]) {
          const lengthRatio = z / totalLength;
          const phi = sidePhi + sign * 0.25 * Math.PI * Math.cos(((2 * 2 * Math.PI) / totalLength) * z);
          const inner = this.outerRadius(phi, lengthRatio) - 15;
          const outer = this.outerRadius(phi, lengthRatio) + 15;
          const pt1 = this.trafo(vecOps.cylPoint(inner, phi, z));
          const pt2 = this.trafo(vecOps.cylPoint(outer, phi, z));
          lattice.addBeam({ start: pt1, end: pt2, radius: beam });
        }
      }
    }
    this.authorMs += performance.now() - started;
    let structure = lattice.toVoxels();
    structure = structure.fillet({ rounding: 5, finalSurfaceDistance: 0.5 }); // C# OverOffset(5, 0.5)
    structure = structure.smoothen({ distance: 1 });
    return structure.intersect(this.voxBounding);
  }

  // ── Flange.cs ──────────────────────────────────────────────────────────────

  /** Bottom flange + screw holes (+ thread cutters, preview-only in the Task). */
  private flange(): { flange: Voxels; screwHoles: Voxels; screwCutter: Voxels } {
    const coreRadius = 5;
    const maxRadius = 6;
    const cutLength = 24;
    const screwThreadRadius = 3.5;
    const screwThreadLength = 2;
    const screwHeadRadius = 7;
    const screwHeadLength = 10;
    const flangeList: Voxels[] = [];
    const cutterList: Voxels[] = [];
    const screwList: Voxels[] = [];
    for (const x of [-60, 60]) {
      for (const y of [-38, 0, 38]) {
        const pt: Vec3 = [x, y, 0];
        const screwHole = new ScrewHole(
          localFrame.create(vec3.add(pt, [0, 0, 6])),
          screwThreadLength,
          screwThreadRadius,
          screwHeadLength,
          screwHeadRadius,
        );
        screwList.push(screwHole.voxConstruct(this.pk));
        const cylinder = new BaseCylinder(localFrame.create(pt), 8, screwHeadRadius + 5);
        flangeList.push(cylinder.voxConstruct(this.pk));
        const cutter = new ThreadCutter(
          localFrame.create(vec3.sub(pt, [0, 0, 10])),
          cutLength,
          maxRadius,
          coreRadius,
          1.3,
        );
        cutterList.push(cutter.voxConstruct(this.pk));
      }
    }
    return {
      screwHoles: screwList[0]!.union(...screwList.slice(1)),
      screwCutter: cutterList[0]!.union(...cutterList.slice(1)),
      flange: flangeList[0]!.union(...flangeList.slice(1)),
    };
  }

  // ── IOSupports.cs ──────────────────────────────────────────────────────────

  /** Printable support beams under the IO pipes (C# `voxGetIOSupports`). */
  private ioSupports(): Voxels {
    const minBeam = 1;
    const started = performance.now();
    const lattice = this.pk.createLattice();
    const frames = [this.firstInletFrame, this.firstOutletFrame, this.secondInletFrame, this.secondOutletFrame];
    for (const ioFrame of frames) {
      let backwardAngle1 = (-50 / 180) * Math.PI;
      if (ioFrame.pos[0] > 0) backwardAngle1 = -backwardAngle1;
      let backwardAngle2 = (-20 / 180) * Math.PI;
      if (ioFrame.pos[0] > 0) backwardAngle2 = -backwardAngle2;
      let inwardAngle = (15 / 180) * Math.PI;
      if (ioFrame.pos[1] > 0) inwardAngle = -inwardAngle;

      let dir1 = vecOps.rotateAroundAxis([0, 0, -1], backwardAngle1, [0, 1, 0]);
      dir1 = vecOps.rotateAroundAxis(dir1, inwardAngle, [1, 0, 0]);
      let dir2 = vecOps.rotateAroundAxis([0, 0, -1], backwardAngle2, [0, 1, 0]);
      dir2 = vecOps.rotateAroundAxis(dir2, inwardAngle, [1, 0, 0]);

      for (let s = 0; s < 30; s += 1) {
        const lengthRatio = s / 30;
        const maxBeam = uf.transFixed(this.ioRadius + 6, this.ioRadius + 2, lengthRatio);
        const dH = (maxBeam - minBeam) / Math.tan((30 / 180) * Math.PI);
        const pt1 = vec3.add(ioFrame.pos, vec3.scale(ioFrame.lz, 10 - s));
        const kink = vec3.add(pt1, vec3.scale(dir2, dH));
        const pt2 = vec3.sub(kink, vec3.scale(dir1, kink[2] / dir1[2]));
        lattice.addBeam({ start: pt1, end: kink, startRadius: maxBeam, endRadius: minBeam });
        lattice.addBeam({ start: kink, end: pt2, radius: minBeam });
      }
    }
    this.authorMs += performance.now() - started;
    return lattice.toVoxels();
  }

  // ── IOCuts.cs / IOThreads.cs ──────────────────────────────────────────────

  /** Shapes cutting open the IO pipe ends (C# `voxGetIOCuts`). */
  private ioCuts(): Voxels {
    const list: Voxels[] = [];
    const cutRadius = 2.5;
    const cutLength = 12;
    const ioFrames = [this.firstInletFrame, this.secondInletFrame, this.firstOutletFrame, this.secondOutletFrame];
    for (const f of ioFrames) {
      const cut = new LatticeManifold(f, { length: cutLength, radius: cutRadius });
      list.push(cut.voxConstruct(this.pk));
    }
    for (const f of ioFrames) {
      const shifted = localFrame.translated(f, vec3.scale(f.lz, cutLength + 2));
      list.push(
        sh
          .latFromTaperedBeam(this.pk, shifted.pos, vec3.sub(shifted.pos, vec3.scale(shifted.lz, 4)), 7, 2, false)
          .toVoxels(),
      );
    }
    return list[0]!.union(...list.slice(1));
  }

  /** Thread reinforcements on the IO pipe ends (C# `voxGetIOThreads`). */
  private ioThreads(): Voxels {
    const list: Voxels[] = [];
    const outerRadius = 14;
    const length = 12;
    const ioFrames = [this.firstInletFrame, this.secondInletFrame, this.firstOutletFrame, this.secondOutletFrame];
    for (const f of ioFrames) {
      let threadFrame = localFrame.translated(f, [0, 0, 1]);
      threadFrame = localFrame.inverted(threadFrame, true, false);
      threadFrame = localFrame.translated(threadFrame, vec3.scale(threadFrame.lz, -length));
      const reinforcement = new ThreadReinforcement(threadFrame, length, this.ioRadius, outerRadius);
      list.push(reinforcement.voxConstruct(this.pk));
    }
    return list[0]!.union(...list.slice(1));
  }

  // ── PrintWeb.cs ────────────────────────────────────────────────────────────

  /** Powder-removal grooves at the build plate (C# `voxGetPrintWeb`). */
  private printWeb(): Voxels {
    const z = -4;
    const beam = 0.8;
    const dX = 10;
    const y = 70;
    const started = performance.now();
    const lattice = this.pk.createLattice();
    for (let x = 0; x <= 60; x += dX) {
      lattice.addBeam({ start: [x, -y, z], end: [x, y, z], radius: beam });
      lattice.addBeam({ start: [-x, -y, z], end: [-x, y, z], radius: beam });
    }
    this.authorMs += performance.now() - started;
    return lattice.toVoxels();
  }
}
