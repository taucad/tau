import { useCallback } from 'react';
import { useCredits } from '@taucad/billing/hooks/use-credits';
import { useModelEstimates } from '@taucad/billing/hooks/use-model-estimates';
import { refuseUnfundedTurn } from '#hooks/credit-preflight-refusal.js';
import { useAutoReloadEnabled } from '@taucad/billing-ui/hooks/use-auto-reload-enabled';

/**
 * Refuse a turn the account cannot fund, before it is dispatched.
 *
 * Throws an `Error` whose message is the same `ChatError` JSON the gateway's own
 * 402 projects (`agent-host-event-projection.ts`), so the refusal renders on the
 * existing credits card with the same `details` shortfall the server would have
 * sent. Returns normally — fails **open** to the server's own admission — when
 * either read is unavailable, the route publishes no estimate, or automatic reload
 * is enabled: the server's own insufficient-credit denial is what wakes the reload.
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
  const autoReloadEnabled = useAutoReloadEnabled();

  return useCallback(
    (routeId: string, modelName: string): void => {
      // `eligibleAvailableCreditAtoms` is the server's own spendable figure
      // (assets − holds, zero while in debt). An explanation whose authority is
      // unavailable carries no balance at all, and must not read as zero.
      const balance = explanation?.balance;
      refuseUnfundedTurn({
        available: balance ? balance.eligibleAvailableCreditAtoms : undefined,
        required: estimates?.routes.find((route) => route.routeId === routeId)?.minimumHoldAtoms,
        autoReloadEnabled,
        routeId,
        modelName,
      });
    },
    [autoReloadEnabled, estimates, explanation],
  );
};
