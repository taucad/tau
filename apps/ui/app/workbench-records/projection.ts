/* oxlint-disable typescript/no-restricted-types -- Entry path is nullable in the workbench record schema. */
import { workbenchRecords } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import { defaultGraphicsSettings } from '@taucad/viewer/graphics/graphics-settings';
import type { GraphicsViewSettings } from '@taucad/viewer/graphics/graphics-settings';
import { canonicalCaptureViews } from '@taucad/agent-tools/capture';
import * as THREE from 'three';
import { resolveCameraUp } from '@taucad/viewer/graphics/three/utils/camera-controls-adapter';

/** Translate a portable view into the existing graphics owner's create-only seed. */
export const graphicsSettingsForView = (record: WorkbenchView): GraphicsViewSettings => ({
  ...defaultGraphicsSettings,
  enableSurfaces: record.display.surfaces,
  enableLines: record.display.lines,
  enableGizmo: record.display.gizmo,
  enableGrid: record.display.grid,
  enableAxes: record.display.axes,
  enableMatcap: record.display.matcap,
  enablePostProcessing: record.display.postProcessing,
  upDirection: record.upDirection,
  cameraFovAngle: record.fieldOfView,
  ...(record.camera.kind === 'pose' ? { cameraView: record.camera } : {}),
  sectionView: record.section,
  pinnedMeasurements: record.measurements.map((measurement) => ({ ...measurement })),
});

/** Preserve the active viewer's display choices when a person opens another view. */
export const newViewRecord = (entryPath: string | null, settings?: GraphicsViewSettings): WorkbenchView =>
  workbenchRecords.view.schema.parse({
    version: 1,
    entryPath,
    ...(settings
      ? {
          fieldOfView: settings.cameraFovAngle,
          upDirection: settings.upDirection,
          display: {
            surfaces: settings.enableSurfaces,
            lines: settings.enableLines,
            gizmo: settings.enableGizmo,
            grid: settings.enableGrid,
            axes: settings.enableAxes,
            matcap: settings.enableMatcap,
            postProcessing: settings.enablePostProcessing,
          },
          ...(settings.cameraView ? { camera: { kind: 'pose', ...settings.cameraView } } : {}),
        }
      : {}),
  });

/** Camera direction and up shared by live adoption and the rendered capture parity check. */
export const viewCameraOrientation = (
  record: WorkbenchView,
):
  | Readonly<{
      direction: [number, number, number];
      up: [number, number, number];
    }>
  | undefined => {
  if (record.camera.kind === 'pose') {
    return undefined;
  }
  const instruction = record.camera;
  const recipe =
    instruction.kind === 'preset' && instruction.preset !== 'isometric'
      ? canonicalCaptureViews.find((view) => view.id === instruction.preset)
      : undefined;
  const direction =
    instruction.kind === 'look'
      ? instruction.direction
      : (recipe?.direction ?? ([Math.sqrt(3 / 8), -Math.sqrt(3 / 8), 0.5] as const));
  const preferred =
    instruction.kind === 'look' && instruction.up
      ? instruction.up
      : (recipe?.up ??
        (record.upDirection === 'x'
          ? ([1, 0, 0] as const)
          : record.upDirection === 'y'
            ? ([0, 1, 0] as const)
            : ([0, 0, 1] as const)));
  const up = resolveCameraUp({
    direction: new THREE.Vector3(...direction),
    preferredUp: new THREE.Vector3(...preferred),
    fallbackUp: new THREE.Vector3(0, 1, 0),
  });
  return { direction: [...direction], up: [up.x, up.y, up.z] };
};
