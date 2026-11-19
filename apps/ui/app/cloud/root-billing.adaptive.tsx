import { useLayoutEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useSession } from '@better-auth-ui/react';
import { BillingSessionProvider } from '@taucad/billing/hooks/billing-session';
import type { BillingSession } from '@taucad/billing/hooks/billing-session';
import {
  FinancialSessionProvider,
  FinancialSessionScope,
} from '@taucad/billing-ui/providers/financial-session-provider';
import { BillingLegalLinksProvider } from '@taucad/billing-ui/providers/billing-legal-links-provider';
import type { BillingLegalLinks } from '@taucad/billing-ui/providers/billing-legal-links-provider';
import { AuthConfigProvider } from '#providers/auth-provider.js';
import { authClient } from '#lib/auth-client.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { legalUrl } from '#lib/legal-url.js';
import { ENV } from '#environment.config.js';
import { useDeploymentMode } from '#cloud/use-deployment-mode.js';
import { CloudIdentityProvider, cloudIdentityValue } from '#cloud/cloud-identity.js';
import { CloudSurface } from '#cloud/cloud-surface.js';
import { cloudSurfaces } from '#cloud/cloud-entries.js';
import { cloudPort } from '#cloud/cloud-port.js';
import type { CloudIdentity } from '#cloud/cloud-port.js';

/** The billing surfaces link Tau's legal pages on this deployment's website (`lib/legal-url`). */
const billingLegalLinks: BillingLegalLinks = { legalUrl };

/**
 * The adaptive root boundary (adaptive app deployment mode charter D6, D7, D17, I5, I6). The financial session
 * providers are Core and always mounted, so the purge and the scoping never depend on a chunk and the tree never
 * remounts when Cloud code arrives. The billing session is bound from the display mode: the API base URL, the billing
 * environment the answer names and the owner only while the mode is `funded`, the signed-out session otherwise, so no
 * billing query can run against an unfunded or unknown API. While bound and signed in, the Cloud chunk's bridge is
 * mounted through the one surface helper to fill the port.
 */
export function CloudRootBoundary({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return (
    <FinancialSessionProvider>
      <BillingLegalLinksProvider links={billingLegalLinks}>
        <AuthConfigProvider>
          <AdaptiveBillingSession>{children}</AdaptiveBillingSession>
        </AuthConfigProvider>
      </BillingLegalLinksProvider>
    </FinancialSessionProvider>
  );
}

/**
 * The financial identity a mode and an owner give (D7): defined only when the mode is `funded` with an environment
 * and someone is signed in.
 *
 * @param input - The page's API base URL, the mode's state and environment, and the owner.
 * @returns The identity, or `undefined`.
 * @public
 */
export const fundedIdentity = (
  input: Readonly<{
    apiBaseUrl: string | undefined;
    state: 'funded' | 'unfunded' | 'unknown';
    environment: string | undefined;
    ownerId: string | undefined;
  }>,
): CloudIdentity | undefined =>
  input.state === 'funded' &&
  input.apiBaseUrl !== undefined &&
  input.environment !== undefined &&
  input.ownerId !== undefined
    ? { apiBaseUrl: input.apiBaseUrl, environment: input.environment, ownerId: input.ownerId }
    : undefined;

function AdaptiveBillingSession({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const { data: session } = useSession(authClient);
  const mode = useDeploymentMode();
  const ownerId = session?.user.id;
  // Desktop SPA prerender runs before preload supplies the runtime API configuration.
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- globalThis.window is absent during desktop SPA prerender.
  const apiBaseUrl = isDesktopTarget() && globalThis.window === undefined ? undefined : ENV.TAU_API_URL;
  const funded = mode.state === 'funded';
  /* The owner admits only an environment this build knows (D7; parity with the wire schema is tested), and a funded
   * mode always names one. */
  const environment = funded ? (mode.environment as BillingSession['environment']) : undefined;
  /* One value per identity, so the port and the surfaces see a change only when the identity changes. */
  const bound = useMemo(
    () => cloudIdentityValue(fundedIdentity({ apiBaseUrl, state: mode.state, environment, ownerId })),
    [apiBaseUrl, environment, mode.state, ownerId],
  );
  const { identity } = bound;
  /* I4: what a fact used outside render reads when it is called; binding also starts the facts' deadline (I15). */
  useLayoutEffect(() => {
    cloudPort.bind(bound.key);
  }, [bound.key]);
  return (
    <FinancialSessionScope identity={identity} ownerId={ownerId}>
      <BillingSessionProvider
        value={
          funded
            ? { apiBaseUrl, environment, userId: ownerId }
            : { apiBaseUrl: undefined, environment: undefined, userId: undefined }
        }
      >
        <CloudIdentityProvider value={bound}>
          {children}
          {bound.key === undefined ? undefined : (
            <CloudSurface
              loader={cloudSurfaces}
              enabled
              fallback={undefined}
              render={(module) => <module.CloudBridge identityKey={bound.key!} />}
            />
          )}
        </CloudIdentityProvider>
      </BillingSessionProvider>
    </FinancialSessionScope>
  );
}

/** Core never reads or clears a return parameter (I7); the funded Cloud chunk's handler arrives with W5. */
export const useCloudPaymentActionReturn = (): void => {
  // Nothing until the funded chunk mounts the handler.
};
