/**
 * Crankshaft (spec 3.2): revolved journal stack + extruded cheek profiles
 * with counterweights, snout/flange dressing, 8x Ø5 oiling drillings.
 *
 * Local frame: mains axis = +X, P1 throw along +Z (install rotates -45
 * about X). Stations use the assembly mainX/crankpinX values directly.
 */
import { draw, drawCircle, makeCylinder } from 'replicad';
import type { Shape3D } from 'replicad';
import type { InterfaceDeclarations } from '@taucad/replicad/annotations';
import {
  axisGroupNear,
  axisNear,
  datumAt,
  faceNear,
  groupNear,
} from './annotate.js';
import { Placement } from './frame.js';
import type { Vec3 } from './frame.js';
import {
  crank as cp,
  crankOilMap,
  crankpinPhase,
  crankpinX,
  mainX,
  tapHoleDia,
  throw_,
} from './params.js';
import type { BuiltPart } from './piston-group.js';

const mainR = cp.mainDia / 2;
const pinR = cp.pinDia / 2;
const phaseDir = (pin: number): [number, number] => {
  const r = (crankpinPhase[pin - 1]! * Math.PI) / 180;
  return [Math.sin(r), Math.cos(r)];
};

/** Journal x-bands. */
const mainBand = (main: number): [number, number] => {
  const half = main === 3 ? cp.thrustWidth / 2 : cp.mainWidth / 2;
  return [mainX[main - 1]! - half, mainX[main - 1]! + half];
};
const pinBand = (pin: number): [number, number] => [
  crankpinX[pin - 1]! - cp.pinLen / 2,
  crankpinX[pin - 1]! + cp.pinLen / 2,
];

/** Cheek x-bands; the two cheeks flanking thrust main #3 stop at its faces. */
const cheekBands = (
  pin: number,
): { front: [number, number]; rear: [number, number] } => {
  const [pinStart, pinEnd] = pinBand(pin);
  const front: [number, number] =
    pin === 3 ? [mainBand(3)[1], pinStart] : [pinStart - cp.cheekT, pinStart];
  const rear: [number, number] =
    pin === 2 ? [pinEnd, mainBand(3)[0]] : [pinEnd, pinEnd + cp.cheekT];
  return { front, rear };
};

/** Counterweighted cheeks: pins 1 and 4 both, pin 2 front, pin 3 rear. */
const counterweighted = new Set(['1f', '1r', '2f', '3r', '4f', '4r']);

const cheekSolid = (pin: number, side: 'f' | 'r'): Shape3D => {
  const [dy, dz] = phaseDir(pin);
  const pinCenter2d: [number, number] = [throw_ * dy, throw_ * dz];
  let profile = drawCircle(40).fuse(
    drawCircle(35).translate(pinCenter2d[0], pinCenter2d[1]),
  );
  if (counterweighted.has(`${pin}${side}`)) {
    const opp = Math.atan2(-dy, -dz);
    const a1 = opp - (65 * Math.PI) / 180;
    const a2 = opp + (65 * Math.PI) / 180;
    const r = cp.counterweightR;
    const sector = draw([0, 0])
      .lineTo([r * Math.sin(a1), r * Math.cos(a1)])
      .threePointsArcTo(
        [r * Math.sin(a2), r * Math.cos(a2)],
        [r * Math.sin(opp), r * Math.cos(opp)],
      )
      .close()
      .fillet(cp.fillet);
    profile = profile.fuse(sector);
  }
  const band = cheekBands(pin)[side === 'f' ? 'front' : 'rear'];
  return profile
    .sketchOnPlane('YZ')
    .extrude(band[1] - band[0])
    .translate([band[0], 0, 0]) as Shape3D;
};

export const buildCrankshaft = (place: Placement): BuiltPart => {
  // Front dressing (snout, gear seat, neck into M1) as one revolved profile.
  const front = draw([cp.frontX, 0])
    .lineTo([cp.frontX, cp.snoutDia / 2])
    .lineTo([-36, cp.snoutDia / 2])
    .lineTo([-36, cp.gearSeatDia / 2])
    .lineTo([-18, cp.gearSeatDia / 2])
    .lineTo([-18, cp.snoutDia / 2])
    .lineTo([-4, cp.snoutDia / 2])
    .lineTo([-4, 23])
    .lineTo([mainBand(1)[0] + 1, 23])
    .lineTo([mainBand(1)[0] + 1, 0])
    .close()
    .sketchOnPlane('XZ')
    .revolve([1, 0, 0]);
  // Rear dressing (resequenced to the housing/flywheel stack): Ø73 neck
  // through the block rear bore and housing web, Ø90 seal journal under the
  // seal lip (world 520.7-523.7), Ø98 reluctor seat, Ø120 flange with its
  // rear face at 554 (flywheel joint), Ø70 spigot to rearX = 562.
  const rear = draw([mainBand(5)[1] - 1, 0])
    .lineTo([mainBand(5)[1] - 1, 36.5])
    .lineTo([519.8, 36.5])
    .lineTo([519.8, cp.rearSealDia / 2])
    .lineTo([529, cp.rearSealDia / 2])
    .lineTo([529, cp.reluctorSeatDia / 2])
    .lineTo([540, cp.reluctorSeatDia / 2])
    .lineTo([540, cp.flangeDia / 2])
    .lineTo([554, cp.flangeDia / 2])
    .lineTo([554, cp.spigotDia / 2])
    .lineTo([cp.rearX, cp.spigotDia / 2])
    .lineTo([cp.rearX, 0])
    .close()
    .sketchOnPlane('XZ')
    .revolve([1, 0, 0]);
  // Main journals Ø64 at their bands.
  const mains: Shape3D[] = [1, 2, 3, 4, 5].map((main) => {
    const [start, end] = mainBand(main);
    return makeCylinder(mainR, end - start, [start, 0, 0], [1, 0, 0]);
  });
  const revolved = front.fuse(rear);

  // Crankpins.
  const pins: Shape3D[] = [1, 2, 3, 4].map((pin) => {
    const [dy, dz] = phaseDir(pin);
    const [start] = pinBand(pin);
    return makeCylinder(
      pinR,
      cp.pinLen,
      [start, throw_ * dy, throw_ * dz],
      [1, 0, 0],
    );
  });
  // Cheeks.
  const cheeks: Shape3D[] = [];
  for (const pin of [1, 2, 3, 4]) {
    cheeks.push(cheekSolid(pin, 'f'), cheekSolid(pin, 'r'));
  }

  let crank = revolved;
  for (const solid of [...mains, ...pins, ...cheeks]) {
    crank = crank.fuse(solid);
  }

  // Snout flats (oil pump drive, 34 A/F) on the Ø38 band [-14, -2].
  const flatBox = (side: 1 | -1): Shape3D => {
    const box = draw([-17, cp.flatsAf / 2])
      .lineTo([-4, cp.flatsAf / 2])
      .lineTo([-4, 40])
      .lineTo([-17, 40])
      .close()
      .sketchOnPlane('XY')
      .extrude(60)
      .translate([0, 0, -30]) as Shape3D;
    return side === 1 ? box : box.mirror('XZ');
  };
  crank = crank.cut(flatBox(1)).cut(flatBox(-1));

  // Keyway: end-milled capsule slot, width 10, floor r14, on the +Z side.
  const kw = cp.keyway;
  const capsule = drawCircle(kw.w / 2)
    .translate(kw.frontX + kw.w / 2, 0)
    .fuse(drawCircle(kw.w / 2).translate(kw.frontX + kw.len - kw.w / 2, 0))
    .fuse(
      draw([kw.frontX + kw.w / 2, -kw.w / 2])
        .lineTo([kw.frontX + kw.len - kw.w / 2, -kw.w / 2])
        .lineTo([kw.frontX + kw.len - kw.w / 2, kw.w / 2])
        .lineTo([kw.frontX + kw.w / 2, kw.w / 2])
        .close(),
    );
  const keywayCut = capsule.sketchOnPlane('XY', 14).extrude(10);
  crank = crank.cut(keywayCut);

  // Damper bolt tap M16x2.0 x 30 into the snout tip.
  crank = crank.cut(
    makeCylinder(
      tapHoleDia(16) / 2,
      cp.snoutThreadDepth,
      [cp.frontX - 0.01, 0, 0],
      [1, 0, 0],
    ),
  );
  // Pilot bore Ø20 x 25 into the rear spigot face.
  crank = crank.cut(
    makeCylinder(
      cp.pilotBoreDia / 2,
      cp.pilotBoreDepth,
      [cp.rearX + 0.01, 0, 0],
      [-1, 0, 0],
    ),
  );
  // 8x M10x1.0 flange taps on Ø100 BC, depth 16 from the flange rear face.
  const flangeTaps: Shape3D[] = [];
  const flangeTapProbes: Vec3[] = [];
  for (let index = 0; index < 8; index++) {
    const theta = (index * 45 * Math.PI) / 180;
    const y = 50 * Math.sin(theta);
    const z = 50 * Math.cos(theta);
    flangeTaps.push(
      makeCylinder(tapHoleDia(10) / 2, 16, [554.01, y, z], [-1, 0, 0]),
    );
    const inward = 50 - tapHoleDia(10) / 2;
    flangeTapProbes.push([
      547,
      inward * Math.sin(theta),
      inward * Math.cos(theta),
    ]);
  }
  crank = crank.cutAll(flangeTaps);

  // 8x Ø5 main-to-pin oil drillings (REQ-012/013 canon lanes).
  const drills: Shape3D[] = [];
  for (const { main, pin } of crankOilMap) {
    const [dy, dz] = phaseDir(pin);
    const mx = mainX[main - 1]!;
    const px = crankpinX[pin - 1]!;
    const exitX = px + (mx > px ? 10 : -10);
    const start: Vec3 = [mx, 38 * dy, 38 * dz];
    const end: Vec3 = [exitX, 14 * dy, 14 * dz];
    const dir: Vec3 = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
    const length = Math.hypot(dir[0], dir[1], dir[2]);
    drills.push(
      makeCylinder(cp.oilDrillDia / 2, length, start, [
        dir[0] / length,
        dir[1] / length,
        dir[2] / length,
      ]),
    );
  }
  crank = crank.cutAll(drills);

  const shape = place.shape(crank);

  const mainProbeDir: Record<number, [number, number]> = {
    1: [0, -1],
    2: [-1, 0],
    3: [0, 1],
    4: [0, 1],
    5: [0, 1],
  };
  const perp = (d: [number, number]): [number, number] => [d[1], -d[0]];
  const interfaces: InterfaceDeclarations = {
    centerline: datumAt(place, [0, 0, 0], [0, 0, 1], [1, 0, 0]),
    crankpin: axisGroupNear(
      place,
      [1, 2, 3, 4].map((pin) => {
        const [dy, dz] = phaseDir(pin);
        return [
          crankpinX[pin - 1]!,
          (throw_ - pinR) * dy,
          (throw_ - pinR) * dz,
        ] as Vec3;
      }),
      'CYLINDRE',
      0.15,
    ),
    flangeTap: axisGroupNear(place, flangeTapProbes, 'CYLINDRE', 0.1),
    keyway: faceNear(place, [kw.frontX, 0, 16.5], 'CYLINDRE', 0.15),
    mainJournal: axisGroupNear(
      place,
      [1, 2, 3, 4, 5].map((main) => {
        const [py, pz] = mainProbeDir[main]!;
        return [mainX[main - 1]!, mainR * py, mainR * pz] as Vec3;
      }),
      'CYLINDRE',
      0.15,
    ),
    pilotBore: axisNear(
      place,
      [cp.rearX - 12, 0, cp.pilotBoreDia / 2],
      'CYLINDRE',
      0.15,
    ),
    pinCheeks: groupNear(
      place,
      [1, 2, 3, 4].map((pin) => {
        const [dy, dz] = phaseDir(pin);
        const [py, pz] = perp([dy, dz]);
        const x = pinBand(pin)[0];
        return [x, throw_ * dy + 29 * py, throw_ * dz + 29 * pz] as Vec3;
      }),
      'PLANE',
      0.12,
    ),
    rearSealJournal: axisNear(
      place,
      [524, 0, -cp.rearSealDia / 2],
      'CYLINDRE',
      0.15,
    ),
    reluctorSeat: axisNear(
      place,
      [534.5, 0, -cp.reluctorSeatDia / 2],
      'CYLINDRE',
      0.15,
    ),
    snout: axisNear(place, [-45, 0, -cp.snoutDia / 2], 'CYLINDRE', 0.15),
    snoutFlats: faceNear(place, [-10, cp.flatsAf / 2, 0], 'PLANE', 0.12),
    snoutShoulder: faceNear(place, [-36, 0, -21.5], 'PLANE', 0.12),
    snoutThread: axisNear(
      place,
      [-50, 0, -tapHoleDia(16) / 2],
      'CYLINDRE',
      0.12,
    ),
    spigot: axisNear(place, [558, 0, -cp.spigotDia / 2], 'CYLINDRE', 0.15),
    thrustFaces: faceNear(
      place,
      [mainBand(3)[0], 36 * phaseDir(2)[0], 36 * phaseDir(2)[1]],
      'PLANE',
      0.12,
    ),
  };
  return { shape, interfaces };
};

export { cheekBands, mainBand, pinBand, phaseDir };
export { Placement };
