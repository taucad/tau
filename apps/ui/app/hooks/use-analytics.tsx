import { PostHogProvider, usePostHog } from 'posthog-js/react';
import type { PostHog } from 'posthog-js/react';
import { useSession } from '@better-auth-ui/react';
import { authClient } from '#lib/auth-client.js';
import { useEffect, useRef } from 'react';
import { posthogConfig } from '#lib/posthog.lib.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';

export type Analytics = PostHog;

export type ConsentStatus = 'pending' | 'granted' | 'denied';

/**
 * Noop analytics object that implements the PostHog interface.
 * Used when PostHog is not configured (e.g., no API key in development or self-hosted).
 */
/* eslint-disable @typescript-eslint/naming-convention -- posthog-js uses snake_case method names */
// oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- noop stub for external PostHog type; only methods actually called are implemented
const noopAnalytics = {
  opt_in_capturing: () => undefined,
  opt_out_capturing: () => undefined,
  get_explicit_consent_status: () => undefined,
  identify: () => undefined,
  reset: () => undefined,
  _isIdentified: () => false,
  captureException: () => undefined,
} as unknown as Analytics;
/* eslint-enable @typescript-eslint/naming-convention -- re-enable after noop object */

export function useAnalytics(): Analytics {
  const posthog = usePostHog();

  // When PostHog is not configured (no API key), usePostHog returns an object
  // that doesn't have all the required methods. Check for a key method to determine
  // if PostHog is properly initialized.
  if (typeof posthog.get_explicit_consent_status !== 'function') {
    return noopAnalytics;
  }

  return posthog;
}

/**
 * Hook to manage cookie consent state.
 * Returns the current consent status and a setter function.
 */
export function useCookieConsent(): [ConsentStatus, (status: ConsentStatus) => void] {
  const [consentStatus, setConsentStatus] = useCookie<ConsentStatus>(cookieName.cookieConsent, 'pending');
  return [consentStatus, setConsentStatus];
}

/**
 * Internal component that handles user identification with PostHog.
 *
 * Following PostHog best practices:
 * - Identifies logged-in users with their unique user ID and person properties
 * - Resets analytics when users log out to unlink future events
 * - Called once per session, with identification on app load and after login
 * - Only identifies users who have explicitly granted consent
 *
 * @see https://posthog.com/docs/data/identify
 */
function AnalyticsIdentifier({ children }: { readonly children: React.ReactNode }): React.ReactNode {
  const analytics = useAnalytics();
  const { data: sessionData } = useSession(authClient);
  const user = sessionData?.user;
  const [consentStatus] = useCookieConsent();
  const previousUserIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const currentUserId = user?.id;
    const previousUserId = previousUserIdRef.current;

    // Only identify users who have explicitly granted consent
    // PostHog does not automatically prevent identify() calls, so we must check consent
    const hasConsent = consentStatus === 'granted';

    // User logged in or app loaded with authenticated user
    if (currentUserId && currentUserId !== previousUserId) {
      const isAlreadyIdentified = analytics._isIdentified();

      // Identify the user with their unique ID and person properties
      // Only call identify() once per session to prevent unnecessary events
      // Skip if already identified (e.g., PostHog restored from session storage)
      if (hasConsent && !isAlreadyIdentified) {
        analytics.identify(currentUserId, {
          email: user.email,
          name: user.name,
          // PostHog uses 'avatar' for person profile images
          avatar: user.image,
        });
      }

      // Only update ref after successful identification to handle deferred consent
      // Also update if already identified from session (for logout detection)
      if (hasConsent || isAlreadyIdentified) {
        previousUserIdRef.current = currentUserId;
      }
    }

    // User logged out - reset to unlink future events from this user
    // This is important for shared devices to avoid merging different users
    if (!currentUserId && previousUserId) {
      analytics.reset();
      previousUserIdRef.current = undefined;
    }
  }, [analytics, consentStatus, user?.id, user?.email, user?.name, user?.image]);

  return children;
}

/**
 * Starts PostHog session recording after the browser is idle, avoiding the synchronous
 * rrweb DOM snapshot during the critical rendering path. Uses `requestIdleCallback` with
 * a `setTimeout` fallback for Safari.
 */
export function DeferredSessionRecording(): React.ReactNode {
  const posthog = usePostHog();

  useEffect(() => {
    const start = () => {
      posthog.startSessionRecording();
    };

    if ('requestIdleCallback' in globalThis) {
      const id = requestIdleCallback(start);
      return () => {
        cancelIdleCallback(id);
      };
    }

    const id = setTimeout(start, 0);
    return () => {
      clearTimeout(id);
    };
  }, [posthog]);

  return undefined;
}

export function AnalyticsProvider({ children }: { readonly children: React.ReactNode }): React.ReactNode {
  const { options, apiKey } = posthogConfig;

  // When no API key is set, we don't use the analytics provider.
  // This is useful for development and self-hosted configurations.
  // The useAnalytics hook returns a noop implementation when PostHog is not available.
  if (!apiKey) {
    return children;
  }

  return (
    <PostHogProvider options={options} apiKey={apiKey}>
      <DeferredSessionRecording />
      <AnalyticsIdentifier>{children}</AnalyticsIdentifier>
    </PostHogProvider>
  );
}
