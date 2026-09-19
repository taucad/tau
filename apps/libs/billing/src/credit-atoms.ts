/** Number of indivisible atoms in one Tau credit. @public */
export const creditAtomsPerCredit = 10_000n;

/** Largest credit-atom value supported by PostgreSQL `bigint`. @public */
export const maxCreditAtoms = 9_223_372_036_854_775_807n;

/** One exact rational contribution to an atom total. @public */
export type RationalCreditAtoms = {
  numeratorCreditAtoms: bigint;
  denominator: bigint;
};

const assertRational = ({ numeratorCreditAtoms, denominator }: RationalCreditAtoms): void => {
  if (numeratorCreditAtoms < 0n || denominator <= 0n) {
    throw new RangeError('Rational contributions require a nonnegative numerator and positive denominator');
  }
};

const sumRational = (contributions: readonly RationalCreditAtoms[]): RationalCreditAtoms => {
  let numeratorCreditAtoms = 0n;
  let denominator = 1n;

  for (const contribution of contributions) {
    assertRational(contribution);
    numeratorCreditAtoms =
      numeratorCreditAtoms * contribution.denominator + contribution.numeratorCreditAtoms * denominator;
    denominator *= contribution.denominator;
  }

  return { numeratorCreditAtoms, denominator };
};

const assertAtomResult = (value: bigint): bigint => {
  if (value > maxCreditAtoms) {
    throw new RangeError('Credit atom result exceeds signed 64-bit storage');
  }
  return value;
};

/** Reserves the ceiling of the exact sum, rounding only once after summation. @public */
export const ceilRationalCreditAtoms = (contributions: readonly RationalCreditAtoms[]): bigint => {
  const { numeratorCreditAtoms, denominator } = sumRational(contributions);
  return assertAtomResult((numeratorCreditAtoms + denominator - 1n) / denominator);
};

/** Settles the half-up value of the exact sum, rounding only once after summation. @public */
export const roundHalfUpRationalCreditAtoms = (contributions: readonly RationalCreditAtoms[]): bigint => {
  const { numeratorCreditAtoms, denominator } = sumRational(contributions);
  return assertAtomResult((2n * numeratorCreditAtoms + denominator) / (2n * denominator));
};

/** Multiplies USD principal cents by a frozen offer's exact atoms-per-cent rate. @public */
export const usdCentsToCreditAtoms = (principalCents: bigint, creditAtomsPerCent: bigint): bigint => {
  if (
    principalCents < 0n ||
    creditAtomsPerCent < 0n ||
    (creditAtomsPerCent !== 0n && principalCents > maxCreditAtoms / creditAtomsPerCent)
  ) {
    throw new RangeError('USD principal conversion is outside supported credit atom storage');
  }
  return principalCents * creditAtomsPerCent;
};

/** Formats atom values as an exact credit decimal without floating-point conversion. @public */
export const formatCreditAtoms = (atoms: bigint): string => {
  const negative = atoms < 0n;
  const absolute = negative ? -atoms : atoms;
  const whole = absolute / creditAtomsPerCredit;
  const fraction = (absolute % creditAtomsPerCredit).toString().padStart(4, '0').replace(/0+$/u, '');
  return `${negative ? '-' : ''}${whole}${fraction.length === 0 ? '' : `.${fraction}`}`;
};

const atomsPerDisplayDigit = creditAtomsPerCredit / 100n;

/**
 * Formats atom values for ordinary display: at most two fractional digits with
 * trailing zeros trimmed, and a bounded form for a nonzero amount that is too
 * small at that precision. `formatCreditAtoms` keeps the exact detail value.
 * @public
 */
export const formatCreditAtomsDisplay = (atoms: bigint): string => {
  const negative = atoms < 0n;
  const absolute = negative ? -atoms : atoms;
  const hundredths = (2n * absolute + atomsPerDisplayDigit) / (2n * atomsPerDisplayDigit);
  if (hundredths === 0n) {
    return absolute === 0n ? '0' : negative ? '>-0.01' : '<0.01';
  }
  const fraction = (hundredths % 100n).toString().padStart(2, '0').replace(/0+$/u, '');
  return `${negative ? '-' : ''}${hundredths / 100n}${fraction.length === 0 ? '' : `.${fraction}`}`;
};
