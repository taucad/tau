import type { standardInternationalBaseUnits, standardInternationalDerivedUnits } from '#constants/unit.constants.js';

export type UnitSystem =
  (typeof standardInternationalBaseUnits)[keyof typeof standardInternationalBaseUnits]['variants'][number]['system'];

/**
 * Quantity names for the 7 SI base units.
 */
export type UnitQuantity = keyof typeof standardInternationalBaseUnits;

export type ExtractAllUnits<
  T extends {
    unit: string;
    variants: Array<{ unit: string }>;
  },
> = T['unit'] | T['variants'][number]['unit'];

export type ExtractAllSymbols<
  T extends {
    symbol: string;
    variants: Array<{ symbol: string }>;
  },
> = T['symbol'] | T['variants'][number]['symbol'];

// SI Base Units
export type LengthUnit = ExtractAllUnits<(typeof standardInternationalBaseUnits)['length']>;
export type LengthSymbol = ExtractAllSymbols<(typeof standardInternationalBaseUnits)['length']>;

export type MassUnit = ExtractAllUnits<(typeof standardInternationalBaseUnits)['mass']>;
export type MassSymbol = ExtractAllSymbols<(typeof standardInternationalBaseUnits)['mass']>;

export type TimeUnit = ExtractAllUnits<(typeof standardInternationalBaseUnits)['time']>;
export type TimeSymbol = ExtractAllSymbols<(typeof standardInternationalBaseUnits)['time']>;

export type ElectricCurrentUnit = ExtractAllUnits<(typeof standardInternationalBaseUnits)['electricCurrent']>;
export type ElectricCurrentSymbol = ExtractAllSymbols<(typeof standardInternationalBaseUnits)['electricCurrent']>;

export type ThermodynamicTemperatureUnit = ExtractAllUnits<
  (typeof standardInternationalBaseUnits)['thermodynamicTemperature']
>;
export type ThermodynamicTemperatureSymbol = ExtractAllSymbols<
  (typeof standardInternationalBaseUnits)['thermodynamicTemperature']
>;

export type AmountOfSubstanceUnit = ExtractAllUnits<(typeof standardInternationalBaseUnits)['amountOfSubstance']>;
export type AmountOfSubstanceSymbol = ExtractAllSymbols<(typeof standardInternationalBaseUnits)['amountOfSubstance']>;

export type LuminousIntensityUnit = ExtractAllUnits<(typeof standardInternationalBaseUnits)['luminousIntensity']>;
export type LuminousIntensitySymbol = ExtractAllSymbols<(typeof standardInternationalBaseUnits)['luminousIntensity']>;

/**
 * Maps each quantity key to its corresponding unit symbol type
 * using mapped types derived from the SI base unit constants.
 * This enables type-safe unit parsing and conversion.
 */
export type QuantitySymbolMap = {
  [Q in keyof typeof standardInternationalBaseUnits]: ExtractAllSymbols<(typeof standardInternationalBaseUnits)[Q]>;
};

/**
 * Maps each quantity key to its corresponding unit symbol type
 * using mapped types derived from the SI base unit constants.
 * This enables type-safe unit parsing and conversion.
 */
export type QuantityUnitMap = {
  [Q in keyof typeof standardInternationalBaseUnits]: ExtractAllUnits<(typeof standardInternationalBaseUnits)[Q]>;
};

// SI Derived Units with Special Names
export type AngleUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['planeAngle']>;
export type AngleSymbol = ExtractAllSymbols<(typeof standardInternationalDerivedUnits)['planeAngle']>;
export type SolidAngleUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['solidAngle']>;
export type FrequencyUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['frequency']>;
export type ForceUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['force']>;
export type PressureUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['pressure']>;
export type EnergyUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['energy']>;
export type PowerUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['power']>;
export type ElectricChargeUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['electricCharge']>;
export type VoltageUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['electricPotential']>;
export type CapacitanceUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['capacitance']>;
export type ResistanceUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['electricalResistance']>;
export type ConductanceUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['electricalConductance']>;
export type MagneticFluxUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['magneticFlux']>;
export type MagneticFluxDensityUnit = ExtractAllUnits<
  (typeof standardInternationalDerivedUnits)['magneticFluxDensity']
>;
export type InductanceUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['inductance']>;
export type CelsiusTemperatureUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['celsiusTemperature']>;
export type LuminousFluxUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['luminousFlux']>;
export type IlluminanceUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['illuminance']>;
export type ActivityUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['activityRadionuclide']>;
export type AbsorbedDoseUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['absorbedDose']>;
export type DoseEquivalentUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['doseEquivalent']>;
export type CatalyticActivityUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['catalyticActivity']>;

// Other Common Engineering Units
export type AreaUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['area']>;
export type VolumeUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['volume']>;
export type VelocityUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['velocity']>;
export type AccelerationUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['acceleration']>;
export type TorqueUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['torque']>;
export type DensityUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['density']>;
