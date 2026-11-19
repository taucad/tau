import { useEffect, useMemo } from 'react';
import { isKernelAllowed, storageLimitBytesByTier } from '@taucad/billing';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import { useCredits } from '@taucad/billing/hooks/use-credits';
import { useModelEstimates } from '@taucad/billing/hooks/use-model-estimates';
import { useAutoReloadEnabled } from '@taucad/billing-ui/hooks/use-auto-reload-enabled';
import { kernelConfigurations } from '@taucad/types/constants';
import { cloudPort } from '#cloud/cloud-port.js';
import type { CloudPlanFacts } from '#cloud/plan-facts.types.js';

/**
 * The Cloud chunk (adaptive app deployment mode charter D6): loaded only while the mode is `funded`, through the one
 * loader (`cloud-entries.ts`), and mounted through the one surface helper. Never part of Core.
 */

/**
 * The bridge: mounted inside the financial providers for one identity, it calls the real billing hooks and publishes
 * that identity's plan facts into the port as data, never closures (D6). A fact is published only once its source has
 * answered; until then the facades read it as unresolved. It forgets the identity's facts when it unmounts.
 *
 * @param props - The identity's key.
 * @returns Nothing visible.
 */
export function CloudBridge({ identityKey }: { readonly identityKey: string }): undefined {
  const entitlements = useEntitlements();
  const explanation = useCredits();
  const estimates = useModelEstimates();
  const autoReloadEnabled = useAutoReloadEnabled();
  const facts = useMemo((): CloudPlanFacts => {
    const commercial = entitlements.isResolved
      ? {
          canCreatePrivateShares: entitlements.canCreatePrivateShares,
          canSyncFiles: entitlements.canSyncFiles,
          storageLimitBytes: entitlements.canSyncFiles ? storageLimitBytesByTier[entitlements.tier] : undefined,
          canUpgradePlan: entitlements.tier !== 'enterprise',
        }
      : undefined;
    const kernels = entitlements.isResolved
      ? {
          allowed: kernelConfigurations
            .map((option) => option.id)
            .filter((kernel) => isKernelAllowed(kernel, entitlements.tier)),
        }
      : undefined;
    const credit =
      estimates === undefined
        ? undefined
        : {
            /* An explanation whose authority is unavailable carries no balance, which must not read as zero. */
            availableAtoms: explanation?.balance ? explanation.balance.eligibleAvailableCreditAtoms : undefined,
            minimumHoldAtoms: Object.fromEntries(
              estimates.routes.map((route) => [route.routeId, route.minimumHoldAtoms]),
            ),
            autoReloadEnabled,
          };
    return {
      ...(commercial === undefined ? {} : { commercial }),
      ...(kernels === undefined ? {} : { kernels }),
      ...(credit === undefined ? {} : { credit }),
    };
  }, [autoReloadEnabled, entitlements, estimates, explanation]);
  useEffect(() => {
    cloudPort.publish(identityKey, facts);
  }, [facts, identityKey]);
  useEffect(
    () => () => {
      cloudPort.clear(identityKey);
    },
    [identityKey],
  );
  return undefined;
}
