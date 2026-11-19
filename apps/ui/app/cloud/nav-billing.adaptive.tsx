import { ChartColumn } from 'lucide-react';
import { FundedSurface } from '#cloud/cloud-surface.js';
import { useCloudFunded } from '#cloud/cloud-mode.js';
import { isDesktopTarget } from '#lib/build-target.js';
import type { NavRoute } from '#constants/route.constants.js';
import {
  NavBillingItem as SelfHostNavBillingItem,
  NavCreditsMeter as SelfHostNavCreditsMeter,
} from '#cloud/nav-billing.self-host.js';

const usageRoutes: NavRoute[] = [{ title: 'Usage', url: '/usage', icon: ChartColumn }];
const noRoutes: NavRoute[] = [];

/**
 * The Usage link (adaptive app deployment mode D8): only where the route exists, the adaptive desktop build, and only
 * while the mode is `funded`. The adaptive web build has no `/usage`.
 *
 * @returns The billing nav routes.
 */
export const useBillingNavRoutes = (): NavRoute[] => (useCloudFunded() && isDesktopTarget() ? usageRoutes : noRoutes);

/** The account menu's Billing or Upgrade entry, from the Cloud chunk while funded. */
export function NavBillingItem(): React.JSX.Element | undefined {
  return <FundedSurface fallback={<SelfHostNavBillingItem />} render={(cloud) => <cloud.NavBillingItem />} />;
}

/** The credits meter, from the Cloud chunk while funded. */
export function NavCreditsMeter(): React.JSX.Element | undefined {
  return <FundedSurface fallback={<SelfHostNavCreditsMeter />} render={(cloud) => <cloud.NavCreditsMeter />} />;
}
