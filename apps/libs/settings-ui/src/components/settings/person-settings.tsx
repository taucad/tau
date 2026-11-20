/**
 * What the person-record settings read from the host app: Settings → Viewer and Settings → Agents' Setup answers row.
 * The app owns the person record's storage, its analytics and its onboarding events, so it supplies them here and the
 * settings only read and call them.
 */
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { GizmoStyleId, LeafPatch, MousePresetId, PersonProfile, ViewerPreferences } from '@taucad/preferences';
import type { ViewerAnalytics } from '#components/settings/viewer/viewer-person-properties.js';

/**
 * What a write did. `saved` is stored. `refused` (the device rejected it) and `newer` (a later build wrote the
 * section) keep the value in effect for this tab; the surface that wrote it shows its status line.
 */
export type PersonSettingsWriteResult = 'saved' | 'refused' | 'newer';

/**
 * The onboarding events these settings report, one plain function each. The app's onboarding emitters satisfy it.
 */
export type PersonSettingsTelemetry = Readonly<{
  viewerPresetSelected: (input: Readonly<{ preset: MousePresetId; suggested: boolean; source: 'settings' }>) => void;
  viewerGizmoSelected: (input: Readonly<{ style: GizmoStyleId; suggested: boolean; source: 'settings' }>) => void;
  viewerDefaultChanged: (input: Readonly<{ level: 'person'; field: string }>) => void;
  viewerOverrideReset: (input: Readonly<{ level: 'person'; field: string }>) => void;
  setupAnswersCleared: () => void;
}>;

/** The person record on this device, its writers, and the host services the settings call. */
export type PersonSettings = Readonly<{
  profile: PersonProfile;
  viewer: ViewerPreferences;
  /** Set or reset profile leaves. */
  writeProfile: (patch: LeafPatch<PersonProfile>) => PersonSettingsWriteResult;
  /** Set or reset viewer-preference leaves. */
  writeViewer: (patch: LeafPatch<ViewerPreferences>) => PersonSettingsWriteResult;
  telemetry: PersonSettingsTelemetry;
  /** The host's analytics, for the viewer's person properties. */
  analytics: ViewerAnalytics;
  /** This device's OS class, such as `linux`, read when a row renders. */
  osClass: () => string;
}>;

const PersonSettingsContext = createContext<PersonSettings | undefined>(undefined);

/**
 * Provides the person record and the host services to the settings below it.
 *
 * @param props - The host's person settings, and the settings that read them.
 * @returns The provider.
 */
export function PersonSettingsProvider({
  value,
  children,
}: {
  readonly value: PersonSettings;
  readonly children: ReactNode;
}): React.JSX.Element {
  return <PersonSettingsContext value={value}>{children}</PersonSettingsContext>;
}

/**
 * The person settings the host app provides.
 *
 * @returns The value from the nearest {@link PersonSettingsProvider}.
 */
export const usePersonSettings = (): PersonSettings => {
  const value = useContext(PersonSettingsContext);
  if (value === undefined) {
    throw new Error('PersonSettingsProvider is missing');
  }
  return value;
};
