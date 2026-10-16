import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { desktopPosthogOptions } from '#lib/posthog.lib.js';
import { PostHogAnalyticsProvider } from '#providers/posthog-analytics-provider.js';

/**
 * Desktop analytics boundary: product analytics always run when the build carries a PostHog key. There is
 * no consent surface on desktop, and no session replay, whose recorder is a remote script the app's
 * Content-Security-Policy refuses.
 */
export function DesktopAnalyticsProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const options = useMemo(() => desktopPosthogOptions(), []);
  return (
    <PostHogAnalyticsProvider isActive options={options} isReplayEnabled={false}>
      {children}
    </PostHogAnalyticsProvider>
  );
}
