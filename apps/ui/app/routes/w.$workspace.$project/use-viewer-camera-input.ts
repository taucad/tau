import { useMemo } from 'react';
import { effectiveGizmoStyle, effectivePreset } from '@taucad/preferences';
import type { PersonProfile, ViewerPreferences } from '@taucad/preferences';
import type { CameraInput } from '@taucad/viewer/graphics/three/controls/camera-wheel-router';
import type { GizmoStyleId } from '@taucad/viewer/graphics/three/controls/viewport-gizmo-styles';
import { useFeature } from '#flags/use-feature.js';
import { usePersonRecord } from '#preferences/use-person-record.js';

/** What the project viewer passes `CadViewer` for the person's navigation; empty keeps today's bindings. */
export type ViewerCameraInputProps = Readonly<{ cameraInput?: CameraInput; gizmoStyle?: GizmoStyleId }>;

/**
 * The person's camera input and gizmo style: the stored preset, else the suggestion for the tool answer (never
 * stored, so a changed answer still moves it, C9); the three toggles as stored, absent
 * where unset so the viewer applies its built-in values; and the stored gizmo style, else the suggestion. With the
 * `viewerControls` flag off, nothing, so the viewer keeps today's bindings and cube.
 *
 * @param input - Whether `viewerControls` is on, and the person record.
 * @returns The props for `CadViewer`.
 */
export const resolveViewerCameraInput = ({
  enabled,
  profile,
  viewer,
}: Readonly<{
  enabled: boolean;
  profile: PersonProfile;
  viewer: ViewerPreferences;
}>): ViewerCameraInputProps => {
  if (!enabled) {
    return {};
  }
  const { zoomToCursor, orbitAboutCursor, invertZoom } = viewer.controls;
  return {
    cameraInput: {
      preset: effectivePreset(viewer, profile),
      ...(zoomToCursor === undefined ? {} : { zoomToCursor }),
      ...(orbitAboutCursor === undefined ? {} : { orbitAboutCursor }),
      ...(invertZoom === undefined ? {} : { invertZoom }),
    },
    gizmoStyle: effectiveGizmoStyle(viewer, profile),
  };
};

/**
 * {@link resolveViewerCameraInput} from the person record on this device and the `viewerControls` flag. A change to the
 * record, in this tab or another, reaches every open viewer without a reload.
 *
 * @returns The props for `CadViewer`.
 */
export const useViewerCameraInput = (): ViewerCameraInputProps => {
  const enabled = useFeature('viewerControls');
  const { profile, viewer } = usePersonRecord();
  return useMemo(() => resolveViewerCameraInput({ enabled, profile, viewer }), [enabled, profile, viewer]);
};
