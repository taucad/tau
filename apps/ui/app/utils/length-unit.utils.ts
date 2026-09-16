import { parseInput } from '@taucad/units/input';
import { convert, createQuantity, quantityKinds } from '@taucad/units/quantity';

export type LengthSymbol = string;
export type UnitSystem = 'si' | 'imperial';

export const displayLengthUnits = [
  { label: 'Millimeter', symbol: 'mm', code: 'mm', metersPerUnit: 0.001, system: 'si' },
  { label: 'Centimeter', symbol: 'cm', code: 'cm', metersPerUnit: 0.01, system: 'si' },
  { label: 'Meter', symbol: 'm', code: 'm', metersPerUnit: 1, system: 'si' },
  { label: 'Inch', symbol: 'in', code: '[in_i]', metersPerUnit: 0.0254, system: 'imperial' },
  { label: 'Foot', symbol: 'ft', code: '[ft_i]', metersPerUnit: 0.3048, system: 'imperial' },
  { label: 'Yard', symbol: 'yd', code: '[yd_i]', metersPerUnit: 0.9144, system: 'imperial' },
] as const;

const displayUnitBySymbol = new Map<string, (typeof displayLengthUnits)[number]>(
  displayLengthUnits.map((unit) => [unit.symbol, unit]),
);
const displaySymbolByCode = new Map<string, string>(displayLengthUnits.map((unit) => [unit.code, unit.symbol]));

export function getDisplayLengthUnit(symbol: string): (typeof displayLengthUnits)[number] {
  const unit = displayUnitBySymbol.get(symbol);
  if (!unit) {
    throw new Error(`Unsupported display length unit: ${symbol}`);
  }
  return unit;
}

const toUcumCode = (symbol: string): string => displayUnitBySymbol.get(symbol)?.code ?? symbol;

export const toDisplayUnitSymbol = (code: string): string => displaySymbolByCode.get(code) ?? code;

export function convertLength(value: number, fromSymbol: string, toSymbol: string): number {
  const source = createQuantity({
    value,
    unit: toUcumCode(fromSymbol),
    kind: quantityKinds.length,
    space: 'linear',
  });
  if (source.status !== 'success') {
    throw new Error(source.diagnostic.message);
  }

  const result = convert({ quantity: source.value, to: toUcumCode(toSymbol) });
  if (result.status !== 'success') {
    throw new Error(result.diagnostic.message);
  }
  if (typeof result.value.value !== 'number') {
    throw new TypeError('Length conversion returned a non-numeric representation.');
  }
  return result.value.value;
}

export function parseLengthToDisplay(text: string, displaySymbol: string): number | undefined {
  const displayUnit = toUcumCode(displaySymbol);
  const parsed = parseInput({
    text,
    inputUnit: displayUnit,
    kind: quantityKinds.length,
    space: 'linear',
  });
  if (parsed.status !== 'success') {
    return undefined;
  }

  const result = convert({ quantity: parsed.value.quantity, to: displayUnit });
  return result.status === 'success' && typeof result.value.value === 'number' ? result.value.value : undefined;
}
