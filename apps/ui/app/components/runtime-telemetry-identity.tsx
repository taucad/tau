/**
 * Bridges the page's session, the account's privacy preference and the device preference into runtime telemetry
 * (`#telemetry/runtime-telemetry`), and the account id into error reporting's `user.id`
 * (`#lib/sentry-context.lib`), outside React's render (AR-W5-02, AR-W15-06).
 *
 * Headless, mounted once at the application root beside the revision actor identity, where the session's react-query
 * provider is guaranteed.
 */

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useIsMutating } from '@tanstack/react-query';
import { useSession } from '@better-auth-ui/react';
import { cookieName } from '#constants/cookie.constants.js';
import { useCookie } from '#hooks/use-cookie.js';
import { privacyPreferencesMutationKey, usePrivacyPreferences } from '#hooks/use-privacy-preferences.js';
import { authClient } from '#lib/auth-client.js';
import { isGlobalPrivacyControlEnabled } from '#lib/global-privacy-control.lib.js';
import { setReportedUserId } from '#lib/sentry-context.lib.js';
import type { BrowserIdentity } from '#telemetry/page-telemetry.js';
import { pageTelemetry } from '#telemetry/runtime-telemetry.js';

/**
 * The page's three-state identity from `useSession`: pending or failed is `unresolved`, never `signed-out`; a session
 * is the ACCOUNT id, never the session token (FR-19).
 *
 * @param input - The session query's state.
 * @returns The identity.
 */
export const browserIdentityOf = (
  input: Readonly<{ accountId: string | undefined; isPending: boolean; isError: boolean }>,
): BrowserIdentity => {
  if (input.accountId !== undefined && input.accountId !== '') {
    return { kind: 'signed-in', accountId: input.accountId };
  }
  return input.isPending || input.isError ? { kind: 'unresolved' } : { kind: 'signed-out' };
};

/**
 * Mirror the consent inputs into the page's runtime telemetry composition.
 *
 * @returns Nothing rendered.
 */
export function RuntimeTelemetryIdentity(): ReactNode {
  const { data: session, isPending, error } = useSession(authClient);
  const identity = browserIdentityOf({ accountId: session?.user.id, isPending, isError: error !== null });
  const isSignedIn = identity.kind === 'signed-in';
  const { preferences } = usePrivacyPreferences({ enabled: isSignedIn });
  const updatePending = useIsMutating({ mutationKey: privacyPreferencesMutationKey }) > 0;
  const [device] = useCookie<unknown>(cookieName.telemetry, 'unset');
  const server = isSignedIn ? preferences?.allowsUsageMetrics : undefined;
  const accountId = identity.kind === 'signed-in' ? identity.accountId : undefined;
  const isResolved = identity.kind !== 'unresolved';
  const globalPrivacyControl = isGlobalPrivacyControlEnabled();

  /* Error reporting's `user.id` (D1): the opaque account id once the session resolves, cleared on sign-out. Not
   * consent-gated: error reporting is not tracking. */
  useEffect(() => {
    if (isResolved) {
      setReportedUserId(accountId);
    }
  }, [accountId, isResolved]);

  /* Runs on every input change, never in render: the mirror and the desktop notice live in `onConsentInputsChanged`. */
  useEffect(() => {
    const telemetry = pageTelemetry();
    if (telemetry === undefined) {
      return;
    }
    telemetry.setServerPreference(server);
    telemetry.setIdentity(
      accountId === undefined
        ? isResolved
          ? { kind: 'signed-out' }
          : { kind: 'unresolved' }
        : { kind: 'signed-in', accountId },
    );
    telemetry.onConsentInputsChanged({ updatePending, observed: { device, globalPrivacyControl } });
  }, [accountId, isResolved, server, updatePending, device, globalPrivacyControl]);

  return null;
}
