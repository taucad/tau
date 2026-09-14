import { describe, expect, it } from 'vitest';
import { parseInput } from '@taucad/units/input';
import { convert, createQuantity } from '@taucad/units/quantity';

const converted = (value: number, from: string, to: string): number => {
  const source = createQuantity({ value, unit: from, space: 'linear' });
  if (source.status !== 'success') {
    throw new Error(source.diagnostic.message);
  }
  const result = convert({ quantity: source.value, to });
  if (result.status !== 'success') {
    throw new Error(result.diagnostic.message);
  }
  if (typeof result.value.value !== 'number') {
    throw new TypeError('Legacy numeric conversion returned a non-numeric representation.');
  }
  return result.value.value;
};

describe('64-case legacy regression corpus', () => {
  it.each([
    [10, 'mm', 'mm', 10],
    [5.5, '[in_i]', '[in_i]', 5.5],
    [10, 'mm', 'cm', 1],
    [1, 'cm', 'mm', 10],
    [1000, 'mm', 'm', 1],
    [1, 'm', 'mm', 1000],
    [12, '[in_i]', '[ft_i]', 1],
    [1, '[ft_i]', '[in_i]', 12],
    [36, '[in_i]', '[yd_i]', 1],
    [3, '[ft_i]', '[yd_i]', 1],
    [25.4, 'mm', '[in_i]', 1],
    [1, '[in_i]', 'mm', 25.4],
    [304.8, 'mm', '[ft_i]', 1],
    [1, '[ft_i]', 'mm', 304.8],
    [2.54, 'cm', '[in_i]', 1],
    [0.5, '[in_i]', 'mm', 12.7],
    [-10, 'mm', 'cm', -1],
    [-1, '[in_i]', 'mm', -25.4],
    [10, 'kg', 'kg', 10],
    [5.5, 'g', 'g', 5.5],
    [1000, 'g', 'kg', 1],
    [1, 'kg', 'g', 1000],
    [1, 't', 'kg', 1000],
    [1, 'kg', '[lb_av]', 2.2046226218],
    [1, '[lb_av]', 'kg', 0.45359237],
    [10, 's', 's', 10],
    [60, 's', 'min', 1],
    [1, 'min', 's', 60],
    [3600, 's', 'h', 1],
    [1, 'h', 'min', 60],
    [1000, 'ms', 's', 1],
    [1, 's', 'ms', 1000],
  ] as const)('converts legacy value %s %s to %s', (...[value, from, to, expected]) => {
    expect(converted(value, from, to)).toBeCloseTo(expected, 8);
  });

  // Bare legacy inputs now capture their native-entry context instead of returning an untyped number.
  it.each([
    ['12.5', 12.5, 'mm'],
    ['0.5', 0.5, 'mm'],
    ['-5.25', -5.25, 'mm'],
    ['12.5 mm', 12.5, 'mm'],
    ['12.5mm', 12.5, 'mm'],
    ['3.5 in', 3.5, '[in_i]'],
    ['1/2', 0.5, 'mm'],
    ['3/4', 0.75, 'mm'],
    ['-1/4', -0.25, 'mm'],
    ['1/2 in', 0.5, '[in_i]'],
    ['3/4 mm', 0.75, 'mm'],
    ['1 1/2', 1.5, 'mm'],
    ['2-3/4', 2.75, 'mm'],
    ['5 1/4 in', 5.25, '[in_i]'],
    ['-1 1/2', -1.5, 'mm'],
    ['-2-3/4', -2.75, 'mm'],
    ["12'", 144, '[in_i]'],
    ['12ft', 144, '[in_i]'],
    ['12 feet', 144, '[in_i]'],
    ['6"', 6, '[in_i]'],
    ['6in', 6, '[in_i]'],
    ['6 inches', 6, '[in_i]'],
    ['12\' 6"', 150, '[in_i]'],
    ['5\' 11"', 71, '[in_i]'],
    ['12ft 6in', 150, '[in_i]'],
    ["1.5'", 18, '[in_i]'],
    ['2.5"', 2.5, '[in_i]'],
    ['  12.5  ', 12.5, 'mm'],
    ['  12.5   mm  ', 12.5, 'mm'],
    ['0 mm', 0, 'mm'],
    ['-0 mm', -0, 'mm'],
    ['1e2 mm', 100, 'mm'],
  ] as const)('parses legacy input %s', (text, value, unit) => {
    const result = parseInput({ text, expectedUnit: 'mm' });
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.value.consumedUnit).toBe(unit);
      expect(
        Object.is(value, -0) ? Object.is(result.value.quantity.value, -0) : result.value.quantity.value === value,
      ).toBe(true);
    }
  });
});
