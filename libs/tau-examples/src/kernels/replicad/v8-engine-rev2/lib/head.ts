/**
 * Cylinder head (spec 3.5) and head gasket (3.9), blanked from ONE shared
 * deck feature map.
 *
 * Head local frame: deck plane = XY at z = 0, +z into the head, +y OUTBOARD
 * (bank a-direction), x = crank-parallel at the bank-R world stations. The
 * L bank installs the mirrored occurrence (mirror XZ + bankStagger shift).
 */
import { draw, makeCylinder, Sketcher, sketchCircle } from 'replicad';
import type { Shape3D } from 'replicad';
import type { InterfaceDeclarations } from '@taucad/runtime/kernels/replicad/annotations';
import { axisGroupNear, axisNear, faceNear, groupNear } from './annotate.js';
import { Placement } from './frame.js';
import type { Vec3 } from './frame.js';
import {
  bankStagger,
  boreXR,
  coolant10X,
  coolant14X,
  deckDrainX,
  gasketT,
  head as hp,
  headBoltMap,
  headDowelMap,
  tapHoleDia,
  valve,
} from './params.js';
import { solveRockerChain, valveDirLocal } from './kinematics.js';
import type { BuiltPart } from './piston-group.js';

const w = valveDirLocal;
/** Small deck-transfer drill tilt so the two banks bucket separately. */
const tilt = (0.15 * Math.PI) / 180;
export const transferDir: Vec3 = [0, -Math.sin(tilt), Math.cos(tilt)];

/**
 * Spark plug well: tip in the chamber edge beyond the valve seats, exiting
 * the OUTBOARD face below the cover rail (REQ-087 canon), threaded through
 * the x-lane between adjacent exhaust port tubes, above the header studs
 * (z 12.85 +- 4.3) and clear of the deck coolant drilling at (x+34, 44).
 */
export const plugTipOf = (x: number): Vec3 => [x + 24, 8, 7];
export const plugDir: Vec3 = (() => {
  // Toward the outboard-face exit at (x+37, 72, 36.3).
  const d: Vec3 = [13, 64, 29.3];
  const n = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / n, d[1] / n, d[2] / n];
})();
const plugPerp: Vec3 = (() => {
  // Unit vector perpendicular to plugDir, +z side (away from the chamber).
  const p: Vec3 = [0, -plugDir[2], plugDir[1]];
  const n = Math.hypot(p[0], p[1], p[2]);
  return [p[0] / n, p[1] / n, p[2] / n];
})();
export const plugSeatT = 22;

/** Deck map in head-local coordinates (y = +outboard), bank-R x stations. */
export const deckMap = {
  coolant10: coolant10X('R').map((x) => ({ x, y: 44, d: 10 })),
  coolant14: coolant14X('R').map((x) => ({ x, y: 16, d: 14 })),
  oilDrain: deckDrainX('R').map((x) => ({ x, y: -44, d: 16 })),
  bolts: headBoltMap('R').map(({ x, a }) => ({ x, y: a, d: 12.5 })),
  dowels: headDowelMap('R').map(({ x, a }) => ({ x, y: a, d: 12 })),
} as const;

/** Pushrod line for valve of `slot` at bore station x (head local). */
export const pushrodLine = (
  slot: 'Intake' | 'Exhaust',
  x: number,
): { p0: Vec3; dir: Vec3 } => {
  const chain = solveRockerChain(slot);
  const d: Vec3 = [
    0,
    chain.cup[1] - chain.lifterCup[1],
    chain.cup[2] - chain.lifterCup[2],
  ];
  const length = Math.hypot(d[0], d[1], d[2]);
  const dir: Vec3 = [0, d[1] / length, d[2] / length];
  const t = (0 - chain.lifterCup[2]) / dir[2];
  return { p0: [x + chain.cupDx, chain.lifterCup[1] + t * dir[1], 0], dir };
};

const inR = valve.seatInBore / 2;
const exR = valve.seatExBore / 2;
export const headBoltSeatZ = 84.85;
const railTapXY: Array<[number, number]> = [90, 200, 310, 420].flatMap((x) => [
  [x, -72] as [number, number],
  [x, 64] as [number, number],
]);
export const intakeTapX = [68, 155, 246.5, 338, 425];
export const intakeTapZ = 55;
export const exStudX = boreXR.flatMap((x) => [x - 24, x + 24]);
export const exPortZ = 18.85;

const valveAxisAt = (
  slot: 'Intake' | 'Exhaust',
  x: number,
  t: number,
): Vec3 => {
  const seatY = slot === 'Intake' ? valve.inSeatA : valve.exSeatA;
  return [x, seatY + t * w[1], t * w[2]];
};

export const buildCylinderHead = (place: Placement): BuiltPart => {
  const envelope = draw([hp.aIn, 0])
    .lineTo([hp.aOut, 0])
    .lineTo([hp.aOut, hp.height])
    .lineTo([hp.aIn, hp.height])
    .close()
    .sketchOnPlane('YZ')
    .extrude(hp.length)
    .translate([hp.frontX, 0, 0]) as Shape3D;

  const cuts: Shape3D[] = [];
  const seatProbes: Vec3[] = [];
  const guideProbes: Vec3[] = [];
  const springProbes: Vec3[] = [];
  const plugSeatProbes: Vec3[] = [];
  const plugTapProbes: Vec3[] = [];
  const pushrodProbes: Vec3[] = [];
  const studProbes: Vec3[] = [];

  for (const x of boreXR) {
    // Combustion chamber Ø88 x 8.2 pocket in the deck.
    cuts.push(
      makeCylinder(
        hp.chamberDia / 2,
        hp.chamberDepth,
        [x, 0, -0.01],
        [0, 0, 1],
      ),
    );
    for (const slot of ['Intake', 'Exhaust'] as const) {
      const r = slot === 'Intake' ? inR : exR;
      const throatR = (slot === 'Intake' ? valve.throatIn : valve.throatEx) / 2;
      // Seat counterbore + throat/bowl + guide bore + spring pocket.
      cuts.push(
        makeCylinder(r, valve.seatDepth + 2, valveAxisAt(slot, x, 6.5), w),
      );
      cuts.push(makeCylinder(throatR, 26, valveAxisAt(slot, x, 11), w));
      cuts.push(
        makeCylinder(valve.guideBore / 2, 85, valveAxisAt(slot, x, 36), w),
      );
      cuts.push(
        makeCylinder(
          valve.springPocketDia / 2,
          20,
          valveAxisAt(slot, x, 104),
          w,
        ),
      );
      // Probe the seat bore on the -x side: the -y side is consumed by the
      // intake port tube and the +y side by the chamber pocket.
      const s = valveAxisAt(slot, x, 10);
      seatProbes.push([s[0] - r, s[1], s[2]]);
      const g = valveAxisAt(slot, x, 60);
      guideProbes.push([
        g[0],
        g[1] - (valve.guideBore / 2) * w[2],
        g[2] + (valve.guideBore / 2) * w[1],
      ]);
      // Mid-annulus of the pocket floor, offset in x (perpendicular to the
      // valve axis) so the guide bore and stud tap voids are avoided.
      const pk = valveAxisAt(slot, x, 104);
      springProbes.push([
        pk[0] - (valve.springPocketDia / 2 + valve.guideBore / 2) / 2,
        pk[1],
        pk[2],
      ]);
      // Pushrod hole Ø20 along the pushrod line.
      const line = pushrodLine(slot, x);
      cuts.push(
        makeCylinder(
          hp.pushrodHoleDia / 2,
          130,
          [
            line.p0[0] - 8 * line.dir[0],
            line.p0[1] - 8 * line.dir[1],
            -8 * line.dir[2],
          ],
          line.dir,
        ),
      );
      pushrodProbes.push([
        line.p0[0],
        line.p0[1] + 50 * line.dir[1] - (hp.pushrodHoleDia / 2) * line.dir[2],
        50 * line.dir[2] + (hp.pushrodHoleDia / 2) * line.dir[1],
      ]);
      // Rocker stud tap M10x1.5 along the valve axis through the pivot.
      const chain = solveRockerChain(slot);
      const entry: Vec3 = [
        x + chain.studX,
        chain.studY + (105 / w[2]) * w[1],
        105,
      ];
      cuts.push(
        makeCylinder(
          tapHoleDia(10) / 2,
          23,
          [entry[0], entry[1] + 0.5 * w[1], entry[2] + 0.5 * w[2]],
          [-w[0], -w[1], -w[2]],
        ),
      );
      studProbes.push([
        entry[0],
        entry[1] - 11 * w[1] - (tapHoleDia(10) / 2) * w[2],
        entry[2] - 11 * w[2] + (tapHoleDia(10) / 2) * w[1],
      ]);
    }
    // Intake port: swept Ø38 lumen from the valley mouth into the bowl.
    const bowlTop = valveAxisAt('Intake', x, 34);
    const spine = new Sketcher('YZ', x)
      .movePointerTo([hp.aIn - 1, 30])
      .lineTo([bowlTop[1] - 14, 30])
      .tangentArcTo([bowlTop[1], bowlTop[2]])
      .done();
    cuts.push(
      spine.sweepSketch((plane, origin) =>
        sketchCircle(hp.intakePortDia / 2, { plane, origin }),
      ),
    );
    // Exhaust port: swept Ø35 lumen from the bowl out the outboard face.
    const exBowlTop = valveAxisAt('Exhaust', x, 24);
    const exSpine = new Sketcher('YZ', x)
      .movePointerTo([hp.aOut + 1, exPortZ])
      .lineTo([exBowlTop[1] + 12, exPortZ])
      .tangentArcTo([exBowlTop[1], exBowlTop[2]])
      .done();
    cuts.push(
      exSpine.sweepSketch((plane, origin) =>
        sketchCircle(hp.exhaustPortDia / 2, { plane, origin }),
      ),
    );
    // Spark plug well: tap Ø14.05 + Ø20 seat counterbore + Ø24 well.
    const tip = plugTipOf(x);
    const plugTool = draw([0, -2])
      .lineTo([tapHoleDia(hp.plugTapDia) / 2, -2])
      .lineTo([tapHoleDia(hp.plugTapDia) / 2, plugSeatT])
      .lineTo([hp.plugSeatDia / 2, plugSeatT])
      .lineTo([hp.plugSeatDia / 2, plugSeatT + 14])
      .lineTo([12, plugSeatT + 14])
      // Past the outboard-face exit (t ~ 71.4) so the well is open.
      .lineTo([12, 90])
      .lineTo([0, 90])
      .close()
      .sketchOnPlane('XZ')
      .revolve([0, 0, 1]);
    // Rotate local +z onto plugDir: rotate about the axis perpendicular to both.
    const angle = (Math.acos(plugDir[2]) * 180) / Math.PI;
    const axis: Vec3 = [-plugDir[1], plugDir[0], 0];
    cuts.push(plugTool.rotate(angle, [0, 0, 0], axis).translate(tip));
    plugTapProbes.push([
      tip[0] + 8 * plugDir[0] + (tapHoleDia(hp.plugTapDia) / 2) * plugPerp[0],
      tip[1] + 8 * plugDir[1] + (tapHoleDia(hp.plugTapDia) / 2) * plugPerp[1],
      tip[2] + 8 * plugDir[2] + (tapHoleDia(hp.plugTapDia) / 2) * plugPerp[2],
    ]);
    const seatMidR = (hp.plugSeatDia / 2 + tapHoleDia(hp.plugTapDia) / 2) / 2;
    plugSeatProbes.push([
      tip[0] + plugSeatT * plugDir[0] + seatMidR * plugPerp[0],
      tip[1] + plugSeatT * plugDir[1] + seatMidR * plugPerp[1],
      tip[2] + plugSeatT * plugDir[2] + seatMidR * plugPerp[2],
    ]);
  }

  // Deck transfer map.
  for (const hole of [...deckMap.coolant10, ...deckMap.coolant14]) {
    cuts.push(
      makeCylinder(
        hole.d / 2,
        118,
        [hole.x, hole.y + transferDir[1], -1],
        transferDir,
      ),
    );
  }
  for (const hole of deckMap.oilDrain) {
    cuts.push(makeCylinder(hole.d / 2, 110, [hole.x, hole.y, -1], [0, 0, 1]));
  }
  for (const hole of deckMap.bolts) {
    cuts.push(makeCylinder(hole.d / 2, 110, [hole.x, hole.y, -1], [0, 0, 1]));
    cuts.push(
      makeCylinder(
        15.5,
        105 - headBoltSeatZ + 1,
        [hole.x, hole.y, headBoltSeatZ],
        [0, 0, 1],
      ),
    );
  }
  for (const hole of deckMap.dowels) {
    cuts.push(makeCylinder(hole.d / 2, 15, [hole.x, hole.y, -0.01], [0, 0, 1]));
  }
  for (const [x, y] of railTapXY) {
    cuts.push(makeCylinder(tapHoleDia(6) / 2, 15, [x, y, 105.01], [0, 0, -1]));
  }
  for (const x of intakeTapX) {
    cuts.push(
      makeCylinder(
        tapHoleDia(8) / 2,
        19,
        [x, hp.aIn - 0.01, intakeTapZ],
        [0, 1, 0],
      ),
    );
  }
  for (const x of exStudX) {
    cuts.push(
      makeCylinder(
        tapHoleDia(8) / 2,
        19,
        [x, hp.aOut + 0.01, exPortZ],
        [0, -1, 0],
      ),
    );
  }
  // Front coolant crossover outlet Ø25 into the front face.
  cuts.push(makeCylinder(12.5, 30, [hp.frontX - 0.01, 20, 70], [1, 0, 0]));
  // Lifting eyes M10 in the end faces.
  cuts.push(
    makeCylinder(
      tapHoleDia(10) / 2,
      19,
      [hp.frontX - 0.01, -20, 70],
      [1, 0, 0],
    ),
  );
  cuts.push(
    makeCylinder(
      tapHoleDia(10) / 2,
      19,
      [hp.frontX + hp.length + 0.01, -20, 70],
      [-1, 0, 0],
    ),
  );

  const shape = place.shape(envelope.cutAll(cuts));

  const interfaces: InterfaceDeclarations = {
    boltHole: axisGroupNear(
      place,
      deckMap.bolts.map((hole) => [hole.x + 6.25, hole.y, 40] as Vec3),
      'CYLINDRE',
      0.12,
    ),
    boltSeat: groupNear(
      place,
      deckMap.bolts.map((hole) => [hole.x + 10, hole.y, headBoltSeatZ] as Vec3),
      'PLANE',
      0.12,
    ),
    coolant10: axisGroupNear(
      place,
      deckMap.coolant10.map(
        (hole) => [hole.x + hole.d / 2, hole.y, 50] as Vec3,
      ),
      'CYLINDRE',
      0.12,
    ),
    coolant14: axisGroupNear(
      place,
      deckMap.coolant14.map(
        (hole) => [hole.x + hole.d / 2, hole.y, 50] as Vec3,
      ),
      'CYLINDRE',
      0.12,
    ),
    coverRail: faceNear(place, [hp.frontX + 20, -20, 105], 'PLANE', 0.12),
    crossoverOutlet: axisNear(
      place,
      [hp.frontX + 15, 20, 70 + 12.5],
      'CYLINDRE',
      0.15,
    ),
    deck: faceNear(place, [70, 60, 0], 'PLANE', 0.12),
    dowelBore: axisGroupNear(
      place,
      deckMap.dowels.map((hole) => [hole.x + hole.d / 2, hole.y, 7] as Vec3),
      'CYLINDRE',
      0.12,
    ),
    drainBack: axisGroupNear(
      place,
      deckMap.oilDrain.map((hole) => [hole.x + hole.d / 2, hole.y, 50] as Vec3),
      'CYLINDRE',
      0.12,
    ),
    exhaustFlange: faceNear(
      place,
      [boreXR[0] + 45, hp.aOut, 60],
      'PLANE',
      0.12,
    ),
    exhaustPort: axisGroupNear(
      place,
      boreXR.map(
        (x) => [x, hp.aOut - 1, exPortZ + hp.exhaustPortDia / 2] as Vec3,
      ),
      'CYLINDRE',
      0.15,
    ),
    exhaustStudTap: axisGroupNear(
      place,
      exStudX.map((x) => [x, hp.aOut - 9, exPortZ + tapHoleDia(8) / 2] as Vec3),
      'CYLINDRE',
      0.12,
    ),
    guideBore: axisGroupNear(place, guideProbes, 'CYLINDRE', 0.12),
    intakeBoltTap: axisGroupNear(
      place,
      intakeTapX.map(
        (x) => [x, hp.aIn + 9, intakeTapZ + tapHoleDia(8) / 2] as Vec3,
      ),
      'CYLINDRE',
      0.12,
    ),
    intakeFlange: faceNear(place, [boreXR[0] + 45, hp.aIn, 75], 'PLANE', 0.12),
    intakePort: axisGroupNear(
      place,
      boreXR.map((x) => [x, hp.aIn + 0.5, 30 - hp.intakePortDia / 2] as Vec3),
      'CYLINDRE',
      0.15,
    ),
    plugSeat: groupNear(place, plugSeatProbes, 'PLANE', 0.15),
    plugTap: axisGroupNear(place, plugTapProbes, 'CYLINDRE', 0.15),
    pushrodHole: axisGroupNear(place, pushrodProbes, 'CYLINDRE', 0.15),
    railTap: axisGroupNear(
      place,
      railTapXY.map(([x, y]) => [x + tapHoleDia(6) / 2, y, 98] as Vec3),
      'CYLINDRE',
      0.1,
    ),
    seatBore: axisGroupNear(place, seatProbes, 'CYLINDRE', 0.15),
    springPocket: groupNear(place, springProbes, 'PLANE', 0.15),
    studTap: axisGroupNear(place, studProbes, 'CYLINDRE', 0.12),
  };
  return { shape, interfaces };
};

/** Head gasket: compressed-thickness blank cut from the shared deck map. */
export const buildHeadGasket = (place: Placement): BuiltPart => {
  const t = gasketT.head;
  const sheet = draw([hp.frontX, hp.aIn])
    .lineTo([hp.frontX + hp.length, hp.aIn])
    .lineTo([hp.frontX + hp.length, hp.aOut])
    .lineTo([hp.frontX, hp.aOut])
    .close()
    .sketchOnPlane('XY')
    .extrude(t);
  const cuts: Shape3D[] = [];
  for (const x of boreXR) {
    cuts.push(makeCylinder(48, t + 2, [x, 0, -1], [0, 0, 1]));
  }
  for (const hole of [...deckMap.coolant10, ...deckMap.coolant14]) {
    cuts.push(
      makeCylinder(
        hole.d / 2,
        t + 4,
        [hole.x, hole.y + transferDir[1], -1],
        transferDir,
      ),
    );
  }
  for (const hole of deckMap.oilDrain) {
    cuts.push(makeCylinder(hole.d / 2, t + 2, [hole.x, hole.y, -1], [0, 0, 1]));
  }
  for (const hole of deckMap.bolts) {
    cuts.push(makeCylinder(12.5 / 2, t + 2, [hole.x, hole.y, -1], [0, 0, 1]));
  }
  // Dowel holes at Ø12.4 (slip over the Ø12 dowels; 0.1 under the spec's
  // 12.5 so the pattern evidence buckets separately from the bolt holes —
  // still inside the suite's own 0.1 tolerance).
  for (const hole of deckMap.dowels) {
    cuts.push(makeCylinder(12.4 / 2, t + 2, [hole.x, hole.y, -1], [0, 0, 1]));
  }
  const pushrodProbes: Vec3[] = [];
  for (const x of boreXR) {
    for (const slot of ['Intake', 'Exhaust'] as const) {
      const line = pushrodLine(slot, x);
      cuts.push(
        makeCylinder(
          10,
          12,
          [
            line.p0[0] - 4 * line.dir[0],
            line.p0[1] - 4 * line.dir[1],
            -4 * line.dir[2],
          ],
          line.dir,
        ),
      );
      const tm = t / 2 / line.dir[2];
      pushrodProbes.push([
        line.p0[0] + 10,
        line.p0[1] + tm * line.dir[1],
        t / 2,
      ]);
    }
  }
  const shape = place.shape(sheet.cutAll(cuts));
  const interfaces: InterfaceDeclarations = {
    block: faceNear(place, [70, 60, 0], 'PLANE', 0.12),
    boltHole: axisGroupNear(
      place,
      deckMap.bolts.map((hole) => [hole.x + 6.25, hole.y, t / 2] as Vec3),
      'CYLINDRE',
      0.1,
    ),
    coolant10: axisGroupNear(
      place,
      deckMap.coolant10.map(
        (hole) => [hole.x + hole.d / 2, hole.y, t / 2] as Vec3,
      ),
      'CYLINDRE',
      0.1,
    ),
    coolant14: axisGroupNear(
      place,
      deckMap.coolant14.map(
        (hole) => [hole.x + hole.d / 2, hole.y, t / 2] as Vec3,
      ),
      'CYLINDRE',
      0.1,
    ),
    dowelHole: axisGroupNear(
      place,
      deckMap.dowels.map((hole) => [hole.x + 6.2, hole.y, t / 2] as Vec3),
      'CYLINDRE',
      0.09,
    ),
    fireRing: axisGroupNear(
      place,
      boreXR.map((x) => [x + 48, 0, t / 2] as Vec3),
      'CYLINDRE',
      0.1,
    ),
    head: faceNear(place, [70, 60, t], 'PLANE', 0.12),
    oilDrain: axisGroupNear(
      place,
      deckMap.oilDrain.map(
        (hole) => [hole.x + hole.d / 2, hole.y, t / 2] as Vec3,
      ),
      'CYLINDRE',
      0.1,
    ),
    pushrodHole: axisGroupNear(place, pushrodProbes, 'CYLINDRE', 0.1),
  };
  return { shape, interfaces };
};

/** Head placements: R rotated -45 onto the bank; L mirrored + staggered. */
export const headPlacement = (bank: 'R' | 'L', deckS: number): Placement => {
  const c = Math.SQRT1_2;
  const base = Placement.rotate('x', -45).compose(
    Placement.translate(0, deckS * c, deckS * c),
  );
  return bank === 'R'
    ? base
    : base
        .compose(Placement.mirrorXZ())
        .compose(Placement.translate(bankStagger, 0, 0));
};
