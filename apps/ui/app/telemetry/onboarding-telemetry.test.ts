/* eslint-disable @typescript-eslint/naming-convention -- event properties are analytics wire names. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Analytics } from '#hooks/use-analytics.js';
import {
  buildOnboardingTelemetry,
  connectBaselineTelemetry,
  disconnectBaselineTelemetry,
  firstSeenStorageName,
  markFirstSeen,
  onboardingEventName,
  onboardingEventProperties,
  reportFirstExport,
  reportFirstModelBuilt,
  setBaselineEnvironmentForTesting,
} from '#telemetry/onboarding-telemetry.js';
import type { BaselineCapture, FirstSeenMarker, OnboardingTelemetry } from '#telemetry/onboarding-telemetry.js';

const memoryStore = (initial?: unknown) => {
  let value = initial;
  return {
    read: () => value,
    write: vi.fn((marker: FirstSeenMarker) => {
      value = marker;
    }),
    current: () => value,
  };
};

let restore: (() => void) | undefined;

const useBaseline = (options: {
  readonly initial?: unknown;
  readonly now?: number;
  readonly host?: 'web' | 'desktop';
}) => {
  const store = memoryStore(options.initial);
  let now = options.now ?? 1_000_000;
  restore = setBaselineEnvironmentForTesting({
    store,
    now: () => now,
    host: () => options.host ?? 'web',
  });
  return {
    store,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

const capturing = (): ReturnType<typeof vi.fn<BaselineCapture>> => vi.fn<BaselineCapture>(() => true);

afterEach(() => {
  disconnectBaselineTelemetry();
  restore?.();
  restore = undefined;
});

describe('onboarding event names', () => {
  it('declares every event of Finding 12, once each', () => {
    expect(Object.values(onboardingEventName).toSorted()).toStrictEqual(
      [
        'first_seen',
        'first_model_built',
        'first_export',
        'onboarding_setup_opened',
        'onboarding_step_completed',
        'onboarding_setup_completed',
        'onboarding_setup_skipped',
        'onboarding_preview_fallback_shown',
        'viewer_preset_selected',
        'viewer_gizmo_selected',
        'viewer_default_changed',
        'viewer_override_reset',
        'home_suggestion_selected',
        'setup_answers_switch_changed',
        'setup_answers_cleared',
        'tour_started',
        'tour_step_shown',
        'tour_step_seen',
        'tour_paused',
        'tour_resumed',
        'tour_dismissed',
        'tour_completed',
      ].toSorted(),
    );
    expect(Object.keys(onboardingEventProperties).toSorted()).toStrictEqual(
      Object.values(onboardingEventName).toSorted(),
    );
  });

  it('never lists a key that could carry prompt text, example text or a file name', () => {
    const keys = Object.values(onboardingEventProperties).flat();
    for (const key of keys) {
      expect(key).not.toMatch(/prompt|text|name|file|path|label|message|query/u);
    }
  });
});

describe('surface emitters', () => {
  const build = () => {
    const capture = vi.fn();
    const telemetry = buildOnboardingTelemetry({ capture } as Analytics, 'desktop');
    return { capture, telemetry };
  };

  const cases: ReadonlyArray<
    readonly [string, (telemetry: OnboardingTelemetry) => void, string, Readonly<Record<string, unknown>>]
  > = [
    [
      'setupOpened',
      (t) => {
        t.setupOpened({ entry: 'help' });
      },
      'onboarding_setup_opened',
      { entry: 'help', host: 'desktop' },
    ],
    [
      'setupStepCompleted',
      (t) => {
        t.setupStepCompleted({ step: 'goals', answered: true });
      },
      'onboarding_step_completed',
      { step: 'goals', answered: true },
    ],
    [
      'setupCompleted',
      (t) => {
        t.setupCompleted({
          steps_answered: 2,
          duration_ms: 41_000,
          tour_wanted: false,
        });
      },
      'onboarding_setup_completed',
      { steps_answered: 2, duration_ms: 41_000, tour_wanted: false },
    ],
    [
      'setupSkipped',
      (t) => {
        t.setupSkipped({ at_step: 'viewer' });
      },
      'onboarding_setup_skipped',
      { at_step: 'viewer' },
    ],
    [
      'previewFallbackShown',
      (t) => {
        t.previewFallbackShown({ reason: 'no_webgl' });
      },
      'onboarding_preview_fallback_shown',
      { reason: 'no_webgl' },
    ],
    [
      'viewerPresetSelected',
      (t) => {
        t.viewerPresetSelected({
          preset: 'right-orbit',
          suggested: true,
          source: 'setup',
        });
      },
      'viewer_preset_selected',
      { preset: 'right-orbit', suggested: true, source: 'setup' },
    ],
    [
      'viewerGizmoSelected',
      (t) => {
        t.viewerGizmoSelected({
          style: 'cube',
          suggested: false,
          source: 'settings',
        });
      },
      'viewer_gizmo_selected',
      { style: 'cube', suggested: false, source: 'settings' },
    ],
    [
      'viewerDefaultChanged',
      (t) => {
        t.viewerDefaultChanged({ level: 'person', field: 'display.edges' });
      },
      'viewer_default_changed',
      { level: 'person', field: 'display.edges' },
    ],
    [
      'viewerOverrideReset',
      (t) => {
        t.viewerOverrideReset({ level: 'view', field: 'fieldOfView' });
      },
      'viewer_override_reset',
      { level: 'view', field: 'fieldOfView' },
    ],
    [
      'homeSuggestionSelected',
      (t) => {
        t.homeSuggestionSelected({
          example_id: 'phone-stand',
          goal_matched: true,
        });
      },
      'home_suggestion_selected',
      { example_id: 'phone-stand', goal_matched: true },
    ],
    [
      'setupAnswersSwitchChanged',
      (t) => {
        t.setupAnswersSwitchChanged({ enabled: false });
      },
      'setup_answers_switch_changed',
      { enabled: false },
    ],
    [
      'setupAnswersCleared',
      (t) => {
        t.setupAnswersCleared();
      },
      'setup_answers_cleared',
      {},
    ],
    [
      'tourStarted',
      (t) => {
        t.tourStarted({ mode: 'guided' });
      },
      'tour_started',
      { mode: 'guided' },
    ],
    [
      'tourStepShown',
      (t) => {
        t.tourStepShown({ mode: 'guided', step: 'look' });
      },
      'tour_step_shown',
      { mode: 'guided', step: 'look' },
    ],
    [
      'tourStepSeen',
      (t) => {
        t.tourStepSeen({ mode: 'replay', step: 'adjust', by: 'next' });
      },
      'tour_step_seen',
      { mode: 'replay', step: 'adjust', by: 'next' },
    ],
    [
      'tourPaused',
      (t) => {
        t.tourPaused({ mode: 'guided', step: 'verify' });
      },
      'tour_paused',
      { mode: 'guided', step: 'verify' },
    ],
    [
      'tourResumed',
      (t) => {
        t.tourResumed({ mode: 'guided', step: 'verify' });
      },
      'tour_resumed',
      { mode: 'guided', step: 'verify' },
    ],
    [
      'tourDismissed',
      (t) => {
        t.tourDismissed({ mode: 'guided', step: 'build' });
      },
      'tour_dismissed',
      { mode: 'guided', step: 'build' },
    ],
    [
      'tourCompleted',
      (t) => {
        t.tourCompleted({ mode: 'replay' });
      },
      'tour_completed',
      { mode: 'replay' },
    ],
  ];

  it('covers every surface emitter', () => {
    expect(cases.map(([name]) => name).toSorted()).toStrictEqual(Object.keys(build().telemetry).toSorted());
  });

  it.each(cases.map(([name, call, event, properties]) => ({ name, call, event, properties })))(
    '$name captures exactly its listed properties',
    ({ call, event, properties }) => {
      const { capture, telemetry } = build();
      call(telemetry);
      expect(capture).toHaveBeenCalledTimes(1);
      expect(capture).toHaveBeenCalledWith(event, properties);
    },
  );

  it('drops a key the event does not list, so a caller cannot add free text', () => {
    const { capture, telemetry } = build();
    telemetry.homeSuggestionSelected({
      example_id: 'phone-stand',
      goal_matched: false,
      text: 'A phone stand with an adjustable angle',
    } as Parameters<OnboardingTelemetry['homeSuggestionSelected']>[0]);
    expect(capture).toHaveBeenCalledWith('home_suggestion_selected', {
      example_id: 'phone-stand',
      goal_matched: false,
    });
  });
});

describe('baseline events', () => {
  it('stamps the device the first time it starts and keeps that time afterwards', () => {
    const { store, advance } = useBaseline({ now: 5000 });
    expect(markFirstSeen()).toStrictEqual({ at: 5000, reported: [] });
    advance(60_000);
    expect(markFirstSeen()).toStrictEqual({ at: 5000, reported: [] });
    expect(store.write).toHaveBeenCalledTimes(1);
  });

  it('replaces a malformed marker', () => {
    useBaseline({ initial: { at: 'yesterday' }, now: 7000 });
    expect(markFirstSeen()).toStrictEqual({ at: 7000, reported: [] });
  });

  it('reports first_seen once per device when analytics are admitted, with the time since the first start', () => {
    const { store, advance } = useBaseline({ now: 10_000, host: 'web' });
    markFirstSeen();
    advance(2500);
    const capture = capturing();
    connectBaselineTelemetry(capture);
    expect(capture).toHaveBeenCalledExactlyOnceWith('first_seen', {
      host: 'web',
      ms_since_first_seen: 2500,
    });
    expect(store.current()).toStrictEqual({
      at: 10_000,
      reported: ['first_seen'],
    });

    // A later admission (another load, or consent withdrawn and given again) sends nothing more.
    disconnectBaselineTelemetry();
    const again = capturing();
    connectBaselineTelemetry(again);
    expect(again).not.toHaveBeenCalled();
  });

  it('reports first_model_built and first_export once each, with the kernel', () => {
    const { advance } = useBaseline({ now: 1, host: 'desktop' });
    const capture = capturing();
    connectBaselineTelemetry(capture);
    advance(90_000);
    reportFirstModelBuilt({ kernel: 'openscad' });
    reportFirstModelBuilt({ kernel: 'replicad' });
    advance(30_000);
    reportFirstExport({ kernel: 'openscad' });
    reportFirstExport({ kernel: 'openscad' });
    expect(capture.mock.calls).toStrictEqual([
      ['first_seen', { host: 'desktop', ms_since_first_seen: 0 }],
      ['first_model_built', { host: 'desktop', ms_since_first_seen: 90_000, kernel: 'openscad' }],
      ['first_export', { host: 'desktop', ms_since_first_seen: 120_000, kernel: 'openscad' }],
    ]);
  });

  it('leaves kernel out when it is not known', () => {
    useBaseline({ now: 1 });
    const capture = capturing();
    connectBaselineTelemetry(capture);
    reportFirstModelBuilt({ kernel: undefined });
    expect(capture).toHaveBeenLastCalledWith('first_model_built', {
      host: 'web',
      ms_since_first_seen: 0,
    });
  });

  it('captures nothing and records nothing while analytics are not admitted (declined on the web, off on desktop)', () => {
    const { store } = useBaseline({ now: 1 });
    markFirstSeen();
    reportFirstModelBuilt({ kernel: 'openscad' });
    reportFirstExport({ kernel: 'openscad' });
    expect(store.current()).toStrictEqual({ at: 1, reported: [] });

    // So the events go out the first time they happen with analytics on.
    const capture = capturing();
    connectBaselineTelemetry(capture);
    reportFirstModelBuilt({ kernel: 'openscad' });
    expect(capture.mock.calls.map(([event]) => event)).toStrictEqual(['first_seen', 'first_model_built']);
  });

  it('stops capturing as soon as analytics are withdrawn', () => {
    useBaseline({ now: 1 });
    const capture = capturing();
    connectBaselineTelemetry(capture);
    disconnectBaselineTelemetry();
    reportFirstModelBuilt({ kernel: 'openscad' });
    expect(capture.mock.calls.map(([event]) => event)).toStrictEqual(['first_seen']);
  });

  it('takes back the record of an event the host did not capture', () => {
    const { store } = useBaseline({ now: 1 });
    connectBaselineTelemetry(() => false);
    expect(store.current()).toStrictEqual({ at: 1, reported: [] });
    const capture = capturing();
    connectBaselineTelemetry(capture);
    expect(capture).toHaveBeenCalledWith('first_seen', {
      host: 'web',
      ms_since_first_seen: 0,
    });
  });

  it('never sends an event twice when the capture throws', () => {
    useBaseline({ now: 1 });
    const failing = vi.fn<BaselineCapture>(() => {
      throw new Error('transport');
    });
    expect(() => {
      connectBaselineTelemetry(failing);
    }).not.toThrow();
    expect(failing).toHaveBeenCalledTimes(1);
    const capture = capturing();
    connectBaselineTelemetry(capture);
    expect(capture).not.toHaveBeenCalled();
  });

  it('stores the marker under the tau-first-seen device key', () => {
    expect(firstSeenStorageName).toBe('tau-first-seen');
  });
});
