import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { webPosthogOptions } from '#lib/web-posthog.lib.js';
import { useCookieConsent } from '#hooks/use-cookie-consent.js';
import { PostHogAnalyticsProvider } from '#providers/posthog-analytics-provider.js';
import { isMemoryConstrainedDevice } from '#lib/device-memory-class.js';

/**
 * Web analytics boundary: PostHog only after accepted consent, with session
 * replay on desktop-class devices. On a phone, rrweb's mirror of every node and
 * its serialization of every streamed-token mutation compete with the kernel
 * for the tab's memory limit, so replay stays off there (B-19, D-UI-05).
 */
export function WebAnalyticsProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const consentStatus = useCookieConsent();
  const options = useMemo(() => webPosthogOptions(), []);
  const [isReplayEnabled] = useState(() => !isMemoryConstrainedDevice());
  return (
    <PostHogAnalyticsProvider
      isActive={consentStatus === 'accepted'}
      options={options}
      isReplayEnabled={isReplayEnabled}
    >
      {children}
    </PostHogAnalyticsProvider>
  );
}
