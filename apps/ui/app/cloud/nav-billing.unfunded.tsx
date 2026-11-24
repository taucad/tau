import type { NavRoute } from '#constants/route.constants.js';

const noRoutes: NavRoute[] = [];

export const useBillingNavRoutes = (): NavRoute[] => noRoutes;

export function NavBillingItem(): React.JSX.Element | undefined {
  return undefined;
}

export function NavCreditsMeter(): React.JSX.Element | undefined {
  return undefined;
}
