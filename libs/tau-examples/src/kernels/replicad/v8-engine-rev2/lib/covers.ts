/**
 * Covers and systems (spec 3.10): front cover with gerotor pump housing and
 * filter adapter, rear seal housing, valve covers, oil pan, pickup, pump
 * rotors/cover, relief valve set, water pump set, thermostat set, seals,
 * flange gaskets, and small service hardware.
 *
 * Front cover local frame = world (it bolts on the block front at x=0-).
 */
import {
  draw,
  drawCircle,
  makeCylinder,
  Sketcher,
  sketchCircle,
  sketchHelix,
} from 'replicad';
import type { Shape3D, Sketch } from 'replicad';
import type { InterfaceDeclarations } from '@taucad/runtime/kernels/replicad/annotations';
import {
  axisGroupNear,
  axisNear,
  datumAt,
  faceNear,
  groupNear,
} from './annotate.js';
import { Placement } from './frame.js';
import type { Vec3 } from './frame.js';
import { fit, gasketT, press, tapHoleDia, threadBandDia } from './params.js';
import type { BuiltPart } from './piston-group.js';

/** Front cover plate geometry (shared with its gasket and bolts). */
export const frontCover = {
  /** Gasket face (block side) sits at x = -gasketT.frontCover. */
  backX: -gasketT.frontCover,
  plateT: 6,
  wallX: -40,
  outline: { yHalf: 112, zMin: -36, zMax: 205 },
  boltPts: [
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
  ] as Array<[number, number]>,
  pumpPocketR: fit.outerRotorDia / 2 + 0.05,
  pumpPocketDepth: 12.05,
  sealBoreR: 34,
  reliefY: 40,
  reliefZ: -52,
  filterZ: -30,
  filterY: -55,
} as const;

/**
 * Front cover: shelled plate over the timing set, gerotor pocket on the
 * crank axis, seal bore, relief bore + plug tap, filter adapter, cam
 * sensor boss, pickup pad, 10 bolt holes with spot faces.
 */
export const buildFrontCover = (place: Placement): BuiltPart => {
  const o = frontCover.outline;
  // Cover body: outline slab from backX to wallX (cavity shelled after).
  const body = draw([-o.yHalf, o.zMin])
    .lineTo([o.yHalf, o.zMin])
    .lineTo([o.yHalf, o.zMax])
    .lineTo([-o.yHalf, o.zMax])
    .close()
    .sketchOnPlane('YZ')
    .extrude(frontCover.wallX - frontCover.backX)
    .translate([frontCover.backX, 0, 0]) as Shape3D;
  // Timing cavity: inner void open to the block face.
  const cavity = draw([-o.yHalf + 12, o.zMin + 12])
    .lineTo([o.yHalf - 12, o.zMin + 12])
    .lineTo([o.yHalf - 12, o.zMax - 12])
    .lineTo([-o.yHalf + 12, o.zMax - 12])
    .close()
    .sketchOnPlane('YZ')
    .extrude(frontCover.wallX - frontCover.backX - frontCover.plateT)
    .translate([frontCover.backX, 0, 0]) as Shape3D;
  let cover = body.cut(cavity);
  // Gerotor pump boss: front wall to x = -4; pocket opens rearward.
  cover = cover.fuse(
    makeCylinder(
      44,
      -4 - frontCover.wallX,
      [frontCover.wallX, 0, 0],
      [1, 0, 0],
    ),
  );
  cover = cover.cut(
    makeCylinder(
      frontCover.pumpPocketR,
      frontCover.pumpPocketDepth,
      [-4.01 - frontCover.pumpPocketDepth + 0.01, 0, 0],
      [1, 0, 0],
    ).translate([frontCover.pumpPocketDepth * 0, 0, 0]),
  );
  // Front seal bore + snout clearance bore through the boss.
  cover = cover.cut(
    makeCylinder(
      frontCover.sealBoreR,
      8,
      [frontCover.wallX - 0.01, 0, 0],
      [1, 0, 0],
    ),
  );
  cover = cover.cut(
    makeCylinder(24, 40, [frontCover.wallX - 1, 0, 0], [1, 0, 0]),
  );
  // Oil pump cover taps 4x M6 on the boss face.
  const pumpCoverTapPts: Vec3[] = [45, 135, 225, 315].map((deg) => {
    const t = (deg * Math.PI) / 180;
    return [-4, 40 * Math.cos(t), 40 * Math.sin(t)] as Vec3;
  });
  cover = cover.cutAll(
    pumpCoverTapPts.map((p) =>
      makeCylinder(
        tapHoleDia(6) / 2,
        13,
        [p[0] + 0.01, p[1], p[2]],
        [-1, 0, 0],
      ),
    ),
  );
  // Relief bore Ø12 + M12 plug tap (vertical, in the lower boss).
  cover = cover.fuse(
    draw([frontCover.reliefY - 12, frontCover.reliefZ - 14])
      .lineTo([frontCover.reliefY + 12, frontCover.reliefZ - 14])
      .lineTo([frontCover.reliefY + 12, frontCover.reliefZ + 14])
      .lineTo([frontCover.reliefY - 12, frontCover.reliefZ + 14])
      .close()
      .sketchOnPlane('YZ')
      .extrude(-26)
      .translate([frontCover.backX, 0, 0]) as Shape3D,
  );
  cover = cover.cut(
    makeCylinder(
      6.01,
      40,
      [frontCover.backX - 13, frontCover.reliefY, frontCover.reliefZ - 14.01],
      [0, 0, 1],
    ),
  );
  cover = cover.cut(
    makeCylinder(
      tapHoleDia(12) / 2,
      11,
      [frontCover.backX - 13, frontCover.reliefY, frontCover.reliefZ + 13.99],
      [0, 0, -1],
    ),
  );
  // Filter adapter boss with the 3/4-16 nipple land + in/out drillings.
  cover = cover.fuse(
    makeCylinder(
      26,
      12,
      [frontCover.wallX - 12, frontCover.filterY, frontCover.filterZ],
      [1, 0, 0],
    ),
  );
  cover = cover.cut(
    makeCylinder(
      9.4,
      14,
      [frontCover.wallX - 13, frontCover.filterY, frontCover.filterZ],
      [1, 0, 0],
    ),
  );
  cover = cover.cut(
    makeCylinder(
      5,
      42,
      [frontCover.wallX - 6, frontCover.filterY + 6, frontCover.filterZ],
      [1, 0, 0],
    ),
  );
  cover = cover.cut(
    makeCylinder(
      5,
      42,
      [frontCover.wallX - 6, frontCover.filterY - 12, frontCover.filterZ + 8],
      [1, 0, 0],
    ),
  );
  // Cam sensor boss on the upper face.
  cover = cover.fuse(
    makeCylinder(10, 10, [frontCover.wallX - 10, 0, 185], [1, 0, 0]),
  );
  cover = cover.cut(
    makeCylinder(
      tapHoleDia(10) / 2,
      24,
      [frontCover.wallX - 10.01, 0, 185],
      [1, 0, 0],
    ),
  );
  // Oil pickup pad (flat boss under the pump housing) + 2x M6 taps.
  cover = cover.fuse(
    draw([-22, -50])
      .lineTo([22, -50])
      .lineTo([22, -40])
      .lineTo([-22, -40])
      .close()
      .sketchOnPlane('YZ')
      .extrude(16)
      .translate([-20, 0, 0]) as Shape3D,
  );
  const pickupTapPts: Vec3[] = [
    [-10, -16, -50],
    [-10, 16, -50],
  ];
  cover = cover.cutAll(
    pickupTapPts.map((p) =>
      makeCylinder(tapHoleDia(6) / 2, 8, [p[0], p[1], p[2] - 0.01], [0, 0, 1]),
    ),
  );
  // Pickup suction port up into the pump pocket.
  cover = cover.cut(makeCylinder(11, 46, [-10, 0, -50.01], [0, 0, 1]));
  // 10 bolt holes Ø6.6 + spot faces through the flange.
  const boltTools: Shape3D[] = [];
  for (const [y, z] of frontCover.boltPts) {
    boltTools.push(makeCylinder(3.3, 46, [1, y, z], [-1, 0, 0]));
    boltTools.push(makeCylinder(6.5, 27.5, [-45, y, z], [1, 0, 0]));
  }
  cover = cover.cutAll(boltTools);
  // Edge-break chamfer 0.5x45 along the top outer corner (REQ-080 budget).
  cover = cover.chamfer(0.5, (e) =>
    e
      .inDirection('X')
      .containsPoint([-20, frontCover.outline.yHalf, frontCover.outline.zMax]),
  );

  const shape = place.shape(cover);
  const interfaces: InterfaceDeclarations = {
    blockJoint: faceNear(place, [frontCover.backX, -106, 60], 'PLANE', 0.1),
    boltHole: axisGroupNear(
      place,
      frontCover.boltPts.map(([y, z]) => [-5, y + 3.3, z] as Vec3),
      'CYLINDRE',
      0.1,
    ),
    boltSeat: groupNear(
      place,
      frontCover.boltPts.map(([y, z]) => [-17.5, y + 4.9, z] as Vec3),
      'PLANE',
      0.1,
    ),
    camSensorBoss: axisNear(
      place,
      [frontCover.wallX - 5, tapHoleDia(10) / 2, 185],
      'CYLINDRE',
      0.12,
    ),
    filterLand: faceNear(
      place,
      [frontCover.wallX - 12, frontCover.filterY + 18, frontCover.filterZ],
      'PLANE',
      0.12,
    ),
    filterNipple: axisNear(
      place,
      [frontCover.wallX - 6, frontCover.filterY + 9.4, frontCover.filterZ],
      'CYLINDRE',
      0.12,
    ),
    pickupPad: faceNear(place, [-10, 20, -50], 'PLANE', 0.12),
    pickupTap: axisGroupNear(
      place,
      pickupTapPts.map(
        (p) => [p[0], p[1] + tapHoleDia(6) / 2, p[2] + 4] as Vec3,
      ),
      'CYLINDRE',
      0.1,
    ),
    pumpCoverTap: axisGroupNear(
      place,
      pumpCoverTapPts.map((p) => {
        const n = Math.hypot(p[1], p[2]);
        const r = tapHoleDia(6) / 2;
        return [p[0] - 5, p[1] - (p[1] / n) * r, p[2] - (p[2] / n) * r] as Vec3;
      }),
      'CYLINDRE',
      0.12,
    ),
    pumpPocket: axisNear(
      place,
      [-10, 0, frontCover.pumpPocketR],
      'CYLINDRE',
      0.1,
    ),
    reliefBore: axisNear(
      place,
      [
        frontCover.backX - 13 + 6.01,
        frontCover.reliefY,
        frontCover.reliefZ - 4,
      ],
      'CYLINDRE',
      0.1,
    ),
    reliefPlugTap: axisNear(
      place,
      [
        frontCover.backX - 13 + tapHoleDia(12) / 2,
        frontCover.reliefY,
        frontCover.reliefZ + 9,
      ],
      'CYLINDRE',
      0.1,
    ),
    sealBore: axisNear(
      place,
      [frontCover.wallX + 5, 0, -frontCover.sealBoreR],
      'CYLINDRE',
      0.1,
    ),
  };
  return { shape, interfaces };
};

/** Rear seal housing: round plate r70 with the seal bore and 6 holes. */
export const buildRearSealHousing = (place: Placement): BuiltPart => {
  const t = 12;
  // Web bore 84 dia clears the crank 73 dia neck; the 90.35 seal recess opens
  // to the rear face (depth 9), leaving a 3 mm retention web.
  let housing = makeCylinder(70, t, [0, 0, 0], [1, 0, 0])
    .cut(makeCylinder(90.35 / 2, 9, [t - 9 + 0.01, 0, 0], [1, 0, 0]))
    .cut(makeCylinder(42, t + 2, [-1, 0, 0], [1, 0, 0]));
  const boltTools: Shape3D[] = [];
  const boltPts: Vec3[] = [];
  for (let index = 0; index < 6; index++) {
    const a = (index * 60 * Math.PI) / 180;
    const y = 60 * Math.cos(a);
    const z = 60 * Math.sin(a);
    boltTools.push(makeCylinder(3.3, t + 2, [-1, y, z], [1, 0, 0]));
    boltPts.push([t / 2, y + 3.3, z]);
  }
  housing = housing.cutAll(boltTools);
  const shape = place.shape(housing);
  const interfaces: InterfaceDeclarations = {
    blockJoint: faceNear(place, [0, 0, -66], 'PLANE', 0.1),
    boltHole: axisGroupNear(place, boltPts, 'CYLINDRE', 0.1),
    boltSeat: faceNear(place, [t, 0, -66], 'PLANE', 0.1),
    sealBore: axisNear(place, [t - 4, 0, 90.35 / 2], 'CYLINDRE', 0.1),
  };
  return { shape, interfaces };
};

/** Main seal (front/rear): case ring with a garter lip, modeled squeezed. */
export const buildMainSeal = (
  place: Placement,
  kind: 'front' | 'rear',
): BuiltPart => {
  const caseR = kind === 'front' ? 68.3 / 2 : 90.6 / 2;
  const lipR =
    kind === 'front' ? 48 / 2 - press.sealLip : 90 / 2 - press.sealLip;
  const t = kind === 'front' ? 10 : 9;
  const profile = draw([lipR, 1])
    .lineTo([lipR + 2, 0])
    .lineTo([caseR, 0])
    .lineTo([caseR, t])
    .lineTo([lipR + 3, t])
    .lineTo([lipR, t - 5])
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1]);
  const oriented = profile.rotate(90, [0, 0, 0], [0, 1, 0]);
  const shape = place.shape(oriented);
  const interfaces: InterfaceDeclarations = {
    casePress: axisNear(place, [t / 2, 0, caseR], 'CYLINDRE', 0.1),
    // Lip band spans x 1..t-5 after orienting the revolve along +x.
    lip: axisNear(place, [3, 0, lipR], 'CYLINDRE', 0.3),
  };
  return { shape, interfaces };
};

/** Valve cover: shelled crown open at the rail, 8 bolt towers. */
export const buildValveCover = (
  place: Placement,
  bank: 'R' | 'L',
): BuiltPart => {
  const railTapXY: Array<[number, number]> = [90, 200, 310, 420].flatMap(
    (x) => [[x, -72] as [number, number], [x, 64] as [number, number]],
  );
  let cover = draw([20, -80])
    .lineTo([495, -80])
    .lineTo([495, 72])
    .lineTo([20, 72])
    .close()
    .sketchOnPlane('XY')
    .extrude(58);
  cover = cover.cut(
    draw([25, -75])
      .lineTo([490, -75])
      .lineTo([490, 67])
      .lineTo([25, 67])
      .close()
      .sketchOnPlane('XY')
      .extrude(54)
      .translate([0, 0, -0.01]) as Shape3D,
  );
  const boltTools: Shape3D[] = [];
  for (const [x, y] of railTapXY) {
    cover = cover.fuse(makeCylinder(8, 58, [x, y, 0], [0, 0, 1]));
    boltTools.push(makeCylinder(3.3, 60, [x, y, -1], [0, 0, 1]));
    boltTools.push(makeCylinder(6.6, 20, [x, y, 40.01], [0, 0, 1]));
  }
  cover = cover.cutAll(boltTools);
  if (bank === 'R') {
    cover = cover.fuse(makeCylinder(19, 14, [140, 0, 56], [0, 0, 1]));
    cover = cover.cut(makeCylinder(15, 22, [140, 0, 50], [0, 0, 1]));
  } else {
    cover = cover.fuse(makeCylinder(13, 12, [370, 0, 56], [0, 0, 1]));
    cover = cover.cut(makeCylinder(9.5, 22, [370, 0, 52], [0, 0, 1]));
  }
  // Local frame matches the head (deck at z=0): the rail sits at z=105 in
  // head coordinates -> build at rail-local z=0 and let the caller shift.
  const shape = place.shape(cover);
  const interfaces: InterfaceDeclarations = {
    boltHole: axisGroupNear(
      place,
      railTapXY.map(([x, y]) => [x + 3.3, y, 20] as Vec3),
      'CYLINDRE',
      0.1,
    ),
    boltSeat: axisGroupNear(
      place,
      railTapXY.map(([x, y]) => [x + 6.6, y, 45] as Vec3),
      'CYLINDRE',
      0.1,
    ),
    envelope: faceNear(place, [257, -20, 58], 'PLANE', 0.3),
    rail: faceNear(place, [60, -77.5, 0], 'PLANE', 0.12),
    ...(bank === 'R'
      ? { fillerNeck: axisNear(place, [140 + 15, 0, 62], 'CYLINDRE', 0.15) }
      : { pcvGrommet: axisNear(place, [370 + 9.5, 0, 62], 'CYLINDRE', 0.15) }),
  };
  return { shape, interfaces };
};

/** Perimeter flange gasket blanked from a rail hole map. */
export const buildRailGasket = (
  place: Placement,
  options: {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
    t: number;
    holes: Array<{ x: number; y: number; d: number }>;
    windowInset?: number;
    /** Circular window (radius) instead of the inset rectangle. */
    windowRound?: number;
    /** Override the face probe point (x, y) when the default hits a hole. */
    probeAt?: [number, number];
  },
): BuiltPart => {
  let sheet = draw([options.x0, options.y0])
    .lineTo([options.x1, options.y0])
    .lineTo([options.x1, options.y1])
    .lineTo([options.x0, options.y1])
    .close()
    .sketchOnPlane('XY')
    .extrude(options.t);
  if (options.windowRound !== undefined) {
    sheet = sheet.cut(
      makeCylinder(
        options.windowRound,
        options.t + 2,
        [(options.x0 + options.x1) / 2, (options.y0 + options.y1) / 2, -1],
        [0, 0, 1],
      ),
    );
  }
  if (options.windowInset !== undefined) {
    sheet = sheet.cut(
      draw([options.x0 + options.windowInset, options.y0 + options.windowInset])
        .lineTo([
          options.x1 - options.windowInset,
          options.y0 + options.windowInset,
        ])
        .lineTo([
          options.x1 - options.windowInset,
          options.y1 - options.windowInset,
        ])
        .lineTo([
          options.x0 + options.windowInset,
          options.y1 - options.windowInset,
        ])
        .close()
        .sketchOnPlane('XY')
        .extrude(options.t + 2)
        .translate([0, 0, -1]) as Shape3D,
    );
  }
  const tools: Shape3D[] = [];
  for (const hole of options.holes) {
    tools.push(
      makeCylinder(hole.d / 2, options.t + 2, [hole.x, hole.y, -1], [0, 0, 1]),
    );
  }
  if (tools.length > 0) {
    sheet = sheet.cutAll(tools);
  }
  const probeX =
    options.probeAt?.[0] ?? options.x0 + (options.windowInset ?? 8) / 2;
  const probeY = options.probeAt?.[1] ?? (options.y0 + options.y1) / 2;
  const shape = place.shape(sheet);
  const interfaces: InterfaceDeclarations = {
    a: faceNear(place, [probeX, probeY, 0], 'PLANE', 0.12),
    b: faceNear(place, [probeX, probeY, options.t], 'PLANE', 0.12),
    ...(options.holes.length > 0
      ? {
          boltHole: axisGroupNear(
            place,
            options.holes.map(
              (hole) => [hole.x + hole.d / 2, hole.y, options.t / 2] as Vec3,
            ),
            'CYLINDRE',
            0.1,
          ),
        }
      : {}),
  };
  return { shape, interfaces };
};

/** Oil pan: stamped tray with a deep rear sump, rim flange, drain boss. */
export const buildOilPan = (place: Placement): BuiltPart => {
  const rim = 16;
  let pan = draw([-8, -114])
    .lineTo([524, -114])
    .lineTo([524, 114])
    .lineTo([-8, 114])
    .close()
    .sketchOnPlane('XY')
    .extrude(-40);
  const sump = draw([230, -100])
    .lineTo([510, -100])
    .lineTo([510, 100])
    .lineTo([230, 100])
    .close()
    .sketchOnPlane('XY')
    .extrude(-140);
  pan = pan.fuse(sump);
  // Hollow (constant-wall stamping).
  pan = pan
    .cut(
      draw([-8 + 3, -111])
        .lineTo([521, -111])
        .lineTo([521, 111])
        .lineTo([-5, 111])
        .close()
        .sketchOnPlane('XY')
        .extrude(-37)
        .translate([0, 0, 0.01]) as Shape3D,
    )
    .cut(
      draw([233, -97])
        .lineTo([507, -97])
        .lineTo([507, 97])
        .lineTo([233, 97])
        .close()
        .sketchOnPlane('XY')
        .extrude(-137)
        .translate([0, 0, 0.01]) as Shape3D,
    );
  void rim;
  // Rim flange plate (window matches the block skirt opening) so the rail
  // bolts at y = +-94 have material to pierce and seat on.
  const rimPlate = draw([-8, -114])
    .lineTo([524, -114])
    .lineTo([524, 114])
    .lineTo([-8, 114])
    .close()
    .sketchOnPlane('XY')
    .extrude(-4)
    .cut(
      draw([0, -90])
        .lineTo([516, -90])
        .lineTo([516, 90])
        .lineTo([0, 90])
        .close()
        .sketchOnPlane('XY')
        .extrude(-6)
        .translate([0, 0, 1]) as Shape3D,
    );
  pan = pan.fuse(rimPlate);
  // Rim flange with 16 bolt holes matching the block rail taps.
  const railXs = [50, 115, 180, 245, 310, 375, 440, 478];
  const boltPts: Vec3[] = [];
  const tools: Shape3D[] = [];
  for (const side of [-1, 1] as const) {
    for (const x of railXs) {
      tools.push(makeCylinder(3.3, 6, [x, side * 94, 2], [0, 0, -1]));
      boltPts.push([x + 3.3, side * 94, -1.5]);
    }
  }
  // Drain boss protruding below the sump floor (floor band -140..-137).
  pan = pan.fuse(makeCylinder(12, 8, [480, 60, -148], [0, 0, 1]));
  pan = pan.cutAll([
    ...tools,
    makeCylinder(tapHoleDia(14) / 2, 12, [480, 60, -148.01], [0, 0, 1]),
  ]);
  const shape = place.shape(pan);
  const interfaces: InterfaceDeclarations = {
    boltHole: axisGroupNear(place, boltPts, 'CYLINDRE', 0.1),
    boltSeat: faceNear(place, [30, 100, -4], 'PLANE', 0.3),
    drainBoss: axisNear(
      place,
      [480 + tapHoleDia(14) / 2, 60, -144],
      'CYLINDRE',
      0.12,
    ),
    rail: faceNear(place, [30, -100, 0], 'PLANE', 0.12),
  };
  return { shape, interfaces };
};

/** Oil pickup: swept Ø22 tube from the pump inlet to the sump strainer. */
export const buildOilPickup = (place: Placement): BuiltPart => {
  const flange = makeCylinder(20, 4, [0, 0, 0], [0, 0, -1]).fuse(
    makeCylinder(24, 4, [0, 0, 0], [0, 0, -1]).cut(
      makeCylinder(20.5, 6, [0, 0, 1], [0, 0, -1]),
    ),
  );
  void flange;
  let pickup = makeCylinder(20, 4, [0, 0, -4], [0, 0, 1]) as Shape3D;
  const spine = (): ReturnType<Sketcher['done']> =>
    new Sketcher('XZ')
      .movePointerTo([0, 0])
      .lineTo([0, -50])
      .tangentArcTo([30, -80])
      .lineTo([300, -80])
      .done();
  const outer = spine().sweepSketch((plane, origin) =>
    sketchCircle(11, { plane, origin }),
  );
  const lumen = spine().sweepSketch((plane, origin) =>
    sketchCircle(9, { plane, origin }),
  );
  pickup = pickup.fuse(outer).cut(lumen);
  // Strainer plate at the far end.
  pickup = pickup.fuse(
    makeCylinder(30, 3, [300, 0, -83], [0, 0, -1]).cut(
      makeCylinder(26, 5, [300, 0, -82], [0, 0, -1]),
    ),
  );
  const boltTools: Shape3D[] = [];
  const boltPts: Vec3[] = [];
  for (const side of [-1, 1] as const) {
    boltTools.push(
      makeCylinder(3.3, 8, [side * -0 + 0, side * 18, 1], [0, 0, -1]),
    );
    boltPts.push([side * 18 + 3.3, 0, -2].reverse() as unknown as Vec3);
  }
  void boltTools;
  const holes = [
    makeCylinder(3.3, 8, [0, -18, 1], [0, 0, -1]),
    makeCylinder(3.3, 8, [0, 18, 1], [0, 0, -1]),
  ];
  pickup = pickup.cutAll(holes);
  const shape = place.shape(pickup);
  const interfaces: InterfaceDeclarations = {
    boltHole: axisGroupNear(
      place,
      [
        [3.3, -18, -2],
        [3.3, 18, -2],
      ],
      'CYLINDRE',
      0.1,
    ),
    // Annulus r 11..20 (the suction tube fuses through the middle).
    boltSeat: faceNear(place, [15, 0, -4], 'PLANE', 0.3),
    pumpJoint: faceNear(place, [15, 8, 0], 'PLANE', 0.3),
  };
  void boltPts;
  return { shape, interfaces };
};

/** Gerotor rotors: simplified lobed discs with exact tip clearances. */
export const buildPumpRotor = (
  place: Placement,
  kind: 'inner' | 'outer',
): BuiltPart => {
  const width = fit.rotorWidth;
  if (kind === 'outer') {
    const outerR = fit.outerRotorDia / 2;
    let rotor = makeCylinder(outerR, width, [0, 0, 0], [1, 0, 0]) as Shape3D;
    // Bore Ø52 scalloped by 11 lobe pockets on the bore circle.
    const pockets: Shape3D[] = [];
    for (let index = 0; index < 11; index++) {
      const a = (index * 2 * Math.PI) / 11;
      pockets.push(
        makeCylinder(
          6,
          width + 2,
          [-1, 26 * Math.cos(a), 26 * Math.sin(a)],
          [1, 0, 0],
        ),
      );
    }
    rotor = rotor
      .cut(makeCylinder(26, width + 2, [-1, 0, 0], [1, 0, 0]))
      .cutAll(pockets);
    const shape = place.shape(rotor);
    // Probe the bore wall midway between two pockets.
    const mid = (8.5 * 2 * Math.PI) / 11;
    const interfaces: InterfaceDeclarations = {
      lobes: axisNear(
        place,
        [width / 2, 26 * Math.cos(mid), 26 * Math.sin(mid)],
        'CYLINDRE',
        0.15,
      ),
      outer: axisNear(place, [width / 2, 0, -outerR], 'CYLINDRE', 0.1),
      sideFace: faceNear(
        place,
        [0, 28.5 * Math.cos(mid), 28.5 * Math.sin(mid)],
        'PLANE',
        0.12,
      ),
    };
    return { shape, interfaces };
  }
  // Inner rotor: r21 body with 10 tip bumps (tips r25.5), riding the snout
  // flats through a Ø38.1 bore flattened at 34.1 A/F.
  let rotor = makeCylinder(21, width, [0, 0, 0], [1, 0, 0]) as Shape3D;
  for (let index = 0; index < 10; index++) {
    const a = (index * 2 * Math.PI) / 10;
    rotor = rotor.fuse(
      makeCylinder(
        4.5,
        width,
        [0, 21 * Math.cos(a), 21 * Math.sin(a)],
        [1, 0, 0],
      ),
    );
  }
  const boreProfile = drawCircle(19.05)
    .cut(
      draw([17.05, -25])
        .lineTo([30, -25])
        .lineTo([30, 25])
        .lineTo([17.05, 25])
        .close(),
    )
    .cut(
      draw([-30, -25])
        .lineTo([-17.05, -25])
        .lineTo([-17.05, 25])
        .lineTo([-30, 25])
        .close(),
    );
  rotor = rotor.cut(
    boreProfile
      .sketchOnPlane('YZ')
      .extrude(width + 2)
      .translate([-1, 0, 0]) as Shape3D,
  );
  const shape = place.shape(rotor);
  const interfaces: InterfaceDeclarations = {
    driveFlats: faceNear(place, [width / 2, 17.05, 0], 'PLANE', 0.12),
    lobes: axisNear(place, [width / 2, 25.5, 0], 'CYLINDRE', 0.15),
  };
  return { shape, interfaces };
};

/** Oil pump cover: ground plate closing the pocket, 4x M6. */
export const buildPumpCover = (place: Placement): BuiltPart => {
  let plate = makeCylinder(44, 6, [0, 0, 0], [-1, 0, 0]) as Shape3D;
  const boltPts: Vec3[] = [];
  const tools: Shape3D[] = [];
  for (const deg of [45, 135, 225, 315]) {
    const t = (deg * Math.PI) / 180;
    tools.push(
      makeCylinder(3.3, 8, [1, 36 * Math.cos(t), 36 * Math.sin(t)], [-1, 0, 0]),
    );
    boltPts.push([-3, 36 * Math.cos(t) + 3.3, 36 * Math.sin(t)]);
  }
  plate = plate.cutAll(tools);
  const shape = place.shape(plate);
  const interfaces: InterfaceDeclarations = {
    boltHole: axisGroupNear(place, boltPts, 'CYLINDRE', 0.1),
    boltSeat: faceNear(place, [-6, 0, 20], 'PLANE', 0.3),
    plateFace: faceNear(place, [0, 0, 20], 'PLANE', 0.12),
  };
  return { shape, interfaces };
};

/** Relief valve piston + spring + plug. */
export const buildReliefPiston = (place: Placement): BuiltPart => {
  const shape = place.shape(makeCylinder(5.99, 16, [0, 0, 0], [0, 0, 1]));
  const interfaces: InterfaceDeclarations = {
    body: axisNear(place, [5.99, 0, 8], 'CYLINDRE', 0.1),
  };
  return { shape, interfaces };
};

export const buildReliefSpring = (place: Placement): BuiltPart => {
  const helix = sketchHelix(4, 16, 4.2, [0, 0, 0], [0, 0, 1]);
  const coil = helix.sweepSketch((plane, origin) => {
    void origin;
    return drawCircle(0.9).sketchOnPlane(plane) as Sketch;
  });
  const shape = place.shape(coil);
  const interfaces: InterfaceDeclarations = {
    // Swept helix (BSpline segments): probe on the tube surface at a
    // half-turn, away from the segment boundaries at whole turns.
    coils: faceNear(place, [0, -5.1, 7], undefined, 0.3),
  };
  return { shape, interfaces };
};

/** Water pump set: housing with two legs + volute, shaft, impeller, pulley. */
export const buildWaterPumpHousing = (place: Placement): BuiltPart => {
  const legY = 145.7;
  const bodyX: [number, number] = [-70, -46];
  let housing = draw([-176, 40])
    .lineTo([176, 40])
    .lineTo([176, 93])
    .lineTo([-176, 93])
    .close()
    .sketchOnPlane('YZ')
    .extrude(bodyX[1] - bodyX[0])
    .translate([bodyX[0], 0, 0]) as Shape3D;
  // Volute cavity around the impeller (on the crank-parallel pump axis).
  housing = housing.cut(
    makeCylinder(36.5, 18, [bodyX[0] + 3, 0, 66.5], [1, 0, 0]),
  );
  // Cartridge bore through the front wall.
  housing = housing.cut(
    makeCylinder(8, 40, [bodyX[0] - 1, 0, 66.5], [1, 0, 0]),
  );
  // Legs back to the block pads.
  for (const side of [-1, 1] as const) {
    housing = housing.fuse(
      draw([side * legY - 26, 50.2])
        .lineTo([side * legY + 26, 50.2])
        .lineTo([side * legY + 26, 93])
        .lineTo([side * legY - 26, 93])
        .close()
        .sketchOnPlane('YZ')
        .extrude(-bodyX[1] - 0 + 0)
        .translate([bodyX[1], 0, 0]) as Shape3D,
    );
  }
  // Discharge drillings from the volute into the block inlets.
  for (const side of [-1, 1] as const) {
    housing = housing.cut(
      makeCylinder(
        15,
        200,
        [-0.5, side * legY, 66.5],
        [-0.4, side * 0.9, 0].map((v, index) =>
          index === 0 ? -0.42 : v,
        ) as Vec3,
      ),
    );
  }
  // 4 bolt holes through the legs at the block tap pattern.
  const boltPts: Array<[number, number]> = [
    [-126, 55],
    [-165.4, 90],
    [126, 55],
    [165.4, 90],
  ];
  const tools: Shape3D[] = [];
  for (const [y, z] of boltPts) {
    tools.push(makeCylinder(4.3, 80, [1, y, z], [-1, 0, 0]));
  }
  housing = housing.cutAll(tools);
  const shape = place.shape(housing);
  const interfaces: InterfaceDeclarations = {
    blockJoint: faceNear(place, [0, legY, 60], 'PLANE', 0.15),
    boltHole: axisGroupNear(
      place,
      boltPts.map(([y, z]) => [-20, y + 4.3, z] as Vec3),
      'CYLINDRE',
      0.1,
    ),
    // Bolt heads land on the body FRONT face (x = bodyX[0]); x = bodyX[1]
    // is buried where the legs meet the body.
    boltSeat: faceNear(place, [bodyX[0], legY, 70], 'PLANE', 0.5),
    // Only the front wall (3 thick) carries the bore; the volute cavity
    // opens up right behind it.
    cartridgeBore: axisNear(
      place,
      [bodyX[0] + 1.5, 0, 66.5 + 8],
      'CYLINDRE',
      0.1,
    ),
    // Side of the volute arc: its top/bottom poke past the body slab.
    volute: axisNear(place, [bodyX[0] + 10, 36.5, 66.5], 'CYLINDRE', 0.12),
  };
  return { shape, interfaces };
};

export const buildWaterPumpShaft = (place: Placement): BuiltPart => {
  const shape = place.shape(
    draw([-40, 0])
      .lineTo([-40, 6])
      .lineTo([-24, 6])
      .lineTo([-24, 7.99])
      .lineTo([8, 7.99])
      .lineTo([8, 6])
      .lineTo([16, 6])
      .lineTo([16, 0])
      .close()
      .sketchOnPlane('XZ')
      .revolve([1, 0, 0]),
  );
  const interfaces: InterfaceDeclarations = {
    cartridge: axisNear(place, [-8, 0, 7.99], 'CYLINDRE', 0.1),
    impellerEnd: axisNear(place, [12, 0, -6], 'CYLINDRE', 0.1),
    pulleyEnd: axisNear(place, [-32, 0, -6], 'CYLINDRE', 0.1),
  };
  return { shape, interfaces };
};

export const buildImpeller = (place: Placement): BuiltPart => {
  let impeller = makeCylinder(12, 8, [8, 0, 0], [1, 0, 0]) as Shape3D;
  for (let index = 0; index < 6; index++) {
    const a = (index * Math.PI) / 3;
    impeller = impeller.fuse(
      makeCylinder(
        3.5,
        fit.impellerDia / 2 - 2,
        [12, 0, 0],
        [0, Math.cos(a), Math.sin(a)],
      ),
    );
  }
  impeller = impeller.cut(makeCylinder(6, 10, [7, 0, 0], [1, 0, 0]));
  const shape = place.shape(impeller);
  const interfaces: InterfaceDeclarations = {
    hub: axisNear(place, [12, 0, 6], 'CYLINDRE', 0.15),
    // Flat end cap of the vane pointing along +y (vane 0).
    tips: faceNear(place, [12, fit.impellerDia / 2 - 2, 0], 'PLANE', 0.1),
  };
  return { shape, interfaces };
};

export const buildPumpPulley = (place: Placement): BuiltPart => {
  let pulley = makeCylinder(45, 10, [-46, 0, 0], [1, 0, 0]) as Shape3D;
  pulley = pulley.cut(
    makeCylinder(42, 4, [-43, 0, 0], [1, 0, 0]).cut(
      makeCylinder(36, 6, [-44, 0, 0], [1, 0, 0]),
    ),
  );
  pulley = pulley.cut(makeCylinder(6, 12, [-47, 0, 0], [1, 0, 0]));
  const shape = place.shape(pulley);
  const interfaces: InterfaceDeclarations = {
    beltPlane: datumAt(place, [-41, 0, 0], [0, 0, 1], [1, 0, 0]),
    hub: axisNear(place, [-40, 0, 6], 'CYLINDRE', 0.1),
  };
  return { shape, interfaces };
};

export { Placement, threadBandDia };
