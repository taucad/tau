import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { webPosthogOptions } from '#lib/web-posthog.lib.js';
import { useCookieConsent } from '#hooks/use-cookie-consent.js';
import { PostHogAnalyticsProvider } from '#providers/posthog-analytics-provider.js';

/** Web analytics boundary: PostHog, with session replay, only after accepted consent. */
export function WebAnalyticsProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const consentStatus = useCookieConsent();
  const options = useMemo(() => webPosthogOptions(), []);
  return (
    <PostHogAnalyticsProvider isActive={consentStatus === 'accepted'} options={options} isReplayEnabled>
      {children}
    </PostHogAnalyticsProvider>
  );
}
