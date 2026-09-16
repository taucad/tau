import { creditAtomsPerCredit } from '@taucad/billing';

/**
 * Bounded presentation number for a chart axis. Exact aggregation stays on the
 * server in atoms; this value never returns to charging arithmetic.
 */
export function displayCredits(atoms: string): number {
  return Number(BigInt(atoms)) / Number(creditAtomsPerCredit);
}
