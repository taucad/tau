/**
 * Full V8 assembly (spec Section 4): exactly the 650 T-CENSUS occurrences,
 * placed at the modeled phase (crank 0 = cyl 1 TDC compression) with exact
 * fits, contacts, and the solved valvetrain kinematics.
 */
import type { InterfaceDeclarations } from '@taucad/runtime/kernels/replicad/annotations';
import { draw, makeCylinder, type Shape3D } from 'replicad';
import { Placement, vecNorm, type Vec3 } from './frame.js';
import {
  bankPoint,
  bankStagger,
  boreX,
  crank as ckp,
  deckHeight,
  gasketT,
  head as hp,
  mainX,
  pinDirection,
  pistonS,
  crankpinX,
  throw_,
  valve as vp,
  camAxisZ,
} from './params.js';
import {
  allValveChains,
  solveRockerChain,
  valveTipT,
  headDeckS,
  camCenterS,
  lifterAxisA,
} from './kinematics.js';
import {
  buildBlock,
  capGeo,
  rearFaceX,
  sensorBore,
  sensorBoss,
} from './block.js';
import {
  buildCylinderHead,
  buildHeadGasket,
  headPlacement,
  deckMap,
  intakeTapX,
  exPortZ,
  plugTipOf,
  plugDir,
  plugSeatT,
} from './head.js';
import {
  buildCirclip,
  buildOilExpander,
  buildOilRail,
  buildPiston,
  buildSecondRing,
  buildTopRing,
  buildWristPin,
} from './piston-group.js';
import type { BuiltPart } from './piston-group.js';
import {
  buildConnectingRod,
  buildRodCap,
  buildRodShell,
  buildShell,
  buildSmallEndBushing,
  rodBoltPart,
  rodBoltSeatZ,
  rodBoltY,
  notchX,
} from './rod.js';
import { buildCrankshaft } from './crank.js';
import {
  buildAdjusterNut,
  buildCamGear,
  buildCamshaft,
  buildCrankGear,
  buildLifter,
  buildPivotBall,
  buildPushrod,
  buildRockerArm,
  buildRockerStud,
  buildThrustPlate,
  rockerLayout,
  lifterCupLocalZ,
} from './valvetrain.js';
import {
  buildKeeper,
  buildRetainer,
  buildSparkPlug,
  buildStemSeal,
  buildValve,
  buildValveGuide,
  buildValveSeat,
  buildValveSpring,
  retainerCone,
  valveSpec,
} from './valve-parts.js';
import {
  buildCamBearing,
  buildCorePlug,
  buildCrankKey,
  buildDamperElastomer,
  buildDamperHub,
  buildDamperWasher,
  buildDowel,
  buildFlywheel,
  buildInertiaRing,
  buildPilotBushing,
  buildReluctor,
  buildRingGear,
} from './cranktrain.js';
import {
  buildBolt,
  buildNut,
  buildPlug,
  buildStud,
  buildWasher,
  hexAf,
} from './fasteners.js';
import {
  buildFrontCover,
  buildImpeller,
  buildMainSeal,
  buildOilPan,
  buildOilPickup,
  buildPumpCover,
  buildPumpPulley,
  buildPumpRotor,
  buildRailGasket,
  buildRearSealHousing,
  buildReliefPiston,
  buildReliefSpring,
  buildValveCover,
  buildWaterPumpHousing,
  buildWaterPumpShaft,
  frontCover,
} from './covers.js';
import {
  buildFuelRail,
  buildInjector,
  buildInjectorORing,
  buildIntakeManifold,
  buildThermostat,
  buildThermostatHousing,
  buildThrottleBlade,
  buildThrottleBody,
  buildThrottleShaft,
  manifoldFlangeA,
  plenum,
  runnerMouthS,
} from './induction.js';
import {
  buildExhaustGasket,
  buildExhaustHeader,
  buildExhaustNut,
  buildExhaustStud,
} from './exhaust.js';
import { axisNear, faceNear, axisGroupNear, groupNear } from './annotate.js';

const c = Math.SQRT1_2;

/** Rodrigues rotation of a point about an axis line (degrees). */
const rotatePointAbout = (
  p: Vec3,
  origin: Vec3,
  direction: Vec3,
  degrees: number,
): Vec3 => {
  const r = (degrees * Math.PI) / 180;
  const cA = Math.cos(r);
  const sA = Math.sin(r);
  const n = Math.hypot(direction[0], direction[1], direction[2]);
  const k: Vec3 = [direction[0] / n, direction[1] / n, direction[2] / n];
  const vv: Vec3 = [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
  const kv = k[0] * vv[0] + k[1] * vv[1] + k[2] * vv[2];
  const cr: Vec3 = [
    k[1] * vv[2] - k[2] * vv[1],
    k[2] * vv[0] - k[0] * vv[2],
    k[0] * vv[1] - k[1] * vv[0],
  ];
  return [
    origin[0] + vv[0] * cA + cr[0] * sA + k[0] * kv * (1 - cA),
    origin[1] + vv[1] * cA + cr[1] * sA + k[1] * kv * (1 - cA),
    origin[2] + vv[2] * cA + cr[2] * sA + k[2] * kv * (1 - cA),
  ];
};

export type Entry = {
  shape: Shape3D;
  name: string;
  interfaces?: InterfaceDeclarations;
  color?: string;
  density?: number;
};

const named = (
  name: string,
  part: BuiltPart,
  color?: string,
  density?: number,
): Entry => ({
  shape: part.shape,
  name,
  interfaces: part.interfaces,
  ...(color ? { color } : {}),
  ...(density ? { density } : {}),
});

/** Align local +z to `dir` (unit) via one rotateAxis op. */
const alignZ = (dir: Vec3): Placement => {
  const z: Vec3 = [0, 0, 1];
  const dot = z[0] * dir[0] + z[1] * dir[1] + z[2] * dir[2];
  if (dot > 1 - 1e-12) {
    return Placement.identity;
  }
  if (dot < -1 + 1e-12) {
    return Placement.rotate('x', 180);
  }
  const axis: Vec3 = [
    z[1] * dir[2] - z[2] * dir[1],
    z[2] * dir[0] - z[0] * dir[2],
    z[0] * dir[1] - z[1] * dir[0],
  ];
  const angle = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
  return Placement.identity.rotateAxis([0, 0, 0], axis, angle);
};

/** Bank axis unit vectors. */
const bankU = (bank: 'R' | 'L'): Vec3 =>
  bank === 'R' ? [0, c, c] : [0, -c, c];
const bankV = (bank: 'R' | 'L'): Vec3 =>
  bank === 'R' ? [0, c, -c] : [0, -c, -c];

export const buildEngine = (withProbes: boolean): Entry[] => {
  const entries: Entry[] = [];
  const push = (
    name: string,
    part: BuiltPart,
    color?: string,
    density?: number,
  ): void => {
    entries.push(named(name, part, color, density));
  };

  // --- Block & structure ---
  push('Block 1', buildBlock(Placement.identity), '#79808a', 7.2);
  for (let main = 1; main <= 5; main++) {
    const x = mainX[main - 1]!;
    push(
      `Main Bearing Cap ${main}`,
      buildMainCap(Placement.translate(x, 0, 0)),
      '#6d747c',
    );
    for (const side of [1, 2] as const) {
      const boltIndex = 2 * (main - 1) + side;
      const y = side === 1 ? -capGeo.boltY : capGeo.boltY;
      push(
        `Main Cap Bolt ${boltIndex}`,
        buildBolt(
          Placement.rotate('x', 180).compose(
            Placement.translate(x, y, -capGeo.height + 6),
          ),
          {
            d: 12,
            length: 90 - 18,
            threadLength: 34,
            af: 18,
            headHeight: 10,
          },
        ),
        '#4a4f55',
      );
    }
    push(
      `Main Bearing Upper Shell ${main}`,
      buildShell(Placement.translate(x, 0, 0), {
        idR: 64.045 / 2,
        odR: 34.025,
        width: 21,
        half: 'upper',
        oilHole: true,
        flanged: main === 3,
        tangX: notchX.upper,
        lugY: capGeo.notchY,
      }),
      '#c8b89a',
    );
    push(
      `Main Bearing Lower Shell ${main}`,
      buildShell(Placement.translate(x, 0, 0), {
        idR: 64.045 / 2,
        odR: 34.025,
        width: 21,
        half: 'lower',
        flanged: main === 3,
        tangX: notchX.lower,
        lugY: capGeo.notchY,
      }),
      '#c8b89a',
    );
    push(
      `Camshaft Bearing ${main}`,
      buildCamBearing(Placement.translate(x, 0, camAxisZ)),
      '#b8a888',
    );
  }
  // Core plugs: 4 per bank on the outer walls.
  let plugIndex = 1;
  for (const bank of ['R', 'L'] as const) {
    for (const x of bank === 'R'
      ? [80, 191, 302, 413]
      : [101.8, 212.8, 323.8, 434.8]) {
      const entry = bankPoint(bank, x, 71, 150);
      const outward = bankV(bank);
      push(
        `Core Plug ${plugIndex}`,
        buildCorePlug(
          alignZ(outward).compose(
            Placement.translate(entry[0], entry[1], entry[2]),
          ),
        ),
        '#8b9199',
      );
      plugIndex += 1;
    }
  }
  for (let dowel = 1; dowel <= 4; dowel++) {
    const bank = dowel <= 2 ? 'R' : 'L';
    const map = deckMap.dowels[(dowel - 1) % 2]!;
    const x = bank === 'R' ? map.x : map.x + bankStagger;
    const base = bankPoint(
      bank,
      x,
      bank === 'R' ? map.y : map.y,
      deckHeight - 11,
    );
    push(
      `Head Dowel ${dowel}`,
      buildDowel(
        alignZ(bankU(bank)).compose(
          Placement.translate(base[0], base[1], base[2]),
        ),
      ),
      '#555',
    );
  }
  for (const dowel of [1, 2]) {
    const y = dowel === 1 ? 165 : -165;
    push(
      `Bellhousing Dowel ${dowel}`,
      buildDowel(
        alignZ([1, 0, 0]).compose(Placement.translate(rearFaceX - 12, y, 0)),
      ),
      '#555',
    );
  }
  // Gallery plugs: 1 M16 rear main + 4 M12 lifter gallery ends.
  push(
    'Oil Gallery Plug 1',
    buildPlug(
      alignZ([-1, 0, 0]).compose(Placement.translate(rearFaceX, 0, 60)),
      { d: 16, length: 12 },
    ),
    '#666',
  );
  const lifterGalleryPoint = (bank: 'R' | 'L'): Vec3 =>
    bankPoint(bank, 0, lifterAxisA, camCenterS + 45);
  let galleryPlug = 2;
  for (const bank of ['R', 'L'] as const) {
    const [gy, gz] = [lifterGalleryPoint(bank)[1], lifterGalleryPoint(bank)[2]];
    push(
      `Oil Gallery Plug ${galleryPlug}`,
      buildPlug(alignZ([1, 0, 0]).compose(Placement.translate(0, gy, gz)), {
        d: 12,
        length: 10,
      }),
      '#666',
    );
    galleryPlug += 1;
    push(
      `Oil Gallery Plug ${galleryPlug}`,
      buildPlug(
        alignZ([-1, 0, 0]).compose(Placement.translate(rearFaceX, gy, gz)),
        { d: 12, length: 10 },
      ),
      '#666',
    );
    galleryPlug += 1;
  }

  // --- Cranktrain ---
  const crankPlace = Placement.rotate('x', ckp.fillet * 0 - 45);
  push('Crankshaft 1', buildCrankshaft(crankPlace), '#6f7378', 7.85);
  push('Crank Key 1', buildCrankKey(crankPlace), '#777');
  push(
    'Crank Timing Gear 1',
    buildCrankGear(Placement.translate(-34, 0, 0)),
    '#8a8f96',
  );
  push(
    'Damper Hub 1',
    buildDamperHub(Placement.translate(-36, 0, 0)),
    '#787d84',
  );
  push(
    'Damper Elastomer 1',
    buildDamperElastomer(Placement.translate(-36, 0, 0)),
    '#333',
  );
  push(
    'Damper Inertia Ring 1',
    buildInertiaRing(Placement.translate(-36, 0, 0)),
    '#4d5157',
  );
  push(
    'Damper Bolt 1',
    buildBolt(
      Placement.rotate('y', -90).compose(Placement.translate(-63, 0, 0)),
      {
        d: 16,
        length: 45,
        threadLength: 32,
        af: 24,
        headHeight: 12,
      },
    ),
    '#4a4f55',
  );
  push(
    'Damper Washer 1',
    buildDamperWasher(
      Placement.rotate('y', 0).compose(Placement.translate(-58, 0, 0)),
    ),
    '#555',
  );
  push('Flywheel 1', buildFlywheel(Placement.translate(554, 0, 0)), '#5d6167');
  for (let bolt = 1; bolt <= 8; bolt++) {
    const t = ((bolt - 1) * 45 * Math.PI) / 180;
    push(
      `Flywheel Bolt ${bolt}`,
      buildBolt(
        Placement.rotate('y', 90).compose(
          Placement.translate(568, 50 * Math.sin(t), 50 * Math.cos(t)),
        ),
        {
          d: 10,
          length: 22,
          threadLength: 16,
          af: 16,
          headHeight: 8,
        },
      ),
      '#4a4f55',
    );
  }
  push('Ring Gear 1', buildRingGear(Placement.translate(554, 0, 0)), '#777');
  push(
    'Pilot Bushing 1',
    buildPilotBushing(Placement.translate(562, 0, 0)),
    '#a8763f',
  );
  push(
    'Reluctor Ring 1',
    buildReluctor(Placement.translate(530, 0, 0)),
    '#666',
  );
  push(
    'Front Main Seal 1',
    buildMainSeal(Placement.translate(-40, 0, 0), 'front'),
    '#222',
  );
  push(
    'Rear Main Seal 1',
    buildMainSeal(Placement.translate(519.7, 0, 0), 'rear'),
    '#222',
  );
  push(
    'Rear Seal Housing 1',
    buildRearSealHousing(Placement.translate(516.7, 0, 0)),
    '#9aa1a8',
  );
  for (let bolt = 1; bolt <= 6; bolt++) {
    const t = ((bolt - 1) * 60 * Math.PI) / 180;
    push(
      `Rear Seal Housing Bolt ${bolt}`,
      buildBolt(
        Placement.rotate('y', 90).compose(
          Placement.translate(516.7 + 12, 60 * Math.cos(t), 60 * Math.sin(t)),
        ),
        {
          d: 6,
          length: 16,
          threadLength: 12,
          af: 10,
          headHeight: 5,
        },
      ),
      '#4a4f55',
    );
  }
  push(
    'Rear Seal Housing Gasket 1',
    buildRailGasket(
      Placement.rotate('y', 90)
        .compose(Placement.rotate('z', 90))
        .compose(Placement.translate(rearFaceX, 0, 0)),
      {
        x0: -75,
        x1: 75,
        y0: -75,
        y1: 75,
        t: gasketT.rearHousing,
        holes: [],
        windowInset: 24,
      },
    ),
    '#8f959c',
  );

  // --- Piston group + rods ---
  for (let cyl = 1; cyl <= 8; cyl++) {
    const bank = cyl <= 4 ? 'R' : 'L';
    const s = pistonS(cyl);
    const p = bankPoint(bank, boreX(cyl), 0, s);
    const pistonPlace = Placement.rotate('x', bank === 'R' ? -45 : 45).compose(
      Placement.translate(p[0], p[1], p[2]),
    );
    push(
      `Piston ${cyl}`,
      buildPiston(pistonPlace, bank === 'L'),
      '#c8ccd0',
      2.7,
    );
    push(`Wrist Pin ${cyl}`, buildWristPin(pistonPlace), '#888');
    push(`Pin Circlip ${2 * cyl - 1}`, buildCirclip(pistonPlace, -1), '#999');
    push(`Pin Circlip ${2 * cyl}`, buildCirclip(pistonPlace, 1), '#999');
    push(`Top Ring ${cyl}`, buildTopRing(pistonPlace), '#aaa');
    push(`Second Ring ${cyl}`, buildSecondRing(pistonPlace), '#999');
    push(
      `Oil Ring Upper Rail ${cyl}`,
      buildOilRail(pistonPlace, 'upper'),
      '#bbb',
    );
    push(
      `Oil Ring Lower Rail ${cyl}`,
      buildOilRail(pistonPlace, 'lower'),
      '#bbb',
    );
    push(`Oil Ring Expander ${cyl}`, buildOilExpander(pistonPlace), '#8b8f94');

    // Rod: from the crankpin to the piston pin.
    const pin = ((cyl - 1) % 4) + 1;
    const [py, pz] = pinDirection(pin);
    const pinCenter: Vec3 = [crankpinX[pin - 1]!, throw_ * py, throw_ * pz];
    const pinTop: Vec3 = [p[0], p[1], p[2]];
    const d: Vec3 = [0, pinTop[1] - pinCenter[1], pinTop[2] - pinCenter[2]];
    const tilt = (Math.atan2(-d[1], d[2]) * 180) / Math.PI;
    const rodX = crankpinX[pin - 1]! + (bank === 'R' ? -10.9 : 10.9);
    const rodPlace = Placement.rotate('x', -tilt).compose(
      Placement.translate(rodX, pinCenter[1], pinCenter[2]),
    );
    push(
      `Connecting Rod ${cyl}`,
      buildConnectingRod(rodPlace),
      '#8a8f98',
      7.85,
    );
    push(`Rod Cap ${cyl}`, buildRodCap(rodPlace), '#8a8f98');
    for (const side of [1, 2] as const) {
      const y = side === 1 ? -rodBoltY : rodBoltY;
      push(
        `Rod Bolt ${2 * (cyl - 1) + side}`,
        rodBoltPart(
          Placement.rotate('x', 180)
            .compose(Placement.translate(0, y, rodBoltSeatZ))
            .compose(rodPlace),
        ),
        '#4a4f55',
      );
    }
    push(
      `Rod Bearing Upper Shell ${cyl}`,
      buildRodShell(rodPlace, 'upper'),
      '#c8b89a',
    );
    push(
      `Rod Bearing Lower Shell ${cyl}`,
      buildRodShell(rodPlace, 'lower'),
      '#c8b89a',
    );
    push(
      `Small End Bushing ${cyl}`,
      buildSmallEndBushing(Placement.translate(0, 0, 152).compose(rodPlace)),
      '#a8763f',
    );
  }

  // --- Heads, gaskets, head bolts, valves ---
  const headPlaceOf = (bank: 'R' | 'L') => headPlacement(bank, headDeckS);
  const gasketPlaceOf = (bank: 'R' | 'L') => headPlacement(bank, deckHeight);
  push('Cylinder Head R', buildCylinderHead(headPlaceOf('R')), '#b9bec4', 2.7);
  push('Cylinder Head L', buildCylinderHead(headPlaceOf('L')), '#b9bec4', 2.7);
  push('Head Gasket R', buildHeadGasket(gasketPlaceOf('R')), '#9aa2ab');
  push('Head Gasket L', buildHeadGasket(gasketPlaceOf('L')), '#9aa2ab');
  for (let bolt = 1; bolt <= 20; bolt++) {
    const bank = bolt <= 10 ? 'R' : 'L';
    const hole = deckMap.bolts[(bolt - 1) % 10]!;
    const seat = headPlaceOf(bank).pt([hole.x, hole.y, 84.85]);
    const up = bankU(bank);
    push(
      `Head Bolt ${bolt}`,
      buildBolt(
        alignZ(up).compose(Placement.translate(seat[0], seat[1], seat[2])),
        {
          d: 11,
          length: 110,
          threadLength: 28,
          af: 17,
          headHeight: 11,
        },
      ),
      '#4a4f55',
    );
  }
  // Valve groups per chain. Solve every rocker pose first so exact valve
  // lifts (from the pallet drop) drive the valve-stack placement.
  const chains = allValveChains();
  const poses = new Map<string, ChainPose>();
  for (const chain of chains) {
    poses.set(
      `${chain.cylinder}:${chain.slot}`,
      solveChainPose(chain, headPlaceOf(chain.bank)),
    );
  }
  const valveLiftOf = new Map<string, number>();
  for (const [key, pose] of poses) {
    valveLiftOf.set(key, pose.valveLift);
  }
  for (const chain of chains) {
    const v = chain.valveOrdinal;
    const cylBoreX = boreX(chain.cylinder);
    const headPlace = headPlaceOf(chain.bank);
    const seatY = chain.slot === 'Intake' ? vp.inSeatA : vp.exSeatA;
    const w = [
      0,
      Math.sin((12 * Math.PI) / 180),
      Math.cos((12 * Math.PI) / 180),
    ] as Vec3;
    // Head-local x for this cylinder: bank R heads carry the R stations.
    const localX = chain.bank === 'R' ? cylBoreX : cylBoreX - bankStagger;
    const seatBase: Vec3 = [localX, seatY + 9.4 * w[1], 9.4 * w[2]];
    const axisPlace = (t: number, extra?: Placement): Placement => {
      const base = alignZ(w).compose(
        Placement.translate(
          seatBase[0],
          seatBase[1] + (t - 9.4) * w[1] * 0,
          seatBase[2],
        ),
      );
      void t;
      return (extra ?? Placement.identity).compose(base).compose(headPlace);
    };
    void axisPlace;
    // Common placement: local +z along the valve axis, origin at the seat
    // cone mid-circle station (head-local seatBase), then the head pose.
    const valveFrame = alignZ(w)
      .compose(Placement.translate(seatBase[0], seatBase[1], seatBase[2]))
      .compose(headPlace);
    const lift =
      valveLiftOf.get(`${chain.cylinder}:${chain.slot}`) ?? chain.valveLift;
    const liftShift = Placement.translate(0, 0, -lift);
    push(
      `${chain.slot} Valve ${chain.cylinder}`,
      buildValve(liftShift.compose(valveFrame), chain.slot),
      '#d8d3c8',
    );
    push(
      `${chain.slot} Valve Seat ${chain.cylinder}`,
      buildValveSeat(valveFrame, chain.slot),
      '#9b8f7f',
    );
    push(
      `Valve Guide ${v}`,
      buildValveGuide(
        Placement.translate(0, 0, 60).compose(valveFrame),
        chain.slot,
      ),
      '#a8763f',
    );
    push(
      `Valve Stem Seal ${v}`,
      buildStemSeal(Placement.translate(0, 0, 102).compose(valveFrame)),
      '#222',
    );
    const pocketT = 104 - 9.4;
    push(
      `Valve Spring ${v}`,
      buildValveSpring(
        Placement.translate(0, 0, pocketT).compose(valveFrame),
        vp.installedHeight - lift,
      ),
      '#777',
    );
    const retainerT = pocketT + vp.installedHeight - lift;
    push(
      `Spring Retainer ${v}`,
      buildRetainer(Placement.translate(0, 0, retainerT).compose(valveFrame)),
      '#888',
    );
    push(
      `Valve Keeper ${2 * v - 1}`,
      buildKeeper(Placement.translate(0, 0, retainerT).compose(valveFrame), 0),
      '#999',
    );
    push(
      `Valve Keeper ${2 * v}`,
      buildKeeper(Placement.translate(0, 0, retainerT).compose(valveFrame), 1),
      '#999',
    );
  }
  for (let cyl = 1; cyl <= 8; cyl++) {
    const bank = cyl <= 4 ? 'R' : 'L';
    const localX = bank === 'R' ? boreX(cyl) : boreX(cyl) - bankStagger;
    const tip = plugTipOf(localX);
    const place = alignZ(plugDir)
      .compose(Placement.translate(tip[0], tip[1], tip[2]))
      .compose(
        Placement.translate(
          plugSeatT * plugDir[0],
          plugSeatT * plugDir[1],
          plugSeatT * plugDir[2],
        ),
      )
      .compose(headPlaceOf(bank));
    push(`Spark Plug ${cyl}`, buildSparkPlug(place), '#eee');
  }

  // --- Valvetrain drive ---
  push(
    'Camshaft 1',
    buildCamshaft(Placement.translate(0, 0, camAxisZ)),
    '#5e6368',
    7.3,
  );
  push(
    'Cam Thrust Plate 1',
    buildThrustPlate(Placement.translate(1.5, 0, camAxisZ)),
    '#777',
  );
  for (const [index, side] of ([-1, 1] as const).entries()) {
    push(
      `Thrust Plate Bolt ${index + 1}`,
      buildBolt(
        Placement.rotate('y', 90).compose(
          Placement.translate(6.5, side * 30, camAxisZ + 20),
        ),
        {
          d: 6,
          length: 12,
          threadLength: 9,
          af: 10,
          headHeight: 5,
        },
      ),
      '#4a4f55',
    );
  }
  push(
    'Cam Gear 1',
    buildCamGear(
      Placement.rotate('x', 360 / 64 / 2).compose(
        Placement.translate(-34, 0, camAxisZ),
      ),
    ),
    '#8a8f96',
  );
  for (const [index, deg] of [0, 120, 240].entries()) {
    const t = (deg * Math.PI) / 180;
    const p: Vec3 = [-38, 22 * Math.cos(t), camAxisZ + 22 * Math.sin(t)];
    push(
      `Cam Gear Bolt ${index + 1}`,
      buildBolt(
        Placement.rotate('y', 90).compose(
          Placement.translate(p[0], p[1], p[2]),
        ),
        {
          d: 8,
          length: 20,
          threadLength: 14,
          af: 13,
          headHeight: 6,
        },
      ),
      '#4a4f55',
    );
  }
  // Lifters, pushrods, rockers, studs, balls, nuts (solved poses).
  for (const chain of chains) {
    const v = chain.valveOrdinal;
    const pose = poses.get(`${chain.cylinder}:${chain.slot}`)!;
    push(`Lifter ${v}`, buildLifter(pose.lifterPlace), '#9aa0a6');
    push(`Rocker Arm ${v}`, buildRockerArm(pose.rockerFrame), '#9aa0a6');
    push(`Rocker Pivot Ball ${v}`, buildPivotBall(pose.pivotPlace), '#888');
    push(`Rocker Adjuster Nut ${v}`, buildAdjusterNut(pose.nutPlace), '#777');
    push(`Rocker Stud ${v}`, buildRockerStud(pose.studPlace), '#666');
    push(`Pushrod ${v}`, buildPushrod(pose.pushrodPlace), '#b8bcc0');
  }

  // --- Induction & fuel ---
  push(
    'Intake Manifold 1',
    buildIntakeManifold(Placement.identity),
    '#adb3ba',
    2.7,
  );
  for (const bank of ['R', 'L'] as const) {
    const gasketFrame = Placement.mirrorXZ()
      .rotate('x', -135)
      .compose(
        Placement.translate(
          0,
          (bank === 'R' ? 1 : -1) * Number(hp.aIn) * c * -1 * -1,
          0,
        ),
      );
    void gasketFrame;
    push(`Intake Gasket ${bank}`, buildIntakeGasket(bank), '#7f8891');
  }
  for (let bolt = 1; bolt <= 10; bolt++) {
    const bank = bolt <= 5 ? 'R' : 'L';
    const xt = intakeTapX[(bolt - 1) % 5]!;
    const x = bank === 'R' ? xt : xt + bankStagger;
    const seat = bankPoint(
      bank,
      x,
      manifoldFlangeA + 12,
      deckHeight + gasketT.head + 55,
    );
    const outward = bankV(bank).map((v0) => -v0) as Vec3;
    void outward;
    const inwardNormal: Vec3 = bank === 'R' ? [0, -c, c] : [0, c, c];
    push(
      `Intake Bolt ${bolt}`,
      buildBolt(
        alignZ([-inwardNormal[0], -inwardNormal[1], -inwardNormal[2]]).compose(
          Placement.translate(seat[0], seat[1], seat[2]),
        ),
        {
          d: 8,
          length: 35,
          threadLength: 20,
          af: 13,
          headHeight: 6,
        },
      ),
      '#4a4f55',
    );
  }
  push(
    'Throttle Body 1',
    buildThrottleBody(
      Placement.translate(
        plenum.throttleX - gasketT.throttle,
        0,
        plenum.throttleZ,
      ),
    ),
    '#9aa1a8',
  );
  push(
    'Throttle Shaft 1',
    buildThrottleShaft(
      Placement.translate(
        plenum.throttleX - gasketT.throttle - 21,
        0,
        plenum.throttleZ,
      ),
    ),
    '#777',
  );
  push(
    'Throttle Blade 1',
    buildThrottleBlade(
      Placement.translate(
        plenum.throttleX - gasketT.throttle - 21,
        0,
        plenum.throttleZ,
      ),
    ),
    '#c8a24a',
  );
  for (const [index, dy] of [-10, 10].entries()) {
    push(
      `Throttle Blade Screw ${index + 1}`,
      buildBolt(
        Placement.rotate('y', -90).compose(
          Placement.translate(
            plenum.throttleX - gasketT.throttle - 21 + 4.75,
            dy,
            plenum.throttleZ,
          ),
        ),
        {
          d: 3,
          length: 6,
          threadLength: 5,
          af: 5.5,
          headHeight: 2.5,
        },
      ),
      '#c8a24a',
    );
  }
  for (const [index, deg] of [45, 135, 225, 315].entries()) {
    const t = (deg * Math.PI) / 180;
    push(
      `Throttle Bolt ${index + 1}`,
      buildBolt(
        Placement.rotate('y', -90).compose(
          Placement.translate(
            plenum.throttleX - gasketT.throttle - 42,
            46 * Math.cos(t),
            plenum.throttleZ + 46 * Math.sin(t),
          ),
        ),
        {
          d: 6,
          length: 20 + 22,
          threadLength: 14,
          af: 10,
          headHeight: 5,
        },
      ),
      '#4a4f55',
    );
  }
  push(
    'Throttle Gasket 1',
    buildRailGasket(
      Placement.rotate('y', 90)
        .compose(Placement.rotate('z', 90))
        .compose(Placement.translate(plenum.throttleX, 0, plenum.throttleZ)),
      {
        x0: -52,
        x1: 52,
        y0: -52,
        y1: 52,
        t: gasketT.throttle,
        holes: [45, 135, 225, 315].map((deg) => {
          const t = (deg * Math.PI) / 180;
          return { x: 46 * Math.cos(t), y: 46 * Math.sin(t), d: 6.6 };
        }),
        // Round window: the diagonal corners carry the BC92 bolt holes.
        windowRound: 37.9,
      },
    ),
    '#8f959c',
  );
  for (const bank of ['R', 'L'] as const) {
    const railXs = bank === 'R' ? [120, 350] : [141.8, 371.8];
    const railZ = 262;
    const sign = bank === 'R' ? 1 : -1;
    push(
      `Fuel Rail ${bank}`,
      buildFuelRail(
        Placement.rotate('x', sign * -90).compose(
          Placement.translate(0, sign * (plenum.yHalf + 18), railZ),
        ),
        bank,
      ),
      '#8f959c',
    );
    void railXs;
  }
  for (let bolt = 1; bolt <= 4; bolt++) {
    const bank = bolt <= 2 ? 'R' : 'L';
    const sign = bank === 'R' ? 1 : -1;
    const x = (bank === 'R' ? [120, 350] : [141.8, 371.8])[(bolt - 1) % 2]!;
    push(
      `Rail Bolt ${bolt}`,
      buildBolt(
        alignZ([0, -sign, 0]).compose(
          Placement.translate(x, sign * (plenum.yHalf + 18), 262),
        ),
        {
          d: 6,
          length: 16 + 18,
          threadLength: 12,
          af: 10,
          headHeight: 5,
        },
      ),
      '#4a4f55',
    );
  }
  for (let injector = 1; injector <= 8; injector++) {
    const bank = injector <= 4 ? 'R' : 'L';
    const xs =
      bank === 'R' ? [80, 191, 302, 413] : [101.8, 212.8, 323.8, 434.8];
    const x = xs[(injector - 1) % 4]!;
    const mouth = bankPoint(bank, x, manifoldFlangeA, runnerMouthS + 26);
    const dir: Vec3 = bank === 'R' ? [0, c, c] : [0, -c, c];
    const place = alignZ(dir).compose(
      Placement.translate(
        mouth[0],
        mouth[1] - dir[1] * 6,
        mouth[2] - dir[2] * 6,
      ),
    );
    push(`Injector ${injector}`, buildInjector(place), '#5b6066');
    push(
      `Injector O-Ring ${2 * injector - 1}`,
      buildInjectorORing(Placement.translate(0, 0, 39).compose(place)),
      '#333',
    );
    push(
      `Injector O-Ring ${2 * injector}`,
      buildInjectorORing(Placement.translate(0, 0, 3).compose(place)),
      '#333',
    );
  }
  push('Thermostat 1', buildThermostat(Placement.translate(4, 0, 240)), '#999');
  push(
    'Thermostat Housing 1',
    buildThermostatHousing(Placement.translate(4 - gasketT.thermostat, 0, 240)),
    '#9aa1a8',
  );
  for (const [index, dz] of [30, -30].entries()) {
    push(
      `Thermostat Housing Bolt ${index + 1}`,
      buildBolt(
        Placement.rotate('y', -90).compose(
          Placement.translate(4 - gasketT.thermostat - 8, 0, 240 + dz),
        ),
        {
          d: 6,
          length: 20,
          threadLength: 14,
          af: 10,
          headHeight: 5,
        },
      ),
      '#4a4f55',
    );
  }
  push(
    'Thermostat Gasket 1',
    buildRailGasket(
      Placement.rotate('y', 90)
        .compose(Placement.rotate('z', 90))
        .compose(Placement.translate(4, 0, 240)),
      {
        x0: -40,
        x1: 40,
        y0: -40,
        y1: 40,
        t: gasketT.thermostat,
        holes: [
          { x: 0, y: 30, d: 6.6 },
          { x: 0, y: -30, d: 6.6 },
        ],
        windowInset: 11,
      },
    ),
    '#8f959c',
  );

  // --- Exhaust ---
  push(
    'Exhaust Header R',
    buildExhaustHeader(Placement.identity),
    '#a7a29a',
    7.9,
  );
  push(
    'Exhaust Header L',
    buildExhaustHeader(
      Placement.mirrorXZ().compose(Placement.translate(bankStagger, 0, 0)),
    ),
    '#a7a29a',
    7.9,
  );
  push('Exhaust Gasket R', buildExhaustGasket(Placement.identity), '#8f959c');
  push(
    'Exhaust Gasket L',
    buildExhaustGasket(
      Placement.mirrorXZ().compose(Placement.translate(bankStagger, 0, 0)),
    ),
    '#8f959c',
  );
  for (let stud = 1; stud <= 16; stud++) {
    const bank = stud <= 8 ? 'R' : 'L';
    const local = (stud - 1) % 8;
    const cylSlot = Math.floor(local / 2);
    const xs =
      bank === 'R' ? [80, 191, 302, 413] : [101.8, 212.8, 323.8, 434.8];
    const x = xs[cylSlot]! + (local % 2 === 0 ? -24 : 24);
    const base = bankPoint(
      bank,
      x,
      hp.aOut - 17,
      deckHeight + gasketT.head + exPortZ,
    );
    const outward = bankV(bank);
    push(
      `Exhaust Stud ${stud}`,
      buildExhaustStud(
        alignZ(outward).compose(Placement.translate(base[0], base[1], base[2])),
      ),
      '#666',
    );
    // Nuts land on the spot-faced pads 0.8 below the plate outer surface.
    const nutBase = bankPoint(
      bank,
      x,
      hp.aOut + gasketT.exhaust + 9.2,
      deckHeight + gasketT.head + exPortZ,
    );
    push(
      `Exhaust Nut ${stud}`,
      buildExhaustNut(
        alignZ(outward).compose(
          Placement.translate(nutBase[0], nutBase[1], nutBase[2]),
        ),
      ),
      '#a8763f',
    );
  }

  // --- Covers, lube, cooling, service ---
  const railTapXY: Array<[number, number]> = [90, 200, 310, 420].flatMap(
    (x) => [[x, -72] as [number, number], [x, 64] as [number, number]],
  );
  for (const bank of ['R', 'L'] as const) {
    const coverPlace = Placement.translate(
      0,
      0,
      105 + gasketT.valveCover,
    ).compose(headPlaceOf(bank));
    push(`Valve Cover ${bank}`, buildValveCover(coverPlace, bank), '#7d848c');
    push(
      `Valve Cover Gasket ${bank}`,
      buildRailGasket(
        Placement.translate(0, 0, 105).compose(headPlaceOf(bank)),
        {
          x0: 20,
          x1: 495,
          y0: -80,
          y1: 72,
          t: gasketT.valveCover,
          holes: railTapXY.map(([x, y]) => ({ x, y, d: 6.6 })),
          windowInset: 16,
        },
      ),
      '#333',
    );
  }
  for (let bolt = 1; bolt <= 16; bolt++) {
    const bank = bolt <= 8 ? 'R' : 'L';
    const [x, y] = railTapXY[(bolt - 1) % 8]!;
    const seat = headPlaceOf(bank).pt([x, y, 105 + gasketT.valveCover + 40]);
    const up = bankU(bank);
    push(
      `Valve Cover Bolt ${bolt}`,
      buildBolt(
        alignZ(up).compose(Placement.translate(seat[0], seat[1], seat[2])),
        {
          d: 6,
          length: 25 + 22,
          threadLength: 13,
          af: 10,
          headHeight: 5,
        },
      ),
      '#4a4f55',
    );
  }
  push('Front Cover 1', buildFrontCover(Placement.identity), '#9aa1a8', 2.7);
  push(
    'Front Cover Gasket 1',
    buildRailGasket(
      Placement.rotate('y', 90)
        .compose(Placement.rotate('z', 90))
        .compose(Placement.translate(0, 0, 0)),
      {
        x0: -frontCover.outline.yHalf,
        x1: frontCover.outline.yHalf,
        y0: frontCover.outline.zMin,
        y1: frontCover.outline.zMax,
        t: gasketT.frontCover,
        holes: frontCover.boltPts.map(([y, z]) => ({ x: y, y: z, d: 6.6 })),
        windowInset: 12,
        // Between the (-106, 85) and (-106, 140) bolt holes.
        probeAt: [-106, 112.5],
      },
    ),
    '#8f959c',
  );
  for (const [index, [y, z]] of frontCover.boltPts.entries()) {
    push(
      `Front Cover Bolt ${index + 1}`,
      buildBolt(
        Placement.rotate('y', -90).compose(Placement.translate(-17.5, y, z)),
        {
          d: 6,
          length: 30,
          threadLength: 13,
          af: 10,
          headHeight: 5,
        },
      ),
      '#4a4f55',
    );
  }
  push(
    'Oil Pump Inner Rotor 1',
    buildPumpRotor(Placement.translate(-16, 0, 0), 'inner'),
    '#7c828a',
  );
  push(
    'Oil Pump Outer Rotor 1',
    buildPumpRotor(Placement.translate(-16, 0, 0), 'outer'),
    '#7c828a',
  );
  push(
    'Oil Pump Cover 1',
    buildPumpCover(Placement.translate(-4 + 0, 0, 0)),
    '#8f959c',
  );
  for (const [index, deg] of [45, 135, 225, 315].entries()) {
    const t = (deg * Math.PI) / 180;
    push(
      `Oil Pump Cover Bolt ${index + 1}`,
      buildBolt(
        Placement.rotate('y', 90).compose(
          Placement.translate(-10, 40 * Math.cos(t), 40 * Math.sin(t)),
        ),
        {
          d: 6,
          length: 16,
          threadLength: 12,
          af: 10,
          headHeight: 5,
        },
      ),
      '#4a4f55',
    );
  }
  push(
    'Relief Valve Piston 1',
    buildReliefPiston(
      Placement.translate(
        frontCover.backX - 13,
        frontCover.reliefY,
        frontCover.reliefZ - 12,
      ),
    ),
    '#999',
  );
  push(
    'Relief Valve Spring 1',
    buildReliefSpring(
      Placement.translate(
        frontCover.backX - 13,
        frontCover.reliefY,
        frontCover.reliefZ - 12 + 3,
      ),
    ),
    '#777',
  );
  push(
    'Relief Valve Plug 1',
    buildPlug(
      alignZ([0, 0, -1]).compose(
        Placement.translate(
          frontCover.backX - 13,
          frontCover.reliefY,
          frontCover.reliefZ + 14,
        ),
      ),
      {
        d: 12,
        length: 10,
      },
    ),
    '#666',
  );
  push(
    'Oil Filter 1',
    buildOilFilter(
      Placement.translate(
        frontCover.wallX - 12,
        frontCover.filterY,
        frontCover.filterZ,
      ),
    ),
    '#d0d0d0',
  );
  push(
    'Oil Pickup Tube 1',
    buildOilPickup(Placement.translate(-10, 0, -50)),
    '#9aa1a8',
  );
  for (const [index, dy] of [-16, 16].entries()) {
    push(
      `Pickup Bolt ${index + 1}`,
      buildBolt(
        Placement.rotate('x', 0).compose(Placement.translate(-10, dy, -54 - 4)),
        {
          d: 6,
          length: 12,
          threadLength: 9,
          af: 10,
          headHeight: 5,
        },
      ),
      '#4a4f55',
    );
  }
  push(
    'Oil Pan 1',
    buildOilPan(Placement.translate(0, 0, -38 - gasketT.oilPan)),
    '#7d848c',
  );
  push(
    'Oil Pan Gasket 1',
    buildRailGasket(Placement.translate(0, 0, -38 - gasketT.oilPan), {
      x0: -8,
      x1: 524,
      y0: -114,
      y1: 114,
      t: gasketT.oilPan,
      holes: [50, 115, 180, 245, 310, 375, 440, 478].flatMap((x) => [
        { x, y: -94, d: 6.6 },
        { x, y: 94, d: 6.6 },
      ]),
      windowInset: 26,
    }),
    '#333',
  );
  for (let bolt = 1; bolt <= 16; bolt++) {
    const x = [50, 115, 180, 245, 310, 375, 440, 478][(bolt - 1) % 8]!;
    const y = bolt <= 8 ? -94 : 94;
    push(
      `Oil Pan Bolt ${bolt}`,
      buildBolt(Placement.translate(x, y, -38 - gasketT.oilPan - 4), {
        d: 6,
        length: 16,
        threadLength: 12,
        af: 10,
        headHeight: 5,
      }),
      '#4a4f55',
    );
  }
  push(
    'Drain Plug 1',
    buildPlug(
      alignZ([0, 0, 1]).compose(
        Placement.translate(480, 60, -38 - gasketT.oilPan - 148),
      ),
      { d: 14, length: 10 },
    ),
    '#666',
  );
  push(
    'Water Pump Housing 1',
    buildWaterPumpHousing(Placement.translate(-gasketT.waterPump, 0, 0)),
    '#9aa1a8',
  );
  push(
    'Water Pump Shaft 1',
    buildWaterPumpShaft(Placement.translate(-46.7, 0, 66.5)),
    '#888',
  );
  push(
    'Water Pump Impeller 1',
    buildImpeller(
      Placement.translate(-46.7 - 20, 0, 66.5).compose(
        Placement.translate(0, 0, 0),
      ),
    ),
    '#9aa1a8',
  );
  push(
    'Water Pump Pulley 1',
    buildPumpPulley(Placement.translate(-46.7, 0, 66.5)),
    '#666',
  );
  push('Water Pump Gasket 1', buildWaterPumpGasket(), '#8f959c');
  for (const [index, pt] of (
    [
      [-126, 55],
      [-165.4, 90],
      [126, 55],
      [165.4, 90],
    ] as Array<[number, number]>
  ).entries()) {
    push(
      `Water Pump Bolt ${index + 1}`,
      buildBolt(
        Placement.rotate('y', -90).compose(
          Placement.translate(-46 - 5, pt[0], pt[1]),
        ),
        {
          d: 8,
          length: 30 + 21,
          threadLength: 17,
          af: 13,
          headHeight: 6,
        },
      ),
      '#4a4f55',
    );
  }
  push('Dipstick 1', buildDipstick(), '#c8a24a');
  push('Dipstick Tube 1', buildDipstickTube(), '#999');
  push('PCV Valve 1', buildPcv(headPlaceOf('L')), '#777');
  push('Oil Filler Cap 1', buildFillerCap(headPlaceOf('R')), '#333');
  push(
    'Coolant Temp Sensor 1',
    buildSensor(
      alignZ([0, 0, -1]).compose(Placement.translate(30, 0, 272)),
      12,
      false,
    ),
    '#b8a888',
  );
  push(
    'Oil Pressure Sensor 1',
    buildSensor(
      alignZ([-1, 0, 0]).compose(Placement.translate(rearFaceX, 16, 60)),
      10,
      false,
    ),
    '#b8a888',
  );
  push('Knock Sensor 1', buildKnockSensor('R'), '#b8a888');
  push('Knock Sensor 2', buildKnockSensor('L'), '#b8a888');
  push(
    'Cam Position Sensor 1',
    buildSensor(
      alignZ([1, 0, 0]).compose(
        Placement.translate(frontCover.wallX - 10, 0, 185),
      ),
      10,
      false,
    ),
    '#5b6066',
  );
  push(
    'Crank Position Sensor 1',
    buildSensor(
      alignZ([0, 0, -1]).compose(
        Placement.translate(sensorBore.x, 0, sensorBoss.zTop),
      ),
      12,
      true,
    ),
    '#5b6066',
  );

  if (withProbes) {
    // REQ-087: Ø22 x 80 probes along each plug axis, outboard of the seat.
    for (let cyl = 1; cyl <= 8; cyl++) {
      const bank = cyl <= 4 ? 'R' : 'L';
      const localX = bank === 'R' ? boreX(cyl) : boreX(cyl) - bankStagger;
      const tip = plugTipOf(localX);
      const start: Vec3 = [
        tip[0] + (plugSeatT + 40) * plugDir[0],
        tip[1] + (plugSeatT + 40) * plugDir[1],
        tip[2] + (plugSeatT + 40) * plugDir[2],
      ];
      const place = alignZ(plugDir)
        .compose(Placement.translate(start[0], start[1], start[2]))
        .compose(headPlaceOf(bank));
      push(`Plug Tool Probe ${cyl}`, buildProbe(place, 11, 80), '#ff8800');
    }
    // REQ-088: head-bolt torque-tool probes (Ø 1.6 x AF 17, length 40).
    for (let bolt = 1; bolt <= 20; bolt++) {
      const bank = bolt <= 10 ? 'R' : 'L';
      const hole = deckMap.bolts[(bolt - 1) % 10]!;
      const top = headPlaceOf(bank).pt([hole.x, hole.y, 84.85 + 11.5]);
      const up = bankU(bank);
      const place = alignZ(up).compose(
        Placement.translate(top[0], top[1], top[2]),
      );
      push(
        `Head Bolt Tool Probe ${bolt}`,
        buildProbe(place, (1.6 * hexAf(11)) / 2, 40),
        '#ff8800',
      );
    }
  }

  return entries;
};

/**
 * Minimal sub-assembly: the entries of {@link buildEngine} whose `name` is in
 * `names`, in build order. Placements are absolute and `interfaces` travel with
 * each entry, so a subset is verdict-preserving for any GeoSpec proof that
 * references only those occurrences — while serializing a fraction of the
 * unique-casting topology, so the STEP export stays inside the load budget.
 * Names absent from the assembly are silently skipped (they surface downstream
 * as an `unsupported` selector resolution, never a wrong pass).
 */
export const buildSubAssembly = (
  names: ReadonlySet<string>,
  withProbes = false,
): Entry[] => buildEngine(withProbes).filter((entry) => names.has(entry.name));

// --- Chain pose solver ---------------------------------------------------------

type ChainPose = {
  lifterPlace: Placement;
  rockerFrame: Placement;
  pivotPlace: Placement;
  nutPlace: Placement;
  studPlace: Placement;
  pushrodPlace: Placement;
  valveLift: number;
};

const solveChainPose = (
  chain: ReturnType<typeof allValveChains>[number],
  headPlace: Placement,
): ChainPose => {
  const u = bankU(chain.bank);
  const vv = bankV(chain.bank);
  const camPoint: Vec3 = [chain.x, 0, camAxisZ];
  const footCenter: Vec3 = [
    camPoint[0],
    camPoint[1] + 8 * vv[1] + chain.footCenterH * u[1],
    camPoint[2] + 8 * vv[2] + chain.footCenterH * u[2],
  ];
  const lifterBase: Vec3 = [
    footCenter[0],
    footCenter[1] - 700 * u[1],
    footCenter[2] - 700 * u[2],
  ];
  const lifterPlace = alignZ(u).compose(
    Placement.translate(lifterBase[0], lifterBase[1], lifterBase[2]),
  );
  const chainGeo = solveRockerChain(chain.slot);
  const localX =
    chain.bank === 'R'
      ? boreX(chain.cylinder)
      : boreX(chain.cylinder) - bankStagger;
  const pivotW = headPlace.pt([
    localX + chainGeo.studX,
    chainGeo.pivot[1],
    chainGeo.pivot[2],
  ]);
  const palletW = headPlace.pt([
    localX + chainGeo.pallet[0],
    chainGeo.pallet[1],
    chainGeo.pallet[2],
  ]);
  const cupW = headPlace.pt([
    localX + chainGeo.cup[0],
    chainGeo.cup[1],
    chainGeo.cup[2],
  ]);
  const xAxis = vecNorm([
    palletW[0] - pivotW[0],
    palletW[1] - pivotW[1],
    palletW[2] - pivotW[2],
  ]);
  const wWorld = headPlace.dir([
    0,
    Math.sin((12 * Math.PI) / 180),
    Math.cos((12 * Math.PI) / 180),
  ]);
  const yAxis = vecNorm([
    xAxis[1] * wWorld[2] - xAxis[2] * wWorld[1],
    xAxis[2] * wWorld[0] - xAxis[0] * wWorld[2],
    xAxis[0] * wWorld[1] - xAxis[1] * wWorld[0],
  ]);
  const alignX = ((): Placement => {
    const dot = xAxis[0];
    const cross: Vec3 = [0, -xAxis[2], xAxis[1]];
    const angle = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
    if (Math.hypot(cross[0], cross[1], cross[2]) < 1e-9) {
      return dot > 0 ? Placement.identity : Placement.rotate('z', 180);
    }
    return Placement.identity.rotateAxis([0, 0, 0], cross, angle);
  })();
  const rolledZ = alignX.dir([0, 0, 1]);
  const targetZ = vecNorm([
    xAxis[1] * yAxis[2] - xAxis[2] * yAxis[1],
    xAxis[2] * yAxis[0] - xAxis[0] * yAxis[2],
    xAxis[0] * yAxis[1] - xAxis[1] * yAxis[0],
  ]);
  const rollDot =
    rolledZ[0] * targetZ[0] + rolledZ[1] * targetZ[1] + rolledZ[2] * targetZ[2];
  const rollCross: Vec3 = [
    rolledZ[1] * targetZ[2] - rolledZ[2] * targetZ[1],
    rolledZ[2] * targetZ[0] - rolledZ[0] * targetZ[2],
    rolledZ[0] * targetZ[1] - rolledZ[1] * targetZ[0],
  ];
  const rollSign =
    rollCross[0] * xAxis[0] +
      rollCross[1] * xAxis[1] +
      rollCross[2] * xAxis[2] >=
    0
      ? 1
      : -1;
  const rollAngle =
    (rollSign * (Math.acos(Math.max(-1, Math.min(1, rollDot))) * 180)) /
    Math.PI;
  // Lifter cup centre (already risen: footCenterH includes the lift).
  const cupL: Vec3 = [
    lifterBase[0] + lifterCupLocalZ * u[0],
    lifterBase[1] + lifterCupLocalZ * u[1],
    lifterBase[2] + lifterCupLocalZ * u[2],
  ];
  const cupDistribution = (phi: number): number => {
    const cupRot = rotatePointAbout(cupW, pivotW, yAxis, phi);
    return (
      Math.hypot(
        cupRot[0] - cupL[0],
        cupRot[1] - cupL[1],
        cupRot[2] - cupL[2],
      ) - vp.pushrodLen
    );
  };
  let lo = -30;
  let hi = 30;
  if (Math.sign(cupDistribution(lo)) === Math.sign(cupDistribution(hi))) {
    lo = 0;
    hi = 0;
  }
  const fLo = cupDistribution(lo);
  for (let iter = 0; iter < 80 && hi - lo > 1e-12; iter++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(cupDistribution(mid)) === Math.sign(fLo)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const rockerRotation = (lo + hi) / 2;
  const rockerFrame = alignX
    .rotateAxis([0, 0, 0], xAxis, rollAngle)
    .compose(Placement.translate(pivotW[0], pivotW[1], pivotW[2]))
    .rotateAxis(pivotW, yAxis, rockerRotation);
  const palletRot = rotatePointAbout(palletW, pivotW, yAxis, rockerRotation);
  const valveLift =
    (palletW[0] - palletRot[0]) * wWorld[0] +
    (palletW[1] - palletRot[1]) * wWorld[1] +
    (palletW[2] - palletRot[2]) * wWorld[2];
  const cupR = rotatePointAbout(cupW, pivotW, yAxis, rockerRotation);
  const dRod = vecNorm([
    cupR[0] - cupL[0],
    cupR[1] - cupL[1],
    cupR[2] - cupL[2],
  ]);
  const lowBall: Vec3 = [
    cupL[0] + 0.25 * dRod[0],
    cupL[1] + 0.25 * dRod[1],
    cupL[2] + 0.25 * dRod[2],
  ];
  const studBase = headPlace.pt([
    localX + chainGeo.studX,
    chainGeo.studY + (105 / 0.9781) * 0.2079,
    105,
  ]);
  return {
    lifterPlace,
    rockerFrame,
    pivotPlace: alignZ(wWorld).compose(
      Placement.translate(pivotW[0], pivotW[1], pivotW[2]),
    ),
    nutPlace: alignZ(wWorld).compose(
      Placement.translate(
        pivotW[0] + wWorld[0] * 5,
        pivotW[1] + wWorld[1] * 5,
        pivotW[2] + wWorld[2] * 5,
      ),
    ),
    studPlace: alignZ(wWorld).compose(
      Placement.translate(studBase[0], studBase[1], studBase[2]),
    ),
    pushrodPlace: alignZ(dRod).compose(
      Placement.translate(lowBall[0], lowBall[1], lowBall[2]),
    ),
    valveLift,
  };
};

// --- Local small builders -----------------------------------------------------

const buildProbe = (place: Placement, r: number, length: number): BuiltPart => {
  const shape = place.shape(makeCylinder(r, length, [0, 0, 0], [0, 0, 1]));
  return {
    shape,
    interfaces: { body: axisNear(place, [r, 0, length / 2], 'CYLINDRE', 0.1) },
  };
};

/** Main bearing cap: extruded section with registers, notch, bolt stack. */
const buildMainCap = (place: Placement): BuiltPart => {
  const { halfW } = capGeo;
  const profile = draw([-halfW, 0])
    .lineTo([halfW, 0])
    .lineTo([halfW, -capGeo.registerDepth])
    .lineTo([halfW - 20, -capGeo.height])
    .lineTo([-halfW + 20, -capGeo.height])
    .lineTo([-halfW, -capGeo.registerDepth])
    .close()
    .sketchOnPlane('YZ')
    .extrude(capGeo.thickness)
    .translate([-capGeo.thickness / 2, 0, 0]) as Shape3D;
  let cap = profile.cut(
    makeCylinder(
      capGeo.saddleR,
      capGeo.thickness + 2,
      [-capGeo.thickness / 2 - 1, 0, 0],
      [1, 0, 0],
    ),
  );
  cap = cap.cut(
    makeCylinder(
      capGeo.notchR,
      6,
      [capGeo.notchXOffset.lower - 3, capGeo.notchY, 0],
      [1, 0, 0],
    ),
  );
  const tools: Shape3D[] = [];
  for (const side of [-1, 1] as const) {
    tools.push(
      makeCylinder(
        6.5,
        capGeo.height + 2,
        [0, side * capGeo.boltY, 0.5],
        [0, 0, -1],
      ),
    );
    tools.push(
      makeCylinder(
        11,
        6,
        [0, side * capGeo.boltY, -capGeo.height - 0.01],
        [0, 0, 1],
      ),
    );
  }
  cap = cap.cutAll(tools);
  const shape = place.shape(cap);
  const interfaces: InterfaceDeclarations = {
    boltHole: axisGroupNearLocal(place, [
      [0, -capGeo.boltY + 6.5, -12],
      [0, capGeo.boltY - 6.5, -12],
    ]),
    boltSeat: groupNearLocal(place, [
      [8, -capGeo.boltY, -capGeo.height + 6],
      [8, capGeo.boltY, -capGeo.height + 6],
    ]),
    halfBore: axisNear(place, [0, 0, -capGeo.saddleR], 'CYLINDRE', 0.12),
    partingFace: faceNear(place, [0, 56, 0], 'PLANE', 0.1),
    sideRegister: faceNear(place, [0, halfW, -12], 'PLANE', 0.1),
    tangNotch: faceNear(
      place,
      [capGeo.notchXOffset.lower, capGeo.notchY, -capGeo.notchR],
      'CYLINDRE',
      0.15,
    ),
  };
  return { shape, interfaces };
};

const axisGroupNearLocal = (place: Placement, pts: Vec3[]) =>
  axisGroupNear(place, pts, 'CYLINDRE', 0.12);
const groupNearLocal = (place: Placement, pts: Vec3[]) =>
  groupNear(place, pts, 'PLANE', 0.12);

/** Intake gasket: blank on the head inner face with ports/bolts/coolant. */
const buildIntakeGasket = (bank: 'R' | 'L'): BuiltPart => {
  const t = gasketT.intake;
  const sheet = draw([40, 232])
    .lineTo([455, 232])
    .lineTo([455, 292])
    .lineTo([40, 292])
    .close()
    .sketchOnPlane('XY')
    .extrude(t);
  const xs = [80, 191, 302, 413];
  const tools: Shape3D[] = [];
  for (const x of xs) {
    tools.push(makeCylinder(19, t + 2, [x, runnerMouthS, -1], [0, 0, 1]));
  }
  for (const x of intakeTapX) {
    tools.push(makeCylinder(4.5, t + 2, [x, 230 + 55, -1], [0, 0, 1]));
  }
  tools.push(makeCylinder(10, t + 2, [52, 285, -1], [0, 0, 1]));
  const cut = sheet.cutAll(tools);
  const frame = Placement.mirrorXZ()
    .rotate('x', -135)
    .rotate('x', 180)
    .compose(Placement.translate(0, hp.aIn * c, -hp.aIn * c));
  const placed =
    bank === 'R'
      ? frame
      : frame
          .compose(Placement.mirrorXZ())
          .compose(Placement.translate(bankStagger, 0, 0));
  const shape = placed.shape(cut);
  const interfaces: InterfaceDeclarations = {
    a: faceNear(placed, [60, 250, 0], 'PLANE', 0.12),
    b: faceNear(placed, [60, 250, t], 'PLANE', 0.12),
    boltHole: axisGroupNear(
      placed,
      intakeTapX.map((x) => [x + 4.5, 285, t / 2] as Vec3),
      'CYLINDRE',
      0.1,
    ),
    coolantPort: axisNear(placed, [52 + 10, 285, t / 2], 'CYLINDRE', 0.1),
    portOval: axisGroupNear(
      placed,
      xs.map((x) => [x + 19, runnerMouthS, t / 2] as Vec3),
      'CYLINDRE',
      0.1,
    ),
  };
  return { shape, interfaces };
};

/** Water pump gasket: two leg pads joined by a floating bridge. */
const buildWaterPumpGasket = (): BuiltPart => {
  const t = gasketT.waterPump;
  const legY = 145.7;
  let sheet = draw([-legY - 30, 46])
    .lineTo([-legY + 30, 46])
    .lineTo([-legY + 30, 96])
    .lineTo([legY - 30, 96])
    .lineTo([legY - 30, 46])
    .lineTo([legY + 30, 46])
    .lineTo([legY + 30, 106])
    .lineTo([-legY - 30, 106])
    .close()
    .sketchOnPlane('YZ')
    .extrude(-t);
  const tools: Shape3D[] = [];
  for (const side of [-1, 1] as const) {
    tools.push(makeCylinder(15, t + 2, [1, side * legY, 66.5], [-1, 0, 0]));
  }
  for (const [y, z] of [
    [-126, 55],
    [-165.4, 90],
    [126, 55],
    [165.4, 90],
  ] as Array<[number, number]>) {
    tools.push(makeCylinder(4.3, t + 2, [1, y, z], [-1, 0, 0]));
  }
  sheet = sheet.cutAll(tools);
  const place = Placement.identity;
  const shape = sheet;
  const interfaces: InterfaceDeclarations = {
    // Z 49 clears the discharge port (r15 about z 66.5 -> down to 51.5).
    a: faceNear(place, [0, legY, 49], 'PLANE', 0.12),
    b: faceNear(place, [-t, legY, 49], 'PLANE', 0.12),
    boltHole: axisGroupNear(
      place,
      (
        [
          [-126, 55],
          [-165.4, 90],
          [126, 55],
          [165.4, 90],
        ] as Array<[number, number]>
      ).map(([y, z]) => [-t / 2, y + 4.3, z] as Vec3),
      'CYLINDRE',
      0.1,
    ),
    transferPort: axisGroupNear(
      place,
      [
        [-t / 2, -legY, 66.5 + 15],
        [-t / 2, legY, 66.5 + 15],
      ],
      'CYLINDRE',
      0.1,
    ),
  };
  return { shape, interfaces };
};

const buildOilFilter = (place: Placement): BuiltPart => {
  let filter = makeCylinder(38, 80, [0, 0, 0], [-1, 0, 0]) as Shape3D;
  filter = filter.cut(makeCylinder(9.55, 14, [1, 0, 0], [-1, 0, 0]));
  const shape = place.shape(filter);
  const interfaces: InterfaceDeclarations = {
    sealingRing: faceNear(place, [0, 0, 24], 'PLANE', 0.3),
    thread: axisNear(place, [-6, 0, 9.55], 'CYLINDRE', 0.1),
  };
  return { shape, interfaces };
};

const buildDipstickTube = (): BuiltPart => {
  const place = Placement.identity;
  const shape = makeCylinder(3.96, 120, [330, 94, -20], [0, 0, 1]).cut(
    makeCylinder(3, 124, [330, 94, -22], [0, 0, 1]),
  );
  const interfaces: InterfaceDeclarations = {
    bore: axisNear(place, [330 + 3, 94, 60], 'CYLINDRE', 0.05),
    press: axisNear(place, [330 + 3.96, 94, -12], 'CYLINDRE', 0.05),
  };
  return { shape, interfaces };
};

const buildDipstick = (): BuiltPart => {
  const place = Placement.identity;
  const shape = makeCylinder(2.5, 150, [330, 94, -35], [0, 0, 1]).fuse(
    makeCylinder(8, 6, [330, 94, 115], [0, 0, 1]),
  );
  const interfaces: InterfaceDeclarations = {
    blade: axisNear(place, [330 + 2.5, 94, 40], 'CYLINDRE', 0.05),
  };
  return { shape, interfaces };
};

const buildPcv = (headPlace: Placement): BuiltPart => {
  const place = Placement.translate(
    370,
    0,
    105 + gasketT.valveCover + 52,
  ).compose(headPlace);
  const shape = place.shape(
    makeCylinder(9.4, 30, [0, 0, 0], [0, 0, 1]).fuse(
      makeCylinder(12, 6, [0, 0, 30], [0, 0, 1]),
    ),
  );
  const interfaces: InterfaceDeclarations = {
    body: axisNear(place, [9.4, 0, 8], 'CYLINDRE', 0.1),
  };
  return { shape, interfaces };
};

const buildFillerCap = (headPlace: Placement): BuiltPart => {
  const place = Placement.translate(
    140,
    0,
    105 + gasketT.valveCover + 70,
  ).compose(headPlace);
  const shape = place.shape(
    makeCylinder(21, 10, [0, 0, 0], [0, 0, 1]).fuse(
      makeCylinder(14.9, 8, [0, 0, -8], [0, 0, 1]),
    ),
  );
  const interfaces: InterfaceDeclarations = {
    seat: faceNear(place, [17, 0, 0], 'PLANE', 0.12),
  };
  return { shape, interfaces };
};

const buildSensor = (
  place: Placement,
  d: number,
  withTip: boolean,
): BuiltPart => {
  const r = (d - 0.1) / 2;
  let sensor = makeCylinder(r, 14, [0, 0, -14], [0, 0, 1]).fuse(
    makeCylinder(d, 16, [0, 0, 0], [0, 0, 1]),
  );
  if (withTip) {
    // Tip reaches z = 70.9 world: 0.9 gap over the reluctor teeth OD 140 (REQ-108).
    sensor = makeCylinder(r, 109.1, [0, 0, -109.1], [0, 0, 1]).fuse(
      makeCylinder(d, 12, [0, 0, 0], [0, 0, 1]),
    );
  }
  const shape = place.shape(sensor);
  const interfaces: InterfaceDeclarations = withTip
    ? {
        body: axisNear(place, [r, 0, -50], 'CYLINDRE', 0.1),
        tip: faceNear(place, [r / 2, 0, -109.1], 'PLANE', 0.12),
      }
    : {
        thread: axisNear(place, [r, 0, -7], 'CYLINDRE', 0.1),
        body: axisNear(place, [d, 0, 8], 'CYLINDRE', 0.25),
      };
  return { shape, interfaces };
};

const buildKnockSensor = (bank: 'R' | 'L'): BuiltPart => {
  const x = bank === 'R' ? 135.5 : 268.3;
  const p = bankPoint(bank, x, -68 - 1, 195);
  const inward: Vec3 = bank === 'R' ? [0, c, -c] : [0, -c, -c];
  const place = alignZ4(inward).compose(Placement.translate(p[0], p[1], p[2]));
  const r = (8 - 0.1) / 2;
  const shape = place.shape(
    makeCylinder(r, 13, [0, 0, 1], [0, 0, 1]).fuse(
      makeCylinder(11, 10, [0, 0, -9], [0, 0, 1]),
    ),
  );
  const interfaces: InterfaceDeclarations = {
    thread: axisNear(place, [r, 0, 7], 'CYLINDRE', 0.1),
  };
  return { shape, interfaces };
};

const alignZ4 = (dir: Vec3): Placement => {
  const z: Vec3 = [0, 0, 1];
  const dot = z[0] * dir[0] + z[1] * dir[1] + z[2] * dir[2];
  if (dot > 1 - 1e-12) {
    return Placement.identity;
  }
  if (dot < -1 + 1e-12) {
    return Placement.rotate('x', 180);
  }
  const axis: Vec3 = [
    z[1] * dir[2] - z[2] * dir[1],
    z[2] * dir[0] - z[0] * dir[2],
    z[0] * dir[1] - z[1] * dir[0],
  ];
  const angle = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
  return Placement.identity.rotateAxis([0, 0, 0], axis, angle);
};

export {
  valveSpec,
  retainerCone,
  valveTipT,
  rockerLayout,
  buildWasher,
  buildStud,
  buildNut,
};
