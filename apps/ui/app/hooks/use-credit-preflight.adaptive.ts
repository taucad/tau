import { cloudPort } from '#cloud/cloud-port.js';
import type { CloudPlanFacts } from '#cloud/plan-facts.types.js';
import { refuseUnfundedTurn } from '#hooks/credit-preflight-refusal.js';
import type { CreditPreflight } from '#hooks/use-credit-preflight.js';

/**
 * The adaptive credit preflight (adaptive app deployment mode charter C7, I4): a stable function that reads the
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
