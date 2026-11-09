import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { DesktopAnalyticsNotice } from '#components/desktop-analytics-notice.js';
import { useDesktopAnalytics } from '#hooks/use-desktop-analytics.js';
import { desktopPosthogOptions } from '#lib/posthog.lib.js';
import { PostHogAnalyticsProvider } from '#providers/posthog-analytics-provider.js';

/**
 * Desktop analytics boundary (Q3): product analytics run when the build carries a PostHog key, unless the person turns
 * them off in Settings → Data controls, and a first-launch notice says so. The notice informs and does not gate
 * capture. While the switch is off the SDK is never fetched or started, including at launch; turning it off later
 * stops capture, resets the identity and clears the SDK's stored data, the same withdrawal path the web consent uses.
 * There is no session replay, whose recorder is a remote script the app's Content-Security-Policy refuses.
 */
export function DesktopAnalyticsProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const options = useMemo(() => desktopPosthogOptions(), []);
  const [isEnabled] = useDesktopAnalytics();
  return (
    <PostHogAnalyticsProvider isActive={isEnabled} options={options} isReplayEnabled={false}>
      {children}
      {/* After `children`, so the app's toaster has subscribed before the notice is raised. */}
      <DesktopAnalyticsNotice />
    </PostHogAnalyticsProvider>
  );
}
