import { useCallback, useSyncExternalStore } from 'react';
import { useDeploymentMode, useRetryDeploymentMode } from '#cloud/use-deployment-mode.js';
import { useCloudIdentity } from '#cloud/cloud-identity.js';
import { cloudPort, useCloudFacts } from '#cloud/cloud-port.js';
import { cloudSurfaces } from '#cloud/cloud-entries.js';
import type { CloudPlanFacts, UnresolvedPlan } from '#cloud/plan-facts.types.js';
import type { DeploymentModeSnapshot } from '#cloud/deployment-mode.types.js';

/**
 * The plan as an adaptive facade reads it (adaptive app deployment mode charter D6, I3, I15): the display mode, the
 * facts the bridge published for the bound identity, and, while there are none, which kind of wait it is with its
 * Retry. Part of Core.
 */
export type AdaptivePlan = Readonly<{
  mode: DeploymentModeSnapshot;
  facts: CloudPlanFacts | undefined;
  /** The wait a missing fact reads as. */
  unresolved: UnresolvedPlan;
}>;

/**
 * Read the plan for the bound identity.
 *
 * @returns The mode, the facts and the unresolved reading.
 * @public
 */
export const useAdaptivePlan = (): AdaptivePlan => {
  const mode = useDeploymentMode();
  const retryMode = useRetryDeploymentMode();
  const { key } = useCloudIdentity();
  const facts = useCloudFacts(key) as CloudPlanFacts | undefined;
  const loadFailed = useSyncExternalStore(
    cloudSurfaces.subscribe,
    () => cloudSurfaces.state().status === 'failed',
    () => false,
  );
  const readWait = useCallback(() => cloudPort.wait(key), [key]);
  const portWait = useSyncExternalStore(cloudPort.subscribe, readWait, (): 'checking' => 'checking');
  const retry = useCallback(() => {
    retryMode();
    cloudPort.recheck(key);
    cloudSurfaces.retry();
  }, [key, retryMode]);
  const wait =
    mode.state === 'unknown'
      ? mode.problem === 'safe-mode'
        ? 'safe-mode'
        : mode.problem === 'pending'
          ? 'checking'
          : 'unavailable'
      : loadFailed
        ? 'unavailable'
        : portWait;
  return { mode, facts, unresolved: { isResolved: false, wait, retry } };
};
