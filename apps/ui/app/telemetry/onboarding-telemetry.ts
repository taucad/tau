/**
 * Type-safe product analytics for onboarding (blueprint Finding 12): every event name and the exact properties each
 * one carries. Surfaces call these emitters; none builds an event name or a property bag of its own.
 *
 * Two ways in, one rule:
 *
 * - {@link useOnboardingTelemetry} for a surface in the React tree, over `useAnalytics().capture`.
 * - The three baseline events (`first_seen`, `first_model_built`, `first_export`) are reported from places with no
 *   React tree (the analytics boundary, the viewer's event stream, the export pane's source), so they go through
 *   {@link connectBaselineTelemetry}, which the analytics boundary calls while it admits analytics.
 *
 * Either way, nothing is captured unless the host admits analytics (accepted consent on the web, Data controls on the
 * desktop). Every property is a closed value, a count, a duration, a boolean or an id: no event carries prompt text,
 * example text or a file name. Each emitter sends exactly the keys {@link onboardingEventProperties} lists for its
 * event, so a caller cannot add one.
 *
 * @module
 */

import { useMemo } from 'react';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';
import { metaConfig } from '#constants/meta.constants.js';
import { useAnalytics } from '#hooks/use-analytics.js';
import type { Analytics } from '#hooks/use-analytics.js';
import { store } from '#hooks/use-cookie.js';
import { isDesktopTarget } from '#lib/build-target.js';

/* eslint-disable @typescript-eslint/naming-convention -- event names and properties are analytics wire names. */

/** Every onboarding event, by emitter name. */
export const onboardingEventName = {
  firstSeen: 'first_seen',
  firstModelBuilt: 'first_model_built',
  firstExport: 'first_export',
  setupOpened: 'onboarding_setup_opened',
  setupStepCompleted: 'onboarding_step_completed',
  setupCompleted: 'onboarding_setup_completed',
  setupSkipped: 'onboarding_setup_skipped',
  previewFallbackShown: 'onboarding_preview_fallback_shown',
  viewerPresetSelected: 'viewer_preset_selected',
  viewerGizmoSelected: 'viewer_gizmo_selected',
  viewerDefaultChanged: 'viewer_default_changed',
  viewerOverrideReset: 'viewer_override_reset',
  homeSuggestionSelected: 'home_suggestion_selected',
  setupAnswersSwitchChanged: 'setup_answers_switch_changed',
  setupAnswersCleared: 'setup_answers_cleared',
  tourStarted: 'tour_started',
  tourStepShown: 'tour_step_shown',
  tourStepSeen: 'tour_step_seen',
  tourPaused: 'tour_paused',
  tourResumed: 'tour_resumed',
  tourDismissed: 'tour_dismissed',
  tourCompleted: 'tour_completed',
} as const;

export type OnboardingEventName = (typeof onboardingEventName)[keyof typeof onboardingEventName];

/** The host an event came from. */
export type OnboardingHost = 'web' | 'desktop';
/** How setup was opened (Finding 3). */
export type SetupEntry = 'signup' | 'first_launch' | 'invite' | 'help' | 'palette';
/** The setup steps, in order (Finding 2). */
export type SetupStep = 'goals' | 'background' | 'viewer' | 'how';
/** Why the live preview in setup step 3 fell back to its still image. */
export type PreviewFallbackReason = 'no_webgl' | 'context_lost' | 'chunk_failed';
/** Where a viewer control was chosen. */
export type ViewerChoiceSource = 'setup' | 'settings';
/** The level a viewer default was changed or reset at (Finding 6). */
export type ViewerSettingLevel = 'person' | 'view';
/** How a tour runs: the first, guided run, or a replay from Help (Finding 8). */
export type TourMode = 'guided' | 'replay';
/** The five tips, in order (Finding 8). */
export type TourStep = 'ask' | 'look' | 'adjust' | 'verify' | 'build';
/** What marked a tip seen: the action it describes, or its Next button. */
export type TourSeenBy = 'action' | 'next';

/** The properties of every event. A key that is not listed here is never sent. */
export type OnboardingEventProperties = {
  first_seen: {
    readonly host: OnboardingHost;
    readonly ms_since_first_seen: number;
  };
  first_model_built: {
    readonly host: OnboardingHost;
    readonly ms_since_first_seen: number;
    readonly kernel?: string;
  };
  first_export: {
    readonly host: OnboardingHost;
    readonly ms_since_first_seen: number;
    readonly kernel?: string;
  };
  onboarding_setup_opened: {
    readonly entry: SetupEntry;
    readonly host: OnboardingHost;
  };
  onboarding_step_completed: {
    readonly step: SetupStep;
    readonly answered: boolean;
  };
  onboarding_setup_completed: {
    readonly steps_answered: number;
    readonly duration_ms: number;
    readonly tour_wanted: boolean;
  };
  onboarding_setup_skipped: { readonly at_step: SetupStep };
  onboarding_preview_fallback_shown: { readonly reason: PreviewFallbackReason };
  /** `preset` is a navigation preset id (`@taucad/viewer`'s closed enum, T4.1). */
  viewer_preset_selected: {
    readonly preset: string;
    readonly suggested: boolean;
    readonly source: ViewerChoiceSource;
  };
  /** `style` is a gizmo style id (`@taucad/viewer`'s closed enum, T4.7). */
  viewer_gizmo_selected: {
    readonly style: string;
    readonly suggested: boolean;
    readonly source: ViewerChoiceSource;
  };
  /** `field` is a view-settings field path, such as `display.edges` (T3.1). */
  viewer_default_changed: {
    readonly level: ViewerSettingLevel;
    readonly field: string;
  };
  viewer_override_reset: {
    readonly level: ViewerSettingLevel;
    readonly field: string;
  };
  /** `example_id` is a `ChatExample` id, never its text. */
  home_suggestion_selected: {
    readonly example_id: string;
    readonly goal_matched: boolean;
  };
  setup_answers_switch_changed: { readonly enabled: boolean };
  setup_answers_cleared: Readonly<Record<never, never>>;
  tour_started: { readonly mode: TourMode };
  tour_step_shown: { readonly mode: TourMode; readonly step: TourStep };
  tour_step_seen: {
    readonly mode: TourMode;
    readonly step: TourStep;
    readonly by: TourSeenBy;
  };
  tour_paused: { readonly mode: TourMode; readonly step: TourStep };
  tour_resumed: { readonly mode: TourMode; readonly step: TourStep };
  tour_dismissed: { readonly mode: TourMode; readonly step: TourStep };
  tour_completed: { readonly mode: TourMode };
};

/** The keys each event may carry, checked against {@link OnboardingEventProperties} at compile time. */
export const onboardingEventProperties = {
  first_seen: ['host', 'ms_since_first_seen'],
  first_model_built: ['host', 'ms_since_first_seen', 'kernel'],
  first_export: ['host', 'ms_since_first_seen', 'kernel'],
  onboarding_setup_opened: ['entry', 'host'],
  onboarding_step_completed: ['step', 'answered'],
  onboarding_setup_completed: ['steps_answered', 'duration_ms', 'tour_wanted'],
  onboarding_setup_skipped: ['at_step'],
  onboarding_preview_fallback_shown: ['reason'],
  viewer_preset_selected: ['preset', 'suggested', 'source'],
  viewer_gizmo_selected: ['style', 'suggested', 'source'],
  viewer_default_changed: ['level', 'field'],
  viewer_override_reset: ['level', 'field'],
  home_suggestion_selected: ['example_id', 'goal_matched'],
  setup_answers_switch_changed: ['enabled'],
  setup_answers_cleared: [],
  tour_started: ['mode'],
  tour_step_shown: ['mode', 'step'],
  tour_step_seen: ['mode', 'step', 'by'],
  tour_paused: ['mode', 'step'],
  tour_resumed: ['mode', 'step'],
  tour_dismissed: ['mode', 'step'],
  tour_completed: ['mode'],
} as const satisfies {
  readonly [Event in OnboardingEventName]: ReadonlyArray<keyof OnboardingEventProperties[Event]>;
};

/**
 * Send one event with only its listed keys; an absent optional key is left out rather than sent as `undefined`.
 *
 * @param capture - The host's capture.
 * @param event - The event.
 * @param properties - Its properties.
 */
const emit = <Event extends OnboardingEventName, Result>(
  capture: (event: Event, properties: Record<string, unknown>) => Result,
  event: Event,
  properties: OnboardingEventProperties[Event],
): Result => {
  const sent: Record<string, unknown> = {};
  for (const key of onboardingEventProperties[event] as readonly string[]) {
    const value = (properties as Readonly<Record<string, unknown>>)[key];
    if (value !== undefined) {
      sent[key] = value;
    }
  }
  return capture(event, sent);
};

/** The host this bundle runs in. */
export const onboardingHost = (): OnboardingHost => (isDesktopTarget() ? 'desktop' : 'web');

// =============================================================================
// Surface events
// =============================================================================

/** One emitter per surface event. The baseline events are reported by {@link connectBaselineTelemetry} instead. */
export type OnboardingTelemetry = {
  readonly setupOpened: (input: { readonly entry: SetupEntry }) => void;
  readonly setupStepCompleted: (input: OnboardingEventProperties['onboarding_step_completed']) => void;
  readonly setupCompleted: (input: OnboardingEventProperties['onboarding_setup_completed']) => void;
  readonly setupSkipped: (input: OnboardingEventProperties['onboarding_setup_skipped']) => void;
  readonly previewFallbackShown: (input: OnboardingEventProperties['onboarding_preview_fallback_shown']) => void;
  readonly viewerPresetSelected: (input: OnboardingEventProperties['viewer_preset_selected']) => void;
  readonly viewerGizmoSelected: (input: OnboardingEventProperties['viewer_gizmo_selected']) => void;
  readonly viewerDefaultChanged: (input: OnboardingEventProperties['viewer_default_changed']) => void;
  readonly viewerOverrideReset: (input: OnboardingEventProperties['viewer_override_reset']) => void;
  readonly homeSuggestionSelected: (input: OnboardingEventProperties['home_suggestion_selected']) => void;
  readonly setupAnswersSwitchChanged: (input: OnboardingEventProperties['setup_answers_switch_changed']) => void;
  readonly setupAnswersCleared: () => void;
  readonly tourStarted: (input: OnboardingEventProperties['tour_started']) => void;
  readonly tourStepShown: (input: OnboardingEventProperties['tour_step_shown']) => void;
  readonly tourStepSeen: (input: OnboardingEventProperties['tour_step_seen']) => void;
  readonly tourPaused: (input: OnboardingEventProperties['tour_paused']) => void;
  readonly tourResumed: (input: OnboardingEventProperties['tour_resumed']) => void;
  readonly tourDismissed: (input: OnboardingEventProperties['tour_dismissed']) => void;
  readonly tourCompleted: (input: OnboardingEventProperties['tour_completed']) => void;
};

/**
 * The surface emitters over one host's analytics.
 *
 * @param analytics - The host's analytics; its `capture` drops everything while analytics are not admitted.
 * @param host - The host the events come from.
 * @returns The emitters.
 */
export const buildOnboardingTelemetry = (
  analytics: Analytics,
  host: OnboardingHost = onboardingHost(),
): OnboardingTelemetry => {
  const { capture } = analytics;
  return {
    setupOpened: ({ entry }) => {
      emit(capture, onboardingEventName.setupOpened, { entry, host });
    },
    setupStepCompleted: (input) => {
      emit(capture, onboardingEventName.setupStepCompleted, input);
    },
    setupCompleted: (input) => {
      emit(capture, onboardingEventName.setupCompleted, input);
    },
    setupSkipped: (input) => {
      emit(capture, onboardingEventName.setupSkipped, input);
    },
    previewFallbackShown: (input) => {
      emit(capture, onboardingEventName.previewFallbackShown, input);
    },
    viewerPresetSelected: (input) => {
      emit(capture, onboardingEventName.viewerPresetSelected, input);
    },
    viewerGizmoSelected: (input) => {
      emit(capture, onboardingEventName.viewerGizmoSelected, input);
    },
    viewerDefaultChanged: (input) => {
      emit(capture, onboardingEventName.viewerDefaultChanged, input);
    },
    viewerOverrideReset: (input) => {
      emit(capture, onboardingEventName.viewerOverrideReset, input);
    },
    homeSuggestionSelected: (input) => {
      emit(capture, onboardingEventName.homeSuggestionSelected, input);
    },
    setupAnswersSwitchChanged: (input) => {
      emit(capture, onboardingEventName.setupAnswersSwitchChanged, input);
    },
    setupAnswersCleared: () => {
      emit(capture, onboardingEventName.setupAnswersCleared, {});
    },
    tourStarted: (input) => {
      emit(capture, onboardingEventName.tourStarted, input);
    },
    tourStepShown: (input) => {
      emit(capture, onboardingEventName.tourStepShown, input);
    },
    tourStepSeen: (input) => {
      emit(capture, onboardingEventName.tourStepSeen, input);
    },
    tourPaused: (input) => {
      emit(capture, onboardingEventName.tourPaused, input);
    },
    tourResumed: (input) => {
      emit(capture, onboardingEventName.tourResumed, input);
    },
    tourDismissed: (input) => {
      emit(capture, onboardingEventName.tourDismissed, input);
    },
    tourCompleted: (input) => {
      emit(capture, onboardingEventName.tourCompleted, input);
    },
  };
};

/**
 * The surface emitters for the current host, over `useAnalytics().capture`.
 *
 * @returns The emitters.
 */
export const useOnboardingTelemetry = (): OnboardingTelemetry => {
  const analytics = useAnalytics();
  return useMemo(() => buildOnboardingTelemetry(analytics), [analytics]);
};

// =============================================================================
// Baseline events (WP0): once per device
// =============================================================================

/** The three baseline events, each reported at most once per device. */
export type BaselineEventName = 'first_seen' | 'first_model_built' | 'first_export';

/**
 * The device's first-seen marker (blueprint defect BD5): when this device first ran Tau, and which baseline events
 * have been reported from it. A telemetry marker, outside every person record; it never leaves the device except as
 * the `ms_since_first_seen` duration.
 */
export type FirstSeenMarker = Readonly<{
  /** Epoch milliseconds of this device's first start. */
  at: number;
  /** The baseline events already captured from this device. */
  reported: readonly BaselineEventName[];
}>;

/** Where the marker lives: one device key, read and written through the preference store. */
export type FirstSeenStore = {
  readonly read: () => unknown;
  readonly write: (marker: FirstSeenMarker) => void;
};

/** The marker's storage name (`tau-first-seen`). */
export const firstSeenStorageName = `${metaConfig.cookiePrefix}${cookieName.firstSeen}`;

const deviceStore: FirstSeenStore = {
  read: () => store.get<unknown>(firstSeenStorageName),
  write: (marker) => {
    store.update(firstSeenStorageName, marker);
  },
};

const baselineEvents: ReadonlySet<string> = new Set<BaselineEventName>([
  'first_seen',
  'first_model_built',
  'first_export',
]);

/**
 * The stored marker, when it is well formed. A malformed one is replaced, because a marker with no usable time
 * cannot produce a duration.
 *
 * @param raw - The stored value.
 * @returns The marker, or `undefined`.
 */
const parseMarker = (raw: unknown): FirstSeenMarker | undefined => {
  if (raw === null || typeof raw !== 'object') {
    return undefined;
  }
  const { at, reported } = raw as { at?: unknown; reported?: unknown };
  if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) {
    return undefined;
  }
  const events = Array.isArray(reported)
    ? reported.filter((event): event is BaselineEventName => typeof event === 'string' && baselineEvents.has(event))
    : [];
  return { at, reported: events };
};

/** What the baseline reporter reads; injectable for tests. */
export type BaselineEnvironment = {
  readonly store: FirstSeenStore;
  readonly now: () => number;
  readonly host: () => OnboardingHost;
};

const defaultEnvironment: BaselineEnvironment = {
  store: deviceStore,
  now: Date.now,
  host: onboardingHost,
};

/** Captures one baseline event; returns whether it was captured (false when analytics stopped in between). */
export type BaselineCapture = (event: BaselineEventName, properties: Readonly<Record<string, unknown>>) => boolean;

let environment = defaultEnvironment;
let baselineCapture: BaselineCapture | undefined;

/**
 * Read this device's marker, writing one stamped now on the device's first start. Called when the page starts, so
 * `ms_since_first_seen` counts from the first start even when analytics are admitted later.
 *
 * @returns The marker.
 */
export const markFirstSeen = (): FirstSeenMarker => {
  const stored = parseMarker(environment.store.read());
  if (stored !== undefined) {
    return stored;
  }
  const marker: FirstSeenMarker = { at: environment.now(), reported: [] };
  environment.store.write(marker);
  return marker;
};

/**
 * Capture one baseline event if this device has not reported it and analytics are admitted, then record it as
 * reported. While analytics are not admitted nothing is captured or recorded, so the event goes out the first time
 * it happens with analytics on.
 *
 * @param event - The event.
 * @param kernel - The kernel that built or exported the model, when known.
 */
const reportBaseline = (event: BaselineEventName, kernel?: string): void => {
  const capture = baselineCapture;
  if (capture === undefined) {
    return;
  }
  const marker = markFirstSeen();
  if (marker.reported.includes(event)) {
    return;
  }
  const properties = {
    host: environment.host(),
    ms_since_first_seen: Math.max(0, Math.round(environment.now() - marker.at)),
    ...(event === 'first_seen' || kernel === undefined ? {} : { kernel }),
  };
  /* Recorded before capture, so a capture that throws can never send the event twice; a capture that did not
     happen is taken back, so the event goes out the next time. */
  environment.store.write({
    at: marker.at,
    reported: [...marker.reported, event],
  });
  let captured: boolean;
  try {
    captured = emit(capture, event, properties);
  } catch {
    // Optional analytics never break the caller; the record stands, because the event may have left.
    return;
  }
  if (!captured) {
    environment.store.write(marker);
  }
};

/**
 * Start reporting the baseline events through `capture`, and report `first_seen` if this device has not. The
 * analytics boundary calls this each time the host admits analytics.
 *
 * @param capture - Captures one event and says whether it did.
 */
export const connectBaselineTelemetry = (capture: BaselineCapture): void => {
  baselineCapture = capture;
  reportBaseline('first_seen');
};

/** Stop reporting the baseline events; the analytics boundary calls this when analytics are withdrawn. */
export const disconnectBaselineTelemetry = (): void => {
  baselineCapture = undefined;
};

/**
 * A model built by a kernel reached its first presented frame.
 *
 * @param input - The kernel that built it, when known.
 */
export const reportFirstModelBuilt = (input: { readonly kernel?: string | undefined }): void => {
  reportBaseline('first_model_built', input.kernel);
};

/**
 * An export from a kernel's model succeeded (downloaded or written to the project).
 *
 * @param input - The kernel that exported it.
 */
export const reportFirstExport = (input: { readonly kernel?: string | undefined }): void => {
  reportBaseline('first_export', input.kernel);
};

/**
 * Replace what the baseline reporter reads, for tests.
 *
 * @param overrides - The parts to replace; omitted parts keep the device defaults.
 * @returns Restores the defaults and disconnects.
 */
export const setBaselineEnvironmentForTesting = (overrides: Partial<BaselineEnvironment>): (() => void) => {
  environment = { ...defaultEnvironment, ...overrides };
  return () => {
    environment = defaultEnvironment;
    baselineCapture = undefined;
  };
};

/* eslint-enable @typescript-eslint/naming-convention -- restore application naming rules. */
