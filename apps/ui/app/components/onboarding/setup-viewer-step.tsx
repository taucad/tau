import type { DeviceRecord, MousePresetId, PersonProfile, ViewerPreferences } from '@taucad/preferences';
import type { GizmoChoiceId } from '#components/onboarding/setup-copy.js';

/** What step 3 reads and writes. */
export type SetupViewerStepProps = Readonly<{
  profile: PersonProfile;
  viewer: ViewerPreferences;
  device: DeviceRecord;
  onPresetChange: (preset: MousePresetId) => void;
  onGizmoChange: (choice: GizmoChoiceId) => void;
  onTrackpadChange: (isTrackpad: boolean) => void;
}>;

/**
 * Step 3, the viewer choices. T6.3 fills it in.
 *
 * @param _properties - The record and its writers.
 * @returns Nothing yet.
 */
export function SetupViewerStep(_properties: SetupViewerStepProps): React.JSX.Element | undefined {
  return undefined;
}
