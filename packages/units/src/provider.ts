// oxlint-disable-next-line typescript/triple-slash-reference -- ucum-lhc ships no declarations; include its ambient types at the backend import seam.
/// <reference path="./ucum-lhc.d.ts" />
import { UcumLhcUtils } from '@lhncbc/ucum-lhc';

type ProviderDimension = Readonly<{
  length: number;
  time: number;
  mass: number;
  angle: number;
  temperature: number;
  charge: number;
  luminousIntensity: number;
  amountOfSubstance: number;
}>;

type ProviderResult<T> =
  | Readonly<{ status: 'success'; value: T }>
  | Readonly<{
      status: 'indeterminate';
      diagnostic: Readonly<{ code: 'UNIT_UNKNOWN'; message: string }>;
    }>;

let providerInstance: ReturnType<typeof UcumLhcUtils.getInstance> | undefined;

const getProvider = (): ReturnType<typeof UcumLhcUtils.getInstance> => {
  providerInstance ??= UcumLhcUtils.getInstance();
  return providerInstance;
};

const providerFailure = (message: string): ProviderResult<never> => ({
  status: 'indeterminate',
  diagnostic: { code: 'UNIT_UNKNOWN', message },
});

export const inspectProviderUnit = (
  code: string,
):
  | ProviderResult<never>
  | Readonly<{
      status: 'success';
      value: Readonly<{
        arbitrary: boolean;
        dimension: ProviderDimension;
        magnitude: number;
        special: boolean;
      }>;
    }> => {
  const { unit } = getProvider().getSpecifiedUnit(code, 'validate');
  if (!unit) {
    return providerFailure('UCUM provider returned no unit metadata.');
  }

  const vector = unit.dim_?.dimVec_ ?? [];
  const magnitude = unit.magnitude_;
  if (magnitude === undefined || !Number.isFinite(magnitude) || magnitude === 0) {
    return providerFailure('UCUM provider returned no finite non-zero unit scale.');
  }

  return {
    status: 'success',
    value: {
      arbitrary: Boolean(unit.isArbitrary_),
      dimension: Object.freeze({
        length: vector[0] ?? 0,
        time: vector[1] ?? 0,
        mass: vector[2] ?? 0,
        angle: vector[3] ?? 0,
        temperature: vector[4] ?? 0,
        charge: vector[5] ?? 0,
        luminousIntensity: vector[6] ?? 0,
        amountOfSubstance: unit.moleExp_ ?? 0,
      }),
      magnitude,
      special: Boolean(unit.isSpecial_),
    },
  };
};

export const validateProviderUnit = (code: string): string | undefined => {
  const validation = getProvider().validateUnitString(code, false, 'validate');
  return validation.status === 'valid' ? undefined : (validation.msg?.join(' ') ?? 'Invalid UCUM code.');
};

type ConversionResult =
  | Readonly<{ status: 'success'; value: number }>
  | Readonly<{
      status: 'invalid';
      diagnostic: Readonly<{ code: 'DIMENSION_MISMATCH'; message: string }>;
    }>;

export const convertWithProvider = (from: string, value: number, to: string): ConversionResult => {
  const converted = getProvider().convertUnitTo(from, value, to, { suggest: false });
  if (converted.status !== 'succeeded' || converted.toVal === undefined) {
    return {
      status: 'invalid',
      diagnostic: {
        code: 'DIMENSION_MISMATCH',
        message: converted.msg?.join(' ') ?? 'Units are not convertible.',
      },
    };
  }
  return { status: 'success', value: converted.toVal };
};
