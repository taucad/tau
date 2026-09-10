import { ceilRationalCreditAtoms } from '@taucad/billing';
import type { JointInputMaximum } from '#api/billing/credit-ledger.types.js';

/** Prices independent meter maxima, or the qualified single disjoint input partition. */
export const maximumMeterCharge = (
  meters: ReadonlyArray<{ dimension: string; quantity: bigint; numerator: bigint; denominator: bigint }>,
  jointInputMaximum?: JointInputMaximum,
): bigint => {
  if (jointInputMaximum === undefined) {
    return ceilRationalCreditAtoms(
      meters.map((meter) => ({
        numeratorCreditAtoms: meter.numerator * meter.quantity,
        denominator: meter.denominator,
      })),
    );
  }
  const maximumInput = BigInt(jointInputMaximum.quantity);
  const input = meters.filter((meter) => meter.dimension !== 'output');
  if (
    input.length === 0 ||
    input.some(
      (meter) =>
        !['uncached_input', 'cache_read', 'cache_write'].includes(meter.dimension) || meter.quantity !== maximumInput,
    )
  ) {
    throw new Error('Joint input maximum does not match the qualified meter partition');
  }
  let highest = input[0]!;
  for (const meter of input) {
    if (meter.numerator * highest.denominator > highest.numerator * meter.denominator) {
      highest = meter;
    }
  }
  return ceilRationalCreditAtoms([
    { numeratorCreditAtoms: highest.numerator * maximumInput, denominator: highest.denominator },
    ...meters
      .filter((meter) => meter.dimension === 'output')
      .map((meter) => ({
        numeratorCreditAtoms: meter.numerator * meter.quantity,
        denominator: meter.denominator,
      })),
  ]);
};
