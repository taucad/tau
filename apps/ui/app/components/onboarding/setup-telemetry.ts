/**
 * Setup's analytics (onboarding blueprint, Finding 12, M1 and M2): its events through T0.3's emitters, and the person
 * properties it sets with `$set` when they change. Everything goes through `useAnalytics().capture`, so web consent
 * and the desktop opt-out apply. No property carries free text: goals and tool are closed ids.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  DeviceRecord,
  GizmoStyleId,
  MousePresetId,
  PersonProfile,
  SetupStatus,
  ViewerPreferences,
} from '@taucad/preferences';
import { suggestedGizmo, suggestedPreset } from '@taucad/preferences';
import { useAnalytics } from '#hooks/use-analytics.js';
import { useOnboardingTelemetry } from '#telemetry/onboarding-telemetry.js';
import type { SetupEntry } from '#telemetry/onboarding-telemetry.js';
import type { SetupStepId } from '#components/onboarding/setup-copy.js';
import { isStepAnswered } from '#components/onboarding/setup-model.js';

/** The person properties setup sets, by name in analytics. The viewer's three come from Settings → Viewer's module. */
export const setupPersonPropertyNames = {
  goals: 'goals',
  tool: 'tool',
  setupStatus: 'setup_status',
} as const;

/* eslint-disable @typescript-eslint/naming-convention -- event properties are analytics wire names. */

/** What one setup record looks like to its events. */
type SetupRecord = Readonly<{ profile: PersonProfile; viewer: ViewerPreferences; device: DeviceRecord }>;

/** The emitters setup calls. */
export type SetupTelemetry = Readonly<{
  stepCompleted: (step: SetupStepId, record: SetupRecord) => void;
  completed: (input: Readonly<{ steps: readonly SetupStepId[]; record: SetupRecord; isTourWanted: boolean }>) => void;
  skipped: (step: SetupStepId) => void;
  presetSelected: (preset: MousePresetId, profile: PersonProfile) => void;
  gizmoSelected: (style: GizmoStyleId, profile: PersonProfile) => void;
  gizmoHidden: () => void;
  profileChanged: (profile: PersonProfile) => void;
}>;

/**
 * Setup's emitters. `onboarding_setup_opened` is captured once, when setup opens, with how it was reached.
 *
 * @param entry - How setup was reached.
 * @returns The emitters.
 */
export const useSetupTelemetry = (entry: SetupEntry): SetupTelemetry => {
  const telemetry = useOnboardingTelemetry();
  const { capture } = useAnalytics();
  const [openedAt] = useState(() => performance.now());
  const isOpenedReported = useRef(false);

  const setPerson = useMemo(
    () =>
      (properties: Readonly<Record<string, unknown>>): void => {
        capture('$set', { $set: properties });
      },
    [capture],
  );

  useEffect(() => {
    if (!isOpenedReported.current) {
      isOpenedReported.current = true;
      telemetry.setupOpened({ entry });
      setPerson({ [setupPersonPropertyNames.setupStatus]: 'offered' satisfies SetupStatus });
    }
  }, [entry, setPerson, telemetry]);

  return useMemo(
    () => ({
      stepCompleted: (step, record) => {
        telemetry.setupStepCompleted({ step, answered: isStepAnswered(step, record) });
      },
      completed: ({ steps, record, isTourWanted }) => {
        telemetry.setupCompleted({
          steps_answered: steps.filter((step) => step !== 'how' && isStepAnswered(step, record)).length,
          duration_ms: Math.round(performance.now() - openedAt),
          tour_wanted: isTourWanted,
        });
        setPerson({ [setupPersonPropertyNames.setupStatus]: 'completed' satisfies SetupStatus });
      },
      skipped: (step) => {
        telemetry.setupSkipped({ at_step: step });
        setPerson({ [setupPersonPropertyNames.setupStatus]: 'skipped' satisfies SetupStatus });
      },
      presetSelected: (preset, profile) => {
        telemetry.viewerPresetSelected({
          preset,
          suggested: preset === suggestedPreset(profile.tool),
          source: 'setup',
        });
      },
      gizmoSelected: (style, profile) => {
        telemetry.viewerGizmoSelected({ style, suggested: style === suggestedGizmo(profile.tool), source: 'setup' });
      },
      gizmoHidden: () => {
        telemetry.viewerDefaultChanged({ level: 'person', field: 'display.gizmo' });
      },
      profileChanged: (profile) => {
        setPerson({
          [setupPersonPropertyNames.goals]: profile.goals,
          ...(profile.tool === undefined ? {} : { [setupPersonPropertyNames.tool]: profile.tool }),
        });
      },
    }),
    [openedAt, setPerson, telemetry],
  );
};

/* eslint-enable @typescript-eslint/naming-convention -- restore application naming rules. */
