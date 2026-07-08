/**
 * Valvetrain drive (spec 3.6): camshaft with true three-arc lobes at their
 * firing phases, lifters, pushrods, rockers, studs, pivot balls, adjuster
 * nuts, thrust plate, and the timing gear pair with pitch-line lands.
 */
import {
  draw,
  drawCircle,
  drawPolysides,
  makeCylinder,
  makeSphere,
} from 'replicad';
import type { Shape3D } from 'replicad';
import type { InterfaceDeclarations } from '@taucad/runtime/kernels/replicad/annotations';
import { axisGroupNear, axisNear, datumAt, faceNear } from './annotate.js';
import { Placement } from './frame.js';
import type { Vec3 } from './frame.js';
import {
  cam as cp,
  gears,
  lifter as lp,
  mainX,
  tapHoleDia,
  threadBandDia,
  valve as vp,
} from './params.js';
import { allValveChains, lifterLength } from './kinematics.js';
import type { ValveChain } from './kinematics.js';
import type { BuiltPart } from './piston-group.js';

const noseCenter = 19;
const flankD = cp.flankR - cp.baseR;
const flankZ =
  (flankD * flankD + noseCenter * noseCenter - (cp.flankR - cp.noseR) ** 2) /
  (2 * noseCenter);
const flankY = Math.sqrt(flankD * flankD - flankZ * flankZ);

/** Lobe 2D profile with the nose along +z (drawing plane YZ). */
const lobeProfile = () => {
  const tb = (side: 1 | -1): [number, number] => [
    (-side * flankY * cp.baseR) / flankD,
    (-flankZ * cp.baseR) / flankD,
  ];
  const tn = (side: 1 | -1): [number, number] => {
    const f: [number, number] = [side * flankY, flankZ];
    const d = Math.hypot(-f[0], noseCenter - f[1]);
    return [
      f[0] + (-f[0] * cp.flankR) / d,
      f[1] + ((noseCenter - f[1]) * cp.flankR) / d,
    ];
  };
  const arcVia = (
    c: [number, number],
    r: number,
    a: [number, number],
    b: [number, number],
  ): [number, number] => {
    const angA = Math.atan2(a[0] - c[0], a[1] - c[1]);
    const angB = Math.atan2(b[0] - c[0], b[1] - c[1]);
    const mid = (angA + angB) / 2;
    return [c[0] + r * Math.sin(mid), c[1] + r * Math.cos(mid)];
  };
  const tbP = tb(1);
  const tbM = tb(-1);
  const tnP = tn(1);
  const tnM = tn(-1);
  // Base arc the long way round (via the bottom of the base circle).
  return draw([tbP[0], tbP[1]])
    .threePointsArcTo([tbM[0], tbM[1]], [0, -cp.baseR])
    .threePointsArcTo(
      [tnM[0], tnM[1]],
      arcVia([-flankY, flankZ], cp.flankR, tbM, tnM),
    )
    .threePointsArcTo(
      [tnP[0], tnP[1]],
      arcVia([0, noseCenter], cp.noseR, tnM, tnP),
    )
    .threePointsArcTo(
      [tbP[0], tbP[1]],
      arcVia([flankY, flankZ], cp.flankR, tnP, tbP),
    )
    .close();
};

/** World nose angle for a chain at the modeled phase (deg from +Z to +Y). */
export const noseAngle = (chain: ValveChain): number =>
  (chain.bank === 'R' ? 45 : -45) + chain.gamma;

/** Contact-arc index -> which lobe face carries the `lobe[v]` interface. */
const lobeContactProbe = (chain: ValveChain): Vec3 => {
  // Tangency point in the follower frame, then rotate to world about x.
  const g = (chain.gamma * Math.PI) / 180;
  const arcs: Array<{ c: [number, number]; r: number }> = [
    { c: [0, 0], r: cp.baseR },
    { c: [0, noseCenter], r: cp.noseR },
    { c: [flankY, flankZ], r: cp.flankR },
    { c: [-flankY, flankZ], r: cp.flankR },
  ];
  const arc = arcs[chain.contactArc]!;
  const cy = arc.c[0] * Math.cos(-g) - arc.c[1] * Math.sin(-g);
  const cz = arc.c[0] * Math.sin(-g) + arc.c[1] * Math.cos(-g);
  const rr = lp.footR + arc.r;
  const h =
    cz + Math.sqrt(rr * rr - (lp.axisOffset - cy) * (lp.axisOffset - cy));
  const ty = (lp.axisOffset - cy) / rr;
  const tz = (h - cz) / rr;
  let angle = Math.atan2(tz, ty);
  const norm = (a: number): number => {
    let d = a;
    while (d > Math.PI) {
      d -= 2 * Math.PI;
    }
    while (d < -Math.PI) {
      d += 2 * Math.PI;
    }
    return d;
  };
  const nudge = (3 * Math.PI) / 180;
  switch (chain.contactArc) {
    case 2:
    case 3: {
      // Low-lift flank contacts sit at the base-circle tangency seam, where
      // the probe would match both arc faces. Nudge deeper into the flank
      // (away from the base seam, which lies opposite the cam center).
      const diff = norm(angle - Math.atan2(-cz, -cy));
      angle += Math.sign(diff || 1) * nudge;
      break;
    }
    case 1: {
      // Nose contacts near a nose-flank seam: nudge away along the nose arc.
      for (const k of [2, 3] as const) {
        const fc = arcs[k]!.c;
        const fy = fc[0] * Math.cos(-g) - fc[1] * Math.sin(-g);
        const fz = fc[0] * Math.sin(-g) + fc[1] * Math.cos(-g);
        const seam = Math.atan2(cz - fz, cy - fy);
        const diff = norm(angle - seam);
        if (Math.abs(diff) < (10 * Math.PI) / 180) {
          angle = seam + (Math.sign(diff || 1) * (10 * Math.PI)) / 180;
        }
      }
      break;
    }
    case 0: {
      // Base contacts just before a flank hand-off also graze a seam: the
      // seam on the base circle lies toward each (rotated) flank center.
      for (const k of [2, 3] as const) {
        const fc = arcs[k]!.c;
        const fy = fc[0] * Math.cos(-g) - fc[1] * Math.sin(-g);
        const fz = fc[0] * Math.sin(-g) + fc[1] * Math.cos(-g);
        const diff = norm(angle - Math.atan2(fz, fy));
        if (Math.abs(diff) < (5 * Math.PI) / 180) {
          angle =
            Math.atan2(fz, fy) + (Math.sign(diff || 1) * (5 * Math.PI)) / 180;
        }
      }
      break;
    }
    default: {
      break;
    }
  }
  const point: [number, number] = [
    cy + arc.r * Math.cos(angle),
    cz + arc.r * Math.sin(angle),
  ];
  // Rotate from the follower frame (follower dir = +z) to world: the
  // follower direction sits at bankAngleDeg from +Z.
  const bankAngle = ((chain.bank === 'R' ? 45 : -45) * Math.PI) / 180;
  const wy = point[0] * Math.cos(bankAngle) + point[1] * Math.sin(bankAngle);
  const wz = -point[0] * Math.sin(bankAngle) + point[1] * Math.cos(bankAngle);
  return [chain.x, wy, wz];
};

/** Camshaft: revolved core/journals/nose + 16 phased extruded lobes. */
export const buildCamshaft = (place: Placement): BuiltPart => {
  const revolved = draw([-24, 0])
    .lineTo([-24, cp.noseSpigotDia / 2])
    .lineTo([-16, cp.noseSpigotDia / 2])
    .lineTo([-16, 26])
    .lineTo([14, 26])
    .lineTo([14, 31])
    .lineTo([20, 31])
    .lineTo([20, 15])
    .lineTo([495, 15])
    .lineTo([495, 19])
    .lineTo([505, 19])
    .lineTo([505, 0])
    .close()
    .sketchOnPlane('XZ')
    .revolve([1, 0, 0]);
  const journals: Shape3D[] = mainX.map((x) =>
    makeCylinder(
      cp.journalDia / 2,
      cp.journalWidth,
      [x - cp.journalWidth / 2, 0, 0],
      [1, 0, 0],
    ),
  );
  const chains = allValveChains();
  const lobes: Shape3D[] = chains.map((chain) => {
    const lobe = lobeProfile()
      .sketchOnPlane('YZ')
      .extrude(cp.lobeWidth)
      .translate([chain.x - cp.lobeWidth / 2, 0, 0]) as Shape3D;
    return lobe.rotate(-noseAngle(chain), [chain.x, 0, 0], [1, 0, 0]);
  });
  let cam = revolved;
  for (const solid of [...journals, ...lobes]) {
    cam = cam.fuse(solid);
  }
  // 3x M8 gear taps on Ø44 BC in the nose hub face.
  const tapPts: Vec3[] = [0, 120, 240].map((deg) => {
    const t = (deg * Math.PI) / 180;
    return [-16, 22 * Math.cos(t), 22 * Math.sin(t)] as Vec3;
  });
  cam = cam.cutAll(
    tapPts.map((p) =>
      makeCylinder(tapHoleDia(8) / 2, 16, [p[0] - 0.01, p[1], p[2]], [1, 0, 0]),
    ),
  );

  const shape = place.shape(cam);
  const interfaces: InterfaceDeclarations = {
    centerline: datumAt(place, [0, 0, 0], [0, 0, 1], [1, 0, 0]),
    gearTap: axisGroupNear(
      place,
      tapPts.map((p) => [-8, p[1] - tapHoleDia(8) / 2, p[2]] as Vec3),
      'CYLINDRE',
      0.1,
    ),
    journal: axisGroupNear(
      place,
      mainX.map((x) => [x, 0, -cp.journalDia / 2] as Vec3),
      'CYLINDRE',
      0.12,
    ),
    lobe: axisGroupNear(
      place,
      chains.map((chain) => lobeContactProbe(chain)),
      'CYLINDRE',
      0.1,
    ),
    noseSpigot: axisNear(
      place,
      [-20, 0, cp.noseSpigotDia / 2],
      'CYLINDRE',
      0.1,
    ),
    thrustCollar: faceNear(place, [14, 0, 28.5], 'PLANE', 0.1),
  };
  return { shape, interfaces };
};

/** Foot-sphere sag over the Ø22 rim; cup sphere centre height (local). */
const footSagLocal = 700 - Math.sqrt(700 * 700 - (lp.dia / 2) ** 2);
export const lifterCupLocalZ =
  footSagLocal + lifterLength - lp.cupDepth + lp.cupR;

/** Lifter: revolve — R700 crowned foot, Ø22 body, R5 pushrod cup. */
export const buildLifter = (place: Placement): BuiltPart => {
  const bodyR = lp.dia / 2;
  const sag = footSagLocal;
  const L = sag + lifterLength;
  const cupRim = Math.sqrt(lp.cupR ** 2 - 1);
  const profile = draw([0, 0])
    .threePointsArcTo(
      [bodyR, sag],
      [bodyR / 2, 700 - Math.sqrt(700 * 700 - (bodyR / 2) ** 2)],
    )
    .lineTo([bodyR, L])
    .lineTo([cupRim, L])
    .threePointsArcTo(
      [0, L - lp.cupDepth],
      [
        Math.sqrt(lp.cupR ** 2 - (lp.cupR - 2) ** 2) * 0 + 3,
        L + 1 - Math.sqrt(25 - 9),
      ],
    )
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1]);
  const shape = place.shape(profile);
  const interfaces: InterfaceDeclarations = {
    body: axisNear(place, [bodyR, 0, L / 2], 'CYLINDRE', 0.1),
    cup: faceNear(place, [3, 0, L + 1 - Math.sqrt(25 - 9)], 'SPHERE', 0.1),
    foot: faceNear(place, [0, 0, 0], 'SPHERE', 0.1),
  };
  return { shape, interfaces };
};

/** Pushrod: capsule Ø9.5 with R4.75 ball ends and an oil-through bore. */
export const buildPushrod = (place: Placement): BuiltPart => {
  const r = vp.pushrodBallR;
  const ballSpan = vp.pushrodLen - 0.5; // Ball-centre distance 199.5.
  const profile = draw([0, -r])
    .threePointsArcTo([r, 0], [r * Math.SQRT1_2, -r * Math.SQRT1_2])
    .lineTo([r, ballSpan])
    .threePointsArcTo(
      [0, ballSpan + r],
      [r * Math.SQRT1_2, ballSpan + r * Math.SQRT1_2],
    )
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1]);
  const shape = place.shape(
    profile.cut(
      makeCylinder(1.5, ballSpan + 2 * r + 2, [0, 0, -r - 1], [0, 0, 1]),
    ),
  );
  const interfaces: InterfaceDeclarations = {
    lifterBall: faceNear(place, [r, 0, -1], 'SPHERE', 0.4),
    rockerBall: faceNear(place, [r, 0, ballSpan + 1], 'SPHERE', 0.4),
  };
  return { shape, interfaces };
};

/**
 * Rocker arm: bar body with a pallet sphere (R20) toward the valve, a cup
 * pocket (R5) toward the pushrod, and a pivot socket (R8) on top.
 * Local frame: pivot ball centre at the ORIGIN; pallet along +x at
 * (palletArm, 0, -6); cup at (-cupArm, 0, -11.25).
 */
export const rockerLayout = {
  palletCenter: [vp.rockerPalletArm, 0, -6] as Vec3,
  cupCenter: [-vp.rockerCupArm, 0, -11.25] as Vec3,
} as const;

export const buildRockerArm = (place: Placement): BuiltPart => {
  const body = draw([-vp.rockerCupArm - 8, -8])
    .lineTo([vp.rockerPalletArm + 8, -8])
    .lineTo([vp.rockerPalletArm + 8, 4])
    .lineTo([-vp.rockerCupArm - 8, 4])
    .close()
    .sketchOnPlane('XZ')
    .extrude(16)
    // The XZ sketch extrudes toward -y; +8 centers the bar on y = 0.
    .translate([0, 8, 0]) as Shape3D;
  const pallet = makeSphere(20).translate([vp.rockerPalletArm, 0, 12]);
  let rocker = body.fuse(pallet as Shape3D);
  // Pushrod cup pocket: sphere R5 centred 1 above the underside.
  rocker = rocker.cut(
    makeSphere(5).translate(rockerLayout.cupCenter) as Shape3D,
  );
  // Pivot socket: sphere R8 centred at the origin, open to the top.
  rocker = rocker.cut(makeSphere(8) as Shape3D);
  // Stud slot through the body.
  rocker = rocker.cut(makeCylinder(5.6, 30, [0, 0, -12], [0, 0, 1]));
  const shape = place.shape(rocker);
  // Probes sit on the exposed band of each sphere: the cup dimple only
  // spans z -8..-6.25, the socket pole is removed by the stud slot, and the
  // pallet pole is tangent to the underside plane.
  const interfaces: InterfaceDeclarations = {
    cup: faceNear(
      place,
      [
        rockerLayout.cupCenter[0] +
          Math.sqrt(25 - (-7 - rockerLayout.cupCenter[2]) ** 2),
        0,
        -7,
      ],
      'SPHERE',
      0.3,
    ),
    pallet: faceNear(
      place,
      [vp.rockerPalletArm + 15, 0, 12 - Math.sqrt(400 - 225)],
      'SPHERE',
      0.3,
    ),
    pivotSocket: faceNear(place, [Math.sqrt(64 - 16), 0, -4], 'SPHERE', 0.3),
  };
  return { shape, interfaces };
};

/** Rocker pivot ball: sphere R8 with a stud bore and a flat top. */
export const buildPivotBall = (place: Placement): BuiltPart => {
  const ball = (makeSphere(8) as Shape3D)
    .cut(makeCylinder(5.1, 20, [0, 0, -10], [0, 0, 1]))
    .cut(makeCylinder(9, 4, [0, 0, 5], [0, 0, 1]));
  const shape = place.shape(ball);
  const interfaces: InterfaceDeclarations = {
    // Equator point; the Ø10.2 stud bore removes both pole caps.
    sphere: faceNear(place, [8, 0, 0], 'SPHERE', 0.3),
    topFace: faceNear(place, [6, 0, 5], 'PLANE', 0.12),
  };
  return { shape, interfaces };
};

/** Rocker stud: lower M10x1.5 band, shoulder, upper M10x1.0 band. */
export const buildRockerStud = (place: Placement): BuiltPart => {
  const lower = threadBandDia(10) / 2;
  const profile = draw([0, -22])
    .lineTo([lower - 0.6, -22])
    .lineTo([lower, -21.4])
    .lineTo([lower, -2])
    .lineTo([5.5, -2])
    .lineTo([5.5, 2])
    .lineTo([4.95, 2])
    .lineTo([4.95, 42])
    .lineTo([0, 42])
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1]);
  const shape = place.shape(profile);
  const interfaces: InterfaceDeclarations = {
    headThread: axisNear(place, [lower, 0, -12], 'CYLINDRE', 0.1),
  };
  return { shape, interfaces };
};

/** Adjuster nut: hex with a spherical clamp face seat. */
export const buildAdjusterNut = (place: Placement): BuiltPart => {
  const hex = drawPolysides(16 / Math.sqrt(3), 6)
    .sketchOnPlane('XY')
    .extrude(10);
  const shape = place.shape(
    hex.cut(makeCylinder(4.53, 12, [0, 0, -1], [0, 0, 1])),
  );
  const interfaces: InterfaceDeclarations = {
    clampFace: faceNear(place, [6, 0, 0], 'PLANE', 0.12),
  };
  return { shape, interfaces };
};

/** Cam thrust plate: C45 plate with the cam nose slot and 2 bolt holes. */
export const buildThrustPlate = (place: Placement): BuiltPart => {
  const plate = draw([-38, -38])
    .lineTo([38, -38])
    .lineTo([38, 38])
    .lineTo([-38, 38])
    .close()
    .sketchOnPlane('YZ')
    .extrude(5);
  const shape = place.shape(
    plate
      .cut(makeCylinder(15.5, 7, [-1, 0, 0], [1, 0, 0]))
      .cut(makeCylinder(3.3, 7, [-1, 30, 20], [1, 0, 0]))
      .cut(makeCylinder(3.3, 7, [-1, -30, 20], [1, 0, 0])),
  );
  const interfaces: InterfaceDeclarations = {
    blockJoint: faceNear(place, [5, 0, -30], 'PLANE', 0.1),
    camFaces: faceNear(place, [0, 0, -25], 'PLANE', 0.1),
  };
  return { shape, interfaces };
};

/** Timing gear: tooth ring + pitch-line witness land + web and bore. */
const buildGear = (
  place: Placement,
  options: {
    teeth: number;
    pitchR: number;
    boreR: number;
    landSide: 1 | -1;
    boltBC?: number;
    pilotR?: number;
  },
): BuiltPart => {
  const { module } = gears;
  const tipR = options.pitchR + module;
  const rootR = options.pitchR - 1.25 * module;
  // Tooth ring: simplified trapezoidal teeth with backlash-thinned flanks.
  let ring = drawCircle(rootR + 0.1);
  const toothAngle = 360 / options.teeth;
  for (let index = 0; index < options.teeth; index++) {
    const a = index * toothAngle;
    const halfRoot = (toothAngle / 2) * 0.46;
    const halfTip = (toothAngle / 2) * 0.22;
    const rad = (v: number): number => (v * Math.PI) / 180;
    const tooth = draw([
      rootR * Math.sin(rad(a - halfRoot)),
      rootR * Math.cos(rad(a - halfRoot)),
    ])
      .lineTo([
        tipR * Math.sin(rad(a - halfTip)),
        tipR * Math.cos(rad(a - halfTip)),
      ])
      .lineTo([
        tipR * Math.sin(rad(a + halfTip)),
        tipR * Math.cos(rad(a + halfTip)),
      ])
      .lineTo([
        rootR * Math.sin(rad(a + halfRoot)),
        rootR * Math.cos(rad(a + halfRoot)),
      ])
      .close();
    ring = ring.fuse(tooth);
  }
  let gear = ring.sketchOnPlane('YZ').extrude(gears.width);
  // Pitch-line witness land: a 4-wide cylindrical band at exactly pitch R.
  const land = makeCylinder(
    options.pitchR,
    4,
    [options.landSide === 1 ? gears.width : -4, 0, 0],
    [1, 0, 0],
  );
  gear = gear.fuse(land);
  gear = gear.cut(
    makeCylinder(options.boreR, gears.width + 10, [-5, 0, 0], [1, 0, 0]),
  );
  if (options.pilotR) {
    // Recess opens toward the cam (rear face) to register the nose spigot.
    gear = gear.cut(
      makeCylinder(options.pilotR, 4.01, [gears.width - 4, 0, 0], [1, 0, 0]),
    );
  }
  const boltHoles: Vec3[] = [];
  if (options.boltBC) {
    const tools: Shape3D[] = [];
    for (const deg of [0, 120, 240]) {
      const t = (deg * Math.PI) / 180;
      const y = (options.boltBC / 2) * Math.cos(t);
      const z = (options.boltBC / 2) * Math.sin(t);
      tools.push(makeCylinder(4.25, gears.width + 10, [-5, y, z], [1, 0, 0]));
      boltHoles.push([gears.width / 2, y + 4.25, z]);
    }
    gear = gear.cutAll(tools);
  }
  const shape = place.shape(gear);
  const interfaces: InterfaceDeclarations = {
    bore: axisNear(place, [gears.width / 2, 0, options.boreR], 'CYLINDRE', 0.1),
    pitchSurface: axisNear(
      place,
      [options.landSide === 1 ? gears.width + 2 : -2, 0, options.pitchR],
      'CYLINDRE',
      0.1,
    ),
    ...(options.pilotR
      ? {
          pilotRecess: axisNear(
            place,
            [gears.width - 2, 0, options.pilotR],
            'CYLINDRE',
            0.1,
          ),
          hubFace: faceNear(
            place,
            [
              options.landSide === 1 ? 0 : -4,
              0,
              (options.boreR + options.pitchR) / 2,
            ],
            'PLANE',
            0.1,
          ),
        }
      : {}),
    ...(options.boltBC
      ? { boltHole: axisGroupNear(place, boltHoles, 'CYLINDRE', 0.1) }
      : {}),
  };
  return { shape, interfaces };
};

export const buildCrankGear = (place: Placement): BuiltPart =>
  buildGear(place, {
    teeth: gears.crankTeeth,
    pitchR: gears.crankPitchR,
    boreR: 24,
    landSide: -1,
  });

export const buildCamGear = (place: Placement): BuiltPart =>
  buildGear(place, {
    teeth: gears.camTeeth,
    pitchR: gears.camPitchR,
    boreR: 13,
    landSide: -1,
    boltBC: gears.camBoltBC,
    pilotR: cp.noseSpigotDia / 2,
  });

export { Placement, allValveChains };
