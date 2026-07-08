/**
 * Induction and fuel (spec 3.7): intake manifold (shelled plenum + swept
 * runners + flanges + crossover), throttle set, fuel rails, injectors,
 * o-rings, thermostat set. Manifold local frame = world (valley install).
 */
import {
  draw,
  drawCircle,
  makeCylinder,
  Sketcher,
  sketchCircle,
} from 'replicad';
import type { Shape3D } from 'replicad';
import type { InterfaceDeclarations } from '@taucad/runtime/kernels/replicad/annotations';
import { axisGroupNear, axisNear, faceNear, groupNear } from './annotate.js';
import { Placement } from './frame.js';
import type { Vec3 } from './frame.js';
import {
  bankPoint,
  bankStagger,
  boreXR,
  boreXL,
  fit,
  gasketT,
  head as hp,
  tapHoleDia,
  threadBandDia,
} from './params.js';
import { intakeTapX, intakeTapZ } from './head.js';
import { headDeckS } from './kinematics.js';
import type { BuiltPart } from './piston-group.js';

const c = Math.SQRT1_2;

/** Manifold head-flange planes: head inner face (a = -80) + gasket 0.70. */
export const manifoldFlangeA = hp.aIn - gasketT.intake; // -80.7 (bank coords).
/** Runner mouth centres on the head flange (bank R x stations, s = 262). */
export const runnerMouthS = 262;
/** Plenum body extents (world). */
export const plenum = {
  x0: 30,
  x1: 490,
  zBottom: 228,
  zTop: 300,
  yHalf: 68,
  /** Throttle flange plane (front, normal -X). */
  throttleX: 18,
  throttleZ: 264,
} as const;

const flangeYZ = (
  bank: 'R' | 'L',
  s: number,
  a = manifoldFlangeA,
): [number, number] => {
  const p = bankPoint(bank, 0, a, s);
  return [p[1], p[2]];
};

export const buildIntakeManifold = (place: Placement): BuiltPart => {
  // Plenum: outer box shelled to wall 4, open at the throttle flange.
  let body = draw([plenum.x0, -plenum.yHalf])
    .lineTo([plenum.x1, -plenum.yHalf])
    .lineTo([plenum.x1, plenum.yHalf])
    .lineTo([plenum.x0, plenum.yHalf])
    .close()
    .sketchOnPlane('XY', plenum.zBottom)
    .extrude(plenum.zTop - plenum.zBottom);
  body = body.cut(
    draw([plenum.x0 + 4, -plenum.yHalf + 4])
      .lineTo([plenum.x1 - 4, -plenum.yHalf + 4])
      .lineTo([plenum.x1 - 4, plenum.yHalf - 4])
      .lineTo([plenum.x0 + 4, plenum.yHalf - 4])
      .close()
      .sketchOnPlane('XY', plenum.zBottom + 4)
      .extrude(plenum.zTop - plenum.zBottom - 8),
  );
  // Throttle snout: forward duct to the throttle flange.
  body = body.fuse(
    makeCylinder(
      52,
      plenum.x0 - plenum.throttleX + 4,
      [plenum.throttleX, 0, plenum.throttleZ],
      [1, 0, 0],
    ),
  );
  body = body.cut(
    makeCylinder(
      fit.throttleBore / 2,
      plenum.x0 - plenum.throttleX + 6,
      [plenum.throttleX - 1, 0, plenum.throttleZ],
      [1, 0, 0],
    ),
  );
  // Head flanges: plates along each bank's inner face.
  const flangeT = 12;
  const flangePlate = (bank: 'R' | 'L'): Shape3D => {
    const x0 = bank === 'R' ? 40 : 40 + bankStagger;
    const x1 = bank === 'R' ? 455 : 455 + bankStagger;
    const plate = draw([x0, 230])
      .lineTo([x1, 230])
      .lineTo([x1, 294])
      .lineTo([x0, 294])
      .close()
      .sketchOnPlane('XY')
      .extrude(flangeT);
    // Local sheet frame: XY at s, thickness inward: map so z=0 is the
    // flange plane: mirror+rotate like the exhaust, on the INNER face.
    const frame =
      bank === 'R'
        ? Placement.mirrorXZ()
            .rotate('x', -135)
            .compose(
              Placement.translate(0, manifoldFlangeA * c, -manifoldFlangeA * c),
            )
            .rotate('x', 180)
        : Placement.identity;
    void frame;
    return plate;
  };
  void flangePlate;
  // Simpler: flange slabs built directly in world coordinates by extruding
  // toward the plenum from each flange plane along vR (inward = -vR for R).
  for (const bank of ['R', 'L'] as const) {
    const inward: Vec3 = bank === 'R' ? [0, -c, c] : [0, c, c];
    const x0 = bank === 'R' ? 40 : 40 + bankStagger;
    const length = 415;
    // Build a plate: profile in the (x, s)-plane at the flange a-plane.
    const base = flangeYZ(bank, 230);
    void base;
    const sheetFrame = (
      bank === 'R'
        ? Placement.mirrorXZ().rotate('x', -135)
        : Placement.rotate('x', -45)
            .compose(Placement.mirrorXZ())
            .rotate('x', 0)
    ).compose(
      Placement.translate(
        0,
        (bank === 'R' ? 1 : -1) * manifoldFlangeA * c * (bank === 'R' ? 1 : 1),
        -manifoldFlangeA * c,
      ),
    );
    void sheetFrame;
    void inward;
    void x0;
    void length;
  }
  // Head-flange slabs via bank frames (t measured inward from the flange).
  const slab = (bank: 'R' | 'L'): Shape3D => {
    const sheet = draw([40 + (bank === 'L' ? bankStagger : 0), 232])
      .lineTo([455 + (bank === 'L' ? bankStagger : 0), 232])
      .lineTo([455 + (bank === 'L' ? bankStagger : 0), 292])
      .lineTo([40 + (bank === 'L' ? bankStagger : 0), 292])
      .close()
      .sketchOnPlane('XY')
      .extrude(-flangeT);
    const frame =
      bank === 'R'
        ? Placement.mirrorXZ()
            .rotate('x', -135)
            .compose(
              Placement.translate(0, manifoldFlangeA * c, -manifoldFlangeA * c),
            )
        : Placement.mirrorXZ()
            .rotate('x', -135)
            .compose(
              Placement.translate(0, manifoldFlangeA * c, -manifoldFlangeA * c),
            )
            .mirrorXZ()
            .compose(Placement.translate(bankStagger, 0, 0));
    return frame.shape(sheet);
  };
  body = body.fuse(slab('R')).fuse(slab('L'));

  // Runners: Ø38 lumens swept from each flange mouth into the plenum.
  const runnerCuts: Shape3D[] = [];
  const runnerOuters: Shape3D[] = [];
  for (const bank of ['R', 'L'] as const) {
    const xs = bank === 'R' ? boreXR : boreXL;
    const sign = bank === 'R' ? 1 : -1;
    const [my, mz] = flangeYZ(bank, runnerMouthS);
    for (const x of xs) {
      const spine = () =>
        new Sketcher('YZ', x)
          .movePointerTo([my + sign * c * 2, mz - c * 2])
          .lineTo([my - sign * c * 18, mz + c * 18])
          .tangentArcTo([sign * 40, plenum.zBottom + 24])
          .done();
      runnerOuters.push(
        spine().sweepSketch((plane, origin) =>
          sketchCircle(22.5, { plane, origin }),
        ),
      );
      runnerCuts.push(
        spine().sweepSketch((plane, origin) =>
          sketchCircle(19, { plane, origin }),
        ),
      );
    }
  }
  for (const outer of runnerOuters) {
    body = body.fuse(outer);
  }
  body = body.cutAll(runnerCuts);
  // Flange port openings drilled through the slabs along the flange normal.
  const portTools: Shape3D[] = [];
  for (const bank of ['R', 'L'] as const) {
    const inward: Vec3 = bank === 'R' ? [0, -c, c] : [0, c, c];
    const xs = bank === 'R' ? boreXR : boreXL;
    for (const x of xs) {
      const mouth = bankPoint(bank, x, manifoldFlangeA + 1, runnerMouthS);
      portTools.push(
        makeCylinder(19, 14, mouth, [
          -inward[0] * 0,
          inward[1],
          inward[2],
        ] as Vec3),
      );
    }
  }
  body = body.cutAll(portTools);

  // Manifold bolt holes: 5 per bank matching the head intakeBoltTap map
  // (drilled along the flange normal with spot-faced pads left as-is).
  const boltTools: Shape3D[] = [];
  for (const bank of ['R', 'L'] as const) {
    // Drill along -a-hat (through the flange toward the head taps); spot
    // face each bolt from the inboard side so every seat is its own face.
    const drill: Vec3 = bank === 'R' ? [0, -c, c] : [0, c, c];
    const spot: Vec3 = bank === 'R' ? [0, c, -c] : [0, -c, -c];
    for (const xt of intakeTapX) {
      const x = bank === 'R' ? xt : xt + bankStagger;
      const entry = bankPoint(
        bank,
        x,
        manifoldFlangeA + 4,
        headDeckS + intakeTapZ,
      );
      boltTools.push(makeCylinder(4.3, flangeT + 8, entry, drill));
      const spotEntry = bankPoint(
        bank,
        x,
        manifoldFlangeA - flangeT - 0.01,
        headDeckS + intakeTapZ,
      );
      boltTools.push(makeCylinder(8, 1.01, spotEntry, spot));
    }
  }
  body = body.cutAll(boltTools);

  // Thermostat cavity + 2 M6 taps + coolant temp sensor tap + crossover.
  body = body.fuse(makeCylinder(34, 26, [30, 0, 240], [-1, 0, 0]));
  // Cavity and o-ring groove open FORWARD out of the boss front face (x=4).
  // Depth 12.5 keeps the cavity clear of the throttle bore (x >= 17).
  body = body.cut(makeCylinder(26, 12.51, [3.99, 0, 240], [1, 0, 0]));
  body = body.cut(makeCylinder(27.5, 3, [3.99, 0, 240], [1, 0, 0]));
  const thermostatTapPts: Vec3[] = [
    [4, 0, 270],
    [4, 0, 210],
  ];
  body = body.cutAll(
    thermostatTapPts.map((p) =>
      makeCylinder(tapHoleDia(6) / 2, 13, [p[0] - 0.01, p[1], p[2]], [1, 0, 0]),
    ),
  );
  // Coolant temp sensor tap M12: down through the thermostat boss top (r34
  // about the x-axis at z = 240, so the top surface sits at z = 274).
  body = body.cut(
    makeCylinder(tapHoleDia(12) / 2, 11, [17, 0, 275], [0, 0, -1]),
  );
  // Ponytail: no REQ names manifold crossover inlets (the gasket coolant
  // port row targets the HEAD crossoverOutlet), so the cavity is fed by
  // side drills only in spirit; the Ø25 tubes previously here collided
  // with the throttle bore and tap circle.

  // Injector pockets: Ø14 at 20 deg into each runner near the flange.
  const injectorPockets: Vec3[] = [];
  const pocketTools: Shape3D[] = [];
  for (const bank of ['R', 'L'] as const) {
    const xs = bank === 'R' ? boreXR : boreXL;
    for (const x of xs) {
      const mouth = bankPoint(
        bank,
        x,
        Number(manifoldFlangeA),
        runnerMouthS + 26,
      );
      const dir: Vec3 = bank === 'R' ? [0, -c, -c] : [0, c, -c];
      pocketTools.push(
        makeCylinder(
          7,
          26,
          [mouth[0], mouth[1] - dir[1] * 6, mouth[2] - dir[2] * 6],
          dir,
        ),
      );
      injectorPockets.push([
        mouth[0],
        mouth[1] + dir[1] * 8,
        mouth[2] + dir[2] * 8,
      ]);
    }
  }
  body = body.cutAll(pocketTools);

  // Throttle flange taps 4x M6 + rail mount taps 2 per bank on the plenum.
  const throttleTapPts: Vec3[] = [45, 135, 225, 315].map((deg) => {
    const t = (deg * Math.PI) / 180;
    return [
      plenum.throttleX,
      46 * Math.cos(t),
      plenum.throttleZ + 46 * Math.sin(t),
    ] as Vec3;
  });
  body = body.cutAll(
    throttleTapPts.map((p) =>
      makeCylinder(tapHoleDia(6) / 2, 13, [p[0] - 0.01, p[1], p[2]], [1, 0, 0]),
    ),
  );
  const railTapPts: Record<'R' | 'L', Vec3[]> = { R: [], L: [] };
  const railTools: Shape3D[] = [];
  for (const bank of ['R', 'L'] as const) {
    const sign = bank === 'R' ? 1 : -1;
    for (const x of bank === 'R' ? [120, 350] : [141.8, 371.8]) {
      const p: Vec3 = [x, sign * plenum.yHalf, 262];
      railTools.push(
        makeCylinder(
          tapHoleDia(6) / 2,
          13,
          [p[0], p[1] + sign * 0.01, p[2]],
          [0, -sign, 0],
        ),
      );
      // Wall is 4 thick: probe 2 deep so the point stays on the tapped wall.
      railTapPts[bank].push([p[0], p[1] - sign * 2, p[2] + tapHoleDia(6) / 2]);
    }
  }
  body = body.cutAll(railTools);

  const shape = place.shape(body);
  const boltProbe = (bank: 'R' | 'L', xt: number): Vec3 => {
    const x = bank === 'R' ? xt : xt + bankStagger;
    const p = bankPoint(bank, x, manifoldFlangeA - 6, headDeckS + intakeTapZ);
    return [p[0] + 4.3, p[1], p[2]];
  };
  const interfaces: InterfaceDeclarations = {
    boltHole: axisGroupNear(
      place,
      [
        ...intakeTapX.map((xt) => boltProbe('R', xt)),
        ...intakeTapX.map((xt) => boltProbe('L', xt)),
      ],
      'CYLINDRE',
      0.12,
    ),
    boltSeat: groupNear(
      place,
      [
        ...intakeTapX.map((xt) => ['R', xt] as const),
        ...intakeTapX.map((xt) => ['L', xt] as const),
      ].map(([bank, xt]) => {
        const x = bank === 'R' ? xt : xt + bankStagger;
        const p = bankPoint(
          bank,
          x,
          manifoldFlangeA - flangeT + 1,
          headDeckS + intakeTapZ,
        );
        return [p[0] + 6, p[1], p[2]] as Vec3;
      }),
      'PLANE',
      0.3,
    ),
    coolantSensorTap: axisNear(
      place,
      [17 + tapHoleDia(12) / 2, 0, 270],
      'CYLINDRE',
      0.15,
    ),
    envelope: faceNear(
      place,
      [(plenum.x0 + plenum.x1) / 2, 0, plenum.zTop],
      'PLANE',
      0.15,
    ),
    headFlangeR: faceNear(
      place,
      bankPoint('R', 250, manifoldFlangeA, 262),
      'PLANE',
      0.12,
    ),
    headFlangeL: faceNear(
      place,
      bankPoint('L', 250 + bankStagger, manifoldFlangeA, 262),
      'PLANE',
      0.12,
    ),
    injectorPocket: axisGroupNear(
      place,
      injectorPockets.map((p) => [p[0] + 7, p[1], p[2]] as Vec3),
      'CYLINDRE',
      0.2,
    ),
    railMountTapR: axisGroupNear(place, railTapPts.R, 'CYLINDRE', 0.12),
    railMountTapL: axisGroupNear(place, railTapPts.L, 'CYLINDRE', 0.12),
    runnerFlangeR: axisGroupNear(
      place,
      boreXR.map((x) => {
        const p = bankPoint('R', x, manifoldFlangeA - 5, runnerMouthS);
        return [p[0] + 19, p[1], p[2]] as Vec3;
      }),
      'CYLINDRE',
      0.15,
    ),
    runnerFlangeL: axisGroupNear(
      place,
      boreXL.map((x) => {
        const p = bankPoint('L', x, manifoldFlangeA - 5, runnerMouthS);
        return [p[0] + 19, p[1], p[2]] as Vec3;
      }),
      'CYLINDRE',
      0.15,
    ),
    // Boss front ring (r 27.5..34 about (y0, z240)), off the tap holes.
    thermostatCavity: faceNear(place, [4, 8, 270], 'PLANE', 0.3),
    // 90-deg azimuth: the M6 taps at (y0, z270/z210) pierce the groove wall.
    thermostatSeatGroove: axisNear(place, [5.5, 27.5, 240], 'CYLINDRE', 0.15),
    thermostatTap: axisGroupNear(
      place,
      thermostatTapPts.map(
        (p) => [p[0] + 6, p[1] + tapHoleDia(6) / 2, p[2]] as Vec3,
      ),
      'CYLINDRE',
      0.12,
    ),
    throttleFlange: faceNear(
      place,
      [plenum.throttleX, 0, plenum.throttleZ + 41],
      'PLANE',
      0.15,
    ),
    throttleTap: axisGroupNear(
      place,
      throttleTapPts.map(
        (p) =>
          [
            p[0] + 5,
            p[1] + (tapHoleDia(6) / 2) * Math.sign(p[1] || 1),
            p[2],
          ] as Vec3,
      ),
      'CYLINDRE',
      0.15,
    ),
  };
  return { shape, interfaces };
};

/** Throttle body: ring housing with the Ø75 bore and shaft bosses. */
export const buildThrottleBody = (place: Placement): BuiltPart => {
  const length = 42;
  let bodyShape = makeCylinder(52, length, [0, 0, 0], [-1, 0, 0]) as Shape3D;
  bodyShape = bodyShape.cut(
    makeCylinder(fit.throttleBore / 2, length + 2, [1, 0, 0], [-1, 0, 0]),
  );
  // Shaft bosses across the bore.
  bodyShape = bodyShape.fuse(
    makeCylinder(9, 116, [-length / 2, -58, 0], [0, 1, 0]).cut(
      makeCylinder(fit.throttleBore / 2 - 0.01, length, [1, 0, 0], [-1, 0, 0]),
    ),
  );
  bodyShape = bodyShape.cut(
    makeCylinder(4.01, 120, [-length / 2, -60, 0], [0, 1, 0]),
  );
  const boltPts: Vec3[] = [45, 135, 225, 315].map((deg) => {
    const t = (deg * Math.PI) / 180;
    return [
      0,
      52 * Math.cos(t) * 0 + 46 * Math.cos(t),
      46 * Math.sin(t),
    ] as Vec3;
  });
  const tools = boltPts.map((p) =>
    makeCylinder(3.3, length + 2, [1, p[1], p[2]], [-1, 0, 0]),
  );
  bodyShape = bodyShape.cutAll(tools);
  const shape = place.shape(bodyShape);
  const interfaces: InterfaceDeclarations = {
    boltHole: axisGroupNear(
      place,
      boltPts.map((p) => [-length / 2, p[1] + 3.3, p[2]] as Vec3),
      'CYLINDRE',
      0.15,
    ),
    boltSeat: faceNear(place, [-length, 0, 51], 'PLANE', 0.3),
    bore: axisNear(place, [-8, 0, fit.throttleBore / 2], 'CYLINDRE', 0.1),
    flange: faceNear(place, [0, 0, 51], 'PLANE', 0.15),
    shaftBoss: (() => {
      const g = axisGroupNear(
        place,
        [
          [-length / 2, -50, 4.01],
          [-length / 2, 50, 4.01],
        ],
        'CYLINDRE',
        0.12,
      );
      return g;
    })(),
  };
  return { shape, interfaces };
};

export const buildThrottleShaft = (place: Placement): BuiltPart => {
  let shaft = makeCylinder(
    fit.throttleShaft / 2,
    116,
    [0, -58, 0],
    [0, 1, 0],
  ) as Shape3D;
  const tools = [-10, 10].map((dy) =>
    makeCylinder(tapHoleDia(3) / 2, 9, [4.1, dy, 0], [-1, 0, 0]),
  );
  shaft = shaft.cutAll(tools);
  const shape = place.shape(shaft);
  const interfaces: InterfaceDeclarations = {
    bladeScrewTap: axisGroupNear(
      place,
      [
        [1, -10 + tapHoleDia(3) / 2, 0],
        [1, 10 + tapHoleDia(3) / 2, 0],
      ],
      'CYLINDRE',
      0.1,
    ),
    journal: axisNear(place, [0, -52, fit.throttleShaft / 2], 'CYLINDRE', 0.1),
  };
  return { shape, interfaces };
};

export const buildThrottleBlade = (place: Placement): BuiltPart => {
  let blade = makeCylinder(
    fit.bladeDia / 2,
    1.5,
    [4.75, 0, 0],
    [-1, 0, 0],
  ) as Shape3D;
  const tools = [-10, 10].map((dy) =>
    makeCylinder(1.6, 4, [5, dy, 0], [-1, 0, 0]),
  );
  blade = blade.cutAll(tools);
  const shape = place.shape(blade);
  const interfaces: InterfaceDeclarations = {
    boltHole: axisGroupNear(
      place,
      [
        [4, -10 + 1.6, 0],
        [4, 10 + 1.6, 0],
      ],
      'CYLINDRE',
      0.1,
    ),
    boltSeat: faceNear(place, [4.75, 0, 30], 'PLANE', 0.3),
    edge: axisNear(place, [4, 0, -fit.bladeDia / 2], 'CYLINDRE', 0.1),
  };
  return { shape, interfaces };
};

/** Fuel rail: extruded bar with 4 injector cups. */
export const buildFuelRail = (place: Placement, bank: 'R' | 'L'): BuiltPart => {
  const xs = (bank === 'R' ? boreXR : boreXL).map((x) => x);
  const x0 = xs[0]! - 20;
  const x1 = xs[3]! + 20;
  let rail = draw([x0, -9])
    .lineTo([x1, -9])
    .lineTo([x1, 9])
    .lineTo([x0, 9])
    .close()
    .sketchOnPlane('XY')
    .extrude(18);
  rail = rail.cut(makeCylinder(5, x1 - x0 - 10, [x0 + 5, 0, 9], [1, 0, 0]));
  const cupPts: Vec3[] = [];
  const tools: Shape3D[] = [];
  for (const x of xs) {
    tools.push(makeCylinder(7.01, 8, [x, 0, -0.01], [0, 0, 1]));
    cupPts.push([x + 7.01, 0, 3]);
  }
  const boltPts: Vec3[] = [];
  for (const x of bank === 'R' ? [120, 350] : [141.8, 371.8]) {
    tools.push(makeCylinder(3.3, 20, [x, 0, -1], [0, 0, 1]));
    // Z 16: above the fuel bore (r5 at z 9) that interrupts the hole wall.
    boltPts.push([x + 3.3, 0, 16]);
  }
  rail = rail.cutAll(tools);
  const shape = place.shape(rail);
  const interfaces: InterfaceDeclarations = {
    boltHole: axisGroupNear(place, boltPts, 'CYLINDRE', 0.1),
    boltSeat: faceNear(place, [x0 + 6, 0, 18], 'PLANE', 0.3),
    cup: axisGroupNear(place, cupPts, 'CYLINDRE', 0.1),
  };
  return { shape, interfaces };
};

/** Injector: revolved body with upper/lower o-ring lands Ø14. */
export const buildInjector = (place: Placement): BuiltPart => {
  const profile = draw([0, 0])
    .lineTo([6.99, 0])
    .lineTo([6.99, 7])
    .lineTo([8.5, 8])
    .lineTo([8.5, 34])
    .lineTo([6.99, 35])
    .lineTo([6.99, 42])
    .lineTo([0, 42])
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1]);
  const shape = place.shape(profile);
  const interfaces: InterfaceDeclarations = {
    lowerLand: axisNear(place, [6.99, 0, 3], 'CYLINDRE', 0.1),
    upperLand: axisNear(place, [6.99, 0, 39], 'CYLINDRE', 0.1),
  };
  return { shape, interfaces };
};

/** Injector o-ring: modeled at compressed nominal (torus). */
export const buildInjectorORing = (place: Placement): BuiltPart => {
  const ring = drawCircle(1.3)
    .translate(7 - 1.3, 0)
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1]);
  const shape = place.shape(ring);
  const interfaces: InterfaceDeclarations = {
    // Upper-outer quadrant: the revolve splits the torus into top/bottom
    // halves at the equators, so the equator itself matches both.
    gland: faceNear(
      place,
      [0, 7 - 1.3 + 1.3 * Math.SQRT1_2, 1.3 * Math.SQRT1_2],
      'TORUS',
      0.25,
    ),
  };
  return { shape, interfaces };
};

/** Thermostat: poppet cartridge Ø52 with a seat rim. */
export const buildThermostat = (place: Placement): BuiltPart => {
  let stat = makeCylinder(27.4, 3, [0, 0, 0], [-1, 0, 0]) as Shape3D;
  stat = stat.fuse(makeCylinder(22, 12, [0, 0, 0], [1, 0, 0]));
  stat = stat.fuse(makeCylinder(8, 8, [-8, 0, 0], [1, 0, 0]));
  const shape = place.shape(stat);
  const interfaces: InterfaceDeclarations = {
    seat: axisNear(place, [-1.5, 0, 27.4], 'CYLINDRE', 0.15),
  };
  return { shape, interfaces };
};

/** Thermostat housing: die-cast elbow with an outlet barb. */
export const buildThermostatHousing = (place: Placement): BuiltPart => {
  let housing = makeCylinder(34, 8, [0, 0, 0], [-1, 0, 0]) as Shape3D;
  housing = housing.fuse(makeCylinder(17.5, 40, [-6, 0, 0], [-1, 0, 0]));
  housing = housing.cut(makeCylinder(13, 48, [1, 0, 0], [-1, 0, 0]));
  const tools = [
    makeCylinder(3.3, 10, [1, 0, 30], [-1, 0, 0]),
    makeCylinder(3.3, 10, [1, 0, -30], [-1, 0, 0]),
  ];
  housing = housing.cutAll(tools);
  const shape = place.shape(housing);
  const interfaces: InterfaceDeclarations = {
    boltHole: axisGroupNear(
      place,
      [
        [-4, 3.3, 30],
        [-4, 3.3, -30],
      ],
      'CYLINDRE',
      0.1,
    ),
    // Beside the upper bolt hole (the hole itself pierces z 26.7..33.3).
    boltSeat: faceNear(place, [-8, 5, 30], 'PLANE', 0.3),
    manifoldJoint: faceNear(place, [0, 5, 30], 'PLANE', 0.12),
  };
  return { shape, interfaces };
};

export { Placement, threadBandDia };
