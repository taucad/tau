/**
 * The four flag states that ship (blueprint Finding 13, row FL4), and how an end-to-end run puts the app in one.
 *
 * Tau's onboarding flags are PostHog feature flags. A run does not reach PostHog: it seeds the state's PostHog
 * variants on a page global before any page script runs, and the app's flag source
 * (`apps/ui/app/flags/remote-flags.ts`) reads them in place of the PostHog client in an undeployed debug build,
 * which is how both suites start it. Nothing goes through `window.ENV` or the `tau:flags` override store.
 *
 * Pure data and string builders only, so the browser-side specs, the Node browser commands and `apps/desktop-e2e`
 * can all import it.
 */

/** The page global the app's flag source reads (`seededFlagStateGlobal` in `remote-flags.ts`). */
export const seededFlagStateGlobal = '__TAU_E2E_POSTHOG_FLAGS__';
/** The page global a spec reads the app's resolved flags through (`flagProbeGlobal` in `feature-flags.ts`). */
export const flagProbeGlobal = '__tauFeatureFlags';
/** The environment variable that names a run's flag state; unset is `all-off`. */
export const flagStateVariable = 'TAU_E2E_FLAG_STATE';

export const flagStateNames = ['all-off', 'viewer-controls', 'all-on', 'viewer-controls-onboarding'] as const;
export type FlagStateName = (typeof flagStateNames)[number];

/** The registry flags a state decides, as the app resolves them. */
export type OnboardingFlags = Readonly<{ viewerControls: boolean; onboarding: boolean; onboardingAutoOpen: boolean }>;

/** What each state resolves to in the app. */
export const flagStateFlags: Readonly<Record<FlagStateName, OnboardingFlags>> = {
  'all-off': { viewerControls: false, onboarding: false, onboardingAutoOpen: false },
  'viewer-controls': { viewerControls: true, onboarding: false, onboardingAutoOpen: false },
  'all-on': { viewerControls: true, onboarding: true, onboardingAutoOpen: true },
  /* Where the guardrail of Finding 12 leaves an environment when it fires. */
  'viewer-controls-onboarding': { viewerControls: true, onboarding: true, onboardingAutoOpen: false },
};

/**
 * The PostHog variants a state seeds, by PostHog flag key. Every key is present, so an off flag is an explicit
 * `false`, as PostHog returns it.
 *
 * @param state - The state.
 * @returns The variants.
 */
export const flagStateVariants = (state: FlagStateName): Readonly<Record<string, boolean>> => {
  const flags = flagStateFlags[state];
  return {
    'viewer-controls': flags.viewerControls,
    onboarding: flags.onboarding,
    'onboarding-auto-open': flags.onboardingAutoOpen,
  };
};

/**
 * Resolve a run's flag state from its environment value.
 *
 * @param value - The value of {@link flagStateVariable}.
 * @returns The state; unset or empty is `all-off`.
 * @throws When the value names no state, so a typo never runs a suite in the wrong state.
 */
export const resolveFlagState = (value: string | undefined): FlagStateName => {
  if (value === undefined || value === '') {
    return 'all-off';
  }
  if (!(flagStateNames as readonly string[]).includes(value)) {
    throw new Error(`${flagStateVariable}=${value} names no flag state; use one of ${flagStateNames.join(', ')}.`);
  }
  return value as FlagStateName;
};

/**
 * The init script that seeds a state. A later script replaces an earlier one's value, so a test can change the
 * state before it first navigates.
 *
 * @param state - The state.
 * @returns Script source for `addInitScript({ content })`.
 */
export const flagStateInitScript = (state: FlagStateName): string =>
  `Object.defineProperty(globalThis, ${JSON.stringify(seededFlagStateGlobal)}, { configurable: true, writable: true, value: Object.freeze(${JSON.stringify(flagStateVariants(state))}) });`;
