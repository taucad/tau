import { describe, expect, it } from 'vitest';

import {
  checkOperation,
  convert,
  createQuantity,
  linearize,
  quantityKinds,
  quantityReferences,
} from '@taucad/units/quantity';
import type { Quantity, QuantitySpace } from '@taucad/units/quantity';

const quantity = ({
  value,
  unit,
  kind,
  space = 'linear',
  representation,
}: Readonly<{
  value: number;
  unit: string;
  kind?: string;
  space?: QuantitySpace;
  representation?: 'binary64' | 'safe-integer';
}>): Quantity => {
  const result = createQuantity({ value, unit, kind, space, representation });
  if (result.status !== 'success') {
    throw new Error(result.diagnostic.message);
  }
  return result.value;
};

const valueOf = (result: ReturnType<typeof convert>): number => {
  if (result.status !== 'success' || typeof result.value.value !== 'number') {
    throw new Error(result.status === 'success' ? 'Expected executable value.' : result.diagnostic.message);
  }
  return result.value.value;
};

describe('conversion and checked algebra', () => {
  it.each([
    { value: 1, from: '[in_i]', to: 'mm', expected: 25.4 },
    { value: 180, from: 'deg', to: 'rad', expected: Math.PI },
    { value: 1, from: 'g/cm3', to: 'kg/m3', expected: 1000 },
    { value: 36, from: 'km/h', to: 'm/s', expected: 10 },
    { value: 1, from: 'N', to: 'kg.m/s2', expected: 1 },
    { value: 1, from: 'bar', to: 'Pa', expected: 100_000 },
    { value: 100, from: '%', to: '1', expected: 1 },
    { value: 1, from: 'mol', to: 'mmol', expected: 1000 },
    { value: 1, from: 'A', to: 'mA', expected: 1000 },
    { value: 1, from: 'cd', to: 'mcd', expected: 1000 },
  ])('converts $value $from to $to', ({ value, from, to, expected }) => {
    expect(valueOf(convert({ quantity: quantity({ value, unit: from }), to }))).toBeCloseTo(expected, 12);
  });

  it('enforces exact known and unknown semantic identities', () => {
    expect(createQuantity({ value: 1, unit: 's', kind: quantityKinds.length, space: 'linear' }).status).toBe('invalid');
    const unknown = 'https://invalid.example/Length';
    const unknownQuantity = quantity({ value: 1, unit: 'm', kind: unknown });
    expect(
      checkOperation({
        operator: 'add',
        left: unknownQuantity,
        right: quantity({ value: 1, unit: 'm', kind: quantityKinds.height }),
      }).status,
    ).toBe('indeterminate');
    expect(
      checkOperation({
        operator: 'add',
        left: quantity({ value: 1, unit: 'm' }),
        right: quantity({ value: 1, unit: 'm' }),
      }).status,
    ).toBe('indeterminate');
    const length = quantity({ value: 1, unit: 'm', kind: quantityKinds.length });
    const height = quantity({ value: 100, unit: 'cm', kind: quantityKinds.height });
    const sum = checkOperation({ operator: 'add', left: length, right: height });
    expect(sum.status === 'success' && 'kind' in sum.value && sum.value.kind).toBe(quantityKinds.length);
  });

  it('applies the supported thermodynamic point and difference rules', () => {
    const point = quantity({ value: 0, unit: 'Cel', kind: quantityKinds.temperature, space: 'point' });
    expect(point.reference).toBe(quantityReferences.thermodynamicAbsoluteZero);
    const difference = quantity({
      value: 10,
      unit: 'Cel',
      kind: quantityKinds.temperatureDifference,
      space: 'difference',
    });
    expect(valueOf(convert({ quantity: point, to: 'K' }))).toBeCloseTo(273.15);
    expect(valueOf(convert({ quantity: difference, to: 'K' }))).toBeCloseTo(10);
    const shifted = checkOperation({ operator: 'add', left: point, right: difference });
    expect(shifted.status === 'success' && 'value' in shifted.value && shifted.value.value).toBe(10);
    const delta = checkOperation({
      operator: 'subtract',
      left: shifted.status === 'success' && 'unit' in shifted.value ? shifted.value : point,
      right: point,
    });
    expect(delta.status === 'success' && 'value' in delta.value && delta.value.value).toBe(10);
    expect(linearize(point).status).toBe('success');
    const freezingFahrenheit = quantity({
      value: 32,
      unit: '[degF]',
      kind: quantityKinds.temperature,
      space: 'point',
    });
    const fahrenheitDifference = quantity({
      value: 18,
      unit: '[degF]',
      kind: quantityKinds.temperatureDifference,
      space: 'difference',
    });
    expect(valueOf(convert({ quantity: freezingFahrenheit, to: 'K' }))).toBeCloseTo(273.15);
    expect(valueOf(convert({ quantity: fahrenheitDifference, to: 'K' }))).toBeCloseTo(10);
    expect(
      createQuantity({
        value: 1,
        unit: 'K',
        kind: quantityKinds.temperature,
        space: 'point',
        reference: 'urn:other',
      }).status,
    ).toBe('invalid');
    expect(
      createQuantity({ value: 1, unit: 'm', kind: quantityKinds.length, space: 'linear', reference: 'urn:other' })
        .status,
    ).toBe('invalid');
  });

  it('preserves derived scale and only emits reviewed named kinds', () => {
    const ratio = checkOperation({
      operator: 'divide',
      left: quantity({ value: 50, unit: '%', kind: quantityKinds.dimensionlessRatio }),
      right: quantity({ value: 1, unit: '1', kind: quantityKinds.dimensionlessRatio }),
    });
    expect(ratio.status).toBe('success');
    if (ratio.status !== 'success' || !('unit' in ratio.value)) {
      throw new Error('Expected a derived ratio.');
    }
    const logged = checkOperation({ operator: 'log', left: ratio.value });
    expect(logged.status === 'success' && logged.value.value).toBeCloseTo(Math.log(0.5));

    const speed = checkOperation({
      operator: 'divide',
      left: quantity({ value: 10, unit: 'm', kind: quantityKinds.length }),
      right: quantity({ value: 2, unit: 's', kind: quantityKinds.time }),
    });
    expect(speed.status === 'success' && 'kind' in speed.value && speed.value.kind).toBe(quantityKinds.speed);

    const squareCentimeters = checkOperation({
      operator: 'multiply',
      left: quantity({ value: 2, unit: 'cm', kind: quantityKinds.length }),
      right: quantity({ value: 3, unit: 'cm', kind: quantityKinds.length }),
    });
    if (squareCentimeters.status !== 'success' || !('unit' in squareCentimeters.value)) {
      throw new Error('Expected a derived area.');
    }
    expect(valueOf(convert({ quantity: squareCentimeters.value, to: 'm2' }))).toBeCloseTo(0.0006);
    const summedArea = checkOperation({
      operator: 'add',
      left: squareCentimeters.value,
      right: quantity({ value: 1, unit: 'm2', kind: quantityKinds.area }),
    });
    expect(summedArea.status === 'success' && 'value' in summedArea.value && summedArea.value.value).toBeCloseTo(
      10_006,
    );

    const ambiguous = checkOperation({
      operator: 'multiply',
      left: quantity({ value: 2, unit: 'N', kind: quantityKinds.force }),
      right: quantity({ value: 3, unit: 'm', kind: quantityKinds.length }),
    });
    expect(ambiguous.status === 'success' && 'kind' in ambiguous.value && ambiguous.value.kind).toBeUndefined();
    if (ambiguous.status === 'success' && 'unit' in ambiguous.value) {
      const joules = convert({ quantity: ambiguous.value, to: 'J' });
      expect(joules.status === 'success' && joules.value.kind).toBeUndefined();
    }
    if (
      ambiguous.status === 'success' &&
      'unit' in ambiguous.value &&
      ambiguous.value.unit.classification === 'derived'
    ) {
      const forged = {
        ...ambiguous.value,
        unit: { ...ambiguous.value.unit, dimension: { ...ambiguous.value.unit.dimension, time: 99 } },
      };
      expect(checkOperation({ operator: 'power', left: forged, exponent: 2 }).status).toBe('invalid');
    }
  });

  it('classifies derived scale limits and owns every expression node', () => {
    const overflow = checkOperation({
      operator: 'multiply',
      left: quantity({ value: 1, unit: 'Ym12' }),
      right: quantity({ value: 1, unit: 'Ym12' }),
    });
    expect(overflow).toMatchObject({ status: 'unsupported', diagnostic: { code: 'NUMERIC_OVERFLOW' } });

    const underflow = checkOperation({
      operator: 'multiply',
      left: quantity({ value: 1, unit: 'ym12' }),
      right: quantity({ value: 1, unit: 'ym12' }),
    });
    expect(underflow).toMatchObject({ status: 'unsupported', diagnostic: { code: 'NUMERIC_UNDERFLOW' } });

    const area = checkOperation({
      operator: 'multiply',
      left: quantity({ value: 2, unit: 'cm', kind: quantityKinds.length }),
      right: quantity({ value: 3, unit: 'cm', kind: quantityKinds.length }),
    });
    if (area.status !== 'success' || !('unit' in area.value) || area.value.unit.classification !== 'derived') {
      throw new Error('Expected a derived area.');
    }

    for (const [unit, scale, code] of [
      ['Ym12', Number.POSITIVE_INFINITY, 'NUMERIC_OVERFLOW'],
      ['ym12', 0, 'NUMERIC_UNDERFLOW'],
    ] as const) {
      const revalidated = Reflect.apply(checkOperation, undefined, [
        {
          operator: 'power',
          left: {
            ...area.value,
            unit: {
              ...area.value.unit,
              expression: {
                operator: 'multiply',
                left: { operator: 'unit', unit },
                right: { operator: 'unit', unit },
              },
              scale,
            },
          },
          exponent: 1,
        },
      ]);
      expect(revalidated).toMatchObject({ status: 'unsupported', diagnostic: { code } });
    }

    const nested = checkOperation({ operator: 'power', left: area.value, exponent: 2 });
    if (
      nested.status !== 'success' ||
      !('unit' in nested.value) ||
      nested.value.unit.classification !== 'derived' ||
      nested.value.unit.expression.operator !== 'power'
    ) {
      throw new Error('Expected a nested derived expression.');
    }
    const root = nested.value.unit.expression;
    const operation = root.operand;
    if (operation.operator !== 'multiply') {
      throw new Error('Expected a nested multiplication.');
    }
    expect([root, operation, operation.left, operation.right].every((node) => Object.isFrozen(node))).toBe(true);
    expect(Reflect.set(root, 'exponent', 3)).toBe(false);
    expect(Reflect.set(operation.left, 'unit', 'm')).toBe(false);
    expect(root.exponent).toBe(2);
    expect(operation.left).toEqual({ operator: 'unit', unit: 'cm' });
    expect(valueOf(convert({ quantity: nested.value, to: 'm4' }))).toBeCloseTo(3.6e-7);
  });

  it('rejects dimensionally equal kinds without a reviewed relationship', () => {
    const energy = quantity({ value: 1, unit: 'J', kind: quantityKinds.energy });
    const torque = quantity({ value: 1, unit: 'N.m', kind: quantityKinds.torque });
    expect(checkOperation({ operator: 'add', left: energy, right: torque }).status).toBe('invalid');
    const angle = quantity({ value: 1, unit: 'rad', kind: quantityKinds.planeAngle });
    expect(checkOperation({ operator: 'log', left: angle }).status).toBe('invalid');
    expect(checkOperation({ operator: 'multiply', left: angle, right: angle }).status).toBe('success');
  });

  it('round-trips representative linear conversions without changing native inputs', () => {
    const cases = [
      { from: 'mm', to: '[in_i]', values: [-1000, -0, 0.125, 1, 12_345.678] },
      { from: 'deg', to: 'rad', values: [-360, -0, 0.5, 90, 720] },
      { from: 'kg/m3', to: 'g/cm3', values: [-10, -0, 0.125, 1, 1000] },
    ] as const;
    for (const { from, to, values } of cases) {
      for (const value of values) {
        const original = quantity({ value, unit: from });
        const there = convert({ quantity: original, to });
        if (there.status !== 'success') {
          throw new Error(there.diagnostic.message);
        }
        const back = convert({ quantity: there.value, to: from });
        expect(valueOf(back)).toBeCloseTo(value, 10);
        expect(original.value).toBe(value);
      }
    }
  });

  it('checks zero powers, odd roots, clamp bounds, overflow, integers, and underflow', () => {
    const length = quantity({ value: 2, unit: 'm', kind: quantityKinds.length });
    const zeroPower = checkOperation({ operator: 'power', left: length, exponent: 0 });
    expect(zeroPower.status === 'success' && 'value' in zeroPower.value && zeroPower.value.value).toBe(1);
    const cube = quantity({ value: -8, unit: 'm3', kind: quantityKinds.volume });
    const root = checkOperation({ operator: 'root', left: cube, exponent: 3 });
    expect(root.status === 'success' && 'value' in root.value && root.value.value).toBeCloseTo(-2);
    expect(checkOperation({ operator: 'root', left: cube, exponent: 0 }).status).toBe('invalid');
    expect(
      checkOperation({
        operator: 'clamp',
        left: length,
        right: quantity({ value: 10, unit: 'm', kind: quantityKinds.length }),
        upper: quantity({ value: 1, unit: 'm', kind: quantityKinds.length }),
      }).status,
    ).toBe('invalid');

    const largePoint = quantity({
      value: Number.MAX_VALUE,
      unit: 'K',
      kind: quantityKinds.temperature,
      space: 'point',
    });
    const lowPoint = quantity({ value: -Number.MAX_VALUE, unit: 'K', kind: quantityKinds.temperature, space: 'point' });
    expect(checkOperation({ operator: 'subtract', left: largePoint, right: lowPoint }).status).toBe('invalid');
    const safe = quantity({
      value: Number.MAX_SAFE_INTEGER,
      unit: 'm',
      kind: quantityKinds.length,
      representation: 'safe-integer',
    });
    expect(
      checkOperation({
        operator: 'add',
        left: safe,
        right: quantity({ value: 1, unit: 'm', kind: quantityKinds.length, representation: 'safe-integer' }),
      }).status,
    ).toBe('unsupported');
    expect(convert({ quantity: quantity({ value: Number.MIN_VALUE, unit: 'mm' }), to: 'm' }).status).toBe(
      'unsupported',
    );
  });

  it('preserves decimal text and inferred assumptions without executing them', () => {
    const decimal = createQuantity({
      value: '1.2300',
      representation: 'decimal',
      unit: 'mm',
      kind: quantityKinds.length,
      space: 'linear',
    });
    expect(decimal.status === 'success' && decimal.value.value).toBe('1.2300');
    if (decimal.status === 'success') {
      expect(convert({ quantity: decimal.value, to: 'm' }).status).toBe('unsupported');
    }
    const inferred = createQuantity({
      value: 1,
      unit: 'm',
      kind: quantityKinds.length,
      space: 'linear',
      assumptions: [{ profile: 'p', rule: 'r', evidence: 'e' }],
    });
    expect(inferred.status).toBe('success');
    expect(
      createQuantity({
        value: 1,
        unit: 'm',
        kind: quantityKinds.length,
        space: 'linear',
        assumptions: [{ profile: 'p', rule: 'r', evidence: 'e' }],
        semanticMode: 'declared-only',
      }).status,
    ).toBe('indeterminate');
    expect(Reflect.apply(createQuantity, undefined, [{ value: 1, unit: 'm', space: 'bogus' }]).status).toBe('invalid');
    expect(
      Reflect.apply(createQuantity, undefined, [{ value: 1, unit: 'm', space: 'linear', assumptions: {} }]).status,
    ).toBe('invalid');
  });

  it('requires reviewed semantics in declared-only mode and owns admitted evidence', () => {
    expect(
      createQuantity({
        value: 1,
        unit: 'm',
        kind: 'https://invalid.example/Length',
        space: 'linear',
        semanticMode: 'declared-only',
      }).status,
    ).toBe('indeterminate');

    const assumption = { profile: 'profile', rule: 'before', evidence: 'source' };
    const admitted = createQuantity({
      value: 1,
      unit: 'm',
      kind: quantityKinds.length,
      space: 'linear',
      assumptions: [assumption],
    });
    expect(admitted.status).toBe('success');
    if (admitted.status !== 'success') {
      throw new Error('Fixture failed.');
    }
    assumption.rule = 'after';
    expect(admitted.value.assumptions[0]?.rule).toBe('before');
    expect(Object.isFrozen(admitted.value.assumptions)).toBe(true);
    expect(Object.isFrozen(admitted.value.assumptions[0])).toBe(true);

    const compared = checkOperation({
      operator: 'compare',
      left: admitted.value,
      right: quantity({ value: 2, unit: 'm', kind: quantityKinds.length }),
    });
    expect(compared.status).toBe('success');
    if (compared.status === 'success') {
      expect(Object.isFrozen(compared.value)).toBe(true);
      expect(Object.isFrozen(compared.value.assumptions[0])).toBe(true);
    }
  });

  it('derives selection, point-shift, and clamp metadata from every operand', () => {
    const minimum = checkOperation({
      operator: 'min',
      left: quantity({
        value: 2,
        unit: 'm',
        kind: quantityKinds.height,
        representation: 'safe-integer',
      }),
      right: quantity({ value: 1.5, unit: 'm', kind: quantityKinds.width }),
    });
    expect(minimum.status).toBe('success');
    if (minimum.status === 'success' && 'unit' in minimum.value) {
      expect(minimum.value).toMatchObject({
        value: 1.5,
        kind: quantityKinds.length,
        representation: 'binary64',
      });
    }

    const shifted = checkOperation({
      operator: 'add',
      left: quantity({
        value: 1,
        unit: 'Cel',
        kind: quantityKinds.thermodynamicTemperature,
        space: 'point',
        representation: 'safe-integer',
      }),
      right: quantity({
        value: 0.5,
        unit: 'K',
        kind: quantityKinds.temperatureDifference,
        space: 'difference',
      }),
    });
    expect(shifted.status).toBe('success');
    if (shifted.status === 'success' && 'unit' in shifted.value) {
      expect(shifted.value).toMatchObject({
        value: 1.5,
        kind: quantityKinds.thermodynamicTemperature,
        representation: 'binary64',
      });
    }

    const clamp = checkOperation({
      operator: 'clamp',
      left: quantity({
        value: 5,
        unit: 'm',
        kind: quantityKinds.height,
        representation: 'safe-integer',
      }),
      right: quantity({ value: 1.5, unit: 'm', kind: quantityKinds.height }),
      upper: quantity({ value: 4.5, unit: 'm', kind: quantityKinds.width }),
    });
    expect(clamp.status).toBe('success');
    if (clamp.status === 'success' && 'unit' in clamp.value) {
      expect(clamp.value).toMatchObject({
        value: 4.5,
        kind: quantityKinds.length,
        representation: 'binary64',
      });
    }
  });

  it('uses binary64 alignment intermediates while enforcing the final representation', () => {
    const binaryMetre = quantity({ value: 1, unit: 'm', kind: quantityKinds.length });
    const integerMillimetre = quantity({
      value: 1,
      unit: 'mm',
      kind: quantityKinds.length,
      representation: 'safe-integer',
    });
    const added = checkOperation({ operator: 'add', left: binaryMetre, right: integerMillimetre });
    expect(added.status === 'success' && 'unit' in added.value && added.value.value).toBeCloseTo(1.001);

    const minimum = checkOperation({ operator: 'min', left: binaryMetre, right: integerMillimetre });
    expect(minimum.status === 'success' && 'unit' in minimum.value && minimum.value.value).toBeCloseTo(0.001);

    const clamped = checkOperation({
      operator: 'clamp',
      left: binaryMetre,
      right: integerMillimetre,
      upper: quantity({
        value: 1001,
        unit: 'mm',
        kind: quantityKinds.length,
        representation: 'safe-integer',
      }),
    });
    expect(clamped.status === 'success' && 'unit' in clamped.value && clamped.value.value).toBe(1);

    const safeMetre = quantity({
      value: 1,
      unit: 'm',
      kind: quantityKinds.length,
      representation: 'safe-integer',
    });
    const safeMillimetres = quantity({
      value: 1001,
      unit: 'mm',
      kind: quantityKinds.length,
      representation: 'safe-integer',
    });
    const compared = checkOperation({ operator: 'compare', left: safeMetre, right: safeMillimetres });
    expect(compared.status === 'success' && compared.value.value).toBe(-1);
    expect(checkOperation({ operator: 'add', left: safeMetre, right: safeMillimetres }).status).toBe('unsupported');

    const extremes = checkOperation({
      operator: 'compare',
      left: quantity({ value: Number.MAX_VALUE, unit: 'm', kind: quantityKinds.length }),
      right: quantity({ value: -Number.MAX_VALUE, unit: 'm', kind: quantityKinds.length }),
    });
    expect(extremes.status === 'success' && extremes.value.value).toBe(1);
  });

  it('rejects unusable conversion factors and canonical scalar operands', () => {
    expect(convert({ quantity: quantity({ value: 0, unit: 'ym12' }), to: 'Ym12' }).status).toBe('unsupported');
    expect(
      checkOperation({
        operator: 'sin',
        left: quantity({ value: Number.MIN_VALUE, unit: 'deg', kind: quantityKinds.planeAngle }),
      }).status,
    ).toBe('unsupported');

    const forgedProvenance = {
      ...quantity({ value: 1, unit: 'm' }),
      numericProvenance: { source: 'ucum-lhc-7.1.9', factor: 0, behavior: 'binary64-rounded' },
    };
    expect(Reflect.apply(convert, undefined, [{ quantity: forgedProvenance, to: 'cm' }]).status).toBe('invalid');
  });

  it('rejects malformed runtime requests and merges comparison assumptions', () => {
    const left = createQuantity({
      value: 1,
      unit: 'm',
      kind: quantityKinds.length,
      space: 'linear',
      assumptions: [{ profile: 'left', rule: 'declared', evidence: 'left-evidence' }],
    });
    const right = createQuantity({
      value: 2,
      unit: 'm',
      kind: quantityKinds.length,
      space: 'linear',
      assumptions: [{ profile: 'right', rule: 'declared', evidence: 'right-evidence' }],
    });
    if (left.status !== 'success' || right.status !== 'success') {
      throw new Error('Comparison fixtures failed admission.');
    }
    const compared = checkOperation({ operator: 'compare', left: left.value, right: right.value });
    expect(compared.status === 'success' && compared.value.assumptions).toHaveLength(2);
    expect(
      Reflect.apply(checkOperation, undefined, [{ operator: 'bogus', left: left.value, right: right.value }]).status,
    ).toBe('invalid');
    expect(Reflect.apply(convert, undefined, [null]).status).toBe('invalid');
  });
});
