/**
 * Shared parametric model of the BRep-native V8.
 *
 * Global engine frame:
 *   +X = crankshaft axis (front snout -> rear flange)
 *   +Z = engine up (bisector of the two banks)
 *   +Y = right bank side
 */

export type FlywheelToothDetail = 'preview' | 'exact';

export const defaultParams = {
  // ---- global ----
  bankAngle: 90,
  bore: 94,
  stroke: 90,
  deckHeight: 232,

  // ---- crankshaft ----
  mainJournalDia: 60,
  mainJournalLen: 28,
  crankpinDia: 52,
  crankpinLen: 30,
  crankThrow: 45,
  webThickness: 22,
  webHubMainDia: 68,
  webHubPinDia: 60,
  counterweightDia: 24,
  counterweightOffset: 30,
  snoutDia: 38,
  snoutLen: 60,
  flangeDia: 120,
  flangeThk: 16,
  flangeBolts: 8,
  flangeBoltDia: 11,
  flangeBoltCircle: 90,
  oilGalleryDia: 6,
  endChamfer: 2,

  // ---- piston / pin / rod ----
  crownDia: 93.6,
  domeRise: 3.5,
  pistonCompHeight: 32,
  pistonSkirtLen: 30,
  ringGrooveDepth: 1.2,
  ringGrooveWidth: 2,
  pinBoreDia: 22,
  wristPinOuterDia: 22,
  wristPinInnerDia: 12,
  wristPinLen: 64,
  rodBigEndDia: 56,
  rodBigEndBoreDia: 52,
  rodSmallEndDia: 30,
  rodSmallEndBoreDia: 22,
  rodLength: 155,
  rodBeamWidth: 18,
  rodBeamThk: 10,

  // ---- block ----
  bores: 4,
  borePitch: 102,
  blockDeckThk: 12,
  blockWallThk: 7,
  mainWebThk: 18,

  // ---- heads / covers / intake ----
  headThk: 110,
  valveCoverHeight: 55,
  plenumDia: 90,
  runnerDia: 34,
  throttleDia: 70,
  intakeValveDia: 34,
  exhaustValveDia: 29,
  valveCenterOffset: 42,
  valveStemDia: 7,
  valveLength: 86,
  valveSpringOuterDia: 26,
  valveSpringInnerDia: 15,
  camshaftDia: 28,
  camLobeLift: 10,
  pushrodDia: 7,
  rockerLength: 46,
  lifterDia: 14,
  fuelRailDia: 16,
  injectorDia: 10,
  exhaustRunnerDia: 30,
  exhaustCollectorDia: 58,

  // ---- damper / flywheel ----
  damperOuterDia: 170,
  damperThk: 34,
  damperGrooves: 6,
  flywheelOuterDia: 320,
  flywheelThk: 28,
  flywheelClutchDia: 240,
  ringGearTeeth: 120,
  flywheelToothDetail: 'preview' as FlywheelToothDetail,

  // ---- spark plug ----
  plugThreadDia: 14,
  plugReach: 19,
  plugHexAcross: 16,

  // ---- production detail / fasteners ----
  headBoltDia: 10,
  headBoltCircleOffset: 64,
  panBoltDia: 6,
  coverBoltDia: 6,
  mainCapBoltDia: 10,
  rodBoltDia: 5,
  gasketThk: 1.2,
  mainBearingWall: 2.5,
  rodBearingWall: 1.8,
  oilPumpDia: 54,
  oilPickupDia: 18,
  filterDia: 58,
  waterPumpDia: 70,
  frontCoverThk: 8,
  detailLevel: 'production' as 'preview' | 'production',
} as const;

export type Params = typeof defaultParams;

// Cross-plane crank pin phasing about +X (deg), front pin first.
export const PIN_PHASE: readonly number[] = [0, 90, 270, 180];

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
export const cosd = (deg: number): number => Math.cos(degToRad(deg));
export const sind = (deg: number): number => Math.sin(degToRad(deg));

export function bankLayouts(p: Params) {
  const halfAngle = p.bankAngle / 2;
  return [
    { side: 'L', deckAngle: 90 + halfAngle, xShift: 0 },
    { side: 'R', deckAngle: 90 - halfAngle, xShift: p.borePitch * 0.147 },
  ] as const;
}

export type CylinderPlacement = {
  bankSide: 'L' | 'R';
  deckAngle: number;
  boreIndex: number;
  cylinderIndex: number;
  x: number;
  normalY: number;
  normalZ: number;
  crankY: number;
  crankZ: number;
  pinY: number;
  pinZ: number;
  rodAngleDeg: number;
  deckY: number;
  deckZ: number;
};

export function cylinderPlacements(p: Params): CylinderPlacement[] {
  const st = crankStations(p);
  const placements: CylinderPlacement[] = [];
  const { rodLength } = p;
  const baseZ = 10;
  let cylinderIndex = 0;

  for (const bank of bankLayouts(p)) {
    const normalY = cosd(bank.deckAngle);
    const normalZ = sind(bank.deckAngle);
    for (let boreIndex = 0; boreIndex < p.bores; boreIndex++) {
      const x = st.pinCenter[boreIndex]! + bank.xShift - 7;
      const phase = PIN_PHASE[boreIndex % PIN_PHASE.length]!;
      const crankY = p.crankThrow * cosd(phase);
      const crankZ = p.crankThrow * sind(phase);
      const a = crankY;
      const b = crankZ - baseZ;
      const k = normalY * a + normalZ * b;
      const slider =
        k +
        Math.sqrt(Math.max(0, k * k - (a * a + b * b - rodLength * rodLength)));
      const pinY = slider * normalY;
      const pinZ = baseZ + slider * normalZ;
      const rodAngleDeg =
        (Math.atan2(pinZ - crankZ, pinY - crankY) * 180) / Math.PI;

      placements.push({
        bankSide: bank.side,
        deckAngle: bank.deckAngle,
        boreIndex,
        cylinderIndex,
        x,
        normalY,
        normalZ,
        crankY,
        crankZ,
        pinY,
        pinZ,
        rodAngleDeg,
        deckY: normalY * p.deckHeight,
        deckZ: baseZ + normalZ * p.deckHeight,
      });
      cylinderIndex++;
    }
  }

  return placements;
}

export function crankStations(p: Params) {
  const { snoutLen, mainJournalLen, webThickness, crankpinLen, flangeThk } = p;
  let x = 0;
  const snoutStart = x;
  x += snoutLen;

  const mainStart: number[] = [];
  const pinStart: number[] = [];
  const pinCenter: number[] = [];
  const webStart: number[] = [];

  for (let i = 0; i <= p.bores; i++) {
    mainStart.push(x);
    x += mainJournalLen;
    if (i < p.bores) {
      webStart.push(x);
      x += webThickness;
      pinStart.push(x);
      pinCenter.push(x + crankpinLen / 2);
      x += crankpinLen;
      webStart.push(x);
      x += webThickness;
    }
  }

  const flangeStart = x;
  x += flangeThk;

  return {
    snoutStart,
    mainStart,
    pinStart,
    pinCenter,
    webStart,
    flangeStart,
    totalLen: x,
    mainCenter: mainStart.map((start) => start + mainJournalLen / 2),
  };
}
