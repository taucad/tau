/**
 * Settings → General → Privacy: the one switch for usage and diagnostics data (runtime observability PR-3,
 * `settings.ts`). One switch, two stores, one rule: the sticky device preference (`useCookie`, local, present signed
 * out, three-state) and, signed in, the account's `allowsUsageMetrics`. The displayed value is the resolved consent, so
 * the switch, the page reporter and desktop main never disagree (AR-W4-03, AR-W4-20, AR-W5-02).
 *
 * @module
 */

import { useEffect } from 'react';
import type { ReportingConsent } from '@taucad/telemetry/client';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';
import { useCookie } from '#hooks/use-cookie.js';
import { usePrivacyPreferences } from '#hooks/use-privacy-preferences.js';
import { useTelemetryConsent } from '#hooks/use-telemetry-consent.js';
import { pageTelemetry } from '#telemetry/runtime-telemetry.js';

/**
 * The switch's disclosure. Before PR-7 retired the legacy producers, the copy named each one this switch did not yet
 * stop (AR-W5-04, AR-W6-02); in every phase it names what the switch never governs (AR-W7-01).
 */
export const telemetryCopy = {
  label: 'Share usage and diagnostics',
  description: 'Send anonymous data about how Tau runs, such as speed and errors',
  /** The detail behind the switch, shown from its info glyph. */
  details: [
    'Includes which kernels run, how long operations take, how often they fail, memory use, parameter counts, export formats, whether backups succeed and agent usage.',
    'Never includes prompts, code, parameter values, file names or geometry.',
    'Signed in, data is rate-limited per account but not stored against it. Signed out, nothing identifies you.',
    'Applies to this browser and the Tau desktop app. The Tau command line, MCP server and self-hosted server use "tau telemetry off".',
    'Includes a short diagnostic report when the browser stops a page, such as which kernel was running and how much memory it used.',
    'Other error reports and product analytics are separate. On the web, analytics follow your cookie preferences; in the desktop app, the Analytics switch in Data controls.',
  ],
  untilActivation: {
    /** True to the switch's reach before PR-7: three legacy producers ignored it. */
    caveat:
      'For now, kernel operation timings, whether backups succeed and agent usage may still be sent while this is off.',
  },
  afterActivation: { caveat: undefined },
  forcedOff: 'Off because your browser sends Global Privacy Control or you declined analytics cookies',
  keywords: ['telemetry', 'usage', 'metrics', 'diagnostics', 'privacy'],
} as const;

/**
 * Which disclosure applies (AR-W5-04): `afterActivation` since PR-7 deleted the legacy middleware and moved kernel
 * timings, sync attempts and agent usage onto the one rule, so `off` stops every producer the switch governs.
 */
const telemetryCopyPhase: 'untilActivation' | 'afterActivation' = 'afterActivation';

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
  const { consent, globalPrivacyControl, analytics, device, server, isSignedIn, isSessionPending } =
    useTelemetryConsent();
  const [, setDevice] = useCookie<unknown>(cookieName.telemetry, 'unset');
  const { updatePreferences, isLoading, isUpdating } = usePrivacyPreferences({ enabled: isSignedIn });

  useEffect(() => {
    pageTelemetry()?.onConsentInputsChanged({ updatePending: isUpdating, observed: { server, device, analytics } });
  }, [server, device, analytics, isUpdating]);

  const caveat: string | undefined = telemetryCopy[telemetryCopyPhase].caveat;
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
