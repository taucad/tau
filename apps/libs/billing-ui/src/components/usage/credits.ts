import { creditAtomsPerCredit, formatCreditAtomsDisplay } from '@taucad/billing';

/**
 * Bounded presentation number for a chart axis. Exact aggregation stays on the
 * server in atoms; this value never returns to charging arithmetic.
 */
export function displayCredits(atoms: string): number {
  return Number(BigInt(atoms)) / Number(creditAtomsPerCredit);
}

/** Whole-credit tick labels; chart geometry keeps sub-credit values. */
export function formatChartCredits(value: number): string {
  return formatCreditAtomsDisplay(BigInt(Math.round(value * Number(creditAtomsPerCredit))));
}
