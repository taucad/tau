import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useSession } from '@better-auth-ui/react';
import { PostHogProvider, usePostHog } from 'posthog-js/react';
import { authClient } from '#lib/auth-client.js';
import { posthogConfig } from '#lib/posthog.lib.js';
import { useCookieConsent } from '#hooks/use-cookie-consent.js';
import { AnalyticsContextProvider } from '#hooks/use-analytics.js';
import type { Analytics } from '#hooks/use-analytics.js';

const AnalyticsBridge = ({ children }: { readonly children: ReactNode }): React.JSX.Element => {
  const posthog = usePostHog();
  const analytics = useMemo<Analytics>(
    () => ({
      capture: (event, properties) => {
        posthog.capture(event, properties);
      },
      captureException: (error, properties) => {
        posthog.captureException(error, properties);
      },
    }),
    [posthog],
  );
  return <AnalyticsContextProvider analytics={analytics}>{children}</AnalyticsContextProvider>;
};

const AnalyticsIdentifier = ({ children }: { readonly children: ReactNode }): React.ReactNode => {
  const analytics = usePostHog();
  const { data: sessionData } = useSession(authClient);
  const user = sessionData?.user;
  const previousUserIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const currentUserId = user?.id;
    const previousUserId = previousUserIdRef.current;
    if (currentUserId && currentUserId !== previousUserId && !analytics._isIdentified()) {
      analytics.identify(currentUserId, { avatar: user.image, email: user.email, name: user.name });
      previousUserIdRef.current = currentUserId;
    }
    if (!currentUserId && previousUserId) {
      analytics.reset();
      previousUserIdRef.current = undefined;
    }
  }, [analytics, user?.email, user?.id, user?.image, user?.name]);

  return children;
};

/** Starts recording outside the critical rendering path after consent. */
export function DeferredSessionRecording(): React.ReactNode {
  const posthog = usePostHog();

  useEffect(() => {
    const start = (): void => {
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

const ConsentLifecycle = ({ children }: { readonly children: ReactNode }): React.ReactNode => {
  const posthog = usePostHog();

  useEffect(() => {
    return () => {
      posthog.stopSessionRecording();
      posthog.reset();
      posthog.opt_out_capturing();
    };
  }, [posthog]);

  return children;
};

const ConsentedAnalytics = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
  <ConsentLifecycle>
    <AnalyticsBridge>
      <DeferredSessionRecording />
      <AnalyticsIdentifier>{children}</AnalyticsIdentifier>
    </AnalyticsBridge>
  </ConsentLifecycle>
);

/** Initializes PostHog only after web consent and keeps withdrawal reversible. */
export function WebAnalyticsProvider({ children }: { readonly children: ReactNode }): React.ReactNode {
  const [consentStatus] = useCookieConsent();
  const { apiKey } = posthogConfig;
  if (consentStatus !== 'accepted' || !apiKey) {
    return children;
  }

  return (
    <PostHogProvider apiKey={apiKey} options={posthogConfig.options}>
      <ConsentedAnalytics>{children}</ConsentedAnalytics>
    </PostHogProvider>
  );
}
