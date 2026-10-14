import { formatCreditAtomsDisplay } from '@taucad/billing';

/** Whole-credit presentation with a unit matching the displayed amount. */
export function formatCredits(atoms: bigint): string {
  const amount = formatCreditAtomsDisplay(atoms);
  return `${amount} ${['1', '<1', '-1', '>-1'].includes(amount) ? 'credit' : 'credits'}`;
}
