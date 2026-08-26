import type { standardInternationalBaseUnits, standardInternationalDerivedUnits } from '#constants/unit.constants.js';

/** @public */
export type UnitSystem =
  (typeof standardInternationalBaseUnits)[keyof typeof standardInternationalBaseUnits]['variants'][number]['system'];

/**
 * Quantity names for the 7 SI base units.
 *
 * @public
 */
export type UnitQuantity = keyof typeof standardInternationalBaseUnits;

/** @public */
export type ExtractAllUnits<
  T extends {
    unit: string;
    variants: Array<{ unit: string }>;
  },
> = T['unit'] | T['variants'][number]['unit'];

/** @public */
export type ExtractAllSymbols<
  T extends {
    symbol: string;
    variants: Array<{ symbol: string }>;
  },
> = T['symbol'] | T['variants'][number]['symbol'];

// SI Base Units
/** @public */
export type LengthUnit = ExtractAllUnits<(typeof standardInternationalBaseUnits)['length']>;
/** @public */
export type LengthSymbol = ExtractAllSymbols<(typeof standardInternationalBaseUnits)['length']>;

/** @public */
export type MassUnit = ExtractAllUnits<(typeof standardInternationalBaseUnits)['mass']>;
/** @public */
export type MassSymbol = ExtractAllSymbols<(typeof standardInternationalBaseUnits)['mass']>;

/** @public */
export type TimeUnit = ExtractAllUnits<(typeof standardInternationalBaseUnits)['time']>;
/** @public */
export type TimeSymbol = ExtractAllSymbols<(typeof standardInternationalBaseUnits)['time']>;

/** @public */
export type ElectricCurrentUnit = ExtractAllUnits<(typeof standardInternationalBaseUnits)['electricCurrent']>;
/** @public */
export type ElectricCurrentSymbol = ExtractAllSymbols<(typeof standardInternationalBaseUnits)['electricCurrent']>;

/** @public */
export type ThermodynamicTemperatureUnit = ExtractAllUnits<
  (typeof standardInternationalBaseUnits)['thermodynamicTemperature']
>;
/** @public */
export type ThermodynamicTemperatureSymbol = ExtractAllSymbols<
  (typeof standardInternationalBaseUnits)['thermodynamicTemperature']
>;

/** @public */
export type AmountOfSubstanceUnit = ExtractAllUnits<(typeof standardInternationalBaseUnits)['amountOfSubstance']>;
/** @public */
export type AmountOfSubstanceSymbol = ExtractAllSymbols<(typeof standardInternationalBaseUnits)['amountOfSubstance']>;

/** @public */
export type LuminousIntensityUnit = ExtractAllUnits<(typeof standardInternationalBaseUnits)['luminousIntensity']>;
/** @public */
export type LuminousIntensitySymbol = ExtractAllSymbols<(typeof standardInternationalBaseUnits)['luminousIntensity']>;

/**
 * Maps each quantity key to its corresponding unit symbol type
 * using mapped types derived from the SI base unit constants.
 * This enables type-safe unit parsing and conversion.
 *
 * @public
 */
export type QuantitySymbolMap = {
  [Q in keyof typeof standardInternationalBaseUnits]: ExtractAllSymbols<(typeof standardInternationalBaseUnits)[Q]>;
};

/**
 * Maps each quantity key to its corresponding unit symbol type
 * using mapped types derived from the SI base unit constants.
 * This enables type-safe unit parsing and conversion.
 *
 * @public
 */
export type QuantityUnitMap = {
  [Q in keyof typeof standardInternationalBaseUnits]: ExtractAllUnits<(typeof standardInternationalBaseUnits)[Q]>;
};

// SI Derived Units with Special Names
/** @public */
export type AngleUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['planeAngle']>;
/** @public */
export type AngleSymbol = ExtractAllSymbols<(typeof standardInternationalDerivedUnits)['planeAngle']>;
/** @public */
export type SolidAngleUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['solidAngle']>;
/** @public */
export type FrequencyUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['frequency']>;
/** @public */
export type ForceUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['force']>;
/** @public */
export type PressureUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['pressure']>;
/** @public */
export type EnergyUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['energy']>;
/** @public */
export type PowerUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['power']>;
/** @public */
export type ElectricChargeUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['electricCharge']>;
/** @public */
export type VoltageUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['electricPotential']>;
/** @public */
export type CapacitanceUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['capacitance']>;
/** @public */
export type ResistanceUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['electricalResistance']>;
/** @public */
export type ConductanceUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['electricalConductance']>;
/** @public */
export type MagneticFluxUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['magneticFlux']>;
/** @public */
export type MagneticFluxDensityUnit = ExtractAllUnits<
  (typeof standardInternationalDerivedUnits)['magneticFluxDensity']
>;
/** @public */
export type InductanceUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['inductance']>;
/** @public */
export type CelsiusTemperatureUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['celsiusTemperature']>;
/** @public */
export type LuminousFluxUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['luminousFlux']>;
/** @public */
export type IlluminanceUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['illuminance']>;
/** @public */
export type ActivityUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['activityRadionuclide']>;
/** @public */
export type AbsorbedDoseUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['absorbedDose']>;
/** @public */
export type DoseEquivalentUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['doseEquivalent']>;
/** @public */
export type CatalyticActivityUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['catalyticActivity']>;

// Other Common Engineering Units
/** @public */
export type AreaUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['area']>;
/** @public */
export type VolumeUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['volume']>;
/** @public */
export type VelocityUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['velocity']>;
/** @public */
export type AccelerationUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['acceleration']>;
/** @public */
export type TorqueUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['torque']>;
/** @public */
export type DensityUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['density']>;
