import { standardInternationalBaseUnits } from '#constants/unit.constants.js';
import type {
  AmountOfSubstanceSymbol,
  ElectricCurrentSymbol,
  LengthSymbol,
  LuminousIntensitySymbol,
  MassSymbol,
  ThermodynamicTemperatureSymbol,
  TimeSymbol,
  UnitQuantity,
} from '#types/unit.types.js';

/**
 * Build conversion maps programmatically from standardInternationalBaseUnits
 * for all 7 SI base quantities.
 */
function buildConversionMaps() {
  type ConversionInfo = {
    factor: number;
    offset: number;
  };

  // eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style -- Dynamic map from constants
  type ConversionMaps = {
    [K in UnitQuantity]: Record<string, ConversionInfo>;
  };

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Dynamically built from constants
  const maps = {} as ConversionMaps;

  for (const [quantityKey, quantityDef] of Object.entries(standardInternationalBaseUnits)) {
    const quantity = quantityKey as UnitQuantity;
    const conversionMap: Record<string, ConversionInfo> = {};

    // Add base unit (factor = 1, no offset)
    conversionMap[quantityDef.symbol] = { factor: 1, offset: 0 };

    // Add all variants
    for (const variant of quantityDef.variants) {
      const offset = 'offset' in variant ? (variant.offset as number | undefined) : undefined;

      conversionMap[variant.symbol] = {
        factor: variant.factor,
        offset: offset ?? 0,
      };
    }

    maps[quantity] = conversionMap;
  }

  return maps;
}

/**
 * Conversion maps for all 7 SI base quantities
 */
const quantityConversionMaps = buildConversionMaps();

/**
 * Get conversion info for a unit symbol within a specific quantity
 */
function getConversionInfo(quantity: UnitQuantity, unitSymbol: string): { factor: number; offset: number } | undefined {
  return quantityConversionMaps[quantity][unitSymbol];
}

/**
 * Generic unit conversion function with offset support.
 * Converts value from one unit to another within the same quantity.
 *
 * Formula: (value * fromFactor + fromOffset - toOffset) / toFactor
 *
 * @param value - The numeric value to convert
 * @param fromSymbol - The source unit symbol
 * @param toSymbol - The target unit symbol
 * @param quantity - The quantity type (length, mass, time, etc.)
 * @returns The converted value
 * @throws Error if units are not found in the quantity
 */
function convertUnits(value: number, fromSymbol: string, toSymbol: string, quantity: UnitQuantity): number {
  if (fromSymbol === toSymbol) {
    return value;
  }

  const fromInfo = getConversionInfo(quantity, fromSymbol);
  const toInfo = getConversionInfo(quantity, toSymbol);

  if (!fromInfo || !toInfo) {
    throw new Error(`Invalid units for ${quantity}: from="${fromSymbol}", to="${toSymbol}"`);
  }

  // Convert to base unit, then to target unit with offset support
  // Formula: (value * fromFactor + fromOffset - toOffset) / toFactor
  const valueInBase = value * fromInfo.factor + fromInfo.offset;
  const result = (valueInBase - toInfo.offset) / toInfo.factor;

  return result;
}

// =============================================================================
// QUANTITY-SPECIFIC CONVERSION FUNCTIONS
// =============================================================================

/**
 * Convert a length value from one unit to another
 *
 * @param value - The numeric value to convert
 * @param fromSymbol - The source unit symbol
 * @param toSymbol - The target unit symbol
 * @returns The converted value
 */
export function convertLength(value: number, fromSymbol: LengthSymbol, toSymbol: LengthSymbol): number {
  return convertUnits(value, fromSymbol, toSymbol, 'length');
}

/**
 * Convert a mass value from one unit to another
 *
 * @param value - The numeric value to convert
 * @param fromSymbol - The source unit symbol
 * @param toSymbol - The target unit symbol
 * @returns The converted value
 */
export function convertMass(value: number, fromSymbol: MassSymbol, toSymbol: MassSymbol): number {
  return convertUnits(value, fromSymbol, toSymbol, 'mass');
}

/**
 * Convert a time value from one unit to another
 *
 * @param value - The numeric value to convert
 * @param fromSymbol - The source unit symbol
 * @param toSymbol - The target unit symbol
 * @returns The converted value
 */
export function convertTime(value: number, fromSymbol: TimeSymbol, toSymbol: TimeSymbol): number {
  return convertUnits(value, fromSymbol, toSymbol, 'time');
}

/**
 * Convert an electric current value from one unit to another
 *
 * @param value - The numeric value to convert
 * @param fromSymbol - The source unit symbol
 * @param toSymbol - The target unit symbol
 * @returns The converted value
 */
export function convertElectricCurrent(
  value: number,
  fromSymbol: ElectricCurrentSymbol,
  toSymbol: ElectricCurrentSymbol,
): number {
  return convertUnits(value, fromSymbol, toSymbol, 'electricCurrent');
}

/**
 * Convert a temperature value from one unit to another
 * Handles offset-based conversions (Celsius, Fahrenheit, Kelvin)
 *
 * @param value - The numeric value to convert
 * @param fromSymbol - The source unit symbol
 * @param toSymbol - The target unit symbol
 * @returns The converted value
 */
export function convertTemperature(
  value: number,
  fromSymbol: ThermodynamicTemperatureSymbol,
  toSymbol: ThermodynamicTemperatureSymbol,
): number {
  return convertUnits(value, fromSymbol, toSymbol, 'thermodynamicTemperature');
}

/**
 * Convert an amount of substance value from one unit to another
 *
 * @param value - The numeric value to convert
 * @param fromSymbol - The source unit symbol
 * @param toSymbol - The target unit symbol
 * @returns The converted value
 */
export function convertAmountOfSubstance(
  value: number,
  fromSymbol: AmountOfSubstanceSymbol,
  toSymbol: AmountOfSubstanceSymbol,
): number {
  return convertUnits(value, fromSymbol, toSymbol, 'amountOfSubstance');
}

/**
 * Convert a luminous intensity value from one unit to another
 *
 * @param value - The numeric value to convert
 * @param fromSymbol - The source unit symbol
 * @param toSymbol - The target unit symbol
 * @returns The converted value
 */
export function convertLuminousIntensity(
  value: number,
  fromSymbol: LuminousIntensitySymbol,
  toSymbol: LuminousIntensitySymbol,
): number {
  return convertUnits(value, fromSymbol, toSymbol, 'luminousIntensity');
}
