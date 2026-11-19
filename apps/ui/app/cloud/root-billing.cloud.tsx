import type { ReactNode } from 'react';
import { useSession } from '@better-auth-ui/react';
import { BillingSessionProvider } from '@taucad/billing/hooks/billing-session';
import { AuthConfigProvider } from '#providers/auth-provider.js';
import { authClient } from '#lib/auth-client.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { ENV } from '#environment.config.js';
import {
  FinancialSessionProvider,
  FinancialSessionScope,
  useFinancialSession,
} from '@taucad/billing-ui/providers/financial-session-provider';
import { BillingLegalLinksProvider } from '@taucad/billing-ui/providers/billing-legal-links-provider';
import type { BillingLegalLinks } from '@taucad/billing-ui/providers/billing-legal-links-provider';
import { legalUrl } from '#lib/legal-url.js';
import { CloudFinancialSessionProvider } from '#cloud/cloud-financial-session.js';

/** The billing surfaces link Tau's legal pages on this deployment's website (`lib/legal-url`). */
const billingLegalLinks: BillingLegalLinks = { legalUrl };

export function CloudRootBoundary({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return (
    <FinancialSessionProvider>
      <BillingLegalLinksProvider links={billingLegalLinks}>
        <AuthConfigProvider>
          <BillingSessionBridge>{children}</BillingSessionBridge>
        </AuthConfigProvider>
      </BillingLegalLinksProvider>
    </FinancialSessionProvider>
  );
}

/** The pinned `cloud` build hands the financial session to the Cloud-only payment return as the chunk does. */
const PinnedCloudFinancialSession = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
  <CloudFinancialSessionProvider value={useFinancialSession()}>{children}</CloudFinancialSessionProvider>
);

const BillingSessionBridge = ({ children }: { readonly children: ReactNode }): React.JSX.Element => {
  const { data: session } = useSession(authClient);
  // Desktop SPA prerender runs before preload supplies the runtime API configuration.
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- globalThis.window is absent during desktop SPA prerender.
  const apiBaseUrl = isDesktopTarget() && globalThis.window === undefined ? undefined : ENV.TAU_API_URL;
  const identity =
    apiBaseUrl === undefined || ENV.TAU_BILLING_ENVIRONMENT === undefined || session?.user.id === undefined
      ? undefined
      : { apiBaseUrl, environment: ENV.TAU_BILLING_ENVIRONMENT, ownerId: session.user.id };
  return (
    <FinancialSessionScope identity={identity}>
      <PinnedCloudFinancialSession>
        <BillingSessionProvider
          value={{
            apiBaseUrl,
            environment: ENV.TAU_BILLING_ENVIRONMENT,
            userId: session?.user.id,
          }}
        >
          {children}
        </BillingSessionProvider>
      </PinnedCloudFinancialSession>
    </FinancialSessionScope>
  );
};

// oxlint-disable-next-line no-barrel-files/no-barrel-files -- the root boundary mounts the Cloud-only payment return.
export {
  CloudPaymentReturn,
  DesktopPaymentFollowUp,
  paymentActionEndStates,
  useAnnouncePaymentAction,
  useCloudPaymentActionReturn,
} from '#cloud/payment-return.js';
