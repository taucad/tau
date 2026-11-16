/**
 * The page's resolved usage-and-diagnostics consent: the one rule (`resolveTelemetryConsent`) over GPC, the
 * analytics-cookie decision, the sticky device preference and, signed in, the account's `allowsUsageMetrics`. The
 * switch displays it and every browser producer it governs reads it, so they never disagree (AR-W4-03, AR-W6-02).
 * Side-effect free: the page composition's mirror stays with the switch and `RuntimeTelemetryIdentity`.
 *
 * @module
 */

import { useSession } from '@better-auth-ui/react';
import { resolveTelemetryConsent } from '@taucad/telemetry/client';
import type { DevicePreference, ReportingConsent, TelemetryConsentInputs } from '@taucad/telemetry/client';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';
import { useCookie } from '#hooks/use-cookie.js';
import { useCookieConsent } from '#hooks/use-cookie-consent.js';
import { usePrivacyPreferences } from '#hooks/use-privacy-preferences.js';
import { authClient } from '#lib/auth-client.js';
import { isGlobalPrivacyControlEnabled } from '@taucad/ui-core/lib/global-privacy-control.lib';

const devicePreferenceOf = (value: unknown): DevicePreference => (value === 'on' || value === 'off' ? value : 'unset');

/** The resolved consent, the inputs it was resolved from and the session state behind `server`. */
export type TelemetryConsent = Omit<TelemetryConsentInputs, 'renderer'> &
  Readonly<{
    consent: ReportingConsent;
    isSignedIn: boolean;
    isSessionPending: boolean;
  }>;

/**
 * Resolve the page's telemetry consent. `unknown` (a session or a signed-in preference still loading) is not consent.
 *
 * @returns The resolved consent and its inputs.
 */
export function useTelemetryConsent(): TelemetryConsent {
  const { data: session, isPending: isSessionPending } = useSession(authClient);
  const isSignedIn = session !== null && session !== undefined;
  const [deviceValue] = useCookie<unknown>(cookieName.telemetry, 'unset');
  const device = devicePreferenceOf(deviceValue);
  const analytics = useCookieConsent();
  const { preferences } = usePrivacyPreferences({ enabled: isSignedIn });
  const globalPrivacyControl = isGlobalPrivacyControlEnabled();
  const server: boolean | 'none' | undefined = isSignedIn
    ? preferences?.allowsUsageMetrics
    : isSessionPending
      ? undefined
      : 'none';
  const consent = resolveTelemetryConsent({ globalPrivacyControl, analytics, device, server });
  return { consent, globalPrivacyControl, analytics, device, server, isSignedIn, isSessionPending };
}
