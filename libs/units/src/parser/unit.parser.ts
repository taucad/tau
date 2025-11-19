import { standardInternationalBaseUnits } from '#constants/unit.constants.js';
import { siMagnitudes } from '#constants/magnitude.constants.js';
import type { UnitQuantity, QuantitySymbolMap, QuantityUnitMap } from '#types/unit.types.js';

/**
 * Generic parsed unit result with quantity information.
 * The unit type is derived from the constants based on the quantity.
 */
type ParsedUnit<Q extends UnitQuantity = UnitQuantity> = {
  value: number;
  unit: QuantityUnitMap[Q] | undefined;
  symbol: QuantitySymbolMap[Q] | undefined;
  quantity: Q;
};

/**
 * Unit match info maps a matched pattern to its unit and symbol
 */
type UnitMatchInfo = {
  unit: string;
  symbol: string;
};

/**
 * Cache for unit match maps per quantity
 */
const unitMatchCache = new Map<UnitQuantity, Map<string, UnitMatchInfo>>();

/**
 * Build regex pattern that matches all possible unit symbols and names for a quantity
 * Includes SI base unit, all magnitude prefixes, and custom variants with aliases
 * Also builds a map of matched patterns to their unit and symbol
 */
function buildUnitPatternForQuantity(quantity: UnitQuantity): {
  pattern: string;
  matchMap: Map<string, UnitMatchInfo>;
} {
  const quantityDef = standardInternationalBaseUnits[quantity];
  const patterns: string[] = [];
  const matchMap = new Map<string, UnitMatchInfo>();

  // Helper to add pattern with mapping
  // Note: We store patterns with their original case for case-sensitive matching
  const addPattern = (pattern: string, unit: string, symbol: string): void => {
    patterns.push(escapeRegex(pattern));
    matchMap.set(pattern, { unit, symbol });
  };

  // Base unit symbol and name
  addPattern(quantityDef.symbol, quantityDef.unit, quantityDef.symbol);
  addPattern(quantityDef.unit, quantityDef.unit, quantityDef.symbol);

  // Add SI magnitude prefixes for base unit
  for (const magnitude of siMagnitudes) {
    const prefixedSymbol = magnitude.symbol + quantityDef.symbol;
    const prefixedUnit = magnitude.name + quantityDef.unit;
    addPattern(prefixedSymbol, prefixedUnit, prefixedSymbol);
    addPattern(prefixedUnit, prefixedUnit, prefixedSymbol);
  }

  // Add all variant symbols, names, and aliases
  for (const variant of quantityDef.variants) {
    addPattern(variant.symbol, variant.unit, variant.symbol);
    addPattern(variant.unit, variant.unit, variant.symbol);

    if ('aliases' in variant) {
      const aliases = variant.aliases as string[] | undefined;

      if (aliases) {
        for (const alias of aliases) {
          addPattern(alias, variant.unit, variant.symbol);
        }
      }
    }
  }

  // Add base unit aliases if present
  if ('aliases' in quantityDef) {
    const aliases = quantityDef.aliases as string[] | undefined;

    if (aliases) {
      for (const alias of aliases) {
        addPattern(alias, quantityDef.unit, quantityDef.symbol);
      }
    }
  }

  // Sort by length (longest first) to match greedily
  patterns.sort((a, b) => b.length - a.length);

  return { pattern: patterns.join('|'), matchMap };
}

/**
 * Escape special regex characters
 */
function escapeRegex(string_: string): string {
  return string_.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
}

/**
 * Cache for built regex patterns per quantity
 */
const unitPatternCache = new Map<UnitQuantity, RegExp>();

/**
 * Get cached regex pattern and match map for a quantity
 */
function getUnitPattern(quantity: UnitQuantity): { pattern: RegExp; matchMap: Map<string, UnitMatchInfo> } {
  let pattern = unitPatternCache.get(quantity);
  let matchMap = unitMatchCache.get(quantity);

  if (!pattern || !matchMap) {
    const { pattern: patternString, matchMap: newMatchMap } = buildUnitPatternForQuantity(quantity);
    // Use unicode flag for special characters like μ, °, etc.
    // Note: We don't use 'i' flag to keep case-sensitivity for SI prefixes (M vs m)
    pattern = new RegExp(`^(-?\\d+(?:\\.\\d+)?)\\s*(${patternString})?$`, 'u');
    unitPatternCache.set(quantity, pattern);
    unitMatchCache.set(quantity, newMatchMap);
    matchMap = newMatchMap;
  }

  return { pattern, matchMap };
}

const lengthDef = standardInternationalBaseUnits.length;
const footVariant = lengthDef.variants.find((v) => v.unit === 'foot');
const inchVariant = lengthDef.variants.find((v) => v.unit === 'inch');

/**
 * Parse a length input string that may contain units and fractions.
 * Supports formats like: "12.5", "12.5 mm", "12.5mm", "1/2", "3/4 in", "12' 6\"", "12ft 6in"
 *
 * Special case: Combined feet-inches notation like "12' 6\"" which needs custom parsing
 * to convert feet to inches and add them together.
 *
 * @param input - The input string to parse
 * @returns Parsed value and detected unit and symbol, or undefined if invalid
 */
// eslint-disable-next-line complexity -- Complex input parsing requires multiple format checks
export function parseLengthInput(input: string): ParsedUnit<'length'> | undefined {
  if (!input || typeof input !== 'string') {
    return undefined;
  }

  // Trim whitespace
  const trimmed = input.trim();

  if (trimmed === '') {
    return undefined;
  }

  // Special case: Combined feet-inches notation like "12' 6\"" or "12ft 6in"
  // This is the ONLY length-specific pattern that can't be handled generically
  // We extract the conversion factor (12) from constants
  if (footVariant && inchVariant) {
    // Calculate conversion factor from constants: feet to inches = footFactor / inchFactor
    const feetToInches = footVariant.factor / inchVariant.factor;

    // Try to match combined feet-inches pattern
    // Match: NUMBER + any foot pattern + optional(NUMBER + any inch pattern)
    const combinedMatch = /^(-?\d+(?:\.\d+)?)\s*([^\d\s]+)\s*(?:(-?\d+(?:\.\d+)?)\s*([^\d\s]+)?)?$/i.exec(trimmed);

    if (combinedMatch?.[1] && combinedMatch[2]) {
      const firstValue = Number.parseFloat(combinedMatch[1]);
      const firstUnit = combinedMatch[2];
      const secondValue = combinedMatch[3] ? Number.parseFloat(combinedMatch[3]) : undefined;
      const secondUnit = combinedMatch[4];

      // Build foot symbols list from constants
      const footSymbols: string[] = [footVariant.symbol, footVariant.unit];
      const footAliases = 'aliases' in footVariant ? (footVariant.aliases as string[] | undefined) : undefined;

      if (footAliases) {
        footSymbols.push(...footAliases);
      }

      const isFirstFoot = footSymbols.some((s) => s.toLowerCase() === firstUnit.toLowerCase());

      // Build inch symbols list from constants
      const inchSymbols: string[] = [inchVariant.symbol, inchVariant.unit];
      const inchAliases = 'aliases' in inchVariant ? (inchVariant.aliases as string[] | undefined) : undefined;

      if (inchAliases) {
        inchSymbols.push(...inchAliases);
      }

      const isFirstInch = inchSymbols.some((s) => s.toLowerCase() === firstUnit.toLowerCase());

      if (isFirstFoot) {
        // If there's a second value, check if it's inches
        const hasSecondValue = secondValue !== undefined && secondUnit;
        const isSecondInch = hasSecondValue
          ? inchSymbols.some((s) => s.toLowerCase() === secondUnit.toLowerCase())
          : false;

        if (isSecondInch && secondValue !== undefined) {
          // Combined feet-inches: convert feet to inches and add
          const totalInches = firstValue * feetToInches + secondValue;

          return { value: totalInches, unit: inchVariant.unit, symbol: inchVariant.symbol, quantity: 'length' };
        }

        if (!hasSecondValue) {
          // Just feet: convert to inches
          return {
            value: firstValue * feetToInches,
            unit: inchVariant.unit,
            symbol: inchVariant.symbol,
            quantity: 'length',
          };
        }
      } else if (isFirstInch && !secondValue) {
        // Just inches with alias (like ")
        return { value: firstValue, unit: inchVariant.unit, symbol: inchVariant.symbol, quantity: 'length' };
      }
    }
  }

  // Pattern for fraction: 1/2, 3/4, -1/4
  const fractionMatch = /^(-?\d+)\s*\/\s*(\d+)(?:\s*([a-z]+))?$/i.exec(trimmed);

  if (fractionMatch?.[1] && fractionMatch[2]) {
    const numerator = Number.parseInt(fractionMatch[1], 10);
    const denominator = Number.parseInt(fractionMatch[2], 10);

    if (denominator === 0) {
      return undefined;
    }

    const value = numerator / denominator;
    const matchedUnit = fractionMatch[3];

    if (matchedUnit) {
      const { matchMap } = getUnitPattern('length');
      const unitInfo = matchMap.get(matchedUnit);

      if (unitInfo) {
        return {
          value,
          unit: unitInfo.unit as QuantityUnitMap['length'],
          symbol: unitInfo.symbol as QuantitySymbolMap['length'],
          quantity: 'length',
        };
      }
    }

    return { value, unit: undefined, symbol: undefined, quantity: 'length' };
  }

  // Pattern for mixed fraction: 1 1/2 in, 2-3/4 mm
  const mixedFractionMatch = /^(-?\d+)\s*[-\s]\s*(\d+)\s*\/\s*(\d+)(?:\s*([a-z]+))?$/i.exec(trimmed);

  if (mixedFractionMatch?.[1] && mixedFractionMatch[2] && mixedFractionMatch[3]) {
    const whole = Number.parseInt(mixedFractionMatch[1], 10);
    const numerator = Number.parseInt(mixedFractionMatch[2], 10);
    const denominator = Number.parseInt(mixedFractionMatch[3], 10);

    if (denominator === 0) {
      return undefined;
    }

    const sign = whole < 0 ? -1 : 1;
    const value = whole + sign * (numerator / denominator);
    const matchedUnit = mixedFractionMatch[4];

    if (matchedUnit) {
      const { matchMap } = getUnitPattern('length');
      const unitInfo = matchMap.get(matchedUnit);

      if (unitInfo) {
        return {
          value,
          unit: unitInfo.unit as QuantityUnitMap['length'],
          symbol: unitInfo.symbol as QuantitySymbolMap['length'],
          quantity: 'length',
        };
      }
    }

    return { value, unit: undefined, symbol: undefined, quantity: 'length' };
  }

  // Use programmatic pattern for standard length units
  const { pattern: lengthPattern, matchMap } = getUnitPattern('length');
  const lengthMatch = lengthPattern.exec(trimmed);

  if (lengthMatch?.[1]) {
    const value = Number.parseFloat(lengthMatch[1]);
    const matchedUnit = lengthMatch[2];

    if (Number.isFinite(value)) {
      if (matchedUnit) {
        const unitInfo = matchMap.get(matchedUnit);

        if (unitInfo) {
          return {
            value,
            unit: unitInfo.unit as QuantityUnitMap['length'],
            symbol: unitInfo.symbol as QuantitySymbolMap['length'],
            quantity: 'length',
          };
        }
      }

      return { value, unit: undefined, symbol: undefined, quantity: 'length' };
    }
  }

  return undefined;
}

// =============================================================================
// QUANTITY-SPECIFIC PARSERS FOR OTHER SI BASE UNITS
// =============================================================================

/**
 * Parse a basic unit input string for a specific quantity using programmatic patterns.
 *
 * @param input - The input string to parse
 * @param quantity - The quantity type
 * @returns Parsed value and detected unit and symbol, or undefined if invalid
 */
function parseBasicUnitInput<Q extends UnitQuantity>(input: string, quantity: Q): ParsedUnit<Q> | undefined {
  if (!input || typeof input !== 'string') {
    return undefined;
  }

  const trimmed = input.trim();

  if (trimmed === '') {
    return undefined;
  }

  // Get programmatically built pattern for this quantity
  const { pattern, matchMap } = getUnitPattern(quantity);
  const match = pattern.exec(trimmed);

  if (match?.[1]) {
    const value = Number.parseFloat(match[1]);
    const matchedUnit = match[2];

    if (Number.isFinite(value)) {
      if (matchedUnit) {
        const unitInfo = matchMap.get(matchedUnit);

        if (unitInfo) {
          // Type assertion: unit and symbol are derived from constants and validated by regex
          return {
            value,
            unit: unitInfo.unit as QuantityUnitMap[Q],
            symbol: unitInfo.symbol as QuantitySymbolMap[Q],
            quantity,
          };
        }
      }

      // No unit specified - just the number
      return { value, unit: undefined, symbol: undefined, quantity };
    }
  }

  return undefined;
}

/**
 * Parse a mass input string.
 * Supports all SI magnitudes (mg, kg, etc.) and imperial units (lb, oz)
 *
 * @param input - The input string to parse
 * @returns Parsed value and detected unit, or undefined if invalid
 */
export function parseMassInput(input: string): ParsedUnit<'mass'> | undefined {
  return parseBasicUnitInput(input, 'mass');
}

/**
 * Parse a time input string.
 * Supports all SI magnitudes (ms, μs, etc.) and common units (min, h)
 *
 * @param input - The input string to parse
 * @returns Parsed value and detected unit, or undefined if invalid
 */
export function parseTimeInput(input: string): ParsedUnit<'time'> | undefined {
  return parseBasicUnitInput(input, 'time');
}

/**
 * Parse an electric current input string.
 * Supports all SI magnitudes (mA, kA, etc.)
 *
 * @param input - The input string to parse
 * @returns Parsed value and detected unit, or undefined if invalid
 */
export function parseElectricCurrentInput(input: string): ParsedUnit<'electricCurrent'> | undefined {
  return parseBasicUnitInput(input, 'electricCurrent');
}

/**
 * Parse a temperature input string.
 * Supports Kelvin with SI magnitudes and Celsius/Fahrenheit
 *
 * @param input - The input string to parse
 * @returns Parsed value and detected unit, or undefined if invalid
 */
export function parseTemperatureInput(input: string): ParsedUnit<'thermodynamicTemperature'> | undefined {
  return parseBasicUnitInput(input, 'thermodynamicTemperature');
}

/**
 * Parse an amount of substance input string.
 * Supports all SI magnitudes (mmol, μmol, etc.)
 *
 * @param input - The input string to parse
 * @returns Parsed value and detected unit, or undefined if invalid
 */
export function parseAmountOfSubstanceInput(input: string): ParsedUnit<'amountOfSubstance'> | undefined {
  return parseBasicUnitInput(input, 'amountOfSubstance');
}

/**
 * Parse a luminous intensity input string.
 * Supports all SI magnitudes (mcd, kcd, etc.)
 *
 * @param input - The input string to parse
 * @returns Parsed value and detected unit, or undefined if invalid
 */
export function parseLuminousIntensityInput(input: string): ParsedUnit<'luminousIntensity'> | undefined {
  return parseBasicUnitInput(input, 'luminousIntensity');
}

// =============================================================================
// GENERIC PARSER
// =============================================================================

/**
 * Generic unit input parser that attempts to parse with all quantity-specific parsers.
 * Returns the first successful parse with the quantity identified.
 *
 * @param input - The input string to parse
 * @returns Parsed value with quantity identified, or undefined if invalid
 */
export function parseUnitInput(input: string): ParsedUnit | undefined {
  // Try length first (most complex with special notation)
  const lengthResult = parseLengthInput(input);

  if (lengthResult) {
    // ParseLengthInput already returns the complete ParsedUnit with quantity
    return lengthResult;
  }

  // Try other quantities in order
  const parsers: Array<(input: string) => ParsedUnit | undefined> = [
    parseMassInput,
    parseTimeInput,
    parseElectricCurrentInput,
    parseTemperatureInput,
    parseAmountOfSubstanceInput,
    parseLuminousIntensityInput,
  ];

  for (const parser of parsers) {
    const result = parser(input);

    if (result) {
      return result;
    }
  }

  return undefined;
}
