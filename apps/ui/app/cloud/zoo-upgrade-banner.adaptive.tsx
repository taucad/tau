import type { ComponentProps } from 'react';
import { CloudSurface } from '#cloud/cloud-surface.js';
import { useCloudFunded } from '#cloud/cloud-mode.js';
import { ZooUpgradeBanner as SelfHostZooUpgradeBanner } from '#cloud/zoo-upgrade-banner.self-host.js';

/** The adaptive facade of `zoo-upgrade-banner` (W2 skeleton): the self-host rendering until W5. */
export function ZooUpgradeBanner(
  props: ComponentProps<typeof SelfHostZooUpgradeBanner>,
): React.JSX.Element | undefined {
  const funded = useCloudFunded();
  return <CloudSurface enabled={funded} fallback={<SelfHostZooUpgradeBanner {...props} />} render={() => undefined} />;
}
