/**
 * T-CENSUS transcription — the 650-occurrence bidirectional census from
 * docs/research/v8-engine-rev2-sysml2-specification.md Section 4.1.
 *
 * Names and counts are VERBATIM spec values. The census is closed in BOTH
 * directions (REQ-V8R2-100): every listed name must exist in the export and
 * zero unlisted occurrences may exist. There is no orphan allowlist in rev2
 * (REQ-V8R2-101) — the v1 `Timing Chain` class of decorative part is gone.
 */

export type CensusSubsystem =
  | 'block-structure'
  | 'cranktrain'
  | 'piston-group'
  | 'connecting-rods'
  | 'heads-valves'
  | 'valvetrain-drive'
  | 'induction-fuel'
  | 'exhaust'
  | 'covers-lube-cooling-service';

const numbered = (base: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) => `${base} ${index + 1}`);

/** Bank-scoped singleton pair, spec order R then L (Section 1.5). */
const banked = (base: string): string[] => [`${base} R`, `${base} L`];

/** Section 4.1 census table, one entry per subsystem, names in table order. */
export const censusBySubsystem: Record<CensusSubsystem, string[]> = {
  'block-structure': [
    ...numbered('Block', 1),
    ...numbered('Main Bearing Cap', 5),
    ...numbered('Main Cap Bolt', 10),
    ...numbered('Main Bearing Upper Shell', 5),
    ...numbered('Main Bearing Lower Shell', 5),
    ...numbered('Camshaft Bearing', 5),
    ...numbered('Core Plug', 8),
    ...numbered('Head Dowel', 4),
    ...numbered('Bellhousing Dowel', 2),
    ...numbered('Oil Gallery Plug', 5),
  ],
  cranktrain: [
    ...numbered('Crankshaft', 1),
    ...numbered('Crank Key', 1),
    ...numbered('Crank Timing Gear', 1),
    ...numbered('Damper Hub', 1),
    ...numbered('Damper Elastomer', 1),
    ...numbered('Damper Inertia Ring', 1),
    ...numbered('Damper Bolt', 1),
    ...numbered('Damper Washer', 1),
    ...numbered('Flywheel', 1),
    ...numbered('Flywheel Bolt', 8),
    ...numbered('Ring Gear', 1),
    ...numbered('Pilot Bushing', 1),
    ...numbered('Reluctor Ring', 1),
    ...numbered('Front Main Seal', 1),
    ...numbered('Rear Main Seal', 1),
    ...numbered('Rear Seal Housing', 1),
    ...numbered('Rear Seal Housing Bolt', 6),
    ...numbered('Rear Seal Housing Gasket', 1),
  ],
  'piston-group': [
    ...numbered('Piston', 8),
    ...numbered('Wrist Pin', 8),
    ...numbered('Pin Circlip', 16),
    ...numbered('Top Ring', 8),
    ...numbered('Second Ring', 8),
    ...numbered('Oil Ring Upper Rail', 8),
    ...numbered('Oil Ring Lower Rail', 8),
    ...numbered('Oil Ring Expander', 8),
  ],
  'connecting-rods': [
    ...numbered('Connecting Rod', 8),
    ...numbered('Rod Cap', 8),
    ...numbered('Rod Bolt', 16),
    ...numbered('Rod Bearing Upper Shell', 8),
    ...numbered('Rod Bearing Lower Shell', 8),
    ...numbered('Small End Bushing', 8),
  ],
  'heads-valves': [
    ...banked('Cylinder Head'),
    ...banked('Head Gasket'),
    ...numbered('Head Bolt', 20),
    ...numbered('Valve Guide', 16),
    ...numbered('Valve Stem Seal', 16),
    ...numbered('Valve Spring', 16),
    ...numbered('Spring Retainer', 16),
    ...numbered('Intake Valve Seat', 8),
    ...numbered('Exhaust Valve Seat', 8),
    ...numbered('Intake Valve', 8),
    ...numbered('Exhaust Valve', 8),
    ...numbered('Valve Keeper', 32),
    ...numbered('Spark Plug', 8),
  ],
  'valvetrain-drive': [
    ...numbered('Camshaft', 1),
    ...numbered('Cam Thrust Plate', 1),
    ...numbered('Thrust Plate Bolt', 2),
    ...numbered('Cam Gear', 1),
    ...numbered('Cam Gear Bolt', 3),
    ...numbered('Lifter', 16),
    ...numbered('Pushrod', 16),
    ...numbered('Rocker Stud', 16),
    ...numbered('Rocker Arm', 16),
    ...numbered('Rocker Pivot Ball', 16),
    ...numbered('Rocker Adjuster Nut', 16),
  ],
  'induction-fuel': [
    ...numbered('Intake Manifold', 1),
    ...banked('Intake Gasket'),
    ...numbered('Intake Bolt', 10),
    ...numbered('Throttle Body', 1),
    ...numbered('Throttle Shaft', 1),
    ...numbered('Throttle Blade', 1),
    ...numbered('Throttle Blade Screw', 2),
    ...numbered('Throttle Bolt', 4),
    ...numbered('Throttle Gasket', 1),
    ...banked('Fuel Rail'),
    ...numbered('Rail Bolt', 4),
    ...numbered('Injector', 8),
    ...numbered('Injector O-Ring', 16),
    ...numbered('Thermostat', 1),
    ...numbered('Thermostat Housing', 1),
    ...numbered('Thermostat Housing Bolt', 2),
    ...numbered('Thermostat Gasket', 1),
  ],
  exhaust: [
    ...banked('Exhaust Header'),
    ...banked('Exhaust Gasket'),
    ...numbered('Exhaust Stud', 16),
    ...numbered('Exhaust Nut', 16),
  ],
  'covers-lube-cooling-service': [
    ...banked('Valve Cover'),
    ...banked('Valve Cover Gasket'),
    ...numbered('Valve Cover Bolt', 16),
    ...numbered('Front Cover', 1),
    ...numbered('Front Cover Gasket', 1),
    ...numbered('Front Cover Bolt', 10),
    ...numbered('Oil Pump Inner Rotor', 1),
    ...numbered('Oil Pump Outer Rotor', 1),
    ...numbered('Oil Pump Cover', 1),
    ...numbered('Oil Pump Cover Bolt', 4),
    ...numbered('Relief Valve Piston', 1),
    ...numbered('Relief Valve Spring', 1),
    ...numbered('Relief Valve Plug', 1),
    ...numbered('Oil Filter', 1),
    ...numbered('Oil Pickup Tube', 1),
    ...numbered('Pickup Bolt', 2),
    ...numbered('Oil Pan', 1),
    ...numbered('Oil Pan Gasket', 1),
    ...numbered('Oil Pan Bolt', 16),
    ...numbered('Drain Plug', 1),
    ...numbered('Water Pump Housing', 1),
    ...numbered('Water Pump Shaft', 1),
    ...numbered('Water Pump Impeller', 1),
    ...numbered('Water Pump Pulley', 1),
    ...numbered('Water Pump Gasket', 1),
    ...numbered('Water Pump Bolt', 4),
    ...numbered('Dipstick', 1),
    ...numbered('Dipstick Tube', 1),
    ...numbered('PCV Valve', 1),
    ...numbered('Oil Filler Cap', 1),
    ...numbered('Coolant Temp Sensor', 1),
    ...numbered('Oil Pressure Sensor', 1),
    ...numbered('Knock Sensor', 2),
    ...numbered('Cam Position Sensor', 1),
    ...numbered('Crank Position Sensor', 1),
  ],
};

/** Section 4.2 roll-up, verbatim. */
export const expectedSubsystemCounts: Record<CensusSubsystem, number> = {
  'block-structure': 50,
  cranktrain: 30,
  'piston-group': 72,
  'connecting-rods': 56,
  'heads-valves': 160,
  'valvetrain-drive': 104,
  'induction-fuel': 58,
  exhaust: 36,
  'covers-lube-cooling-service': 84,
};

/** Section 4.1 grand total, verbatim. */
export const expectedOccurrenceTotal = 650;

/** All 650 expected occurrence names in census order. */
export const expectedOccurrenceNames = (): string[] =>
  Object.values(censusBySubsystem).flat();

/**
 * Single part def installed as a mirrored L-bank occurrence (REQ-V8R2-103,
 * Section 4.2 list, verbatim).
 */
export const mirroredOccurrenceNames: readonly string[] = [
  'Cylinder Head L',
  'Head Gasket L',
  'Intake Gasket L',
  'Exhaust Header L',
  'Exhaust Gasket L',
  'Valve Cover L',
  'Valve Cover Gasket L',
];

/**
 * Bidirectional census closure (REQ-V8R2-100): throws naming every missing
 * expected occurrence and every observed occurrence outside the census.
 */
export const assertBidirectionalCensusClosure = (
  observedNames: readonly string[],
): void => {
  const expected = new Set(expectedOccurrenceNames());
  const observed = new Set(observedNames);
  const missing = [...expected].filter((name) => !observed.has(name));
  const unlisted = [...observed].filter((name) => !expected.has(name));
  if (missing.length > 0 || unlisted.length > 0) {
    throw new Error(
      `Census closure violated (REQ-V8R2-100). Missing ${missing.length}: ${missing.join(', ') || '—'}. ` +
        `Unlisted ${unlisted.length}: ${unlisted.join(', ') || '—'}.`,
    );
  }
};
