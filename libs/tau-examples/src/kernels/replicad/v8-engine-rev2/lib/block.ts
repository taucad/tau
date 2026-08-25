/**
 * Block casting (spec 3.1): one drafted V cross-section extruded the block
 * length, bulkhead crankcase, cored jackets, gallery network, and the full
 * machined-feature map. Local frame = the Section 1.5 assembly frame.
 */
import { draw, makeCylinder } from 'replicad';
import type { Shape3D } from 'replicad';
import type { InterfaceDeclarations } from '@taucad/replicad/annotations';
import { axisGroupNear, axisNear, faceNear, groupNear } from './annotate.js';
import { Placement } from './frame.js';
import type { Vec3 } from './frame.js';
import {
  bankPoint,
  block as bp,
  blockLength,
  boreX,
  boreXR,
  camAxisZ,
  coolant10X,
  coolant14X,
  deckDrainX,
  deckHeight,
  headBoltMap,
  headDowelMap,
  lifter,
  lobeX,
  mainX,
  press,
  tapHoleDia,
} from './params.js';
import { pushrodLine } from './head.js';
import { lifterAxisA, camCenterS } from './kinematics.js';
import type { BuiltPart } from './piston-group.js';

const c = Math.SQRT1_2;
/** Bank axis directions (unit). */
const bankU = (bank: 'R' | 'L'): Vec3 =>
  bank === 'R' ? [0, c, c] : [0, -c, c];
/** Deck-transfer tilt: bank R toward +z, bank L toward +y (bucket split). */
const transferDirWorld = (bank: 'R' | 'L'): Vec3 => {
  const a = ((45 - 0.15) * Math.PI) / 180;
  return bank === 'R'
    ? [0, Math.sin(a), Math.cos(a)]
    : [0, -Math.cos(a), Math.sin(a)];
};

const valleyFloorZ = 170;
const valleyWallA = 68;
const bellFlange = { x0: 493, halfW: 180, zMin: -180, zMax: 172 };
export const rearFaceX = 516;
export const rearBoreR = 48;
export const sensorBoss = {
  yHalf: 10,
  zBottom: 74,
  zTop: 180,
  x0: 510,
  x1: 538,
};
/** Crank sensor bore: vertical Ø12.05 at x = 533 reaching z = 74. */
export const sensorBore = { x: 528, r: tapHoleDia(12) / 2 };

/** Main cap geometry shared with the cap builder. */
export const capGeo = {
  width: 130,
  halfW: 65,
  height: 42,
  thickness: 26,
  registerDepth: 22,
  boltY: 45,
  saddleR: 34,
  notchY: 35.5,
  notchR: 4,
  notchXOffset: { upper: -6, lower: 6 },
} as const;

const bulkheadBand = (main: number): [number, number] => [
  mainX[main - 1]! - 13,
  mainX[main - 1]! + 13,
];

export const buildBlock = (place: Placement): BuiltPart => {
  // Primary form: the V cross-section extruded blockLength.
  const dOut = bankPoint('R', 0, bp.deckAOut, deckHeight);
  const dIn = bankPoint('R', 0, -valleyWallA, deckHeight);
  const vFoot: Vec3 = [0, valleyFloorZ - 2 * valleyWallA * c, valleyFloorZ];
  const profilePoints: Array<[number, number]> = [
    [98, -38],
    [98, -12],
    [110, -2],
    [dOut[1], dOut[2]],
    [dIn[1], dIn[2]],
    [vFoot[1], valleyFloorZ],
    [-vFoot[1], valleyFloorZ],
    [-dIn[1], dIn[2]],
    [-dOut[1], dOut[2]],
    [-110, -2],
    [-98, -12],
    [-98, -38],
  ];
  let pen = draw([profilePoints[0]![0], profilePoints[0]![1]]);
  for (const [y, z] of profilePoints.slice(1)) {
    pen = pen.lineTo([y, z]);
  }
  let block = pen.close().sketchOnPlane('YZ').extrude(blockLength);

  // Bellhousing flange plate + crank sensor boss (fused before cuts).
  const flange = draw([-bellFlange.halfW, bellFlange.zMin])
    .lineTo([bellFlange.halfW, bellFlange.zMin])
    .lineTo([bellFlange.halfW, bellFlange.zMax])
    .lineTo([-bellFlange.halfW, bellFlange.zMax])
    .close()
    .sketchOnPlane('YZ')
    .extrude(rearFaceX - bellFlange.x0)
    .translate([bellFlange.x0, 0, 0]) as Shape3D;
  const boss = draw([-sensorBoss.yHalf, sensorBoss.zBottom])
    .lineTo([sensorBoss.yHalf, sensorBoss.zBottom])
    .lineTo([sensorBoss.yHalf, sensorBoss.zTop])
    .lineTo([-sensorBoss.yHalf, sensorBoss.zTop])
    .close()
    .sketchOnPlane('YZ')
    .extrude(sensorBoss.x1 - sensorBoss.x0)
    .translate([sensorBoss.x0, 0, 0]) as Shape3D;
  void 0;
  // Motor mount pads on the skirt walls.
  const mountPad = (side: 1 | -1): Shape3D =>
    draw([side * 98, -36])
      .lineTo([side * 106, -36])
      .lineTo([side * 106, -6])
      .lineTo([side * 98, -6])
      .close()
      .sketchOnPlane('YZ')
      .extrude(90)
      .translate([212.4, 0, 0]) as Shape3D;
  block = block.fuse(flange).fuse(mountPad(1)).fuse(mountPad(-1));

  // Crankcase bays between the bulkheads (front wall 0..22.4, rear 492.4..).
  const bays: Shape3D[] = [];
  for (let bay = 1; bay <= 4; bay++) {
    const x0 = bulkheadBand(bay)[1];
    const x1 = bulkheadBand(bay + 1)[0];
    bays.push(
      draw([-78, -39])
        .lineTo([78, -39])
        .lineTo([78, 92])
        .lineTo([-78, 92])
        .close()
        .sketchOnPlane('YZ')
        .extrude(x1 - x0)
        .translate([x0, 0, 0]) as Shape3D,
    );
  }
  // Below the register ledges the bulkheads are cleared to the skirt walls.
  const underLedge = draw([-90, -181])
    .lineTo([90, -181])
    .lineTo([90, -capGeo.registerDepth])
    .lineTo([-90, -capGeo.registerDepth])
    .close()
    .sketchOnPlane('YZ')
    .extrude(494)
    .translate([-1, 0, 0]) as Shape3D;
  // Cap cavity: the bulkhead bottoms are machined up to the z = 0 parting
  // plane between the register ledges.
  const capCavity = draw([-(capGeo.halfW - press.capRegister), -181])
    .lineTo([capGeo.halfW - press.capRegister, -181])
    .lineTo([capGeo.halfW - press.capRegister, 0.001])
    .lineTo([-(capGeo.halfW - press.capRegister), 0.001])
    .close()
    .sketchOnPlane('YZ')
    .extrude(494)
    .translate([-1, 0, 0]) as Shape3D;
  block = block
    .cut(bays[0]!)
    .cut(bays[1]!)
    .cut(bays[2]!)
    .cut(bays[3]!)
    .cut(capCavity)
    .cut(underLedge);

  // Cylinder barrel tubes into the crankcase, then jackets and bores.
  const fuses: Shape3D[] = [];
  for (let cyl = 1; cyl <= 8; cyl++) {
    const bank = cyl <= 4 ? 'R' : 'L';
    const u = bankU(bank);
    const start = bankPoint(bank, boreX(cyl), 0, 80);
    fuses.push(makeCylinder(60, 70, start, u));
  }
  for (const solid of fuses) {
    block = block.fuse(solid);
  }
  const cuts: Shape3D[] = [];
  // Water jackets: annular cores around each barrel (overlapping per bank).
  for (let cyl = 1; cyl <= 8; cyl++) {
    const bank = cyl <= 4 ? 'R' : 'L';
    const s0 = bp.jacketSBottom;
    const s1 = bp.jacketSTop;
    const x = boreX(cyl);
    const profile = draw([s0, bp.jacketInnerR])
      .lineTo([s1, bp.jacketInnerR])
      .lineTo([s1, bp.jacketOuterR])
      .lineTo([s0, bp.jacketOuterR])
      .close()
      .sketchOnPlane('XZ')
      .revolve([1, 0, 0]);
    const placed = (
      bank === 'R'
        ? Placement.rotate('y', -90).rotate('x', -45)
        : Placement.rotate('y', -90).rotate('x', 45)
    )
      .translate(x, 0, 0)
      .shape(profile);
    cuts.push(placed);
  }
  // Cylinder bores Ø94 through deck to crankcase.
  for (let cyl = 1; cyl <= 8; cyl++) {
    const bank = cyl <= 4 ? 'R' : 'L';
    cuts.push(
      makeCylinder(47, 165, bankPoint(bank, boreX(cyl), 0, 68), bankU(bank)),
    );
  }
  // Crank tunnel Ø68 (saddles) full length + stepped cam tunnel lands Ø55.
  cuts.push(
    makeCylinder(capGeo.saddleR, blockLength + 60, [-30, 0, 0], [1, 0, 0]),
  );
  let camTool = draw([-31, 28.5])
    .lineTo([-31, 0.01])
    .lineTo([517, 0.01])
    .lineTo([517, 27.5]);
  camTool = camTool
    .lineTo([bulkheadBand(5)[0] - 1, 27.5])
    .lineTo([bulkheadBand(5)[0] - 1, 28.5]);
  for (let main = 4; main >= 1; main--) {
    const [b0, b1] = bulkheadBand(main);
    camTool = camTool
      .lineTo([b1 + 1, 28.5])
      .lineTo([b1 + 1, 27.5])
      .lineTo([b0 - 1, 27.5])
      .lineTo([b0 - 1, 28.5]);
  }
  cuts.push(
    camTool
      .close()
      .sketchOnPlane('XZ')
      .revolve([1, 0, 0])
      .translate([0, 0, camAxisZ]) as Shape3D,
  );
  // Rear crank exit bore.
  cuts.push(makeCylinder(rearBoreR, 32, [488, 0, 0], [1, 0, 0]));
  // Saddle tang notches (upper shells): r4 grooves at +y of each saddle.
  for (const x of mainX) {
    cuts.push(
      makeCylinder(
        capGeo.notchR,
        6,
        [x + capGeo.notchXOffset.upper - 3, capGeo.notchY, 0],
        [1, 0, 0],
      ),
    );
  }
  // Main cap bolt taps M12 up into the bulkheads.
  for (const x of mainX) {
    for (const side of [-1, 1] as const) {
      cuts.push(
        makeCylinder(
          tapHoleDia(12) / 2,
          41,
          [x, side * capGeo.boltY, -0.5],
          [0, 0, 1],
        ),
      );
    }
  }
  // Lifter bores Ø22.04 along the bank axes at the lobe stations.
  const lifterBoreProbes: Vec3[] = [];
  for (let cyl = 1; cyl <= 8; cyl++) {
    const bank = cyl <= 4 ? 'R' : 'L';
    const u = bankU(bank);
    for (const slot of ['Intake', 'Exhaust'] as const) {
      const x = lobeX(cyl, slot);
      const axisPoint = bankPoint(bank, x, lifterAxisA, camCenterS);
      cuts.push(
        makeCylinder(
          lifter.boreDia / 2,
          82,
          [axisPoint[0], axisPoint[1] + u[1] * 18, axisPoint[2] + u[2] * 18],
          u,
        ),
      );
      const mid: Vec3 = [
        axisPoint[0],
        axisPoint[1] + u[1] * 62,
        axisPoint[2] + u[2] * 62,
      ];
      lifterBoreProbes.push([
        mid[0],
        mid[1] - u[2] * (lifter.boreDia / 2) * (bank === 'R' ? 1 : -1),
        mid[2] + u[1] * (lifter.boreDia / 2) * (bank === 'R' ? 1 : -1),
      ]);
    }
  }
  // Main oil gallery Ø16 through the bulkheads at (0, 60), plugged rear M16.
  cuts.push(
    makeCylinder(
      bp.galleryDia / 2,
      rearFaceX + 2,
      [-1, 0, bp.galleryZ],
      [1, 0, 0],
    ),
  );
  cuts.push(
    makeCylinder(
      tapHoleDia(16) / 2,
      13,
      [rearFaceX + 0.01, 0, bp.galleryZ],
      [-1, 0, 0],
    ),
  );
  // Lifter galleries Ø11 along X on the lifter-axis lines, M12 taps x4.
  const lifterGalleryYZ = (bank: 'R' | 'L'): [number, number] => {
    const p = bankPoint(bank, 0, lifterAxisA, camCenterS + 45);
    return [p[1], p[2]];
  };
  for (const bank of ['R', 'L'] as const) {
    const [gy, gz] = lifterGalleryYZ(bank);
    cuts.push(
      makeCylinder(
        bp.lifterGalleryDia / 2,
        rearFaceX + 2,
        [-1, gy, gz],
        [1, 0, 0],
      ),
    );
    cuts.push(makeCylinder(tapHoleDia(12) / 2, 11, [-0.01, gy, gz], [1, 0, 0]));
    cuts.push(
      makeCylinder(
        tapHoleDia(12) / 2,
        11,
        [rearFaceX + 0.01, gy, gz],
        [-1, 0, 0],
      ),
    );
  }
  // 5 saddle feeds Ø8 (vertical, gallery to tunnel) + 5 cam feeds Ø6 up.
  for (const x of mainX) {
    cuts.push(makeCylinder(bp.saddleFeedDia / 2, 42, [x, 0, 26], [0, 0, 1]));
    cuts.push(makeCylinder(bp.camFeedDia / 2, 40, [x, 0, 58], [0, 0, 1]));
  }
  // 2 risers Ø8, x-dominant diagonals from the gallery to each lifter gallery.
  for (const bank of ['R', 'L'] as const) {
    const [gy, gz] = lifterGalleryYZ(bank);
    const from: Vec3 = [460, 0, bp.galleryZ];
    const to: Vec3 = [340, gy, gz];
    const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const length = Math.hypot(d[0], d[1], d[2]);
    cuts.push(
      makeCylinder(
        bp.riserDia / 2,
        length + 20,
        [
          from[0] + (d[0] / length) * 10,
          from[1] + (d[1] / length) * 10,
          from[2] + (d[2] / length) * 10,
        ],
        [d[0] / length, d[1] / length, d[2] / length],
      ),
    );
  }
  // 4 valley drain-backs Ø16 (vertical through the vee mass at mid-bays).
  const valleyDrainX = [90, 201, 312, 423];
  for (const x of valleyDrainX) {
    cuts.push(makeCylinder(bp.valleyDrainDia / 2, 60, [x, 40, 120], [0, 0, 1]));
  }
  // 6 bay-breathing windows Ø28 through bulkheads 2..4.
  for (const main of [2, 3, 4]) {
    for (const side of [-1, 1] as const) {
      cuts.push(
        makeCylinder(
          14,
          30,
          [bulkheadBand(main)[0] - 2, side * 30, 45],
          [1, 0, 0],
        ),
      );
    }
  }
  // Deck features per bank: transfers, drains, head-bolt taps, dowels,
  // pushrod reliefs.
  const deckS = deckHeight;
  const boltTapProbes: Record<'R' | 'L', Vec3[]> = { R: [], L: [] };
  const coolProbes: Record<
    'R' | 'L',
    { c10: Vec3[]; c14: Vec3[]; drain: Vec3[] }
  > = {
    R: { c10: [], c14: [], drain: [] },
    L: { c10: [], c14: [], drain: [] },
  };
  const dowelProbes: Vec3[] = [];
  for (const bank of ['R', 'L'] as const) {
    const u = bankU(bank);
    const tDir = transferDirWorld(bank);
    for (const [index, x] of coolant10X(bank).entries()) {
      void index;
      const p = bankPoint(bank, x, 44, deckS + 1);
      cuts.push(makeCylinder(5, 42, p, [-tDir[0], -tDir[1], -tDir[2]]));
      const q = bankPoint(bank, x, 44, deckS - 4);
      coolProbes[bank].c10.push([q[0] + 5, q[1], q[2]]);
    }
    for (const x of coolant14X(bank)) {
      const p = bankPoint(bank, x, 16, deckS + 1);
      cuts.push(makeCylinder(7, 42, p, [-tDir[0], -tDir[1], -tDir[2]]));
      const q = bankPoint(bank, x, 16, deckS - 4);
      coolProbes[bank].c14.push([q[0] + 7, q[1], q[2]]);
    }
    for (const x of deckDrainX(bank)) {
      const p = bankPoint(bank, x, -44, deckS + 1);
      cuts.push(makeCylinder(8, 160, p, [-u[0], -u[1], -u[2]]));
      const q = bankPoint(bank, x, -44, deckS - 20);
      coolProbes[bank].drain.push([q[0] + 8, q[1], q[2]]);
    }
    for (const { x, a } of headBoltMap(bank)) {
      const p = bankPoint(bank, x, a, deckS + 0.5);
      cuts.push(makeCylinder(tapHoleDia(11) / 2, 28, p, [-u[0], -u[1], -u[2]]));
      const q = bankPoint(bank, x, a, deckS - 12);
      boltTapProbes[bank].push([q[0] + tapHoleDia(11) / 2, q[1], q[2]]);
    }
    for (const { x, a } of headDowelMap(bank)) {
      const p = bankPoint(bank, x, a, deckS + 0.5);
      cuts.push(
        makeCylinder((12 - 2 * press.dowel) / 2, 13, p, [-u[0], -u[1], -u[2]]),
      );
      const q = bankPoint(bank, x, a, deckS - 6);
      dowelProbes.push([q[0] + (12 - 2 * press.dowel) / 2, q[1], q[2]]);
    }
    // Pushrod clearance reliefs Ø22 along the pushrod lines.
    for (const cyl of bank === 'R' ? [1, 2, 3, 4] : [5, 6, 7, 8]) {
      for (const slot of ['Intake', 'Exhaust'] as const) {
        const line = pushrodLine(slot, 0);
        const bx = boreX(cyl);
        // Head-local (y=a, z up-deck) -> bank coords -> world.
        const p0 = bankPoint(bank, bx + line.p0[0], line.p0[1], deckS + 1.15);
        const dLocal = line.dir;
        const dWorld: Vec3 =
          bank === 'R'
            ? [
                dLocal[0],
                c * (dLocal[2] + dLocal[1]),
                c * (dLocal[2] - dLocal[1]),
              ]
            : [
                dLocal[0],
                -c * (dLocal[2] + dLocal[1]),
                c * (dLocal[2] - dLocal[1]),
              ];
        cuts.push(
          makeCylinder(
            11,
            16,
            [
              p0[0] + dWorld[0] * 2,
              p0[1] + dWorld[1] * 2,
              p0[2] + dWorld[2] * 2,
            ],
            [-dWorld[0], -dWorld[1], -dWorld[2]],
          ),
        );
      }
    }
  }
  // Core plug bores Ø36 (a-direction drills into the jackets, 4 per bank).
  const corePlugProbes: Vec3[] = [];
  for (const bank of ['R', 'L'] as const) {
    for (const x of bank === 'R' ? boreXR : boreXR.map((v) => v + 21.8)) {
      const entry = bankPoint(bank, x, 80, 150);
      const v: Vec3 = bank === 'R' ? [0, c, -c] : [0, -c, -c];
      cuts.push(
        makeCylinder((36 - 2 * press.corePlug) / 2, 26, entry, [
          -v[0],
          -v[1],
          -v[2],
        ]),
      );
      const q = bankPoint(bank, x, 68, 150);
      corePlugProbes.push([q[0] + (36 - 2 * press.corePlug) / 2, q[1], q[2]]);
    }
  }
  // Pan rail taps 16x M6 up into the rails.
  const railTapPts: Vec3[] = [];
  for (const side of [-1, 1] as const) {
    for (const x of [50, 115, 180, 245, 310, 375, 440, 478]) {
      cuts.push(
        makeCylinder(tapHoleDia(6) / 2, 13, [x, side * 94, -38.01], [0, 0, 1]),
      );
      railTapPts.push([x, side * 94, -30]);
    }
  }
  // Front cover taps 10x M6 into the front face.
  const frontTapPts: Array<[number, number]> = [
    [-94, -29],
    [94, -29],
    [-106, 30],
    [106, 30],
    [-106, 85],
    [106, 85],
    [-106, 140],
    [106, 140],
    [-106, 185],
    [106, 185],
  ];
  for (const [y, z] of frontTapPts) {
    cuts.push(makeCylinder(tapHoleDia(6) / 2, 13, [-0.01, y, z], [1, 0, 0]));
  }
  // Rear housing taps 6x M6 around the rear bore (BC 120).
  const rearTapPts: Array<[number, number]> = Array.from(
    { length: 6 },
    (_, index) => {
      const t = (index * 60 * Math.PI) / 180;
      return [60 * Math.cos(t), 60 * Math.sin(t)];
    },
  );
  for (const [y, z] of rearTapPts) {
    cuts.push(
      makeCylinder(tapHoleDia(6) / 2, 13, [rearFaceX + 0.01, y, z], [-1, 0, 0]),
    );
  }
  // Water pump: pad outline groove + 4x M8 taps + 2x Ø30 jacket inlets.
  const inletYZ: Array<[number, number]> = [
    [145.7, 66.5],
    [-145.7, 66.5],
  ];
  for (const [y, z] of inletYZ) {
    cuts.push(makeCylinder(15, 62, [-0.01, y, z], [1, 0, 0]));
  }
  const pumpTapPts: Array<[number, number]> = [
    [-126, 55],
    [-165.4, 90],
    [126, 55],
    [165.4, 90],
  ];
  for (const [y, z] of pumpTapPts) {
    cuts.push(makeCylinder(tapHoleDia(8) / 2, 17, [-0.01, y, z], [1, 0, 0]));
  }
  // Pad outline groove (4.2 wide, 1.5 deep) separating the pump pad face.
  for (const side of [-1, 1] as const) {
    const cy = side * 145.7;
    const outer = draw([cy - 30.2, 46])
      .lineTo([cy + 30.2, 46])
      .lineTo([cy + 30.2, 101.2])
      .lineTo([cy - 30.2, 101.2])
      .close();
    const inner = draw([cy - 26, 50.2])
      .lineTo([cy + 26, 50.2])
      .lineTo([cy + 26, 97])
      .lineTo([cy - 26, 97])
      .close();
    cuts.push(
      outer
        .cut(inner)
        .sketchOnPlane('YZ')
        .extrude(1.5)
        .translate([-0.01, 0, 0]) as Shape3D,
    );
  }
  // Cam thrust plate seat groove + 2x M6 taps beside the cam nose.
  const camPlateGroove = ((): Shape3D => {
    const outer = draw([-40, camAxisZ - 40])
      .lineTo([40, camAxisZ - 40])
      .lineTo([40, camAxisZ + 40])
      .lineTo([-40, camAxisZ + 40])
      .close();
    const inner = draw([-35.8, camAxisZ - 35.8])
      .lineTo([35.8, camAxisZ - 35.8])
      .lineTo([35.8, camAxisZ + 35.8])
      .lineTo([-35.8, camAxisZ + 35.8])
      .close();
    return outer
      .cut(inner)
      .sketchOnPlane('YZ')
      .extrude(1.5)
      .translate([-0.01, 0, 0]) as Shape3D;
  })();
  cuts.push(camPlateGroove);
  for (const side of [-1, 1] as const) {
    cuts.push(
      makeCylinder(
        tapHoleDia(6) / 2,
        13,
        [-0.01, side * 30, camAxisZ + 20],
        [1, 0, 0],
      ),
    );
  }
  // Motor mount taps 3x M10 per pad.
  for (const side of [-1, 1] as const) {
    for (const dx of [-30, 0, 30]) {
      cuts.push(
        makeCylinder(
          tapHoleDia(10) / 2,
          12,
          [257.4 + dx, side * 106.01, -21],
          [0, -side, 0],
        ),
      );
    }
  }
  // Knock sensor taps M8 in the valley walls; oil pressure tap M10 rear;
  // dipstick boss bore; bellhousing taps M10 BC330 + dowel bores.
  for (const [bank, x] of [
    ['R', 135.5],
    ['L', 268.3],
  ] as const) {
    const p = bankPoint(bank, x as number, -valleyWallA - 1, 195);
    const v: Vec3 = bank === 'R' ? [0, -c, -c] : [0, c, -c];
    void v;
    const inward: Vec3 = bank === 'R' ? [0, c, -c] : [0, -c, -c];
    cuts.push(makeCylinder(tapHoleDia(8) / 2, 17, p, inward));
  }
  cuts.push(
    makeCylinder(
      tapHoleDia(10) / 2,
      11,
      [rearFaceX + 0.01, 16, bp.galleryZ],
      [-1, 0, 0],
    ),
  );
  cuts.push(
    makeCylinder(
      (8 - 2 * press.dipstickTube) / 2,
      26,
      [330, 94, -38.01],
      [0, 0, 1],
    ),
  );
  const bellTapPts: Array<[number, number]> = Array.from(
    { length: 6 },
    (_, index) => {
      const t = ((index * 60 + 30) * Math.PI) / 180;
      return [165 * Math.cos(t), 165 * Math.sin(t)];
    },
  );
  for (const [y, z] of bellTapPts) {
    cuts.push(
      makeCylinder(
        tapHoleDia(10) / 2,
        19,
        [rearFaceX + 0.01, y, z],
        [-1, 0, 0],
      ),
    );
  }
  for (const side of [-1, 1] as const) {
    cuts.push(
      makeCylinder(
        (12 - 2 * press.dowel) / 2,
        13,
        [rearFaceX + 0.01, side * 165, 0],
        [-1, 0, 0],
      ),
    );
  }
  block = block.cutAll(cuts);
  // Sensor boss fused after the bulk cuts (the cam tunnel tool must not
  // gut it), then its bore drilled.
  block = block
    .fuse(boss)
    .cut(
      makeCylinder(
        sensorBore.r,
        110,
        [sensorBore.x, 0, sensorBoss.zTop + 0.01],
        [0, 0, -1],
      ),
    );
  const shape = place.shape(block);

  const deckProbe = (bank: 'R' | 'L'): Vec3 =>
    bankPoint(bank, bank === 'R' ? 57 : 79, 62, deckHeight);
  const interfaces: InterfaceDeclarations = {
    bellDowelBore: axisGroupNear(
      place,
      [-1, 1].map(
        (side) =>
          [rearFaceX - 6, side * 165 + (12 - 2 * press.dowel) / 2, 0] as Vec3,
      ),
      'CYLINDRE',
      0.12,
    ),
    camPlateSeat: faceNear(place, [0, 32, camAxisZ], 'PLANE', 0.1),
    camTunnel: axisGroupNear(
      place,
      mainX.map((x) => [x, 10, camAxisZ - Math.sqrt(27.5 ** 2 - 100)] as Vec3),
      'CYLINDRE',
      0.12,
    ),
    capLedge: groupNear(
      place,
      mainX.map((x) => [x, capGeo.halfW - press.capRegister, -12] as Vec3),
      'PLANE',
      0.12,
    ),
    coolant10R: axisGroupNear(place, coolProbes.R.c10, 'CYLINDRE', 0.12),
    coolant10L: axisGroupNear(place, coolProbes.L.c10, 'CYLINDRE', 0.12),
    coolant14R: axisGroupNear(place, coolProbes.R.c14, 'CYLINDRE', 0.12),
    coolant14L: axisGroupNear(place, coolProbes.L.c14, 'CYLINDRE', 0.12),
    corePlugBore: axisGroupNear(place, corePlugProbes, 'CYLINDRE', 0.12),
    crankSensorBoss: axisNear(
      place,
      [sensorBore.x - sensorBore.r, 0, 120],
      'CYLINDRE',
      0.12,
    ),
    cylBore: axisGroupNear(
      place,
      Array.from({ length: 8 }, (_, index) => {
        const cyl = index + 1;
        const bank = cyl <= 4 ? 'R' : 'L';
        const p = bankPoint(bank, boreX(cyl), 0, 180);
        return [p[0] + 47, p[1], p[2]] as Vec3;
      }),
      'CYLINDRE',
      0.12,
    ),
    deckR: faceNear(place, deckProbe('R'), 'PLANE', 0.1),
    deckL: faceNear(place, deckProbe('L'), 'PLANE', 0.1),
    deckDrainR: axisGroupNear(place, coolProbes.R.drain, 'CYLINDRE', 0.12),
    deckDrainL: axisGroupNear(place, coolProbes.L.drain, 'CYLINDRE', 0.12),
    dipstickBoss: axisNear(
      place,
      [330 + (8 - 2 * press.dipstickTube) / 2, 94, -20],
      'CYLINDRE',
      0.1,
    ),
    frontCoverTap: axisGroupNear(
      place,
      frontTapPts.map(([y, z]) => [6, y + tapHoleDia(6) / 2, z] as Vec3),
      'CYLINDRE',
      0.1,
    ),
    frontFace: faceNear(place, [0, -80, 60], 'PLANE', 0.1),
    galleryPlugTap: axisGroupNear(
      place,
      [
        [rearFaceX - 6, tapHoleDia(16) / 2, bp.galleryZ] as Vec3,
        ...(['R', 'L'] as const).flatMap((bank) => {
          const [gy, gz] = lifterGalleryYZ(bank);
          return [
            [5, gy + tapHoleDia(12) / 2, gz] as Vec3,
            [rearFaceX - 5, gy + tapHoleDia(12) / 2, gz] as Vec3,
          ];
        }),
      ],
      'CYLINDRE',
      0.1,
    ),
    headBoltTapR: axisGroupNear(place, boltTapProbes.R, 'CYLINDRE', 0.12),
    headBoltTapL: axisGroupNear(place, boltTapProbes.L, 'CYLINDRE', 0.12),
    headDowelBore: axisGroupNear(place, dowelProbes, 'CYLINDRE', 0.12),
    jacketInlet: axisGroupNear(
      place,
      inletYZ.map(([y, z]) => [10, y, z + 15] as Vec3),
      'CYLINDRE',
      0.12,
    ),
    knockTap: axisGroupNear(
      place,
      (
        [
          ['R', 135.5],
          ['L', 268.3],
        ] as const
      ).map(([bank, x]) => {
        const p = bankPoint(bank, x as number, -valleyWallA + 8, 195);
        return [p[0] + tapHoleDia(8) / 2, p[1], p[2]] as Vec3;
      }),
      'CYLINDRE',
      0.15,
    ),
    lifterBore: axisGroupNear(place, lifterBoreProbes, 'CYLINDRE', 0.12),
    mainCapTap: axisGroupNear(
      place,
      mainX.flatMap((x) => [
        [x, -capGeo.boltY + tapHoleDia(12) / 2, 12] as Vec3,
        [x, capGeo.boltY - tapHoleDia(12) / 2, 12] as Vec3,
      ]),
      'CYLINDRE',
      0.12,
    ),
    oilPressureTap: axisNear(
      place,
      [rearFaceX - 5, 16 + tapHoleDia(10) / 2, bp.galleryZ],
      'CYLINDRE',
      0.1,
    ),
    panRail: faceNear(place, [30, 94.5, -38], 'PLANE', 0.1),
    panRailTap: axisGroupNear(
      place,
      railTapPts.map((p) => [p[0] + tapHoleDia(6) / 2, p[1], p[2]] as Vec3),
      'CYLINDRE',
      0.1,
    ),
    rearFace: faceNear(place, [rearFaceX, 100, -100], 'PLANE', 0.1),
    rearHousingTap: axisGroupNear(
      place,
      rearTapPts.map(
        ([y, z]) => [rearFaceX - 5, y + tapHoleDia(6) / 2, z] as Vec3,
      ),
      'CYLINDRE',
      0.1,
    ),
    saddle: axisGroupNear(
      place,
      mainX.map((x) => [x, 12, Math.sqrt(capGeo.saddleR ** 2 - 144)] as Vec3),
      'CYLINDRE',
      0.12,
    ),
    saddleFeed: axisGroupNear(
      place,
      mainX.map((x) => [x, bp.saddleFeedDia / 2, 45] as Vec3),
      'CYLINDRE',
      0.1,
    ),
    saddleJoint: groupNear(
      place,
      mainX.map((x) => [x, 56, 0] as Vec3),
      'PLANE',
      0.1,
    ),
    saddleNotch: axisGroupNear(
      place,
      mainX.map(
        (x) =>
          [x + capGeo.notchXOffset.upper, capGeo.notchY, capGeo.notchR] as Vec3,
      ),
      'CYLINDRE',
      0.15,
    ),
    thrustPlateTap: axisGroupNear(
      place,
      [-1, 1].map(
        (side) => [5, side * 30 + tapHoleDia(6) / 2, camAxisZ + 20] as Vec3,
      ),
      'CYLINDRE',
      0.1,
    ),
    waterPumpPad: faceNear(place, [0, 167.7, 66.5], 'PLANE', 0.1),
    waterPumpTap: axisGroupNear(
      place,
      pumpTapPts.map(([y, z]) => [8, y + tapHoleDia(8) / 2, z] as Vec3),
      'CYLINDRE',
      0.1,
    ),
  };
  return { shape, interfaces };
};
