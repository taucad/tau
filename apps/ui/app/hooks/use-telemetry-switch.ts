/**
 * Settings → General → Privacy: the one switch for usage and diagnostics data (runtime observability PR-3,
 * `settings.ts`). One switch, two stores, one rule: the sticky device preference (`useCookie`, local, present signed
 * out, three-state) and, signed in, the account's `allowsUsageMetrics`. The displayed value is the resolved consent, so
 * the switch, the page reporter and desktop main never disagree (AR-W4-03, AR-W4-20, AR-W5-02).
 *
 * @module
 */

import { useEffect } from 'react';
import { useSession } from '@better-auth-ui/react';
import { resolveTelemetryConsent } from '@taucad/telemetry/client';
import type { DevicePreference, ReportingConsent } from '@taucad/telemetry/client';
import { cookieName } from '#constants/cookie.constants.js';
import { useCookie } from '#hooks/use-cookie.js';
import { useCookieConsent } from '#hooks/use-cookie-consent.js';
import { usePrivacyPreferences } from '#hooks/use-privacy-preferences.js';
import { authClient } from '#lib/auth-client.js';
import { isGlobalPrivacyControlEnabled } from '#lib/global-privacy-control.lib.js';
import { pageTelemetry } from '#telemetry/runtime-telemetry.js';

/**
 * The switch's disclosure. Until PR-7 retires the legacy producers, the copy names each one this switch does not yet
 * stop (AR-W5-04, AR-W6-02), and in every phase it names what the switch never governs (AR-W7-01).
 */
export const telemetryCopy = {
  label: 'Share usage and diagnostics',
  description: 'Send anonymous data about how Tau runs, such as speed and errors',
  /** The detail behind the switch, shown from its info glyph. */
  details: [
    'Includes which kernels run, how long operations take, how often they fail, memory use, parameter counts, export formats, project sync outcomes and agent usage.',
    'Never includes prompts, code, parameter values, file names or geometry.',
    'Signed in, data is rate-limited per account but not stored against it. Signed out, nothing identifies you.',
    'Applies to this browser and the Tau desktop app. The Tau command line, MCP server and self-hosted server use "tau telemetry off".',
    'Error reports and product analytics are separate. Analytics follows your cookie preferences.',
  ],
  untilActivation: {
    /** True to the switch's current reach: three legacy producers still ignore it. */
    caveat:
      'For now, kernel operation timings, project sync outcomes and agent usage may still be sent while this is off.',
  },
  afterActivation: { caveat: undefined },
  forcedOff: 'Off because your browser sends Global Privacy Control or you declined analytics cookies',
  keywords: ['telemetry', 'usage', 'metrics', 'diagnostics', 'privacy'],
} as const;

/**
 * Which disclosure applies (AR-W5-04): `untilActivation` until PR-7 deletes the legacy middleware and moves its
 * producers onto the one rule, in the same change that switches this to `afterActivation`.
 */
const telemetryCopyPhase: 'untilActivation' | 'afterActivation' = 'untilActivation';

const devicePreferenceOf = (value: unknown): DevicePreference => (value === 'on' || value === 'off' ? value : 'unset');

/** What the Privacy section renders. */
export type TelemetrySwitch = Readonly<{
  checked: boolean;
  /** A signed-in user's server value is still loading: the switch is disabled, not shown on (AR-W1-09). */
  pending: boolean;
  /** GPC or a declined analytics decision force the switch off; the section says why. */
  forcedOff: boolean;
  /** The resolved consent the switch displays. */
  consent: ReportingConsent;
  onCheckedChange: (next: boolean) => void;
  /** The details the info glyph shows, the current caveat included. */
  details: readonly string[];
}>;

/**
 * The one telemetry switch. Toggling writes the device store first (optimistic) and, signed in, the account
 * preference; the server-`false` mirror runs in the page composition on the transition, never here in render.
 *
 * @returns The switch's state and handler.
 */
export function useTelemetrySwitch(): TelemetrySwitch {
  const { data: session, isPending: isSessionPending } = useSession(authClient);
  const isSignedIn = session !== null && session !== undefined;
  const [deviceValue, setDevice] = useCookie<unknown>(cookieName.telemetry, 'unset');
  const device = devicePreferenceOf(deviceValue);
  const analytics = useCookieConsent();
  const { preferences, updatePreferences, isLoading, isUpdating } = usePrivacyPreferences({ enabled: isSignedIn });
  const globalPrivacyControl = isGlobalPrivacyControlEnabled();
  const server: boolean | 'none' | undefined = isSignedIn
    ? preferences?.allowsUsageMetrics
    : isSessionPending
      ? undefined
      : 'none';

  useEffect(() => {
    pageTelemetry()?.onConsentInputsChanged({ updatePending: isUpdating, observed: { server, device, analytics } });
  }, [server, device, analytics, isUpdating]);

  const caveat: string | undefined = telemetryCopy[telemetryCopyPhase].caveat;
  const consent = resolveTelemetryConsent({ globalPrivacyControl, analytics, device, server });
  return {
    checked: consent === 'granted',
    pending: consent === 'unknown' && (isLoading || isSessionPending),
    forcedOff: globalPrivacyControl || analytics === 'declined',
    consent,
    onCheckedChange: (next: boolean): void => {
      setDevice(next ? 'on' : 'off');
      if (isSignedIn) {
        updatePreferences({ allowsUsageMetrics: next });
      }
    },
    details: caveat === undefined ? telemetryCopy.details : [...telemetryCopy.details, caveat],
  };
}
