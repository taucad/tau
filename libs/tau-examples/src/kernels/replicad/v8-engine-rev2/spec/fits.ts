/**
 * T-FITS transcription — the single fit authority from
 * docs/research/v8-engine-rev2-sysml2-specification.md Section 2.2.
 *
 * All values VERBATIM. Radial mm unless the row says diametral (D) or
 * axial (A). The GeoSpec interference allowance list must equal the press
 * section exactly, both directions (REQ-V8R2-077).
 */
import type { GeoSpecComponentInterferenceAllowance } from 'geospec';

export type FitMeasure = 'radial' | 'diametral' | 'axial';

export type RunningFit = {
  id: string;
  joint: string;
  min: number;
  max: number;
  measure: FitMeasure;
  /** F28 is a frontier-gated assertion (REQ-V8R2-053), not a red test today. */
  frontierGated?: boolean;
};

/** T-FITS-RUN — running/locational clearances F01–F28. */
export const runningFits: readonly RunningFit[] = [
  {
    id: 'F01',
    joint: 'Wrist pin in piston boss (full-float)',
    min: 0.005,
    max: 0.015,
    measure: 'radial',
  },
  {
    id: 'F02',
    joint: 'Wrist pin in rod small-end bushing',
    min: 0.008,
    max: 0.018,
    measure: 'radial',
  },
  {
    id: 'F03',
    joint: 'Piston skirt in bore at skirt-mid gauge point',
    min: 0.02,
    max: 0.05,
    measure: 'radial',
  },
  {
    id: 'F04',
    joint: 'Main bearing vertical oil clearance (radial as modeled concentric)',
    min: 0.015,
    max: 0.0325,
    measure: 'radial',
  },
  {
    id: 'F05',
    joint: 'Rod bearing vertical oil clearance (radial as modeled concentric)',
    min: 0.0125,
    max: 0.03,
    measure: 'radial',
  },
  {
    id: 'F06',
    joint: 'Cam journal in cam bearing ID (radial as modeled concentric)',
    min: 0.02,
    max: 0.045,
    measure: 'radial',
  },
  {
    id: 'F07',
    joint: 'Lifter in lifter bore',
    min: 0.01,
    max: 0.03,
    measure: 'radial',
  },
  {
    id: 'F08',
    joint: 'Valve stem in guide, intake',
    min: 0.012,
    max: 0.03,
    measure: 'radial',
  },
  {
    id: 'F09',
    joint: 'Valve stem in guide, exhaust',
    min: 0.018,
    max: 0.038,
    measure: 'radial',
  },
  {
    id: 'F10',
    joint: 'Ring side clearance in groove (top, second)',
    min: 0.02,
    max: 0.07,
    measure: 'axial',
  },
  {
    id: 'F11',
    joint: 'Oil ring pack side clearance',
    min: 0.02,
    max: 0.07,
    measure: 'axial',
  },
  {
    id: 'F12',
    joint: 'Top ring end gap, installed',
    min: 0.3,
    max: 0.5,
    measure: 'axial',
  },
  {
    id: 'F13',
    joint: 'Second ring end gap, installed',
    min: 0.4,
    max: 0.6,
    measure: 'axial',
  },
  {
    id: 'F14',
    joint: 'Oil rail end gap, installed',
    min: 0.38,
    max: 1.4,
    measure: 'axial',
  },
  {
    id: 'F15',
    joint: 'Crank endplay at thrust main #3 (total)',
    min: 0.05,
    max: 0.2,
    measure: 'axial',
  },
  {
    id: 'F16',
    joint: 'Cam endplay at thrust plate (total)',
    min: 0.05,
    max: 0.15,
    measure: 'axial',
  },
  {
    id: 'F17',
    joint: 'Rod pair side clearance on crankpin (total)',
    min: 0.25,
    max: 0.55,
    measure: 'axial',
  },
  {
    id: 'F18',
    joint: 'Flywheel spigot on crank pilot boss Ø70',
    min: 0,
    max: 0.025,
    measure: 'radial',
  },
  {
    id: 'F19',
    joint: 'Head dowel in head dowel bore (slip side)',
    min: 0.005,
    max: 0.03,
    measure: 'radial',
  },
  {
    id: 'F20',
    joint: 'Bellhousing dowel slip side',
    min: 0.005,
    max: 0.03,
    measure: 'radial',
  },
  {
    id: 'F21',
    joint: 'Rod bolt fitted pilot in reamed cap/rod bore',
    min: 0.004,
    max: 0.015,
    measure: 'radial',
  },
  {
    id: 'F22',
    joint: 'Throttle blade in bore',
    min: 0.05,
    max: 0.15,
    measure: 'radial',
  },
  {
    id: 'F23',
    joint: 'Throttle shaft in shaft bores',
    min: 0.01,
    max: 0.03,
    measure: 'radial',
  },
  {
    id: 'F24',
    joint: 'Oil pump outer rotor in housing pocket',
    min: 0.05,
    max: 0.1,
    measure: 'radial',
  },
  {
    id: 'F25',
    joint: 'Pump rotor side clearance vs cover plate',
    min: 0.02,
    max: 0.06,
    measure: 'axial',
  },
  {
    id: 'F26',
    joint: 'Gerotor tip clearance',
    min: 0.04,
    max: 0.1,
    measure: 'radial',
  },
  {
    id: 'F27',
    joint: 'Water pump impeller tip in volute',
    min: 0.5,
    max: 1.5,
    measure: 'radial',
  },
  {
    id: 'F28',
    joint: 'Timing gear mesh backlash at pitch point',
    min: 0.08,
    max: 0.2,
    measure: 'radial',
    frontierGated: true,
  },
];

export type PressFit = {
  id: string;
  joint: string;
  minInterference: number;
  maxInterference: number;
  /** Component-name selectors used to declare the GeoSpec allowance pair. */
  left: string | RegExp;
  right: string | RegExp;
};

/** T-FITS-PRESS — declared radial interference rows P01–P16. */
export const pressFits: readonly PressFit[] = [
  {
    id: 'P01',
    joint: 'Bearing shell crush (all 26 shells vs housings)',
    minInterference: 0.015,
    maxInterference: 0.04,
    left: /^(Main|Rod) Bearing (Upper|Lower) Shell \d+$/,
    right: /^(Block 1|Main Bearing Cap \d+|Connecting Rod \d+|Rod Cap \d+)$/,
  },
  {
    id: 'P02',
    joint: 'Valve guide in head guide bore',
    minInterference: 0.015,
    maxInterference: 0.035,
    left: /^Valve Guide \d+$/,
    right: /^Cylinder Head [LR]$/,
  },
  {
    id: 'P03',
    joint: 'Valve seat insert in head counterbore (IN Ø53, EX Ø42)',
    minInterference: 0.045,
    maxInterference: 0.075,
    left: /^(Intake|Exhaust) Valve Seat \d+$/,
    right: /^Cylinder Head [LR]$/,
  },
  {
    id: 'P04',
    joint: 'Head/bellhousing dowels in block (press side)',
    minInterference: 0.01,
    maxInterference: 0.03,
    left: /^(Head Dowel \d+|Bellhousing Dowel \d+)$/,
    right: 'Block 1',
  },
  {
    id: 'P05',
    joint: 'Core plug in block core bore',
    minInterference: 0.03,
    maxInterference: 0.08,
    left: /^Core Plug \d+$/,
    right: 'Block 1',
  },
  {
    id: 'P06',
    joint: 'Cam bearing OD in block cam tunnel Ø55',
    minInterference: 0.02,
    maxInterference: 0.045,
    left: /^Camshaft Bearing \d+$/,
    right: 'Block 1',
  },
  {
    id: 'P07',
    joint: 'Damper hub on crank snout Ø38 (+ key)',
    minInterference: 0.005,
    maxInterference: 0.025,
    left: 'Damper Hub 1',
    right: 'Crankshaft 1',
  },
  {
    id: 'P08',
    joint: 'Ring gear on flywheel rim (shrink)',
    minInterference: 0.1,
    maxInterference: 0.2,
    left: 'Ring Gear 1',
    right: 'Flywheel 1',
  },
  {
    id: 'P09',
    joint: 'Reluctor ring on crank seat Ø98',
    minInterference: 0.03,
    maxInterference: 0.06,
    left: 'Reluctor Ring 1',
    right: 'Crankshaft 1',
  },
  {
    id: 'P10',
    joint: 'Pilot bushing in crank pilot bore Ø20',
    minInterference: 0.015,
    maxInterference: 0.04,
    left: 'Pilot Bushing 1',
    right: 'Crankshaft 1',
  },
  {
    id: 'P11',
    joint: 'Small-end bushing in rod eye',
    minInterference: 0.025,
    maxInterference: 0.055,
    left: /^Small End Bushing \d+$/,
    right: /^Connecting Rod \d+$/,
  },
  {
    id: 'P12',
    joint: 'Valve stem seal on guide boss Ø13.5 (elastomer)',
    minInterference: 0.1,
    maxInterference: 0.3,
    left: /^Valve Stem Seal \d+$/,
    right: /^Valve Guide \d+$/,
  },
  {
    id: 'P13',
    joint: 'Front/rear main seal OD in housing bore (elastomer)',
    minInterference: 0.1,
    maxInterference: 0.25,
    left: /^(Front|Rear) Main Seal 1$/,
    right: /^(Front Cover 1|Rear Seal Housing 1)$/,
  },
  {
    id: 'P14',
    joint: 'Seal lip on journal, declared squeeze (elastomer)',
    minInterference: 0.2,
    maxInterference: 0.5,
    left: /^(Front|Rear) Main Seal 1$/,
    right: /^(Damper Hub 1|Crankshaft 1)$/,
  },
  {
    id: 'P15',
    joint: 'Main cap side register in block ledge (per side)',
    minInterference: 0.005,
    maxInterference: 0.025,
    left: /^Main Bearing Cap \d+$/,
    right: 'Block 1',
  },
  {
    id: 'P16',
    joint: 'Dipstick tube in block boss',
    minInterference: 0.02,
    maxInterference: 0.05,
    left: 'Dipstick Tube 1',
    right: 'Block 1',
  },
];

export type GasketBand = {
  /** Gasket occurrence(s) this row governs. */
  gasket: string;
  free: number;
  compressedNominal: number;
  min: number;
  max: number;
};

/**
 * T-FITS-GASKET — compressed-state bands. Gaskets are MODELED at compressed
 * nominal; the assertion is the clamped face-to-face distance (REQ-V8R2-037,
 * REQ-V8R2-049).
 */
export const gasketBands: readonly GasketBand[] = [
  {
    gasket: 'Head Gasket',
    free: 1.3,
    compressedNominal: 1.15,
    min: 1.1,
    max: 1.2,
  },
  {
    gasket: 'Intake Gasket',
    free: 0.8,
    compressedNominal: 0.7,
    min: 0.65,
    max: 0.75,
  },
  {
    gasket: 'Exhaust Gasket',
    free: 1.6,
    compressedNominal: 1.45,
    min: 1.4,
    max: 1.55,
  },
  {
    gasket: 'Valve Cover Gasket',
    free: 4.5,
    compressedNominal: 3.8,
    min: 3.6,
    max: 4,
  },
  {
    gasket: 'Oil Pan Gasket',
    free: 3,
    compressedNominal: 2.5,
    min: 2.3,
    max: 2.7,
  },
  {
    gasket: 'Front Cover Gasket',
    free: 0.8,
    compressedNominal: 0.7,
    min: 0.65,
    max: 0.75,
  },
  {
    gasket: 'Rear Seal Housing Gasket',
    free: 0.8,
    compressedNominal: 0.7,
    min: 0.65,
    max: 0.75,
  },
  {
    gasket: 'Water Pump Gasket',
    free: 0.8,
    compressedNominal: 0.7,
    min: 0.65,
    max: 0.75,
  },
  {
    gasket: 'Thermostat Gasket',
    free: 1.5,
    compressedNominal: 1.3,
    min: 1.2,
    max: 1.4,
  },
  {
    gasket: 'Throttle Gasket',
    free: 0.8,
    compressedNominal: 0.7,
    min: 0.65,
    max: 0.75,
  },
];

/**
 * The declared interference allowance list (REQ-V8R2-077): EXACTLY one entry
 * per T-FITS-PRESS row, nothing else. Elastomers modeled at compressed
 * nominal (damper bond, injector o-rings) do not overlap and therefore have
 * no entry — matching the press table's own scope.
 */
export const expectedIntentionalInterferenceAllowances =
  (): GeoSpecComponentInterferenceAllowance[] =>
    pressFits.map((row) => ({
      kind: 'intentionalInterference',
      left: row.left,
      right: row.right,
      reason: `${row.id} ${row.joint}: declared radial interference ${row.minInterference}-${row.maxInterference} (T-FITS-PRESS)`,
    }));

/** Reason string for interference relationship rows, citing the P row. */
export const pressFitReason = (id: string): string => {
  const row = pressFits.find((candidate) => candidate.id === id);
  if (!row) {
    throw new Error(`Unknown T-FITS-PRESS row ${id}`);
  }
  return `${row.id} ${row.joint}: radial interference ${row.minInterference}-${row.maxInterference} (T-FITS-PRESS)`;
};

/** Reason string for clearance relationship rows, citing the F row. */
export const runningFitReason = (id: string): string => {
  const row = runningFits.find((candidate) => candidate.id === id);
  if (!row) {
    throw new Error(`Unknown T-FITS-RUN row ${id}`);
  }
  return `${row.id} ${row.joint}: ${row.min}-${row.max} ${row.measure} (T-FITS-RUN)`;
};

/** Verbatim band lookup for clearance rows derived from a T-FITS-RUN row. */
export const runningFitBand = (id: string): { min: number; max: number } => {
  const row = runningFits.find((candidate) => candidate.id === id);
  if (!row) {
    throw new Error(`Unknown T-FITS-RUN row ${id}`);
  }
  return { min: row.min, max: row.max };
};
