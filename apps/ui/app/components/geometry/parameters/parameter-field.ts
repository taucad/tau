// Native semantics and admission for one editable number row. The row owns its own draft, so only
// the pure value rules live here.
import type { ParameterBinding } from '@taucad/parameters';
import type { UnitDiagnostic } from '@taucad/units/unit';

/** Native semantics of one editable field, projected out of its admitted manifest binding. */
export type ParameterFieldBinding = Readonly<{
  /** Absent for an ordinary number whose semantics are unknown; `1` is explicit dimensionless. */
  nativeUnit?: string;
  representation: ParameterBinding['representation'];
  constraints: ParameterBinding['constraints'];
  quantityKind?: string;
  space?: ParameterBinding['space'];
  reference?: string;
}>;

/** Reject a native value the producer's declaration cannot accept, before any authority round trip. */
export const validateParameterInputValue = (
  binding: ParameterFieldBinding,
  value: number,
): UnitDiagnostic | undefined => {
  if (binding.representation === 'decimal') {
    return {
      code: 'REPRESENTATION_UNSUPPORTED',
      message: 'Decimal input requires a decimal execution engine.',
    };
  }
  if (!Number.isFinite(value)) {
    return { code: 'REPRESENTATION_UNSUPPORTED', message: 'Parameter values must be finite.' };
  }
  if (binding.representation === 'safe-integer' && !Number.isSafeInteger(value)) {
    return {
      code: 'REPRESENTATION_UNSUPPORTED',
      message: 'Enter a whole number.',
    };
  }
  const { minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf } = binding.constraints;
  if (typeof minimum === 'number' && value < minimum) {
    return { code: 'METADATA_CONFLICT', message: `Value must be at least ${String(minimum)}.` };
  }
  if (typeof maximum === 'number' && value > maximum) {
    return { code: 'METADATA_CONFLICT', message: `Value must be at most ${String(maximum)}.` };
  }
  if (typeof exclusiveMinimum === 'number' && value <= exclusiveMinimum) {
    return { code: 'METADATA_CONFLICT', message: `Value must be greater than ${String(exclusiveMinimum)}.` };
  }
  if (typeof exclusiveMaximum === 'number' && value >= exclusiveMaximum) {
    return { code: 'METADATA_CONFLICT', message: `Value must be less than ${String(exclusiveMaximum)}.` };
  }
  if (typeof multipleOf === 'number' && multipleOf > 0) {
    const quotient = value / multipleOf;
    if (Math.abs(quotient - Math.round(quotient)) > Number.EPSILON * Math.max(1, Math.abs(quotient)) * 8) {
      return { code: 'METADATA_CONFLICT', message: `Value must be a multiple of ${String(multipleOf)}.` };
    }
  }
  if (Object.hasOwn(binding.constraints, 'const') && !Object.is(value, binding.constraints['const'])) {
    return { code: 'METADATA_CONFLICT', message: 'Value does not match the required constant.' };
  }
  if (
    Array.isArray(binding.constraints['enum']) &&
    !binding.constraints['enum'].some((candidate) => Object.is(candidate, value))
  ) {
    return { code: 'METADATA_CONFLICT', message: 'Value is not one of the admitted choices.' };
  }
  return undefined;
};
