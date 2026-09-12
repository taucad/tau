import { useCallback } from 'react';
import { useCredits } from '@taucad/billing/hooks/use-credits';
import { useModelEstimates } from '@taucad/billing/hooks/use-model-estimates';
import { errorCategory } from '@taucad/types/constants';
import { errorCategoryTitles } from '@taucad/chat/utils';

/**
 * Refuse a turn the account cannot fund, before it is dispatched.
 *
 * Throws an `Error` whose message is the same `ChatError` JSON the gateway's own
 * 402 projects (`agent-host-event-projection.ts`), so the refusal renders on the
 * existing credits card with the same `details` shortfall the server would have
 * sent. Returns normally — fails **open** to the server's own admission — when
 * either read is unavailable or the route publishes no estimate.
 */
export type CreditPreflight = (routeId: string, modelName: string) => void;

/**
 * Compares the account's spendable credit against the *floor* admission would hold
 * on the selected route (`minimumHoldAtoms` from `GET /v1/billing/model-estimates`).
 *
 * The floor prices the smallest turn the route's wire admits, so a balance below it
 * cannot fund any turn on the route and the refusal is a fact, not a guess. The
 * representative hold is a much larger number — on Astra, ~2.7x the floor — and
 * refusing against it denied turns the ledger went on to admit; the picker and the
 * balance chip keep using it for "≈ credits per turn" and their advisory
 * below-one-turn warning.
 *
 * @returns A refusal to call once per dispatch, with the route the turn will use.
 */
export const useCreditPreflight = (): CreditPreflight => {
  const explanation = useCredits();
  const estimates = useModelEstimates();

  return useCallback(
    (routeId: string, modelName: string): void => {
      // `eligibleAvailableCreditAtoms` is the server's own spendable figure
      // (assets − holds, zero while in debt). An explanation whose authority is
      // unavailable carries no balance at all, and must not read as zero.
      const balance = explanation?.balance;
      const available = balance ? balance.eligibleAvailableCreditAtoms : undefined;
      const required = estimates?.routes.find((route) => route.routeId === routeId)?.minimumHoldAtoms;
      if (available === undefined || required === undefined) {
        return;
      }
      const availableAtoms = BigInt(available);
      const requiredAtoms = BigInt(required);
      if (availableAtoms >= requiredAtoms) {
        return;
      }
      throw new Error(
        JSON.stringify({
          category: errorCategory.credits,
          title: errorCategoryTitles[errorCategory.credits],
          // The exact shortfall rides on `details`, which the credits card
          // renders; `@taucad/billing`'s formatter is lazy-loaded in this app
          // and may not be imported statically here.
          message: `Add credits to start a turn on ${modelName}.`,
          code: 'INSUFFICIENT_CREDIT',
          httpStatus: 402,
          details: {
            // The real shortfall: what the balance must reach before any turn on
            // this route can be admitted, not what a representative turn reserves.
            requiredCreditAtoms: required,
            availableCreditAtoms: available,
            routeId,
          },
        }),
      );
    },
    [estimates, explanation],
  );
};
