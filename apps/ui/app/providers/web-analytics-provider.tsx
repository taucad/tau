import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { webPosthogOptions } from '#lib/web-posthog.lib.js';
import { useCookieConsent } from '#hooks/use-privacy-choices.js';
import { PostHogAnalyticsProvider } from '#providers/posthog-analytics-provider.js';
import { isMemoryConstrainedDevice } from '@taucad/ui-core/lib/device-memory-class';
import { pageTelemetry } from '#telemetry/runtime-telemetry.js';
import { useSession } from '@better-auth-ui/react';
import { authClient } from '#lib/auth-client.js';
import { usePrivacyPreferences } from '#hooks/use-privacy-preferences.js';
import { useIsReplayForeignContent } from '#lib/replay-content.lib.js';

const subscribeNever = (): (() => void) => () => undefined;
const readIsHydrated = (): boolean => true;
const readIsHydratedOnServer = (): boolean => false;

/**
 * Whether replay may record the chat transcript and code (2026-11-26 ruling): only while the signed-in account's
 * effective "Improve Tau for everyone" value is on and the open project is the viewer's own. `/v1/privacy` answers
 * that value for the plan: on by default for Free, on for a paid plan only if the account turned it on. A signed-out
 * visitor has no switch, and a value that failed to load is not a yes, so both block.
 *
 * @param isReplayEnabled - Whether this device runs replay at all; the preference is not read when it does not.
 * @returns The decision, or `undefined` while it is being read.
 */
const useReplayContentDecision = (isReplayEnabled: boolean): boolean | undefined => {
  const { data: session, isPending } = useSession(authClient);
  const isSignedIn = session !== null && session !== undefined;
  const { preferences, isLoading, error } = usePrivacyPreferences({ enabled: isReplayEnabled && isSignedIn });
  const isForeign = useIsReplayForeignContent();
  if (isPending) {
    return undefined;
  }
  if (!isSignedIn || isForeign || (error !== null && error !== undefined)) {
    return false;
  }
  if (isLoading || preferences === undefined) {
    return undefined;
  }
  return preferences.allowsAiTraining;
};

/**
 * Web analytics boundary: PostHog only after accepted consent, with session
 * replay on desktop-class devices. On a phone, rrweb's mirror of every node and
 * its serialization of every streamed-token mutation compete with the kernel
 * for the tab's memory limit, so replay stays off there (B-19, D-UI-05).
 */
export function WebAnalyticsProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const consentStatus = useCookieConsent();
  /* F2c: the server render and the hydrating render read consent as `unknown` whatever the cookie says (P2), which is
     not the visitor's decision. Until the client has read it, the boundary is told nothing was decided. */
  const isHydrated = useSyncExternalStore(subscribeNever, readIsHydrated, readIsHydratedOnServer);
  /* A declined analytics decision also denies runtime telemetry on this browser (Q21); `unknown` does not block. */
  useEffect(() => {
    pageTelemetry()?.setAnalyticsDecision(consentStatus);
  }, [consentStatus]);
  const options = useMemo(() => webPosthogOptions(), []);
  const [isReplayEnabled] = useState(() => !isMemoryConstrainedDevice());
  const isReplayContentAllowed = useReplayContentDecision(isReplayEnabled);
  return (
    <PostHogAnalyticsProvider
      isActive={isHydrated ? consentStatus === 'accepted' : undefined}
      options={options}
      isReplayEnabled={isReplayEnabled}
      isReplayContentAllowed={isReplayContentAllowed}
    >
      {children}
    </PostHogAnalyticsProvider>
  );
}
