import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useSession } from '@better-auth-ui/react';
import { posthog } from 'posthog-js';
import { authClient } from '#lib/auth-client.js';
import { clearPostHogStorage, posthogConfig } from '#lib/posthog.lib.js';
import { useCookieConsent } from '#hooks/use-cookie-consent.js';
import { AnalyticsContextProvider } from '#hooks/use-analytics.js';
import type { Analytics } from '#hooks/use-analytics.js';

const isCapturing = (): boolean => posthog.__loaded && !posthog.has_opted_out_capturing();

/**
 * Starts replay outside the critical rendering path.
 *
 * @param start - Called once the page is idle.
 * @returns Cancels a start that has not run yet.
 */
const whenIdle = (start: () => void): (() => void) => {
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
};

/**
 * Applies consent to the PostHog singleton. It renders nothing, so a consent
 * change never moves the product between React trees.
 */
function PostHogLifecycle({ isActive }: { readonly isActive: boolean }): undefined {
  const { data: sessionData, isPending } = useSession(authClient);
  const user = sessionData?.user;

  useEffect(() => {
    const { apiKey } = posthogConfig;
    if (!isActive) {
      if (posthog.__loaded) {
        posthog.stopSessionRecording();
        posthog.reset();
        posthog.opt_out_capturing();
      }
      if (apiKey) {
        clearPostHogStorage(apiKey);
      }
      return undefined;
    }

    if (!posthog.__loaded) {
      posthog.init(apiKey, posthogConfig.options);
    }
    // Re-acceptance, or a persisted opt-out marker from an earlier withdrawal. The SDK's
    // initial-pageview guard keeps this from emitting a second `$pageview`.
    if (posthog.has_opted_out_capturing()) {
      posthog.opt_in_capturing({ captureEventName: false });
    }
    return whenIdle(() => {
      posthog.startSessionRecording();
    });
  }, [isActive]);

  useEffect(() => {
    if (!isActive || isPending || !posthog.__loaded) {
      return;
    }
    if (user) {
      // Covers cold authenticated loads, login and account switches without merging accounts.
      if (posthog.get_distinct_id() !== user.id) {
        posthog.identify(user.id, { avatar: user.image, email: user.email, name: user.name });
      }
    } else if (posthog._isIdentified()) {
      posthog.reset();
    }
  }, [isActive, isPending, user]);

  return undefined;
}

/** Web analytics boundary: stable ancestry, PostHog only after accepted consent. */
export function WebAnalyticsProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const [consentStatus] = useCookieConsent();
  const isActive = consentStatus === 'accepted' && posthogConfig.apiKey !== '';
  const analytics = useMemo<Analytics>(
    () => ({
      capture(event, properties) {
        if (isCapturing()) {
          posthog.capture(event, properties);
        }
      },
      captureException(error, properties) {
        if (isCapturing()) {
          posthog.captureException(error, properties);
        }
      },
    }),
    [],
  );

  return (
    <AnalyticsContextProvider analytics={analytics}>
      <PostHogLifecycle isActive={isActive} />
      {children}
    </AnalyticsContextProvider>
  );
}
