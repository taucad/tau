import { CloudSurface } from '#cloud/cloud-surface.js';
import { useCloudFunded } from '#cloud/cloud-mode.js';
import { useCloudFacts } from '#cloud/cloud-port.js';
import {
  CommercialUpgradeLabel as SelfHostUpgradeLabel,
  useCommercialFeatures as useSelfHostCommercialFeatures,
} from '#cloud/commercial-features.self-host.js';

/**
 * The adaptive facade of `commercial-features` (adaptive app deployment mode charter D6, W2 skeleton): the hook reads
 * the Cloud port and the label mounts through the one surface helper. Until W4 and W5 fill them, both answer as the
 * self-host build does.
 */
export function CommercialUpgradeLabel(): React.JSX.Element | undefined {
  const funded = useCloudFunded();
  return <CloudSurface enabled={funded} fallback={<SelfHostUpgradeLabel />} render={() => undefined} />;
}

export const useCommercialFeatures: typeof useSelfHostCommercialFeatures = () => {
  useCloudFacts(undefined);
  return useSelfHostCommercialFeatures();
};
