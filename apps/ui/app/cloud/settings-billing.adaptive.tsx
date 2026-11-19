import { CloudSurface } from '#cloud/cloud-surface.js';
import { useCloudFunded } from '#cloud/cloud-mode.js';
import {
  CloudAccountClosure as SelfHostAccountClosure,
  CloudBillingSettings as SelfHostBillingSettings,
} from '#cloud/settings-billing.self-host.js';

/** The adaptive facade of `settings-billing` (W2 skeleton): the self-host rendering until W5. */
export function CloudBillingSettings(): React.JSX.Element | undefined {
  const funded = useCloudFunded();
  return <CloudSurface enabled={funded} fallback={<SelfHostBillingSettings />} render={() => undefined} />;
}

export function CloudAccountClosure(): React.JSX.Element | undefined {
  const funded = useCloudFunded();
  return <CloudSurface enabled={funded} fallback={<SelfHostAccountClosure />} render={() => undefined} />;
}
