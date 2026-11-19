import type { ComponentProps } from 'react';
import { FundedSurface } from '#cloud/cloud-surface.js';
import { ZooUpgradeBanner as SelfHostZooUpgradeBanner } from '#cloud/zoo-upgrade-banner.self-host.js';

/** The Zoo banner's purchase action, from the Cloud chunk while funded (the surface table). */
export function ZooUpgradeBanner(
  props: ComponentProps<typeof SelfHostZooUpgradeBanner>,
): React.JSX.Element | undefined {
  return (
    <FundedSurface
      fallback={<SelfHostZooUpgradeBanner {...props} />}
      render={(cloud) => <cloud.ZooUpgradeBanner {...props} />}
    />
  );
}
