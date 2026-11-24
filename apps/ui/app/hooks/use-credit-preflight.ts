import { cloudPort } from '#cloud/cloud-port.js';
import type { CloudPlanFacts } from '#cloud/plan-facts.types.js';
import { refuseUnfundedTurn } from '#hooks/credit-preflight-refusal.js';

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
 * The credit preflight (adaptive app deployment mode charter C7, I4): a stable function that reads the
 * credit facts of the identity bound when it is called, never a value captured before an `await`. With none
 * (unfunded, unknown, signed out, the balance not yet read) it is a no-op and the server's admission decides.
 *
 * @param routeId - The route the turn will use.
 * @param modelName - The model's name, for the refusal.
 * @public
 */
export const preflightCredit: CreditPreflight = (routeId, modelName) => {
  const credit = (cloudPort.read(cloudPort.current()) as CloudPlanFacts | undefined)?.credit;
  if (credit === undefined) {
    return;
  }
  refuseUnfundedTurn({
    available: credit.availableAtoms,
    required: credit.minimumHoldAtoms[routeId],
    autoReloadEnabled: credit.autoReloadEnabled,
    routeId,
    modelName,
  });
};

/** One function for the page's life: it reads the bound identity when called. */
export const useCreditPreflight = (): CreditPreflight => preflightCredit;
