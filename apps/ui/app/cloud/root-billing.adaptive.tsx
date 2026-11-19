import type { ReactNode } from 'react';
import { BillingSessionProvider } from '@taucad/billing/hooks/billing-session';
import {
  FinancialSessionProvider,
  FinancialSessionScope,
} from '@taucad/billing-ui/providers/financial-session-provider';
import { BillingLegalLinksProvider } from '@taucad/billing-ui/providers/billing-legal-links-provider';
import type { BillingLegalLinks } from '@taucad/billing-ui/providers/billing-legal-links-provider';
import { AuthConfigProvider } from '#providers/auth-provider.js';
import { legalUrl } from '#lib/legal-url.js';

/** The billing surfaces link Tau's legal pages on this deployment's website (`lib/legal-url`). */
const billingLegalLinks: BillingLegalLinks = { legalUrl };

/**
 * The adaptive root boundary (adaptive app deployment mode charter D6, I5; W2 skeleton): the financial session
 * providers are Core, always mounted, so the purge and the scoping never depend on a chunk and the tree never remounts
 * when Cloud code arrives. Until W3 binds the session from the display mode, it stays signed out: no billing query runs.
 */
export function CloudRootBoundary({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return (
    <FinancialSessionProvider>
      <BillingLegalLinksProvider links={billingLegalLinks}>
        <AuthConfigProvider>
          <FinancialSessionScope identity={undefined}>
            <BillingSessionProvider value={{ apiBaseUrl: undefined, environment: undefined, userId: undefined }}>
              {children}
            </BillingSessionProvider>
          </FinancialSessionScope>
        </AuthConfigProvider>
      </BillingLegalLinksProvider>
    </FinancialSessionProvider>
  );
}

/** Core never reads or clears a return parameter (I7); the funded Cloud chunk's handler arrives with W5. */
export const useCloudPaymentActionReturn = (): void => {
  // Nothing until the funded chunk mounts the handler.
};
