import { convert, createQuantity, quantityKinds } from '@taucad/units/quantity';

/** Persisted display-unit choices retained by the existing graphics settings. */
export const lengthUnitOptions = [
  { symbol: 'mm', label: 'Millimeter', system: 'si', ucum: 'mm' },
  { symbol: 'cm', label: 'Centimeter', system: 'si', ucum: 'cm' },
  { symbol: 'm', label: 'Meter', system: 'si', ucum: 'm' },
  { symbol: 'in', label: 'Inch', system: 'imperial', ucum: '[in_i]' },
  { symbol: 'ft', label: 'Foot', system: 'imperial', ucum: '[ft_i]' },
  { symbol: 'yd', label: 'Yard', system: 'imperial', ucum: '[yd_i]' },
] as const;

export type LengthSymbol = string;
export type UnitSystem = (typeof lengthUnitOptions)[number]['system'];

type LengthUnit = Readonly<{
  symbol: string;
  label: string;
  system: UnitSystem;
  ucum: string;
}>;

export const getLengthUnit = (symbol: LengthSymbol): LengthUnit => {
  const unit = lengthUnitOptions.find((candidate) => candidate.symbol === symbol);
  return unit ?? { symbol, label: symbol, system: 'si', ucum: symbol };
};

export const toUcumLengthCode = (symbol: LengthSymbol): string => getLengthUnit(symbol).ucum;

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

export const metersPerLengthUnit = (symbol: LengthSymbol): number => convertLength(1, symbol, 'm');
