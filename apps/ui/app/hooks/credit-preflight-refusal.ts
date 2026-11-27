import { errorCategory } from '@taucad/types/constants';
import { errorCategoryTitles } from '@taucad/chat/utils';

/**
 * The credit preflight's check, shared by the pinned `cloud` hook and the adaptive facade (adaptive app deployment mode
 * C7): refuse a turn the account cannot fund, with the same `ChatError` JSON the gateway's own 402 projects. Fails
 * open when the balance or the route's floor is unknown, or automatic reload is on.
 *
 * @param input - The spendable atoms, the route's floor hold, whether auto-reload is on, the route and model.
 * @throws The refusal, as an `Error` whose message is the `ChatError` JSON.
 * @public
 */
export const refuseUnfundedTurn = (
  input: Readonly<{
    available: string | undefined;
    required: string | undefined;
    autoReloadEnabled: boolean;
    routeId: string;
    modelName: string;
  }>,
): void => {
  const { available, required, autoReloadEnabled, routeId, modelName } = input;
  if (available === undefined || required === undefined || autoReloadEnabled) {
    return;
  }
  if (BigInt(available) >= BigInt(required)) {
    return;
  }
  throw new Error(
    JSON.stringify({
      category: errorCategory.credits,
      title: errorCategoryTitles[errorCategory.credits],
      // The exact shortfall rides on `details`, which the credits card
      // renders; `@taucad/billing`'s formatter is lazy-loaded in this app
      // and may not be imported statically here.
      message: `Add credits to use ${modelName}.`,
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
};
