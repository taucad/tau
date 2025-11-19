import { siMagnitudes } from '#constants/magnitude.constants.js';

/**
 * The system that the unit belongs to.
 */
type UnitSystem = 'si' | 'imperial';

type UnitVariant = {
  /**
   * The unit of the variant.
   *
   * @example 'inch' - Inch variant of the meter unit
   */
  unit: string;
  /**
   * The symbol of the variant.
   *
   * @example 'in' - Inch symbol
   */
  symbol: string;
  /**
   * The conversion factor of the variant.
   *
   * This is the factor by which the Standard International base unit is multiplied to get the variant unit.
   *
   * @example 0.0254 - Inch to meter conversion factor
   */
  factor: number;
  /**
   * The offset of the variant.
   *
   * This is the offset by which the Standard International base unit is added to get the variant unit.
   *
   * @example `273.15` - Celsius to Kelvin offset
   */
  offset?: number;
  /**
   * The system of the variant.
   *
   * @example 'si'
   * @example 'imperial'
   */
  system: UnitSystem;
  /**
   * The aliases of the variant.
   *
   * These are commonly used aliases for the unit, and may be punctuation marks such as quotes or apostrophes.
   * Plural forms of the unit or symbol that do not end with an 's' should be listed here.
   *
   * @example ['"', 'inches'] - Inch aliases
   * @example ["'", 'feet'] - Foot aliases
   */
  aliases?: string[];
};

type BaseUnit = {
  /**
   * The base unit of the quantity.
   *
   * @example 'meter' - Meter base unit
   * @example 'kilogram' - Kilogram base unit
   */
  unit: string;
  /**
   * The symbol of the unit.
   *
   * @example 'm' - Meter symbol
   * @example 'kg' - Kilogram symbol
   */
  symbol: string;
  /**
   * The dimension of the unit.
   *
   * @example 'L' - Length dimension
   * @example 'M' - Mass dimension
   */
  dimension: string;
  /**
   * The name of the quantity.
   *
   * @example 'length'
   * @example 'mass'
   */
  quantity: string;
  /**
   * The variants of the unit.
   *
   * @example [{ unit: 'meter', symbol: 'm', factor: 1, system: 'si' }]
   */
  variants: UnitVariant[];
  /**
   * The aliases of the unit.
   *
   * Plural forms of the unit or symbol that do not end with an 's' should be listed here.
   *
   * @example ["rads"]
   */
  aliases?: string[];
};

/**
 * Generate SI magnitude variants for a given base unit.
 *
 * @param baseUnit - The base unit name (e.g., 'meter', 'gram')
 * @param baseSymbol - The base unit symbol (e.g., 'm', 'g')
 * @param baseConversionFactor - Optional conversion factor for the base unit (default: 1)
 * @returns Array of UnitVariants with all SI magnitudes
 */
function generateSiMagnitudeVariants<BaseUnit extends string, BaseSymbol extends string>(
  baseUnit: BaseUnit,
  baseSymbol: BaseSymbol,
  baseConversionFactor = 1,
) {
  return siMagnitudes.map((magnitude) => ({
    unit: `${magnitude.name}${baseUnit}` as const,
    symbol: `${magnitude.symbol}${baseSymbol}` as const,
    factor: magnitude.factor * baseConversionFactor,
    system: 'si' as const,
  }));
}

export const standardInternationalBaseUnits = {
  length: {
    unit: 'meter',
    symbol: 'm',
    dimension: 'L',
    quantity: 'length',
    variants: [
      ...generateSiMagnitudeVariants('meter', 'm'),
      {
        unit: 'inch',
        symbol: 'in',
        factor: 0.0254,
        system: 'imperial',
        aliases: ['"', 'inches'],
      },
      {
        unit: 'foot',
        symbol: 'ft',
        factor: 0.3048,
        system: 'imperial',
        aliases: ["'", 'feet'],
      },
      {
        unit: 'yard',
        symbol: 'yd',
        factor: 0.9144,
        system: 'imperial',
      },
    ],
  },
  mass: {
    unit: 'kilogram',
    symbol: 'kg',
    dimension: 'M',
    quantity: 'mass',
    variants: [
      ...generateSiMagnitudeVariants('gram', 'g', 0.001),
      {
        unit: 'ton',
        symbol: 't',
        factor: 1000,
        system: 'si',
      },
      {
        unit: 'pound',
        symbol: 'lb',
        factor: 0.453_592_37,
        system: 'imperial',
      },
      {
        unit: 'ounce',
        symbol: 'oz',
        factor: 0.028_349_523_125,
        system: 'imperial',
      },
    ],
  },
  time: {
    unit: 'second',
    symbol: 's',
    dimension: 'T',
    quantity: 'time',
    aliases: ['secs'],
    variants: [
      ...generateSiMagnitudeVariants('second', 's'),
      {
        unit: 'minute',
        symbol: 'min',
        factor: 60,
        system: 'si',
        aliases: ['mins'],
      },
      {
        unit: 'hour',
        symbol: 'h',
        factor: 3600,
        system: 'si',
        aliases: ['hrs'],
      },
    ],
  },
  electricCurrent: {
    unit: 'ampere',
    symbol: 'A',
    dimension: 'I',
    quantity: 'electric current',
    aliases: ['amps'],
    variants: [...generateSiMagnitudeVariants('ampere', 'A')],
  },
  thermodynamicTemperature: {
    unit: 'kelvin',
    symbol: 'K',
    dimension: 'Θ',
    quantity: 'thermodynamic temperature',
    variants: [
      ...generateSiMagnitudeVariants('kelvin', 'K'),
      {
        unit: 'celsius',
        symbol: '°C',
        factor: 1,
        offset: 273.15,
        system: 'si',
      },
      {
        unit: 'fahrenheit',
        symbol: '°F',
        factor: 5 / 9,
        offset: 273.15 - 32 * (5 / 9),
        system: 'imperial',
      },
    ],
  },
  amountOfSubstance: {
    unit: 'mole',
    symbol: 'mol',
    dimension: 'N',
    quantity: 'amount of substance',
    variants: [...generateSiMagnitudeVariants('mole', 'mol')],
  },
  luminousIntensity: {
    unit: 'candela',
    symbol: 'cd',
    dimension: 'J',
    quantity: 'luminous intensity',
    variants: [...generateSiMagnitudeVariants('candela', 'cd')],
  },
} as const satisfies Record<string, BaseUnit>;

export const standardInternationalDerivedUnits = {
  planeAngle: {
    unit: 'radian',
    symbol: 'rad',
    dimension: 'Θ',
    quantity: 'plane angle',
    variants: [
      ...generateSiMagnitudeVariants('radian', 'rad'),
      {
        unit: 'degree',
        symbol: '°',
        aliases: ['degs'],
        factor: Math.PI / 180,
        system: 'si',
      },
      {
        unit: 'gradian',
        symbol: 'grad',
        factor: Math.PI / 200,
        system: 'si',
      },
      {
        unit: 'arcminute',
        symbol: '′',
        factor: Math.PI / 10_800,
        system: 'si',
      },
      {
        unit: 'arcsecond',
        symbol: '″',
        factor: Math.PI / 648_000,
        system: 'si',
      },
    ],
  },
  solidAngle: {
    unit: 'steradian',
    symbol: 'sr',
    dimension: '',
    quantity: 'solid angle',
    variants: [...generateSiMagnitudeVariants('steradian', 'sr')],
  },
  frequency: {
    unit: 'hertz',
    symbol: 'Hz',
    dimension: 's⁻¹',
    quantity: 'frequency',
    variants: [...generateSiMagnitudeVariants('hertz', 'Hz')],
  },
  force: {
    unit: 'newton',
    symbol: 'N',
    dimension: 'kg⋅m⋅s⁻²',
    quantity: 'force',
    variants: [
      ...generateSiMagnitudeVariants('newton', 'N'),
      {
        unit: 'poundForce',
        symbol: 'lbf',
        factor: 4.448_221_615_260_5,
        system: 'imperial',
      },
    ],
  },
  pressure: {
    unit: 'pascal',
    symbol: 'Pa',
    dimension: 'kg⋅m⁻¹⋅s⁻²',
    quantity: 'pressure, stress',
    variants: [
      ...generateSiMagnitudeVariants('pascal', 'Pa'),
      {
        unit: 'bar',
        symbol: 'bar',
        factor: 100_000,
        system: 'si',
      },
      {
        unit: 'psi',
        symbol: 'psi',
        factor: 6894.757_293_168,
        system: 'imperial',
      },
    ],
  },
  energy: {
    unit: 'joule',
    symbol: 'J',
    dimension: 'kg⋅m²⋅s⁻²',
    quantity: 'energy, work, amount of heat',
    variants: [
      ...generateSiMagnitudeVariants('joule', 'J'),
      {
        unit: 'wattHour',
        symbol: 'Wh',
        factor: 3600,
        system: 'si',
      },
      {
        unit: 'kilowattHour',
        symbol: 'kWh',
        factor: 3_600_000,
        system: 'si',
      },
    ],
  },
  power: {
    unit: 'watt',
    symbol: 'W',
    dimension: 'kg⋅m²⋅s⁻³',
    quantity: 'power, radiant flux',
    variants: [...generateSiMagnitudeVariants('watt', 'W')],
  },
  electricCharge: {
    unit: 'coulomb',
    symbol: 'C',
    dimension: 's⋅A',
    quantity: 'electric charge',
    variants: [...generateSiMagnitudeVariants('coulomb', 'C')],
  },
  electricPotential: {
    unit: 'volt',
    symbol: 'V',
    dimension: 'kg⋅m²⋅s⁻³⋅A⁻¹',
    quantity: 'electric potential difference',
    variants: [...generateSiMagnitudeVariants('volt', 'V')],
  },
  capacitance: {
    unit: 'farad',
    symbol: 'F',
    dimension: 'kg⁻¹⋅m⁻²⋅s⁴⋅A²',
    quantity: 'capacitance',
    variants: [...generateSiMagnitudeVariants('farad', 'F')],
  },
  electricalResistance: {
    unit: 'ohm',
    symbol: 'Ω',
    dimension: 'kg⋅m²⋅s⁻³⋅A⁻²',
    quantity: 'electrical resistance',
    variants: [...generateSiMagnitudeVariants('ohm', 'Ω')],
  },
  electricalConductance: {
    unit: 'siemens',
    symbol: 'S',
    dimension: 'kg⁻¹⋅m⁻²⋅s³⋅A²',
    quantity: 'electrical conductance',
    variants: [...generateSiMagnitudeVariants('siemens', 'S')],
  },
  magneticFlux: {
    unit: 'weber',
    symbol: 'Wb',
    dimension: 'kg⋅m²⋅s⁻²⋅A⁻¹',
    quantity: 'magnetic flux',
    variants: [...generateSiMagnitudeVariants('weber', 'Wb')],
  },
  magneticFluxDensity: {
    unit: 'tesla',
    symbol: 'T',
    dimension: 'kg⋅s⁻²⋅A⁻¹',
    quantity: 'magnetic flux density',
    variants: [...generateSiMagnitudeVariants('tesla', 'T')],
  },
  inductance: {
    unit: 'henry',
    symbol: 'H',
    dimension: 'kg⋅m²⋅s⁻²⋅A⁻²',
    quantity: 'inductance',
    variants: [...generateSiMagnitudeVariants('henry', 'H')],
  },
  celsiusTemperature: {
    unit: 'degreeCelsius',
    symbol: '°C',
    dimension: 'K',
    quantity: 'Celsius temperature',
    variants: [...generateSiMagnitudeVariants('degreeCelsius', '°C')],
  },
  luminousFlux: {
    unit: 'lumen',
    symbol: 'lm',
    dimension: 'cd⋅sr',
    quantity: 'luminous flux',
    variants: [...generateSiMagnitudeVariants('lumen', 'lm')],
  },
  illuminance: {
    unit: 'lux',
    symbol: 'lx',
    dimension: 'cd⋅sr⋅m⁻²',
    quantity: 'illuminance',
    variants: [...generateSiMagnitudeVariants('lux', 'lx')],
  },
  activityRadionuclide: {
    unit: 'becquerel',
    symbol: 'Bq',
    dimension: 's⁻¹',
    quantity: 'activity referred to a radionuclide',
    variants: [...generateSiMagnitudeVariants('becquerel', 'Bq')],
  },
  absorbedDose: {
    unit: 'gray',
    symbol: 'Gy',
    dimension: 'm²⋅s⁻²',
    quantity: 'absorbed dose, kerma',
    variants: [...generateSiMagnitudeVariants('gray', 'Gy')],
  },
  doseEquivalent: {
    unit: 'sievert',
    symbol: 'Sv',
    dimension: 'm²⋅s⁻²',
    quantity: 'dose equivalent',
    variants: [...generateSiMagnitudeVariants('sievert', 'Sv')],
  },
  catalyticActivity: {
    unit: 'katal',
    symbol: 'kat',
    dimension: 'mol⋅s⁻¹',
    quantity: 'catalytic activity',
    variants: [...generateSiMagnitudeVariants('katal', 'kat')],
  },
  area: {
    unit: 'squareMeter',
    symbol: 'm²',
    dimension: 'm²',
    quantity: 'area',
    variants: [
      ...generateSiMagnitudeVariants('squareMeter', 'm²'),
      {
        unit: 'squareInch',
        symbol: 'in²',
        factor: 0.000_645_16,
        system: 'imperial',
      },
      {
        unit: 'squareFoot',
        symbol: 'ft²',
        factor: 0.092_903_04,
        system: 'imperial',
      },
    ],
  },
  volume: {
    unit: 'cubicMeter',
    symbol: 'm³',
    dimension: 'm³',
    quantity: 'volume',
    variants: [
      ...generateSiMagnitudeVariants('cubicMeter', 'm³'),
      {
        unit: 'liter',
        symbol: 'L',
        factor: 0.001,
        system: 'si',
      },
      {
        unit: 'milliliter',
        symbol: 'mL',
        factor: 0.000_001,
        system: 'si',
      },
      {
        unit: 'cubicInch',
        symbol: 'in³',
        factor: 0.000_016_387_064,
        system: 'imperial',
      },
      {
        unit: 'cubicFoot',
        symbol: 'ft³',
        factor: 0.028_316_846_592,
        system: 'imperial',
      },
      {
        unit: 'gallon',
        symbol: 'gal',
        factor: 0.003_785_411_784,
        system: 'imperial',
      },
    ],
  },
  velocity: {
    unit: 'meterPerSecond',
    symbol: 'm/s',
    dimension: 'm⋅s⁻¹',
    quantity: 'velocity',
    variants: [
      ...generateSiMagnitudeVariants('meterPerSecond', 'm/s'),
      {
        unit: 'kilometerPerHour',
        symbol: 'km/h',
        factor: 0.277_777_778,
        system: 'si',
      },
      {
        unit: 'milePerHour',
        symbol: 'mph',
        factor: 0.447_04,
        system: 'imperial',
      },
      {
        unit: 'footPerSecond',
        symbol: 'ft/s',
        factor: 0.3048,
        system: 'imperial',
      },
    ],
  },
  acceleration: {
    unit: 'meterPerSecondSquared',
    symbol: 'm/s²',
    dimension: 'm⋅s⁻²',
    quantity: 'acceleration',
    variants: [
      ...generateSiMagnitudeVariants('meterPerSecondSquared', 'm/s²'),
      {
        unit: 'gravity',
        symbol: 'g',
        factor: 9.806_65,
        system: 'si',
      },
    ],
  },
  torque: {
    unit: 'newtonMeter',
    symbol: 'N⋅m',
    dimension: 'kg⋅m²⋅s⁻²',
    quantity: 'torque',
    variants: [
      ...generateSiMagnitudeVariants('newtonMeter', 'N⋅m'),
      {
        unit: 'poundFoot',
        symbol: 'lb⋅ft',
        factor: 1.355_817_948_331_4,
        system: 'imperial',
      },
      {
        unit: 'poundInch',
        symbol: 'lb⋅in',
        factor: 0.112_984_829_027_616_7,
        system: 'imperial',
      },
    ],
  },
  density: {
    unit: 'kilogramPerCubicMeter',
    symbol: 'kg/m³',
    dimension: 'kg⋅m⁻³',
    quantity: 'density',
    variants: [
      ...generateSiMagnitudeVariants('kilogramPerCubicMeter', 'kg/m³'),
      {
        unit: 'gramPerCubicCentimeter',
        symbol: 'g/cm³',
        factor: 1000,
        system: 'si',
      },
      {
        unit: 'poundPerCubicFoot',
        symbol: 'lb/ft³',
        factor: 16.018_463_373_960_142,
        system: 'imperial',
      },
    ],
  },
} as const satisfies Record<string, BaseUnit>;
