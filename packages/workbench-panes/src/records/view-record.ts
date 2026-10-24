/**
 * The translation between a portable view record (`.tau/workbench/views/<id>.json`) and the viewer's live owners,
 * shared by the Tau app and the agent plugin page so a view written by one opens the same way in the other.
 *
 * - {@link graphicsSettingsForView}: a record as the graphics owner's create-only seed.
 * - {@link newViewRecord}: a new view that keeps the active viewer's display choices.
 * - {@link viewCameraOrientation}: the direction and up of a preset or look camera.
 * - {@link viewSettingsOf}: the live graphics owner's view fields besides its camera, as a record holds them.
 */
import * as THREE from 'three';
import { cameraPresetOrientations, lengthUnits, workbenchRecords } from '@taucad/workbench';
import type { ViewSettings, WorkbenchView } from '@taucad/workbench';
import { defaultGraphicsSettings } from '@taucad/viewer/graphics/graphics-settings';
import type {
  GraphicsViewSettings,
  PersistedSectionCut,
  PinnedMeasurement,
} from '@taucad/viewer/graphics/graphics-settings';
import type { SectionCut } from '@taucad/viewer/graphics/section-cuts';
import { resolveCameraUp } from '@taucad/viewer/graphics/three/utils/camera-controls-adapter';

/**
 * Translate a portable view into the graphics owner's create-only seed.
 *
 * @param record - The view record.
 * @returns The graphics settings the record names; a preset or look camera leaves `cameraView` unset.
 * @public
 */
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

/**
 * A new view of an entry that keeps the active viewer's display choices when a person opens another view.
 *
 * @param entryPath - The entry the view renders; `null` shows the file picker.
 * @param settings - The active viewer's settings, when there is one.
 * @returns The view record.
 * @public
 */
// oxlint-disable-next-line typescript/no-restricted-types -- Entry path is nullable in the workbench record schema.
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

/**
 * The camera direction and up a preset or look instruction names, shared by live adoption and the rendered capture
 * parity check.
 *
 * @param record - The view record.
 * @returns The orientation, or `undefined` for a pose, which names its own.
 * @public
 */
export const viewCameraOrientation = (
  record: Pick<WorkbenchView, 'camera' | 'upDirection'>,
): Readonly<{ direction: [number, number, number]; up: [number, number, number] }> | undefined => {
  if (record.camera.kind === 'pose') {
    return undefined;
  }
  const instruction = record.camera;
  const preset = instruction.kind === 'preset' ? cameraPresetOrientations[instruction.preset] : undefined;
  const direction = instruction.kind === 'look' ? instruction.direction : preset!.direction;
  const preferred =
    instruction.kind === 'look' && instruction.up
      ? instruction.up
      : (preset?.up ??
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

/**
 * A section cut's values without its id, which is made anew at every load.
 *
 * @param cut - The live cut.
 * @returns The cut as a record holds it.
 * @public
 */
export const toPersistedSectionCut = (cut: SectionCut): PersistedSectionCut =>
  cut.kind === 'plane'
    ? { kind: 'plane', plane: cut.plane, offset: cut.offset, isFlipped: cut.isFlipped }
    : { kind: 'revolution', axis: cut.axis, origin: cut.origin, start: cut.start, sweep: cut.sweep };

/**
 * Pinned measurements as a record holds them: the points, distance and name, without the owner's evidence.
 *
 * @param measurements - The owner's pinned measurements.
 * @returns The record's measurements.
 * @public
 */
export const toViewMeasurements = (measurements: readonly PinnedMeasurement[]): ViewSettings['measurements'] =>
  measurements.map(({ id, frameId, startPoint, endPoint, distance, name }) => ({
    id,
    frameId,
    startPoint,
    endPoint,
    distance,
    ...(name ? { name } : {}),
  }));

/** The graphics owner's context fields {@link viewSettingsOf} reads. */
type GraphicsViewContext = Readonly<{
  enableSurfaces: boolean;
  enableLines: boolean;
  enableGizmo: boolean;
  enableGrid: boolean;
  enableAxes: boolean;
  enableMatcap: boolean;
  enablePostProcessing: boolean;
  upDirection: 'x' | 'y' | 'z';
  displayUnits: Readonly<{ length: Readonly<{ symbol: string }> }>;
  isSectionViewActive: boolean;
  sectionCuts: readonly SectionCut[];
  measurements: ReadonlyArray<PinnedMeasurement & Readonly<{ isPinned?: boolean }>>;
}>;

const isLengthUnit = (unit: string): unit is ViewSettings['grid']['unit'] =>
  lengthUnits.includes(unit as ViewSettings['grid']['unit']);

/**
 * The live view fields besides the camera, as a view record holds them.
 *
 * @param context - The graphics owner's context.
 * @param fieldOfView - The camera's requested vertical field of view in degrees.
 * @returns The record's display, grid, field of view, up direction, section and pinned measurements.
 * @public
 */
export const viewSettingsOf = (context: GraphicsViewContext, fieldOfView: number): ViewSettings => ({
  fieldOfView,
  upDirection: context.upDirection,
  display: {
    surfaces: context.enableSurfaces,
    lines: context.enableLines,
    gizmo: context.enableGizmo,
    grid: context.enableGrid,
    axes: context.enableAxes,
    matcap: context.enableMatcap,
    postProcessing: context.enablePostProcessing,
  },
  grid: { unit: isLengthUnit(context.displayUnits.length.symbol) ? context.displayUnits.length.symbol : 'mm' },
  section: { active: context.isSectionViewActive, cuts: context.sectionCuts.map((cut) => toPersistedSectionCut(cut)) },
  measurements: toViewMeasurements(context.measurements.filter((measurement) => measurement.isPinned)),
});
