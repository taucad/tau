/**
 * Setup's analytics: its events through the shared onboarding emitters, and the person
 * properties it sets with `$set` when they change. Everything goes through `useAnalytics().capture`, so web consent
 * and the desktop opt-out apply. No property carries free text: goals and tool are closed ids.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GizmoStyleId, MousePresetId, PersonProfile, SetupStatus, ViewerPreferences } from '@taucad/preferences';
import { mergeOnboarding, suggestedGizmo, suggestedPreset } from '@taucad/preferences';
import { useAnalytics } from '#hooks/use-analytics.js';
import { personRecordStores } from '#preferences/person-record.store.js';
import { setViewerPersonProperties } from '#components/settings/viewer/viewer-person-properties.js';
import { useOnboardingTelemetry } from '#telemetry/onboarding-telemetry.js';
import type { SetupEntry } from '#telemetry/onboarding-telemetry.js';
import type { SetupStepId } from '#components/onboarding/setup-copy.js';
import { isStepAnswered } from '#components/onboarding/setup-model.js';

/** The person properties setup sets, by name in analytics. The viewer's two (mouse_preset, gizmo_style) go
 * through Settings → Viewer's `setViewerPersonProperties`. */
export const setupPersonPropertyNames = {
  goals: 'goals',
  tool: 'tool',
  setupStatus: 'setup_status',
} as const;

/**
 * The status the device holds once this write merges in: a status only rises, so reopening setup after Finish still
 * reads completed.
 *
 * @param next - The status this write sets.
 * @returns The stored status after the write.
 */
const storedStatusAfter = (next: SetupStatus): SetupStatus =>
  mergeOnboarding(personRecordStores.onboarding.read(), { setupStatus: next }).setup?.status ?? next;

/* eslint-disable @typescript-eslint/naming-convention -- event properties are analytics wire names. */

/** What one setup record looks like to its events. */
type SetupRecord = Readonly<{ profile: PersonProfile; viewer: ViewerPreferences }>;

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
  const analytics = useAnalytics();
  const { capture } = analytics;
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
      setPerson({ [setupPersonPropertyNames.setupStatus]: storedStatusAfter('offered') });
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
        setPerson({ [setupPersonPropertyNames.setupStatus]: storedStatusAfter('completed') });
      },
      skipped: (step) => {
        telemetry.setupSkipped({ at_step: step });
        setPerson({ [setupPersonPropertyNames.setupStatus]: storedStatusAfter('skipped') });
      },
      presetSelected: (preset, profile) => {
        telemetry.viewerPresetSelected({
          preset,
          suggested: preset === suggestedPreset(profile.tool),
          source: 'setup',
        });
        setViewerPersonProperties(analytics, { mousePreset: preset });
      },
      gizmoSelected: (style, profile) => {
        telemetry.viewerGizmoSelected({ style, suggested: style === suggestedGizmo(profile.tool), source: 'setup' });
        setViewerPersonProperties(analytics, { gizmoStyle: style });
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
    [analytics, openedAt, setPerson, telemetry],
  );
};

/* eslint-enable @typescript-eslint/naming-convention -- restore application naming rules. */
