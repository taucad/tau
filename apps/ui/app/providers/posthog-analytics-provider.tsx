import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useSession } from '@better-auth-ui/react';
import { posthog } from 'posthog-js';
import type { PostHogConfig } from 'posthog-js';
import { authClient } from '#lib/auth-client.js';
import { clearPostHogStorage, posthogConfig } from '#lib/posthog.lib.js';
import { AnalyticsContextProvider } from '#hooks/use-analytics.js';
import type { Analytics } from '#hooks/use-analytics.js';

/* eslint-disable @typescript-eslint/naming-convention -- PostHog configuration keys are SDK wire names. */

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
 * Applies the host's analytics decision to the PostHog singleton. It renders nothing,
 * so a change never moves the product between React trees.
 */
function PostHogLifecycle({
  isActive,
  options,
  isReplayEnabled,
}: {
  readonly isActive: boolean;
  readonly options: Partial<PostHogConfig>;
  readonly isReplayEnabled: boolean;
}): undefined {
  const { data: sessionData, isPending } = useSession(authClient);
  const user = sessionData?.user;

  useEffect(() => {
    const { apiKey } = posthogConfig;
    if (!isActive) {
      if (posthog.__loaded) {
        posthog.stopSessionRecording();
        posthog.opt_out_capturing();
        posthog.set_config({ disable_persistence: true, advanced_disable_flags: true });
        posthog.reset();
        posthog.opt_out_capturing();
      }
      if (apiKey) {
        clearPostHogStorage(apiKey);
      }
      return undefined;
    }

    if (posthog.__loaded) {
      posthog.set_config({ disable_persistence: false, advanced_disable_flags: false });
    } else {
      posthog.init(apiKey, options);
    }
    // Re-acceptance, or a persisted opt-out marker from an earlier withdrawal. The SDK's
    // initial-pageview guard keeps this from emitting a second `$pageview`.
    if (posthog.has_opted_out_capturing()) {
      posthog.opt_in_capturing({ captureEventName: false });
    }
    if (!isReplayEnabled) {
      return undefined;
    }
    return whenIdle(() => {
      posthog.startSessionRecording();
    });
    // `options` and `isReplayEnabled` are fixed per host, so only `isActive` re-runs this.
  }, [isActive, options, isReplayEnabled]);

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

/**
 * PostHog analytics boundary shared by the web and desktop hosts: stable ancestry, with the SDK
 * running only while `isActive`.
 *
 * @param props - The host's decision, its SDK options and whether to start session replay.
 * @returns The analytics context around `children`.
 */
export function PostHogAnalyticsProvider({
  isActive,
  options,
  isReplayEnabled,
  children,
}: {
  readonly isActive: boolean;
  readonly options: Partial<PostHogConfig>;
  readonly isReplayEnabled: boolean;
  readonly children: ReactNode;
}): React.JSX.Element {
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
      <PostHogLifecycle
        isActive={isActive && posthogConfig.apiKey !== ''}
        options={options}
        isReplayEnabled={isReplayEnabled}
      />
      {children}
    </AnalyticsContextProvider>
  );
}

/* eslint-enable @typescript-eslint/naming-convention -- restore application naming rules. */
