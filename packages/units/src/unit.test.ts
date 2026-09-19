import { describe, expect, it } from 'vitest';

import { admitUnit } from '@taucad/units/unit';

describe('bounded UCUM admission', () => {
  it.each([
    { code: 'mm', status: 'success' },
    { code: 'MM', status: 'invalid' },
    { code: 'kg.m2/s2', status: 'success' },
    { code: 'rad', status: 'success' },
    { code: 'mol', status: 'success' },
    { code: 'Cel', status: 'success' },
    { code: "[arb'U]", status: 'unsupported' },
    { code: '{foo}', status: 'unsupported' },
    { code: '[pH]', status: 'unsupported' },
    { code: 'm/', status: 'invalid' },
    { code: 'm64', status: 'success' },
    { code: 'm65', status: 'invalid' },
  ] as const)('$code is $status', ({ code, status }) => {
    expect(admitUnit(code).status).toBe(status);
  });

  it('reports Tau SI dimensions separately from the provider basis', () => {
    const ampere = admitUnit('A');
    expect(ampere.status).toBe('success');
    if (ampere.status === 'success') {
      expect(ampere.value.dimension).toMatchObject({ time: 0, electricCurrent: 1 });
      expect(ampere.value.providerDimension).toMatchObject({ time: -1, charge: 1 });
    }
    const angle = admitUnit('rad');
    const mole = admitUnit('mol');
    expect(angle.status === 'success' && angle.value.dimension.angle).toBe(1);
    expect(mole.status === 'success' && mole.value.dimension.amountOfSubstance).toBe(1);
  });

  it('rejects malformed runtime arguments without exposing provider execution', () => {
    expect(Reflect.apply(admitUnit, undefined, [42]).status).toBe('invalid');
    expect(Reflect.apply(admitUnit, undefined, [' mm ']).status).toBe('invalid');
  });
});
