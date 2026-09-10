import { standardInternationalBaseUnits, standardInternationalDerivedUnits } from '#constants/unit.constants.js';

type Dimension = Readonly<{
  length?: number;
  mass?: number;
  time?: number;
  electricCurrent?: number;
  thermodynamicTemperature?: number;
  amountOfSubstance?: number;
  luminousIntensity?: number;
}>;

type SourceUnitVariant = {
  readonly unit: string;
  readonly symbol: string;
  readonly factor: number;
  readonly offset?: number;
};

type SourceUnit = {
  readonly unit: string;
  readonly symbol: string;
  readonly variants: readonly SourceUnitVariant[];
};

type UnitDefinition = {
  readonly symbol: string;
  readonly factor: number;
  readonly offset: number;
};

type QuantityDefinition<Source extends SourceUnit> = {
  readonly canonicalUnit: Source['unit'];
  readonly dimension: Dimension;
  readonly units: Readonly<Record<Source['unit'] | Source['variants'][number]['unit'], UnitDefinition>>;
};

const defineQuantity = <const Source extends SourceUnit>(
  source: Source,
  dimension: Dimension,
  options?: { readonly difference?: boolean },
): QuantityDefinition<Source> => {
  const units: Record<string, UnitDefinition> = {
    [source.unit]: Object.freeze({ symbol: source.symbol, factor: 1, offset: 0 }),
  };

  for (const unit of source.variants) {
    units[unit.unit] = Object.freeze({
      symbol: unit.symbol,
      factor: unit.factor,
      offset: options?.difference ? 0 : (unit.offset ?? 0),
    });
  }

  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- keys are populated from the generic source's canonical unit and variants above.
  return Object.freeze({
    canonicalUnit: source.unit,
    dimension: Object.freeze(dimension),
    units: Object.freeze(units),
  }) as QuantityDefinition<Source>;
};

const base = standardInternationalBaseUnits;
const derived = standardInternationalDerivedUnits;

/**
 * Canonical physical quantity registry. Keys are stable semantic quantity IDs;
 * canonical values use coherent SI units.
 *
 * @public
 */
export const quantityRegistry = Object.freeze({
  length: defineQuantity(base.length, { length: 1 }),
  mass: defineQuantity(base.mass, { mass: 1 }),
  time: defineQuantity(base.time, { time: 1 }),
  electricCurrent: defineQuantity(base.electricCurrent, { electricCurrent: 1 }),
  thermodynamicTemperature: defineQuantity(base.thermodynamicTemperature, { thermodynamicTemperature: 1 }),
  temperatureDifference: defineQuantity(
    base.thermodynamicTemperature,
    { thermodynamicTemperature: 1 },
    { difference: true },
  ),
  amountOfSubstance: defineQuantity(base.amountOfSubstance, { amountOfSubstance: 1 }),
  luminousIntensity: defineQuantity(base.luminousIntensity, { luminousIntensity: 1 }),
  planeAngle: defineQuantity(derived.planeAngle, {}),
  solidAngle: defineQuantity(derived.solidAngle, {}),
  ratio: defineQuantity({ unit: 'one', symbol: '1', variants: [] }, {}),
  frequency: defineQuantity(derived.frequency, { time: -1 }),
  force: defineQuantity(derived.force, { mass: 1, length: 1, time: -2 }),
  pressure: defineQuantity(derived.pressure, { mass: 1, length: -1, time: -2 }),
  energy: defineQuantity(derived.energy, { mass: 1, length: 2, time: -2 }),
  torque: defineQuantity(derived.torque, { mass: 1, length: 2, time: -2 }),
  power: defineQuantity(derived.power, { mass: 1, length: 2, time: -3 }),
  electricCharge: defineQuantity(derived.electricCharge, { time: 1, electricCurrent: 1 }),
  electricPotential: defineQuantity(derived.electricPotential, { mass: 1, length: 2, time: -3, electricCurrent: -1 }),
  capacitance: defineQuantity(derived.capacitance, { mass: -1, length: -2, time: 4, electricCurrent: 2 }),
  electricalResistance: defineQuantity(derived.electricalResistance, {
    mass: 1,
    length: 2,
    time: -3,
    electricCurrent: -2,
  }),
  electricalConductance: defineQuantity(derived.electricalConductance, {
    mass: -1,
    length: -2,
    time: 3,
    electricCurrent: 2,
  }),
  magneticFlux: defineQuantity(derived.magneticFlux, { mass: 1, length: 2, time: -2, electricCurrent: -1 }),
  magneticFluxDensity: defineQuantity(derived.magneticFluxDensity, { mass: 1, time: -2, electricCurrent: -1 }),
  inductance: defineQuantity(derived.inductance, { mass: 1, length: 2, time: -2, electricCurrent: -2 }),
  luminousFlux: defineQuantity(derived.luminousFlux, { luminousIntensity: 1 }),
  illuminance: defineQuantity(derived.illuminance, { luminousIntensity: 1, length: -2 }),
  activityRadionuclide: defineQuantity(derived.activityRadionuclide, { time: -1 }),
  absorbedDose: defineQuantity(derived.absorbedDose, { length: 2, time: -2 }),
  doseEquivalent: defineQuantity(derived.doseEquivalent, { length: 2, time: -2 }),
  catalyticActivity: defineQuantity(derived.catalyticActivity, { amountOfSubstance: 1, time: -1 }),
  area: defineQuantity(derived.area, { length: 2 }),
  volume: defineQuantity(derived.volume, { length: 3 }),
  speed: defineQuantity(derived.velocity, { length: 1, time: -1 }),
  acceleration: defineQuantity(derived.acceleration, { length: 1, time: -2 }),
  density: defineQuantity(derived.density, { mass: 1, length: -3 }),
});

/** Quantity IDs in registry order. @public */
// oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- Object.keys returns exactly the own string keys of this frozen registry.
export const quantityIds = Object.freeze(Object.keys(quantityRegistry) as Array<keyof typeof quantityRegistry>);
