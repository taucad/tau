/**
 * Exhaust system (spec 3.8): per-bank header weldment (flange + 4 swept
 * primaries + lofted collector), exhaust gasket, studs and nuts.
 *
 * The R header is modeled IN PLACE (Section 1.5 frame, canon for the
 * REQ-003 claim-2 probes: port centres at s = 250 on the head outboard
 * face a = +72, primaries running outboard along vR).
 */
import { draw, makeCylinder, Sketcher, sketchCircle } from 'replicad';
import type { Shape3D } from 'replicad';
import type { InterfaceDeclarations } from '@taucad/runtime/kernels/replicad/annotations';
import { axisGroupNear, faceNear, groupNear } from './annotate.js';
import { Placement } from './frame.js';
import type { Vec3 } from './frame.js';
import { bankPoint, boreXR, gasketT, head as hp } from './params.js';
import { buildNut, buildStud } from './fasteners.js';
import type { BuiltPart } from './piston-group.js';

const c = Math.SQRT1_2;
/** Header flange plane: head face (a=72) + compressed gasket 1.45. */
const flangeA = hp.aOut + gasketT.exhaust;
const portS = 250;
export const exStudXOffsets = [-24, 24];

/** World position helpers (bank R). */
const atFlange = (x: number, a: number, s: number): Vec3 =>
  bankPoint('R', x, a, s);

/**
 * Bank-R exhaust header, modeled in place. The flange plate is 10 thick
 * with 4 Ø35 port openings and 8 stud slots; primaries sweep outboard-down
 * and rearward into a lofted collector along the bank.
 */
export const buildExhaustHeader = (place: Placement): BuiltPart => {
  // Flange plate: extruded along vR (thickness direction).
  const plateS: [number, number] = [225, 258];
  const plateX: [number, number] = [boreXR[0] - 40, boreXR[3] + 40];
  // Local plate frame: build in bank coordinates then rotate.
  // Draw the plate profile in the (x, s) plane and extrude along a.
  const plate = draw([plateX[0], plateS[0]])
    .lineTo([plateX[1], plateS[0]])
    .lineTo([plateX[1], plateS[1]])
    .lineTo([plateX[0], plateS[1]])
    .close()
    .sketchOnPlane('XY')
    .extrude(10);
  // Frame: local (x, s, t) -> world bank-R point (x, a = flangeA + t, s):
  // mirrorXZ then rotate x -135 maps local +y to uR and +z to vR exactly.
  const frame = Placement.mirrorXZ()
    .rotate('x', -135)
    .compose(Placement.translate(0, flangeA * c, -flangeA * c));
  const placed = frame.compose(place);

  const cuts: Shape3D[] = [];
  const fuses: Shape3D[] = [];
  // Port openings Ø35 + stud slots Ø9 in the plate (drilled along local z).
  for (const x of boreXR) {
    cuts.push(makeCylinder(17.5, 14, [x, portS, -2], [0, 0, 1]));
    for (const dx of exStudXOffsets) {
      cuts.push(makeCylinder(4.5, 14, [x + dx, 244, -2], [0, 0, 1]));
      // Spot-faced nut pad: each seat is its own face (0.8 deep, Ø14).
      cuts.push(makeCylinder(7, 0.81, [x + dx, 244, 9.2], [0, 0, 1]));
    }
  }
  // Primaries: lumen Ø35 wall 1.6 swept along G1 spines outboard then
  // rearward-down to the collector at the rear.
  const collectorY = 90; // Local +z depth (outboard of the flange).
  const primaries: Array<{ outer: Shape3D; lumen: Shape3D }> = [];
  for (const [index, x] of boreXR.entries()) {
    const drop = 40 + index * 0;
    const spine = () =>
      new Sketcher('YZ', x)
        .movePointerTo([portS, -0.5])
        .lineTo([portS, collectorY - 40])
        .tangentArcTo([portS - drop, collectorY])
        .done();
    const outer = spine().sweepSketch((plane, origin) =>
      sketchCircle(19.1, { plane, origin }),
    );
    const lumen = spine().sweepSketch((plane, origin) =>
      sketchCircle(17.5, { plane, origin }),
    );
    primaries.push({ outer, lumen });
  }
  // Collector: a tube along x at s = portS - 40, z = collectorY.. gathered
  // into one outlet; simplified as a swept main pipe the primaries enter.
  const collectorSpine = new Sketcher('XZ', 0)
    .movePointerTo([plateX[0] + 10, 0])
    .lineTo([plateX[1] + 60, 0])
    .done();
  void collectorSpine;
  const collectorOuter = makeCylinder(
    31.6,
    plateX[1] + 80 - plateX[0],
    [plateX[0], portS - 40, collectorY],
    [1, 0, 0],
  );
  const collectorLumen = makeCylinder(
    30,
    plateX[1] + 80 - plateX[0] - 2,
    [plateX[0] + 1, portS - 40, collectorY],
    [1, 0, 0],
  );

  let header = plate;
  for (const p of primaries) {
    fuses.push(p.outer);
  }
  fuses.push(collectorOuter);
  for (const solid of fuses) {
    header = header.fuse(solid);
  }
  header = header.cut(collectorLumen);
  for (const p of primaries) {
    header = header.cut(p.lumen);
  }
  for (const tool of cuts) {
    header = header.cut(tool);
  }

  const shape = placed.shape(header);
  const interfaces: InterfaceDeclarations = {
    envelope: faceNear(
      placed,
      [plateX[1] + 80, portS - 40, collectorY + 30],
      'PLANE',
      0.5,
    ),
    flangeSeat: groupNear(
      placed,
      boreXR.flatMap((x) =>
        exStudXOffsets.map((dx) => [x + dx + 5.5, 244, 9.2] as Vec3),
      ),
      'PLANE',
      0.15,
    ),
    headJoint: faceNear(placed, [plateX[0] + 8, 232, 0], 'PLANE', 0.12),
    portOpening: axisGroupNear(
      placed,
      boreXR.map((x) => [x + 17.5, portS, 5] as Vec3),
      'CYLINDRE',
      0.12,
    ),
    studSlot: axisGroupNear(
      placed,
      boreXR.flatMap((x) =>
        exStudXOffsets.map((dx) => [x + dx + 4.5, 244, 5] as Vec3),
      ),
      'CYLINDRE',
      0.12,
    ),
  };
  return { shape, interfaces };
};

/** Exhaust gasket: MLS blank, 4x Ø38 ports + 8x Ø9 stud holes. */
export const buildExhaustGasket = (place: Placement): BuiltPart => {
  const t = gasketT.exhaust;
  const plateX: [number, number] = [boreXR[0] - 40, boreXR[3] + 40];
  const sheet = draw([plateX[0], 225])
    .lineTo([plateX[1], 225])
    .lineTo([plateX[1], 258])
    .lineTo([plateX[0], 258])
    .close()
    .sketchOnPlane('XY')
    .extrude(t);
  const cuts: Shape3D[] = [];
  for (const x of boreXR) {
    cuts.push(makeCylinder(19, t + 2, [x, portS, -1], [0, 0, 1]));
    for (const dx of exStudXOffsets) {
      cuts.push(makeCylinder(4.5, t + 2, [x + dx, 244, -1], [0, 0, 1]));
    }
  }
  const frame = Placement.mirrorXZ()
    .rotate('x', -135)
    .compose(Placement.translate(0, hp.aOut * c, -hp.aOut * c));
  const placed = frame.compose(place);
  const shape = placed.shape(sheet.cutAll(cuts));
  const interfaces: InterfaceDeclarations = {
    a: faceNear(placed, [plateX[0] + 8, 232, 0], 'PLANE', 0.12),
    b: faceNear(placed, [plateX[0] + 8, 232, t], 'PLANE', 0.12),
    port: axisGroupNear(
      placed,
      boreXR.map((x) => [x + 19, portS, t / 2] as Vec3),
      'CYLINDRE',
      0.1,
    ),
    studHole: axisGroupNear(
      placed,
      boreXR.flatMap((x) =>
        exStudXOffsets.map((dx) => [x + dx + 4.5, 244, t / 2] as Vec3),
      ),
      'CYLINDRE',
      0.1,
    ),
  };
  return { shape, interfaces };
};

export const buildExhaustStud = (place: Placement): BuiltPart =>
  buildStud(place, { d: 8, length: 42, lowerThread: 17, upperThread: 12 });

export const buildExhaustNut = (place: Placement): BuiltPart =>
  buildNut(place, { d: 8, height: 7 });

export { atFlange, flangeA, portS, Placement };
