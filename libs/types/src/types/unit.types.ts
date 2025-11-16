import type { standardInternationalBaseUnits, standardInternationalDerivedUnits } from '#constants/unit.constants.js';

export type ExtractAllUnits<T extends Record<string, unknown>> =
  | T['baseUnit']
  | Extract<keyof T['unitVariants'], string>;

// SI Base Units
export type LengthUnit = ExtractAllUnits<(typeof standardInternationalBaseUnits)['length']>;
export type MassUnit = ExtractAllUnits<(typeof standardInternationalBaseUnits)['mass']>;
export type TimeUnit = ExtractAllUnits<(typeof standardInternationalBaseUnits)['time']>;
export type ElectricCurrentUnit = ExtractAllUnits<(typeof standardInternationalBaseUnits)['electricCurrent']>;
export type ThermodynamicTemperatureUnit = ExtractAllUnits<
  (typeof standardInternationalBaseUnits)['thermodynamicTemperature']
>;
export type AmountOfSubstanceUnit = ExtractAllUnits<(typeof standardInternationalBaseUnits)['amountOfSubstance']>;
export type LuminousIntensityUnit = ExtractAllUnits<(typeof standardInternationalBaseUnits)['luminousIntensity']>;

// SI Derived Units with Special Names
export type AngleUnit = ExtractAllUnits<(typeof standardInternationalDerivedUnits)['planeAngle']>;
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
