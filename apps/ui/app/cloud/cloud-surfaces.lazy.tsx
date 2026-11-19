import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { BillingLegalLinksProvider } from '@taucad/billing-ui/providers/billing-legal-links-provider';
import type { BillingLegalLinks } from '@taucad/billing-ui/providers/billing-legal-links-provider';
import { cloudLegalUrl } from '#cloud/cloud-legal-url.js';
import { CloudFinancialSessionProvider } from '#cloud/cloud-financial-session.js';
import type { CloudFinancialSession } from '#cloud/cloud-financial-session.js';
import { isKernelAllowed, storageLimitBytesByTier } from '@taucad/billing';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import { useCredits } from '@taucad/billing/hooks/use-credits';
import { useModelEstimates } from '@taucad/billing/hooks/use-model-estimates';
import { useAutoReloadEnabled } from '@taucad/billing-ui/hooks/use-auto-reload-enabled';
import { kernelConfigurations } from '@taucad/types/constants';
import { cloudPort } from '#cloud/cloud-port.js';
import type { CloudPlanFacts } from '#cloud/plan-facts.types.js';
import paymentSpriteUrl from '@taucad/ui-kit/icons/generated/payment-sprite.svg?url';
import { SvgSpriteLoader } from '@taucad/ui-kit/icons/svg-sprite-loader';

/* The funded surfaces (adaptive app deployment mode W5): this module resolves every `#` specifier as the `cloud`
 * ceiling does, so these are the Cloud implementations, mounted by their facades through `CloudSurface`. */
/* oxlint-disable no-barrel-files/no-barrel-files -- the one Cloud chunk names the surfaces it carries. */
export { NavBillingItem, NavCreditsMeter } from '#cloud/nav-billing.cloud.js';
export { CloudAccountClosure, CloudBillingSettings } from '#cloud/settings-billing.cloud.js';
export { ZooUpgradeBanner } from '#cloud/zoo-upgrade-banner.cloud.js';
export { CommercialUpgradeLabel } from '#cloud/commercial-features.cloud.js';
export { KernelCommercialBadge } from '#cloud/kernel-commerce.cloud.js';
export { ChatModelSelector } from '#components/chat/chat-model-selector.js';
/* Credit leaves only: the facades render their own cards and tables in Core (gate G1, one-way dependency). */
export {
  ProjectCreditsLine,
  ReceiptCreditsSummary,
  ReceiptCreditsText,
} from '#routes/w.$workspace.$project/chat-receipt-credits.js';
export { AddCreditsAction } from '#routes/w.$workspace.$project/chat-error-add-credits.js';
/** The payment and portal return (I7): the existing handler's body and latch, mounted where the hook was called. */
export { CloudPaymentReturn as PaymentReturn, DesktopPaymentFollowUp } from '#cloud/payment-return.js';
/* oxlint-enable no-barrel-files/no-barrel-files */

/** The billing surfaces link Tau's legal pages on this deployment's website (the chunk's own `cloudLegalUrl`). */
const billingLegalLinks: BillingLegalLinks = { legalUrl: cloudLegalUrl };

/**
 * The context every Cloud surface renders in, applied by `CloudSurface` around each one: the billing legal links, here
 * rather than in Core (charter G1 shrink order, step one), and the financial session Core hands in (one-way dependency).
 *
 * @param props - The surface.
 * @returns The surface inside its providers.
 */
export function CloudProviders({
  financialSession,
  children,
}: {
  readonly financialSession: CloudFinancialSession | undefined;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <CloudFinancialSessionProvider value={financialSession}>
      <BillingLegalLinksProvider links={billingLegalLinks}>{children}</BillingLegalLinksProvider>
    </CloudFinancialSessionProvider>
  );
}

/** The payment artwork the billing surfaces draw; the base sprite is Core. */
export function PaymentSprite(): React.JSX.Element {
  return <SvgSpriteLoader urls={[paymentSpriteUrl]} />;
}

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
