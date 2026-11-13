import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSession } from '@better-auth-ui/react';
import type { PostHog, PostHogConfig } from 'posthog-js';
import { authClient } from '#lib/auth-client.js';
import { clearPostHogStorage, posthogConfig } from '#lib/posthog.lib.js';
import { setAnalyticsLinkSource } from '#lib/analytics-link.lib.js';
import type { AnalyticsLink } from '#lib/analytics-link.lib.js';
import { AnalyticsContextProvider } from '#hooks/use-analytics.js';
import { connectRemoteFlags, disconnectRemoteFlags } from '#flags/remote-flags.js';
import { connectBaselineTelemetry, disconnectBaselineTelemetry } from '#telemetry/onboarding-telemetry.js';
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

type ConsoleGlobal = { posthog?: unknown };

/**
 * Makes the admitted client reachable as `window.posthog`, as PostHog's own snippet does, so an operator can run
 * `posthog.featureFlags.overrideFeatureFlags(...)` from the console. It exists only while analytics are admitted, and
 * a `posthog` global this boundary did not set is left alone.
 */
const setConsoleClient = (client: PostHog | undefined): void => {
  const target = globalThis as ConsoleGlobal;
  if (client !== undefined) {
    target.posthog ??= client;
  } else if (sdk !== undefined && target.posthog === sdk) {
    delete target.posthog;
  }
};

const isCapturing = (): boolean => sdk?.__loaded === true && !sdk.has_opted_out_capturing();

/**
 * Capture one event while analytics are admitted; the single path every product event takes.
 *
 * @returns Whether the event was handed to PostHog.
 */
const captureAdmitted = (event: string, properties?: Readonly<Record<string, unknown>>): boolean => {
  if (!isCapturing()) {
    return false;
  }
  sdk?.capture(event, properties);
  return true;
};

/**
 * Where a Sentry event's PostHog person and replay are (SB7). Read at event time, so it is absent the
 * moment capture stops, and the replay link exists only while a recording runs.
 */
const readAnalyticsLink = (): AnalyticsLink | undefined => {
  if (sdk === undefined || !isCapturing()) {
    return undefined;
  }
  const personUrl = `${sdk.requestRouter.endpointFor('ui')}/project/${sdk.config.token}/person/${encodeURIComponent(sdk.get_distinct_id())}`;
  return sdk.sessionRecordingStarted()
    ? { personUrl, replayUrl: sdk.get_session_replay_url({ withTimestamp: true, timestampLookBack: 30 }) }
    : { personUrl };
};

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
  /* Identification must not run before the admission it belongs to has configured the SDK, and the
     fetch resolves after the effect that starts it has returned. A boolean cannot say that: one that
     only turns true would let a re-acceptance identify through a singleton still opted out, and
     clearing it would mean setting state synchronously inside the effect. So each decision takes a
     generation, held in a ref the decision effect advances, and the admission that finishes records
     its own generation in state. Identification runs only while the two agree, and the state write
     is what re-renders to let it run. */
  const decision = useRef(0);
  /* Whether this document has seen analytics off: an admission after that is a grant made here (on the
     website in another tab, in the banner or in Cookie preferences), which PostHog records as `$opt_in`.
     A load that starts already admitted is a returning visitor, not a new grant. */
  const hasBeenInactive = useRef(false);
  const [admittedGeneration, setAdmittedGeneration] = useState(0);

  useEffect(() => {
    const { apiKey } = posthogConfig;
    decision.current += 1;
    const generation = decision.current;
    if (!isActive) {
      hasBeenInactive.current = true;
      setAnalyticsLinkSource(undefined);
      // PostHog-backed flags return to their defaults before the client forgets its flags.
      disconnectRemoteFlags();
      disconnectBaselineTelemetry();
      setConsoleClient(undefined);
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
      let posthog: PostHog;
      try {
        posthog = await loadSdk();
      } catch {
        // Optional analytics must not prevent the product from opening.
        return;
      }
      if (withdrawn) {
        return;
      }
      if (posthog.__loaded) {
        posthog.set_config({ disable_persistence: false, advanced_disable_flags: false });
        // The withdrawal reset dropped the evaluated flags; fetch them again for the readmitted person.
        posthog.reloadFeatureFlags();
      } else {
        posthog.init(apiKey, options);
      }
      const isGrantedHere = hasBeenInactive.current;
      // Re-acceptance, or a persisted opt-out marker from an earlier withdrawal. The SDK's
      // initial-pageview guard keeps this from emitting a second `$pageview`.
      if (posthog.has_opted_out_capturing()) {
        posthog.opt_in_capturing({ captureEventName: isGrantedHere ? '$opt_in' : false });
      } else if (isGrantedHere) {
        posthog.capture('$opt_in');
      }
      setAnalyticsLinkSource(readAnalyticsLink);
      connectRemoteFlags(posthog);
      setConsoleClient(posthog);
      // The onboarding baseline (`first_seen` once per device, then first model and first export) follows admission.
      connectBaselineTelemetry(captureAdmitted);
      setAdmittedGeneration(generation);
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
      setAnalyticsLinkSource(undefined);
      disconnectRemoteFlags();
      disconnectBaselineTelemetry();
      setConsoleClient(undefined);
    };
    // `options` and `isReplayEnabled` are fixed per host, so only `isActive` re-runs this.
  }, [isActive, options, isReplayEnabled]);

  useEffect(() => {
    if (!isActive || isPending || admittedGeneration !== decision.current || sdk?.__loaded !== true) {
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
  }, [isActive, isPending, admittedGeneration, user]);

  return undefined;
}

/**
 * The admitted analytics client: a no-op until a decision admits the SDK. Module-level, so the app runtime's
 * composition can take it from the client entry (D15) as the boundary below hands it to React.
 *
 * @public
 */
export const admittedAnalytics: Analytics = {
  capture(event, properties) {
    captureAdmitted(event, properties);
  },
};

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
  return (
    <AnalyticsContextProvider analytics={admittedAnalytics}>
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
