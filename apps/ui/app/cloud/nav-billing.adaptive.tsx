import { CloudSurface } from '#cloud/cloud-surface.js';
import { useCloudFunded } from '#cloud/cloud-mode.js';
import {
  NavBillingItem as SelfHostNavBillingItem,
  NavCreditsMeter as SelfHostNavCreditsMeter,
} from '#cloud/nav-billing.self-host.js';

// oxlint-disable-next-line no-barrel-files/no-barrel-files -- the route list is selected by mode in W5.
export { billingNavRoutes } from '#cloud/nav-billing.self-host.js';

/** The adaptive facade of `nav-billing` (W2 skeleton): the self-host rendering until W5. */
export function NavBillingItem(): React.JSX.Element | undefined {
  const funded = useCloudFunded();
  return <CloudSurface enabled={funded} fallback={<SelfHostNavBillingItem />} render={() => undefined} />;
}

export function NavCreditsMeter(): React.JSX.Element | undefined {
  const funded = useCloudFunded();
  return <CloudSurface enabled={funded} fallback={<SelfHostNavCreditsMeter />} render={() => undefined} />;
}
