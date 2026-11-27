import { useMemo } from 'react';
import { useAdaptivePlan } from '#cloud/use-plan-wait.js';
import type { CreditFacts } from '#cloud/plan-facts.types.js';

/** Credit atoms per whole credit, the same figure as `cardCreditAtomsPerCredit` (gate G1 keeps billing out of Core). */
const creditAtomsPerCredit = 10_000n;

/**
 * What the bound account can pay for now, as the chat's credit surfaces read it: the balance, whether a route's
 * floor is covered, and the purchase rate for the price line. Part of Core.
 * @public
 */
export type CreditStanding = Readonly<{
  /** Spendable credit atoms. */
  availableAtoms: bigint;
  /** No spendable credit at all: the zero-balance surfaces (first prompt, note above the composer) apply. */
  isEmpty: boolean;
  /** Whether the balance covers this route's floor; `undefined` when the route publishes none. */
  covers: (routeId: string) => boolean | undefined;
  /** Whether any published route's floor is covered, so a cheaper model is a fix worth offering. */
  coversAnyRoute: boolean;
  /** Credits one US dollar buys, when the Cloud chunk published it. */
  creditsPerUsd: number | undefined;
}>;

/**
 * The standing a set of credit facts describes. Nothing while the balance is unknown or automatic reload is on:
 * reload tops the balance up at the server's refusal, so no surface should ask the person to add credits.
 *
 * @param credit - The published credit facts, if any.
 * @returns The standing, or `undefined`.
 * @public
 */
export const creditStandingOf = (credit: CreditFacts | undefined): CreditStanding | undefined => {
  if (credit?.availableAtoms === undefined || credit.autoReloadEnabled || !/^\d+$/u.test(credit.availableAtoms)) {
    return undefined;
  }
  const availableAtoms = BigInt(credit.availableAtoms);
  const covers = (routeId: string): boolean | undefined => {
    const floor = credit.minimumHoldAtoms[routeId];
    return floor === undefined || !/^\d+$/u.test(floor) ? undefined : availableAtoms >= BigInt(floor);
  };
  return {
    availableAtoms,
    isEmpty: availableAtoms === 0n,
    covers,
    coversAnyRoute: Object.keys(credit.minimumHoldAtoms).some((routeId) => covers(routeId) === true),
    creditsPerUsd: credit.creditsPerUsd,
  };
};

/**
 * Whole credits in a number of atoms, rounded down, formatted for copy ("1,000").
 *
 * @param atoms - Credit atoms.
 * @returns The formatted whole credits.
 * @public
 */
export const formatWholeCredits = (atoms: bigint): string => (atoms / creditAtomsPerCredit).toLocaleString('en-US');

/**
 * The bound account's credit standing, following each publish of its plan facts.
 *
 * @returns The standing, or `undefined` while unknown, unfunded or on automatic reload.
 * @public
 */
export const useCreditStanding = (): CreditStanding | undefined => {
  const credit = useAdaptivePlan().facts?.credit;
  return useMemo(() => creditStandingOf(credit), [credit]);
};
