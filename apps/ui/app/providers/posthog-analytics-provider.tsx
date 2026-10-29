import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSession } from '@better-auth-ui/react';
import type { PostHog, PostHogConfig } from 'posthog-js';
import { authClient } from '#lib/auth-client.js';
import { clearPostHogStorage, posthogConfig } from '#lib/posthog.lib.js';
import { AnalyticsContextProvider } from '#hooks/use-analytics.js';
import type { Analytics } from '#hooks/use-analytics.js';

/* eslint-disable @typescript-eslint/naming-convention -- PostHog configuration keys are SDK wire names. */

/*
 * The SDK is a quarter of a megabyte and this file is the only place that touches it, so importing
 * it here put it in the eager graph of every route: a measured Home navigation parsed and evaluated
 * it before its composer could take a draft, including for the visitors who decline. It is fetched
 * once a decision admits it instead, and `sdk` is undefined until then, which is the same state the
 * singleton reported before `init` and so answers the same way everywhere it is read.
 */
let sdk: PostHog | undefined;

/** Resolves the singleton, fetching it on first admission. */
const loadSdk = async (): Promise<PostHog> => {
  if (sdk === undefined) {
    const module_ = await import('posthog-js');
    sdk = module_.posthog;
  }
  return sdk;
};

const isCapturing = (): boolean => sdk?.__loaded === true && !sdk.has_opted_out_capturing();

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
  /* The fetch resolves after this effect has run, so identification needs a rendered signal that
     the singleton has arrived rather than reading a module variable that changed behind React. */
  const [isSdkLoaded, setIsSdkLoaded] = useState(sdk !== undefined);

  useEffect(() => {
    const { apiKey } = posthogConfig;
    if (!isActive) {
      /* Nothing to stop where the singleton was never fetched: it captures nothing until `init`,
         which only an admission reaches. The storage a previous admission left is still cleared. */
      if (sdk?.__loaded === true) {
        sdk.stopSessionRecording();
        sdk.opt_out_capturing();
        sdk.set_config({ disable_persistence: true, advanced_disable_flags: true });
        sdk.reset();
        sdk.opt_out_capturing();
      }
      if (apiKey) {
        clearPostHogStorage(apiKey);
      }
      return undefined;
    }

    let withdrawn = false;
    let cancelReplay: (() => void) | undefined;
    const admit = async (): Promise<void> => {
      const posthog = await loadSdk();
      if (withdrawn) {
        return;
      }
      setIsSdkLoaded(true);
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
        return;
      }
      cancelReplay = whenIdle(() => {
        posthog.startSessionRecording();
      });
    };
    // async-iife: bootstrap — React effects cannot await the fetch; `withdrawn` owns its lifecycle.
    void admit();
    return () => {
      withdrawn = true;
      cancelReplay?.();
    };
    // `options` and `isReplayEnabled` are fixed per host, so only `isActive` re-runs this.
  }, [isActive, options, isReplayEnabled]);

  useEffect(() => {
    if (!isActive || isPending || !isSdkLoaded || sdk?.__loaded !== true) {
      return;
    }
    const posthog = sdk;
    if (user) {
      // Covers cold authenticated loads, login and account switches without merging accounts.
      if (posthog.get_distinct_id() !== user.id) {
        posthog.identify(user.id, { avatar: user.image, email: user.email, name: user.name });
      }
    } else if (posthog._isIdentified()) {
      posthog.reset();
    }
  }, [isActive, isPending, isSdkLoaded, user]);

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
          sdk?.capture(event, properties);
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
