import { describe, expect, it } from 'vitest';

import { formatQuantity, parseInput } from '@taucad/units/input';
import { createQuantity, quantityKinds } from '@taucad/units/quantity';
import type { Quantity } from '@taucad/units/quantity';

describe('complete input parsing', () => {
  it.each([
    { text: '1/2 in', value: 0.5, unit: '[in_i]', representation: 'fraction' },
    { text: '1 1/2 in', value: 1.5, unit: '[in_i]', representation: 'mixed' },
    { text: '-5ft 6in', value: -66, unit: '[in_i]', representation: 'feet-inches' },
    { text: '1e3 mm', value: 1000, unit: 'mm', representation: 'scientific' },
    { text: '12 μm', value: 12, unit: 'um', representation: 'decimal' },
    { text: '100 milliampere', value: 100, unit: 'mA', representation: 'decimal' },
    { text: '50 μs', value: 50, unit: 'us', representation: 'decimal' },
    { text: '2 kilograms', value: 2, unit: 'kg', representation: 'decimal' },
    { text: '3 candelas', value: 3, unit: 'cd', representation: 'decimal' },
  ])('parses $text', ({ text, value, unit, representation }) => {
    const result = parseInput({ text, locale: 'en-NZ' });
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.value).toMatchObject({ consumedUnit: unit, representation, quantity: { value } });
    }
  });

  it('preserves negative zero and selected bare-entry unit', () => {
    const result = parseInput({ text: '-0', inputUnit: 'mm' });
    expect(result.status === 'success' && Object.is(result.value.quantity.value, -0)).toBe(true);
  });

  it('accepts exact scientific zero and rejects rational numeric loss', () => {
    for (const [text, negative] of [
      ['0e10 m', false],
      ['-0e3 m', true],
    ] as const) {
      const result = parseInput({ text });
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(Object.is(result.value.quantity.value, negative ? -0 : 0)).toBe(true);
      }
    }
    const denominator = '1'.padEnd(401, '0');
    expect(parseInput({ text: `1/${denominator} m` }).status).toBe('unsupported');
    expect(parseInput({ text: `1 1/${denominator} m` }).status).toBe('unsupported');
  });

  it.each([
    { text: '-', status: 'incomplete' },
    { text: '1e', status: 'incomplete' },
    { text: '12 blorp', status: 'invalid' },
    { text: '1e309 mm', status: 'invalid' },
    { text: '1e-999 mm', status: 'unsupported' },
    { text: '-5ft -6in', status: 'invalid' },
    { text: '12,34 mm', status: 'invalid' },
    { text: '1,234.5 mm', status: 'success' },
    { text: '1.234,5 mm', status: 'invalid' },
  ] as const)('classifies $text as $status', ({ text, status }) => {
    expect(parseInput({ text, locale: 'en-NZ' }).status).toBe(status);
  });

  it('preserves a diagnostic span for an invalid suffix and catches invalid Intl inputs', () => {
    const invalidUnit = parseInput({ text: '12 blorp', locale: 'en-NZ' });
    expect(invalidUnit.status !== 'success' && invalidUnit.diagnostic.span).toEqual({ start: 3, end: 8 });
    expect(parseInput({ text: '1 mm', locale: 'not_a_locale' }).status).toBe('invalid');
    const quantity = createQuantity({
      value: 1,
      unit: 'm',
      kind: quantityKinds.length,
      space: 'linear',
    });
    if (quantity.status !== 'success') {
      throw new Error('Fixture failed.');
    }
    expect(formatQuantity({ quantity: quantity.value, maximumFractionDigits: -1 }).status).toBe('invalid');
  });

  it('revalidates no-op formatting and preserves decimal text and negative zero', () => {
    const negativeZero = parseInput({ text: '-0', inputUnit: 'mm' });
    if (negativeZero.status !== 'success') {
      throw new Error('Fixture failed.');
    }
    const formatted = formatQuantity({ quantity: negativeZero.value.quantity, locale: 'en-NZ' });
    expect(formatted.status === 'success' && formatted.value.text).toBe('-0 mm');
    const forged = { ...negativeZero.value.quantity, value: Number.POSITIVE_INFINITY } as unknown as Quantity;
    expect(formatQuantity({ quantity: forged }).status).toBe('invalid');

    const decimal = createQuantity({
      value: '1.2300',
      representation: 'decimal',
      unit: 'mm',
      kind: quantityKinds.length,
      space: 'linear',
    });
    if (decimal.status !== 'success') {
      throw new Error('Fixture failed.');
    }
    const decimalText = formatQuantity({ quantity: decimal.value });
    expect(decimalText.status === 'success' && decimalText.value.text).toBe('1.2300 mm');
    expect(formatQuantity({ quantity: decimal.value, maximumFractionDigits: -1 }).status).toBe('invalid');
    expect(Reflect.apply(parseInput, undefined, [null]).status).toBe('invalid');
    expect(Reflect.apply(formatQuantity, undefined, [null]).status).toBe('invalid');
  });

  it('uses a binary64 view when formatting safe-integer native values', () => {
    const native = createQuantity({
      value: 1,
      representation: 'safe-integer',
      unit: 'mm',
      kind: quantityKinds.length,
      space: 'linear',
    });
    if (native.status !== 'success') {
      throw new Error('Fixture failed.');
    }
    const formatted = formatQuantity({ quantity: native.value, unit: 'm', locale: 'en-NZ' });
    expect(formatted.status === 'success' && formatted.value.text).toBe('0.001 m');
    expect(native.value).toMatchObject({ value: 1, representation: 'safe-integer', unit: { code: 'mm' } });
  });
});
