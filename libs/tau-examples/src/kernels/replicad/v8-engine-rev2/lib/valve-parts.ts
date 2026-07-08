/**
 * Valve group (spec 3.5): valve, seat insert, guide, stem seal, spring,
 * retainer, keepers, spark plug.
 *
 * Local frame per part: the valve axis is +z; z = 0 at the seat-cone
 * reference station (the insert cone mid-line). The head places these along
 * its 12-deg valve axes; `lift` drops the moving parts down the axis.
 */
import {
  draw,
  drawCircle,
  makeBaseBox,
  makeCylinder,
  sketchHelix,
} from 'replicad';
import type { Shape3D, Sketch } from 'replicad';
import type { InterfaceDeclarations } from '@taucad/runtime/kernels/replicad/annotations';
import { axisNear, datumAt, faceNear } from './annotate.js';
import { Placement } from './frame.js';
import { threadBandDia, valve as vp } from './params.js';
import type { BuiltPart } from './piston-group.js';

/** Seat cone reference: insert seated in the head counterbore t in [6.5, 13.5]
 * (head frame); the cone contact circle sits at insert-local z = 0. */
export const seatT = 9.4;

type ValveSpec = {
  headDia: number;
  stemDia: number;
  length: number;
  seatConeMidR: number;
};

export const valveSpec = (slot: 'Intake' | 'Exhaust'): ValveSpec =>
  slot === 'Intake'
    ? {
        headDia: vp.inHeadDia,
        stemDia: vp.stemInDia,
        length: vp.inLen,
        seatConeMidR: (vp.inHeadDia - 2.5) / 2,
      }
    : {
        headDia: vp.exHeadDia,
        stemDia: vp.stemExDia,
        length: vp.exLen,
        seatConeMidR: (vp.exHeadDia - 2.5) / 2,
      };

/**
 * Valve: ONE closed revolved profile. Local z = 0 at the seat-face cone
 * mid-circle (radius seatConeMidR); the tip is at z = length - headBottom.
 */
export const buildValve = (
  place: Placement,
  slot: 'Intake' | 'Exhaust',
): BuiltPart => {
  const s = valveSpec(slot);
  const headR = s.headDia / 2;
  const stemR = s.stemDia / 2;
  const margin = slot === 'Intake' ? 1.5 : 1.8;
  const faceHalf = slot === 'Intake' ? 0.75 : 1;
  // Seat cone band: 45 deg, mid at (seatConeMidR, 0).
  const coneLow: [number, number] = [s.seatConeMidR + faceHalf, -faceHalf];
  const coneHigh: [number, number] = [s.seatConeMidR - faceHalf, faceHalf];
  const headBottomZ = coneLow[1] - margin;
  const tipZ = headBottomZ + s.length;
  const grooveMid = tipZ - vp.keeperGrooveBelowTip - vp.keeperGrooveW / 2;
  const grooveR = vp.keeperGrooveDia / 2;
  const profile = draw([0, headBottomZ])
    .lineTo([headR, headBottomZ])
    .lineTo([headR, coneLow[1]])
    .lineTo([coneLow[0], coneLow[1]])
    .lineTo([coneHigh[0], coneHigh[1]])
    .lineTo([stemR + 3, coneHigh[1] + 6])
    .lineTo([stemR, coneHigh[1] + 16])
    .lineTo([stemR, grooveMid - vp.keeperGrooveW / 2 - 1])
    .lineTo([grooveR, grooveMid - vp.keeperGrooveW / 2])
    .lineTo([grooveR, grooveMid + vp.keeperGrooveW / 2])
    .lineTo([stemR, grooveMid + vp.keeperGrooveW / 2 + 1])
    .lineTo([stemR, tipZ])
    .lineTo([0, tipZ])
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1]);
  const shape = place.shape(profile);
  const interfaces: InterfaceDeclarations = {
    stemAxis: datumAt(place, [0, 0, 0], [1, 0, 0], [0, 0, 1]),
    keeperGroove: axisNear(place, [grooveR, 0, grooveMid], 'CYLINDRE', 0.12),
    // Ponytail: the Tau STEP writer cannot stamp names onto CONICAL_SURFACE
    // faces (verified with a bare-cone repro: 'no representation item named
    // ...'), so declaring this aborts the whole export. The cone geometry is
    // modeled; the interface is omitted until the writer supports cones.
    // seatFace: faceNear(place, [s.seatConeMidR, 0, 0], 'CONE', 0.12),
    stem: axisNear(
      place,
      [stemR, 0, (coneHigh[1] + 20 + grooveMid) / 2],
      'CYLINDRE',
      0.12,
    ),
    tip: faceNear(place, [stemR / 2, 0, tipZ], 'PLANE', 0.12),
  };
  return { shape, interfaces };
};

/** Valve tip z in valve-local coordinates (z = 0 at the seat cone mid). */
export const valveTipZ = (slot: 'Intake' | 'Exhaust'): number => {
  const s = valveSpec(slot);
  const margin = slot === 'Intake' ? 1.5 : 1.8;
  const faceHalf = slot === 'Intake' ? 0.75 : 1;
  return -faceHalf - margin + s.length;
};

/**
 * Seat insert: revolved ring, 45-deg seat cone matching the valve face.
 * Local z = 0 at the cone mid-circle; the press OD band is above.
 */
export const buildValveSeat = (
  place: Placement,
  slot: 'Intake' | 'Exhaust',
): BuiltPart => {
  const odR = (slot === 'Intake' ? vp.seatInOd : vp.seatExOd) / 2;
  const mid = valveSpec(slot).seatConeMidR;
  const faceHalf = slot === 'Intake' ? 0.75 : 1;
  // Cone band from (mid+1.7, -1.7) up to (mid-1.7, +1.7) (wider than the
  // valve band so the contact is face-in-face).
  const w = faceHalf + 0.9;
  // True 45-deg cone from (mid+w, -w) up to the top face at z = 5.3; the
  // closing edge IS the cone, so its slope is exactly 1.
  const profile = draw([mid + w, -w])
    .lineTo([odR, -w])
    .lineTo([odR, 5.3])
    .lineTo([mid - 5.3, 5.3])
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1]);
  const shape = place.shape(profile);
  const interfaces: InterfaceDeclarations = {
    axis: datumAt(place, [0, 0, 0], [1, 0, 0], [0, 0, 1]),
    press: axisNear(place, [odR, 0, 2], 'CYLINDRE', 0.12),
    // Ponytail: the Tau STEP writer cannot stamp names onto CONICAL_SURFACE
    // faces (verified with a bare-cone repro: 'no representation item named
    // ...'), so declaring this aborts the whole export. The cone geometry is
    // modeled; the interface is omitted until the writer supports cones.
    // seatCone: faceNear(place, [mid, 0, 0], 'CONE', 0.12),
  };
  return { shape, interfaces };
};

/** Valve guide: revolved sleeve with the stem-seal boss land on top. */
export const buildValveGuide = (
  place: Placement,
  slot: 'Intake' | 'Exhaust',
): BuiltPart => {
  const odR = vp.guideOd / 2;
  const boreR =
    (slot === 'Intake' ? vp.stemInDia + 0.024 : vp.stemExDia + 0.056) / 2;
  const bossR = vp.sealBossDia / 2;
  const profile = draw([boreR, 0])
    .lineTo([odR, 0])
    .lineTo([odR, vp.guideLen - 10])
    .lineTo([bossR, vp.guideLen - 10])
    .lineTo([bossR, vp.guideLen])
    .lineTo([boreR, vp.guideLen])
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1]);
  const shape = place.shape(profile);
  const interfaces: InterfaceDeclarations = {
    bore: axisNear(place, [boreR, 0, vp.guideLen / 2], 'CYLINDRE', 0.1),
    press: axisNear(place, [odR, 0, 20], 'CYLINDRE', 0.1),
    sealBoss: axisNear(place, [bossR, 0, vp.guideLen - 5], 'CYLINDRE', 0.1),
  };
  return { shape, interfaces };
};

/** Stem seal: elastomer ring pressed over the guide boss (P12 squeeze). */
export const buildStemSeal = (place: Placement): BuiltPart => {
  const innerR = vp.sealBossDia / 2 - 0.2;
  const shape = place.shape(
    makeCylinder(innerR + 2.2, 8, [0, 0, 0], [0, 0, 1]).cut(
      makeCylinder(innerR, 10, [0, 0, -1], [0, 0, 1]),
    ),
  );
  const interfaces: InterfaceDeclarations = {
    bossPress: axisNear(place, [innerR, 0, 4], 'CYLINDRE', 0.1),
  };
  return { shape, interfaces };
};

/** Valve spring: true helical sweep, ground flat ends, compressed height. */
export const buildValveSpring = (
  place: Placement,
  height: number,
): BuiltPart => {
  const wireR = vp.springWireDia / 2;
  const meanR = vp.springMeanDia / 2;
  const effective = height - vp.springWireDia;
  const pitch = effective / (vp.springCoils - 1);
  const helix = sketchHelix(
    pitch,
    effective + pitch,
    meanR,
    [0, 0, wireR - pitch / 2],
    [0, 0, 1],
  );
  let coil = helix.sweepSketch((plane, origin) => {
    void origin;
    return drawCircle(wireR).sketchOnPlane(plane) as Sketch;
  });
  coil = coil
    .cut(makeBaseBox(80, 80, 20).translate([0, 0, -20]))
    .cut(makeBaseBox(80, 80, 20).translate([0, 0, height]));
  // Ground ends: thin fused washers make each end a single annular face
  // (the bare ground helix leaves two coplanar wire patches per end).
  const washer = (z0: number): Shape3D =>
    makeCylinder(meanR + wireR + 0.5, 0.8, [0, 0, z0], [0, 0, 1]).cut(
      makeCylinder(meanR - wireR - 0.5, 1, [0, 0, z0 - 0.1], [0, 0, 1]),
    );
  coil = coil
    .fuse(washer(0))
    .fuse(washer(height - 0.8))
    .simplify();
  const shape = place.shape(coil);
  const interfaces: InterfaceDeclarations = {
    retainerEnd: faceNear(place, [meanR, 0, height], 'PLANE', 0.3),
    seatEnd: faceNear(place, [meanR, 0, 0], 'PLANE', 0.3),
  };
  return { shape, interfaces };
};

/** Spring retainer: revolve — 7 deg keeper cone bore, spring step, top. */
export const buildRetainer = (place: Placement): BuiltPart => {
  // Local z = 0 at the underside (spring contact).
  const tan7 = Math.tan((7 * Math.PI) / 180);
  const boreR = (z: number): number => 5.1 + (8 - z) * tan7 * 0 + z * tan7 + 0; // Placeholder, replaced below.
  void boreR;
  const r0 = 5.2; // Cone radius at the underside.
  const h = 8;
  const r1 = r0 + h * tan7;
  // Spring ledge at z = 0; the center web is recessed to +1.2 so the two
  // underside faces (spring contact vs center web) are distinct.
  const stepR = vp.springMeanDia / 2 - 2.6;
  const profile = draw([r0, 1.2])
    .lineTo([stepR, 1.2])
    .lineTo([stepR, 0])
    .lineTo([vp.retainerOd / 2, 0])
    .lineTo([vp.retainerOd / 2, 2.5])
    .lineTo([vp.springMeanDia / 2 - 2.1, 2.5])
    .lineTo([vp.springMeanDia / 2 - 2.1, h])
    .lineTo([r1, h])
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1]);
  const shape = place.shape(profile);
  const interfaces: InterfaceDeclarations = {
    // Ponytail: the Tau STEP writer cannot stamp names onto CONICAL_SURFACE
    // faces (verified with a bare-cone repro: 'no representation item named
    // ...'), so declaring this aborts the whole export. The cone geometry is
    // modeled; the interface is omitted until the writer supports cones.
    // keeperCone: faceNear(place, [(r0 + r1) / 2, 0, h / 2], 'CONE', 0.12),
    springStep: faceNear(
      place,
      [(stepR + vp.retainerOd / 2) / 2, 0, 0],
      'PLANE',
      0.12,
    ),
    underside: faceNear(
      place,
      [(r0 + stepR + 1.2 * tan7) / 2, 0, 1.2],
      'PLANE',
      0.12,
    ),
  };
  return { shape, interfaces };
};

/** Retainer cone geometry shared with the keepers. */
export const retainerCone = {
  r0: 5.2,
  h: 8,
  tan7: Math.tan((7 * Math.PI) / 180),
} as const;

/**
 * Valve keeper: one half-cotter (168-deg segment) whose outer cone matches
 * the retainer bore and whose bead engages the stem groove. Local frame
 * matches the retainer (z = 0 at the retainer underside).
 */
export const buildKeeper = (place: Placement, side: 0 | 1): BuiltPart => {
  const { r0, h, tan7 } = retainerCone;
  const grooveR = vp.keeperGrooveDia / 2;
  const stemR = 4.03;
  // Bead band z: the stem groove sits mid-keeper.
  const bead0 = h / 2 - vp.keeperGrooveW / 2 + 0.1;
  const bead1 = h / 2 + vp.keeperGrooveW / 2 - 0.1;
  const profile = draw([stemR, -0.5])
    .lineTo([r0 - 0.5 * tan7 - 0.02, -0.5])
    .lineTo([r0 + h * tan7 - 0.02, h])
    .lineTo([stemR, h])
    .lineTo([stemR, bead1])
    .lineTo([grooveR + 0.02, bead1 - 0.1])
    .lineTo([grooveR + 0.02, bead0 + 0.1])
    .lineTo([stemR, bead0])
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1], { angle: 168 });
  const rotated = profile.rotate(side === 0 ? 6 : 186, [0, 0, 0], [0, 0, 1]);
  const shape = place.shape(rotated);
  const midAngle = ((side === 0 ? 90 : 270) * Math.PI) / 180;
  const interfaces: InterfaceDeclarations = {
    bead: faceNear(
      place,
      [
        (grooveR + 0.02) * Math.cos(midAngle),
        (grooveR + 0.02) * Math.sin(midAngle),
        (bead0 + bead1) / 2,
      ],
      'CYLINDRE',
      0.1,
    ),
    // Ponytail: the Tau STEP writer cannot stamp names onto CONICAL_SURFACE
    // faces (verified with a bare-cone repro: 'no representation item named
    // ...'), so declaring this aborts the whole export. The cone geometry is
    // modeled; the interface is omitted until the writer supports cones.
    // cone: faceNear(place, [coneMidR * Math.cos(midAngle), coneMidR * Math.sin(midAngle), h / 2], 'CONE', 0.1),
  };
  return { shape, interfaces };
};

/** Spark plug: revolved body (thread reach, gasket flange, hex, insulator). */
export const buildSparkPlug = (place: Placement): BuiltPart => {
  const threadR = threadBandDia(14) / 2;
  const profile = draw([0, -19])
    .lineTo([threadR - 1, -19])
    .lineTo([threadR, -18])
    .lineTo([threadR, 0])
    .lineTo([9.9, 0])
    .lineTo([9.9, 3])
    .lineTo([8, 3])
    .lineTo([8, 10])
    .lineTo([6, 12])
    .lineTo([6, 22])
    .lineTo([2.5, 26])
    .lineTo([0, 26])
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1]);
  const electrode = makeCylinder(1.2, 4, [0, 0, -23], [0, 0, 1]);
  const shape = place.shape(profile.fuse(electrode));
  const interfaces: InterfaceDeclarations = {
    seatFlange: faceNear(place, [(threadR + 9.9) / 2, 0, 0], 'PLANE', 0.1),
    thread: axisNear(place, [threadR, 0, -10], 'CYLINDRE', 0.1),
  };
  return { shape, interfaces };
};

export { Placement };
