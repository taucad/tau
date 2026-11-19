import { useSyncExternalStore } from 'react';
import { Button } from '@taucad/ui/components/button';
import { SettingsGroup } from '@taucad/settings-ui/components/settings/settings-item';
import { FundedSurface } from '#cloud/cloud-surface.js';
import { cloudSurfaces } from '#cloud/cloud-entries.js';
import { useDeploymentMode, useRetryDeploymentMode } from '#cloud/use-deployment-mode.js';
import type { DeploymentModeProblem } from '#cloud/deployment-mode.types.js';
import {
  CloudAccountClosure as SelfHostAccountClosure,
  CloudBillingSettings as SelfHostBillingSettings,
} from '#cloud/settings-billing.self-host.js';

/** What the Billing section says while the mode is unknown (the surface table, I15). @public */
export const billingWaitCopy: Readonly<Record<DeploymentModeProblem, string>> = {
  pending: 'Checking this server…',
  unreachable: 'Can’t reach this server’s billing right now.',
  unsupported: 'This server’s billing needs a newer version of Tau. Update Tau to see it.',
  misconfigured: 'This server’s billing is not set up. Contact the person who runs it.',
  'safe-mode': 'Billing is off in safe mode. Restart normally to see it.',
};

function BillingWait({ copy, onRetry }: { readonly copy: string; readonly onRetry?: () => void }): React.JSX.Element {
  return (
    <SettingsGroup>
      <div role='status' className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
        <span>{copy}</span>
        {onRetry === undefined ? undefined : (
          <Button variant='outline' size='xs' onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </SettingsGroup>
  );
}

/** While the Cloud chunk loads: loading for the import deadline, then a stated failure with Retry (I8, I15). */
function BillingLoading(): React.JSX.Element {
  const failed = useSyncExternalStore(
    cloudSurfaces.subscribe,
    () => cloudSurfaces.state().status === 'failed',
    () => false,
  );
  return failed ? (
    <BillingWait
      copy='Billing couldn’t load.'
      onRetry={() => {
        cloudSurfaces.retry();
      }}
    />
  ) : (
    <BillingWait copy='Loading billing…' />
  );
}

/**
 * The Billing section (adaptive app deployment mode, the surface table): the Cloud settings while funded; nothing
 * when unfunded; while unknown, which wait it is, with Retry where a retry can help.
 */
export function CloudBillingSettings(): React.JSX.Element | undefined {
  const mode = useDeploymentMode();
  const retry = useRetryDeploymentMode();
  if (mode.state === 'unfunded') {
    return <SelfHostBillingSettings />;
  }
  if (mode.state === 'unknown') {
    const canRetry = mode.problem === 'unreachable' || mode.problem === 'misconfigured';
    return <BillingWait copy={billingWaitCopy[mode.problem]} {...(canRetry ? { onRetry: retry } : {})} />;
  }
  return <FundedSurface fallback={<BillingLoading />} render={(cloud) => <cloud.CloudBillingSettings />} />;
}

/** Close account: only while funded and the latest ask succeeded (I6, D5). */
export function CloudAccountClosure(): React.JSX.Element | undefined {
  const mode = useDeploymentMode();
  const confirmed = mode.state === 'funded' && mode.basis === 'confirmed';
  return (
    <FundedSurface
      enabled={confirmed}
      fallback={<SelfHostAccountClosure />}
      render={(cloud) => <cloud.CloudAccountClosure />}
    />
  );
}
