import { convert, createQuantity, quantityKinds } from '@taucad/units/quantity';

/**
 * Persisted display-unit choices retained by the existing graphics settings.
 *
 * @public
 */
export const lengthUnitOptions = [
  { symbol: 'mm', label: 'Millimeter', system: 'si', ucum: 'mm' },
  { symbol: 'cm', label: 'Centimeter', system: 'si', ucum: 'cm' },
  { symbol: 'm', label: 'Meter', system: 'si', ucum: 'm' },
  { symbol: 'in', label: 'Inch', system: 'imperial', ucum: '[in_i]' },
  { symbol: 'ft', label: 'Foot', system: 'imperial', ucum: '[ft_i]' },
  { symbol: 'yd', label: 'Yard', system: 'imperial', ucum: '[yd_i]' },
] as const;

/**
 * The symbol of a length unit, such as `mm` or `in`.
 *
 * @public
 */
export type LengthSymbol = string;
/**
 * The measurement system a length unit belongs to.
 *
 * @public
 */
export type UnitSystem = (typeof lengthUnitOptions)[number]['system'];

type LengthUnit = Readonly<{
  symbol: string;
  label: string;
  system: UnitSystem;
  ucum: string;
}>;

/**
 * Look up a length unit by symbol. An unknown symbol yields an SI unit that uses the symbol as its label and UCUM code.
 *
 * @param symbol - The unit symbol.
 * @returns The length unit.
 * @public
 */
export const getLengthUnit = (symbol: LengthSymbol): LengthUnit => {
  const unit = lengthUnitOptions.find((candidate) => candidate.symbol === symbol);
  return unit ?? { symbol, label: symbol, system: 'si', ucum: symbol };
};

/**
 * Get the UCUM code of a length unit.
 *
 * @param symbol - The unit symbol.
 * @returns The unit's UCUM code.
 * @public
 */
export const toUcumLengthCode = (symbol: LengthSymbol): string => getLengthUnit(symbol).ucum;

/**
 * Convert a length between two units.
 *
 * @param value - The length in `from` units.
 * @param from - The unit `value` is in.
 * @param to - The unit to convert to.
 * @returns The length in `to` units.
 * @public
 */
export const convertLength = (value: number, from: LengthSymbol, to: LengthSymbol): number => {
  const source = createQuantity({
    value,
    unit: toUcumLengthCode(from),
    kind: quantityKinds.length,
    space: 'linear',
  });
  const result = source.status === 'success' ? convert({ quantity: source.value, to: toUcumLengthCode(to) }) : source;
  if (result.status !== 'success' || typeof result.value.value !== 'number') {
    throw new Error(result.status === 'success' ? 'Length conversion was not numeric.' : result.diagnostic.message);
  }
  return result.value.value;
};

/**
 * Get the number of metres in one of the given length unit.
 *
 * @param symbol - The unit symbol.
 * @returns The length of one unit in metres.
 * @public
 */
export const metersPerLengthUnit = (symbol: LengthSymbol): number => convertLength(1, symbol, 'm');
