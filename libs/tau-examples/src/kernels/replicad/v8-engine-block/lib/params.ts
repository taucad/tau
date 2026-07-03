/**
 * Shared parametric model of the cross-plane 90° V8.
 * Single source of truth mirroring spec/v8-engine.sysml2.
 *
 * Global engine frame:
 *   +X = crankshaft axis (front snout -> rear flange)
 *   +Z = engine up (bisector of the two banks)
 *   +Y = exhaust/passenger side
 */

export const defaultParams = {
  // ---- global ----
  bankAngle: 90, // Included V angle (deg)
  bore: 94, // Cylinder diameter (mm)
  stroke: 90, // => crank throw 45
  deckHeight: 232, // Crank axis -> deck face (mm)

  // ---- crankshaft ----
  mainJournalDia: 60,
  mainJournalLen: 28,
  crankpinDia: 52,
  crankpinLen: 30,
  crankThrow: 45, // Stroke / 2
  webThickness: 22,
  webHubMainDia: 68, // Hub around main journal in a web
  webHubPinDia: 60, // Hub around crankpin in a web
  counterweightDia: 150,
  counterweightOffset: 30, // Lobe centre offset opposite the pin
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
  pistonCompHeight: 32,
  pistonSkirtLen: 30,
  domeRise: 4,
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
  rodLength: 155, // Centre to centre
  rodBeamWidth: 18,
  rodBeamThk: 10,

  // ---- block ----
  bores: 4, // Bores per bank
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

  // ---- damper / flywheel ----
  damperOuterDia: 170,
  damperThk: 34,
  damperGrooves: 6,
  flywheelOuterDia: 320,
  flywheelThk: 28,
  flywheelClutchDia: 240,
  ringGearTeeth: 120,

  // ---- spark plug ----
  plugThreadDia: 14,
  plugReach: 19,
  plugHexAcross: 16,
} as const;

export type Params = typeof defaultParams;

// Cross-plane crank pin phasing about +X (deg), front pin first.
export const PIN_PHASE: readonly number[] = [0, 90, 270, 180];

// Degree helpers (replicad math is radian-free at the API surface, but our
// trig is in degrees to match the SysML attributes).
export const cosd = (deg: number): number => Math.cos((deg * Math.PI) / 180);
export const sind = (deg: number): number => Math.sin((deg * Math.PI) / 180);

/**
 * Axial (X) station map of the crankshaft, computed front-to-back so every
 * component (block, rods, damper, flywheel) can reference identical stations.
 * Returns the X coordinate of each feature's *start* face plus convenience
 * centres for the four crankpins and five main journals.
 */
export function crankStations(p: Params) {
  const { snoutLen, mainJournalLen, webThickness, crankpinLen, flangeThk } = p;
  let x = 0;
  const snoutStart = x;
  x += snoutLen;

  const mainStart: number[] = [];
  const pinStart: number[] = [];
  const pinCenter: number[] = [];
  const webStart: number[] = []; // Every web front face

  for (let index = 0; index < 5; index++) {
    mainStart.push(x);
    x += mainJournalLen;
    if (index < 4) {
      // Throw block: web | pin | web
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
  const totalLength = x;

  return {
    snoutStart,
    mainStart,
    pinStart,
    pinCenter,
    webStart,
    flangeStart,
    totalLen: totalLength,
    mainCenter: mainStart.map((s) => s + mainJournalLen / 2),
  };
}
