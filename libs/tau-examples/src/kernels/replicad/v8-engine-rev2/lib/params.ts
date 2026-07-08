/**
 * V8R2 parameter package — the single numeric authority (spec Section 2).
 *
 * Every dimension consumed by geometry, placement, gasket blanks, probes,
 * or interfaces lives here. Values are verbatim spec numbers; derived
 * values carry their formulas. Units: mm, degrees.
 */
import { Placement } from './frame.js';
import type { Vec3 } from './frame.js';

// -- Architecture (2.1) -------------------------------------------------------
export const bore = 94;
export const stroke = 90;
export const throw_ = stroke / 2;
export const bankAngle = 90;
export const borePitch = 111;
export const bankStagger = 21.8;
export const deckHeight = 230;
export const rodLength = 152;
export const compHeight = 32.5;
export const deckClearance = 0.5;
export const blockLength = 515;
export const camAxisZ = 120;

export const boreXR = [80, 191, 302, 413] as const;
export const boreXL = boreXR.map((x) => x + bankStagger);
export const crankpinX = boreXR.map((x) => x + bankStagger / 2);
export const mainX = [35.4, 146.4, 257.4, 368.4, 479.4] as const;

/** Crankpin phases (deg from +Z toward +Y about +X, crank-local): P1..P4. */
export const crankpinPhase = [0, 90, 270, 180] as const;

/** Cylinder (1..8) -> bore centre X (R bank 1..4, L bank 5..8). */
export const boreX = (cylinder: number): number =>
  cylinder <= 4 ? boreXR[cylinder - 1]! : boreXL[cylinder - 5]!;
export const bankOf = (cylinder: number): 'R' | 'L' =>
  cylinder <= 4 ? 'R' : 'L';
export const bankSlot = (cylinder: number): number => ((cylinder - 1) % 4) + 1;
/** Crankpin index (1..4) serving cylinder c: pin = bank slot. */
export const pinOf = (cylinder: number): number => bankSlot(cylinder);

// -- Bank frames (1.5) --------------------------------------------------------
// Bank R: +45 deg about X from Z; a>0 is outboard (down-deck), s along the
// bore axis from the crank axis. World point = s*u + a*v at the bore X.
export const bankPlacement = (bank: 'R' | 'L'): Placement =>
  bank === 'R' ? Placement.rotate('x', -45) : Placement.rotate('x', 45);

/** Point in bank coordinates (x along crank, a lateral outboard+, s up-bore). */
export const bankPoint = (
  bank: 'R' | 'L',
  x: number,
  a: number,
  s: number,
): Vec3 => {
  const c = Math.SQRT1_2;
  const y = c * (s + a) * (bank === 'R' ? 1 : -1);
  const z = c * (s - a);
  return [x, y, z];
};

// -- Crank/rod kinematics at the modeled phase (crank 0 = cyl 1 TDC comp) ----
/**
 * Crank installed rotation about X (geometric op): local +Z throw P1 lands
 * on the bank-R axis. A -45 deg rotation about +X maps a feature at local
 * angle t (from +Z toward +Y) to world angle t + 45.
 */
export const crankInstallRotation = -45;

/** Assembly-frame direction of crankpin `pin` (unit [y, z]). */
export const pinDirection = (pin: number): [number, number] => {
  const degrees = crankpinPhase[pin - 1]! + 45;
  const r = (degrees * Math.PI) / 180;
  return [Math.sin(r), Math.cos(r)];
};

/** Piston pin position s along its bank axis for cylinder c (exact 2D solve). */
export const pistonS = (cylinder: number): number => {
  const bank = bankOf(cylinder);
  const pin = pinOf(cylinder);
  const [py, pz] = pinDirection(pin);
  const u: [number, number] =
    bank === 'R' ? [Math.SQRT1_2, Math.SQRT1_2] : [-Math.SQRT1_2, Math.SQRT1_2];
  const dotUC = throw_ * (u[0] * py + u[1] * pz);
  const c0 = throw_ * throw_ - rodLength * rodLength;
  return dotUC + Math.sqrt(dotUC * dotUC - c0);
};

// -- Fits (2.2, verbatim) -----------------------------------------------------
export const fit = {
  pinDia: 22,
  pinBossBore: 22.02,
  bushingId: 22.026,
  skirtDia: 93.93,
  mainJournal: 64,
  mainShellId: 64.045,
  rodJournal: 54,
  rodShellId: 54.043,
  camJournal: 52,
  camBearingIdClearRadial: 0.0325,
  lifterDia: 22,
  lifterBore: 22.04,
  stemIn: 8,
  stemEx: 7.99,
  ringGrooveH: 1.52,
  ringH: 1.475,
  oilGrooveH: 3.05,
  oilPackH: 3.005,
  crankThrustSpan: 28.08,
  flangeSpan: 27.95,
  rodWidth: 21.8,
  crankpinLen: 44,
  spigotDia: 70,
  dowelDia: 12,
  pilotBandDia: 9,
  bladeDia: 74.8,
  throttleBore: 75,
  throttleShaft: 8,
  outerRotorDia: 62,
  rotorWidth: 12,
  impellerDia: 70,
} as const;

/** Press interference (radial, modeled at these values inside each band). */
export const press = {
  shellCrush: 0.025, // P01 0.015-0.040
  guide: 0.025, // P02 0.015-0.035
  seat: 0.06, // P03 0.045-0.075
  dowel: 0.02, // P04 0.010-0.030
  corePlug: 0.05, // P05 0.030-0.080
  camBearing: 0.03, // P06 0.020-0.045
  damperHub: 0.015, // P07 0.005-0.025
  ringGear: 0.15, // P08 0.100-0.200
  reluctor: 0.045, // P09 0.030-0.060
  pilotBushing: 0.025, // P10 0.015-0.040
  smallEndBush: 0.04, // P11 0.025-0.055
  stemSeal: 0.2, // P12 0.10-0.30
  sealCase: 0.15, // P13 0.10-0.25
  sealLip: 0.35, // P14 0.20-0.50
  capRegister: 0.015, // P15 0.005-0.025 per side
  dipstickTube: 0.035, // P16 0.020-0.050
} as const;

/** Gasket compressed nominal thicknesses (T-FITS-GASKET). */
export const gasketT = {
  head: 1.15,
  intake: 0.7,
  exhaust: 1.45,
  valveCover: 3.8,
  oilPan: 2.5,
  frontCover: 0.7,
  rearHousing: 0.7,
  waterPump: 0.7,
  thermostat: 1.3,
  throttle: 0.7,
} as const;

// -- Fastener modeling conventions --------------------------------------------
/**
 * Tapped holes are modeled at the 6H internal-thread major diameter
 * (nominal + 0.05 diametral); bolt thread bands at 6g-ish major
 * (nominal - 0.1). Insertion is proven in the tap void; nothing overlaps.
 */
export const tapOversize = 0.05;
export const threadUndersize = 0.1;
export const tapHoleDia = (nominal: number): number => nominal + tapOversize;
export const threadBandDia = (nominal: number): number =>
  nominal - threadUndersize;

// -- Block section layout -----------------------------------------------------
export const block = {
  /** Saddle (crank tunnel) bore diameter; half in block, half in caps. */
  saddleDia: 68,
  /** Bulkhead thickness along X at each main. */
  bulkheadT: 26,
  /** Main cap width across the registers (P15 presses into the ledges). */
  capWidth: 130,
  capHeight: 42,
  /** Skirt: pan-rail plane below the crank axis; rail flange width. */
  panRailZ: -38,
  skirtHalfWidth: 98,
  /** Pan rail flange extends laterally to this half width. */
  railHalfWidth: 112,
  /** Deck band extents in bank coords (a lateral: valley edge .. outboard). */
  deckAIn: -68,
  deckAOut: 67,
  /** Head-bolt rows at a = +/-58, stations at mainX. */
  boltRowA: 58,
  /** Cylinder barrel land + jacket (REQ-007 budget). */
  jacketInnerR: bore / 2 + 5.5,
  jacketOuterR: bore / 2 + 13.5,
  /** Jacket band along s (deck-8 .. deck-145 covers ring travel). */
  jacketSTop: deckHeight - 8,
  jacketSBottom: deckHeight - 145,
  /** Valley wall plane at a = -68 each bank; floor over the cam tunnel. */
  valleyWallA: -68,
  camTunnelDia: 55,
  /** Main oil gallery datum (canon: y = 0, z = 60), Ø16 full length. */
  galleryZ: 60,
  galleryDia: 16,
  /** Lifter galleries Ø11 along X, one per bank on the lifter axis. */
  lifterGalleryDia: 11,
  saddleFeedDia: 8,
  riserDia: 8,
  camFeedDia: 6,
  valleyDrainDia: 16,
  /** Deck coolant transfers per bank: 8x Ø10 + 2x Ø14 (+2x Ø16 oil drains). */
  coolant10Dia: 10,
  coolant14Dia: 14,
  deckDrainDia: 16,
  /** Deck-transfer drill tilt (deg, about X, toward z for bank R) so the
   * native pattern bucketer separates the two banks' identical patterns. */
  transferTilt: 0.15,
  corePlugDia: 36,
  bellBC: 330,
  frontFaceX: 0,
  rearFaceX: 515,
} as const;

// -- Deck feature map (shared by block, head gasket, head; bank coords) -------
/** 8x Ø10 coolant per bank: clear of the Ø96 fire rings (centre distance
 * sqrt(34^2 + 44^2) = 55.6 > ring 48 + hole 5 + bridge). */
export const coolant10A = 44;
export const coolant10X = (bank: 'R' | 'L'): number[] => {
  const bx = bank === 'R' ? boreXR : boreXL;
  return bx.flatMap((x) => [x - 34, x + 34]);
};
/** 2x Ø14 per bank at the bore 1-2 and 3-4 mid-spans (jacket waist). */
export const coolant14A = 16;
export const coolant14X = (bank: 'R' | 'L'): number[] =>
  bank === 'R' ? [135.5, 357.5] : [135.5 + bankStagger, 357.5 + bankStagger];
/** 2x Ø16 oil drain-backs per bank, valley side at the bore mid-spans
 * (clear of both adjacent jacket annuli). */
export const deckDrainA = -44;
export const deckDrainX = (bank: 'R' | 'L'): number[] =>
  bank === 'R' ? [135.5, 357.5] : [135.5 + bankStagger, 357.5 + bankStagger];
/** 8x Ø20 pushrod holes per bank (2 per cylinder at the lobe stations). */
export const pushrodHoleA = -47;
export const pushrodHoleX = (bank: 'R' | 'L'): number[] => {
  const bx = bank === 'R' ? boreXR : boreXL;
  return bx.flatMap((x) => [x - lobeOffset, x + lobeOffset]);
};
/** Head-bolt stations: 10 per bank (2 rows x 5 mainX stations), lower row
 * (outboard, a=+58) holes 1..5 front->rear, upper row (a=-58) holes 6..10. */
export const headBoltMap = (
  bank: 'R' | 'L',
): Array<{ x: number; a: number }> => {
  const shift = bank === 'R' ? 0 : bankStagger;
  return [
    ...mainX.map((x) => ({ x: x + shift, a: block.boltRowA })),
    ...mainX.map((x) => ({ x: x + shift, a: -block.boltRowA })),
  ];
};
/** 2 head dowels per bank at the deck ends, clear of the fire rings. */
export const headDowelMap = (
  bank: 'R' | 'L',
): Array<{ x: number; a: number }> => {
  const shift = bank === 'R' ? 0 : bankStagger;
  return [
    { x: 30, a: -25 },
    { x: 485, a: -25 },
  ].map(({ x, a }) => ({ x: x + shift, a }));
};

// -- Valvetrain layout ---------------------------------------------------------
/** Lobe X offset from the bore centre (intake +, exhaust - so pushrod
 * planes clear the head-bolt counterbores at the mainX stations). */
export const lobeOffset = 24;
export const lobeX = (cylinder: number, slot: 'Intake' | 'Exhaust'): number =>
  boreX(cylinder) + (slot === 'Intake' ? lobeOffset : -lobeOffset);
/** Cam lobe form (REQ-050): base r16, lift 6.5, nose r3.5, flanks R60. */
export const cam = {
  baseR: 16,
  lift: 6.5,
  noseR: 3.5,
  flankR: 60,
  lobeWidth: 12,
  journalDia: fit.camJournal,
  journalWidth: 22,
  noseSpigotDia: 28,
  gearTapBC: 44,
} as const;
/** Lifter axis: parallel to its bank axis, offset from the cam axis. */
export const lifter = {
  dia: fit.lifterDia,
  boreDia: fit.lifterBore,
  length: 56,
  cupR: 5,
  cupDepth: 4,
  footR: 700,
  /** Perpendicular offset of the lifter axis from the cam axis (outboard). */
  axisOffset: 8,
} as const;

/** Valve/rocker geometry. */
export const valve = {
  tiltDeg: 12,
  inSeatA: -13,
  exSeatA: 15,
  inHeadDia: 47,
  exHeadDia: 36,
  inLen: 128,
  exLen: 129,
  stemInDia: fit.stemIn,
  stemExDia: fit.stemEx,
  keeperGrooveDia: 6.6,
  keeperGrooveW: 1.5,
  keeperGrooveBelowTip: 4,
  seatInOd: 53,
  seatExOd: 42,
  seatInBore: 52.89,
  seatExBore: 41.89,
  seatDepth: 7,
  throatIn: 40,
  throatEx: 30,
  guideOd: 13,
  guideBore: 12.97,
  guideLen: 50,
  sealBossDia: 13.5,
  springMeanDia: 26,
  springWireDia: 4.2,
  springCoils: 7.2,
  springFree: 48,
  installedHeight: 40,
  springPocketDia: 34,
  springPocketDepth: 3,
  retainerOd: 32,
  rockerRatio: 1.6,
  rockerPalletArm: 38.4,
  rockerCupArm: 24,
  pushrodDia: 9.5,
  pushrodBallR: 4.75,
  pushrodLen: 200,
} as const;

// -- Head layout (local frame: deck on XY plane at z=0, +z into the head; the
// local +y points VALLEY-ward, so a_local = -a_bank; +x rearward as global) --
export const head = {
  length: 475,
  frontX: 20,
  height: 105,
  aOut: 72,
  aIn: -80,
  deckT: 11,
  boltHoleDia: 12.5,
  pushrodHoleDia: 20,
  drainDia: 16,
  exhaustPortDia: 35,
  intakePortDia: 38,
  chamberDia: 88,
  chamberDepth: 8.2,
  plugSeatDia: 20,
  plugTapDia: 14,
  coverRailInset: 8,
} as const;

// -- Piston group (3.3) --------------------------------------------------------
export const piston = {
  skirtDia: fit.skirtDia,
  topLandDia: 93.2,
  grooveRootDia: 85.9,
  topLandH: 6,
  land2H: 3.5,
  land3H: 3,
  skirtLen: 24,
  bossOuter: 34,
  bossInner: 12,
  clipGrooveDia: 23.6,
  clipGrooveW: 1.3,
  clipGrooveOuter: 32.5,
  crownT: 7,
  reliefInDia: 49,
  reliefInDepth: 1.8,
  reliefExDia: 38,
  reliefExDepth: 2.2,
  drainHoleDia: 2.5,
  pinLen: 62,
  pinBoreDia: 12,
} as const;

// -- Rod (3.4) ------------------------------------------------------------------
export const rod = {
  length: rodLength,
  bigEndBore: 57,
  bigEndWidth: fit.rodWidth,
  smallEndEye: 25,
  smallEndWidth: 22,
  boltTapDia: 9,
  boltSpacing: 46,
  beamFlangeW: 16,
  beamFlangeT: 3.5,
  beamWebT: 4,
  beamDepth: 24,
  capDepth: 22,
} as const;

// -- Crank (3.2) ---------------------------------------------------------------
export const crank = {
  mainDia: fit.mainJournal,
  mainWidth: 26,
  thrustWidth: 28.08,
  pinDia: fit.rodJournal,
  pinLen: fit.crankpinLen,
  cheekT: 20.5,
  /**
   * Spec 3.2 says counterweight R 92, but with deck 230 / rod 152 / skirt
   * length 28 the BDC piston skirt approaches the crank axis to 89.0 —
   * R 92 physically interferes. Modeled at 86 (spec-integrity finding).
   */
  counterweightR: 86,
  webR: 70,
  snoutDia: 38,
  gearSeatDia: 48,
  shoulderX: -32,
  flatsAf: 34,
  keyway: { w: 10, h: 8, len: 36, frontX: -54 },
  snoutThreadDia: 16,
  snoutThreadDepth: 30,
  rearSealDia: 90,
  flangeDia: 120,
  flangeT: 16,
  flangeBC: 100,
  spigotDia: fit.spigotDia,
  spigotLen: 8,
  pilotBoreDia: 20,
  pilotBoreDepth: 25,
  reluctorSeatDia: 98,
  oilDrillDia: 5,
  frontX: -60,
  rearX: 562,
  fillet: 2.5,
} as const;

/**
 * Realizable firing order for crankpinPhase 0/90/270/180 (the spec's
 * declared 1-5-4-8-6-3-7-2 is NOT kinematically realizable with its own
 * phase table — cyl 6 has no TDC at crank 360; spec-integrity finding).
 * TDC-compression angles used for lobe phasing.
 */
export const fireAngles: Record<number, number> = {
  1: 0,
  5: 90,
  4: 180,
  8: 270,
  7: 360,
  2: 450,
  6: 540,
  3: 630,
};

/** Crank oil drilling map (3.2): main -> pin, exit offset toward the main. */
export const crankOilMap: ReadonlyArray<{ main: number; pin: number }> = [
  { main: 1, pin: 1 },
  { main: 2, pin: 2 },
  { main: 4, pin: 3 },
  { main: 5, pin: 4 },
  { main: 2, pin: 1 },
  { main: 3, pin: 2 },
  { main: 3, pin: 3 },
  { main: 4, pin: 4 },
];

// -- Timing gears ---------------------------------------------------------------
export const gears = {
  crankTeeth: 32,
  camTeeth: 64,
  module: 2.5,
  crankPitchR: 40,
  camPitchR: 80,
  width: 18,
  crankOd: 85,
  camOd: 165,
  camBoltBC: 44,
} as const;

// -- Firing order (spec declaration; see fireAngles for the realizable map) --
export const firingOrder = [1, 5, 4, 8, 6, 3, 7, 2] as const;
