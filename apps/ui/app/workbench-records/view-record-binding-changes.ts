/**
 * The view-record binding's two pure functions (graphics event-driven state charter G6; D2, D6, D20; I6, I7): what a
 * foreign view record asks the live owners to adopt, and the record the owners' current values make.
 *
 * They are extracted from `useViewSettingsSync` (`#hooks/use-view-settings-sync.ts`), which stays until the wiring lane
 * (G6b) deletes it. Neither reads an actor's snapshot, a clock or React state: the binding machine holds every value
 * they read and calls them inside its transitions.
 */
import type { CameraOrientation, CameraPose, CameraUpAxis } from '@taucad/camera/machine';
import type { PersistedCameraView, PersistedSectionView } from '@taucad/viewer/graphics/graphics-settings';
import type { GraphicsEvent } from '@taucad/viewer/machines/graphics.machine';
import { lengthUnits } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import { viewCameraOrientation } from '@taucad/workbench-panes/records/view-record';
import type { ViewRecordPatch } from '#workbench-records/view-record-policy.js';

/** The display toggles: the graphics context key, the record key and the graphics event that sets it. */
export const viewDisplayOwners = [
  ['enableSurfaces', 'surfaces', 'setSurfaceVisibility'],
  ['enableLines', 'lines', 'setLinesVisibility'],
  ['enableGizmo', 'gizmo', 'setGizmoVisibility'],
  ['enableGrid', 'grid', 'setGridVisibility'],
  ['enableAxes', 'axes', 'setAxesVisibility'],
  ['enableMatcap', 'matcap', 'setMatcapVisibility'],
  ['enablePostProcessing', 'postProcessing', 'setPostProcessingVisibility'],
] as const;

/** The graphics events a foreign record adopts through: display, grid unit, up direction and pinned measurements. */
export type ViewGraphicsAdoption = Extract<
  GraphicsEvent,
  {
    type:
      | (typeof viewDisplayOwners)[number][2]
      | 'setGridUnit'
      | 'setUpDirection'
      | 'adoptPinnedMeasurements'
      | 'adoptSectionView';
  }
>;

/**
 * The camera fields of a foreign record, adopted in one `adoptPersistedPose` (D2, D15, I8). Field of view and up
 * direction go this way too, never through `setVerticalFieldOfView` or `setUpDirection`, whose person sources would be
 * written back (programme control, 2026-11-10).
 */
export type ViewCameraAdoption = Readonly<{
  pose?: CameraPose;
  orientation?: CameraOrientation;
  verticalFieldOfView?: number;
  upDirection?: CameraUpAxis;
}>;

/** What a foreign record asks the live owners to adopt. Every member is absent when that owner has nothing to adopt. */
export type ViewForeignChanges = Readonly<{
  /** Display, grid unit, up direction and pinned measurements, in that order; each is applied at once. */
  graphics: readonly ViewGraphicsAdoption[];
  /** The section, which the binding adopts only while the person is not editing cuts (the section quiet gate). */
  section?: PersistedSectionView;
  /** The camera's fields; the camera applies them in `input.idle` and drops them otherwise. */
  camera?: ViewCameraAdoption;
}>;

/**
 * The live owners' values a view record holds. `camera` and `fieldOfView` are present only while this view's person
 * made the value the record should hold (D20, I7); absent, the record's own camera and field of view stand.
 */
export type ViewOwners = Readonly<{
  display: WorkbenchView['display'];
  upDirection: WorkbenchView['upDirection'];
  /** The graphics grid unit's symbol; a symbol the record cannot hold keeps the record's unit. */
  gridUnit: string;
  measurements: WorkbenchView['measurements'];
  section: WorkbenchView['section'];
  /** The pose a person made, for the selected kernel view when the record selects one. */
  camera?: PersistedCameraView;
  fieldOfView?: number;
}>;

const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

type ViewCamera = WorkbenchView['camera'];

/** The record's camera for the view it shows: the selected kernel view's, or the default camera. */
export const activeViewCamera = (record: WorkbenchView): ViewCamera => {
  const selected = record.selectedKernelView;
  if (!selected) {
    return record.camera;
  }
  return record.kernelViews?.find((view) => view.id === selected)?.camera ?? { kind: 'preset', preset: 'isometric' };
};

/** A record's camera instruction as the camera adopts it: a pose replaces the pose, a preset or look turns and frames. */
export const cameraAdoptionOf = (
  record: WorkbenchView,
): Readonly<{ pose: CameraPose; orientation?: undefined } | { orientation: CameraOrientation; pose?: undefined }> => {
  const camera = activeViewCamera(record);
  if (camera.kind === 'pose') {
    const { target, direction, up, verticalSpan, perspectiveZoom } = camera;
    return { pose: { target, direction, up, verticalSpan, perspectiveZoom } };
  }
  return { orientation: viewCameraOrientation({ camera, upDirection: record.upDirection })! };
};

/**
 * Whether this view's own write carried the record's active camera.
 *
 * @param record - The record the write produced.
 * @param patch - The fields the write carried.
 * @returns True when the patch holds the camera, or the selected kernel view's camera.
 */
export const ownsCamera = (record: WorkbenchView, patch: ViewRecordPatch | undefined): boolean => {
  if (!patch) {
    return false;
  }
  const selected = record.selectedKernelView;
  if (!selected) {
    return patch.camera !== undefined;
  }
  const change = patch.kernelViews && Object.hasOwn(patch.kernelViews, selected) ? patch.kernelViews[selected] : null;
  return change !== null && change !== undefined && Object.hasOwn(change, 'camera');
};

/* The graphics adoptions: display, grid unit, up direction and pinned measurements, each when it changed. */
const graphicsChanges = (
  previous: WorkbenchView | undefined,
  next: WorkbenchView,
  patch: ViewRecordPatch | undefined,
): ViewGraphicsAdoption[] => {
  const graphics: ViewGraphicsAdoption[] = [];
  for (const [, recordKey, type] of viewDisplayOwners) {
    if (
      !previous ||
      (patch?.display?.[recordKey] === undefined && previous.display[recordKey] !== next.display[recordKey])
    ) {
      graphics.push({ type, payload: next.display[recordKey] });
    }
  }
  if (!previous || (patch?.grid?.unit === undefined && previous.grid.unit !== next.grid.unit)) {
    graphics.push({ type: 'setGridUnit', payload: { unit: next.grid.unit } });
  }
  if (upDirectionChanged(previous, next, patch)) {
    graphics.push({ type: 'setUpDirection', payload: next.upDirection });
  }
  if (!previous || (patch?.measurements === undefined && !same(previous.measurements, next.measurements))) {
    graphics.push({ type: 'adoptPinnedMeasurements', measurements: next.measurements });
  }
  return graphics;
};

const upDirectionChanged = (
  previous: WorkbenchView | undefined,
  next: WorkbenchView,
  patch: ViewRecordPatch | undefined,
): boolean => !previous || (patch?.upDirection === undefined && previous.upDirection !== next.upDirection);

/* The camera adoption: the instruction when the view's camera changed, with field of view and up direction. */
const cameraChanges = (
  previous: WorkbenchView | undefined,
  next: WorkbenchView,
  patch: ViewRecordPatch | undefined,
): ViewCameraAdoption => {
  const cameraChanged =
    !previous ||
    previous.selectedKernelView !== next.selectedKernelView ||
    (!ownsCamera(next, patch) && !same(activeViewCamera(previous), activeViewCamera(next)));
  const fovChanged = !previous || (patch?.fieldOfView === undefined && previous.fieldOfView !== next.fieldOfView);
  return {
    ...(cameraChanged ? cameraAdoptionOf(next) : {}),
    ...(fovChanged ? { verticalFieldOfView: next.fieldOfView } : {}),
    ...(upDirectionChanged(previous, next, patch) ? { upDirection: next.upDirection } : {}),
  };
};

/**
 * What `next` asks the live owners to adopt (the per-field logic of `useViewSettingsSync`'s record effect).
 *
 * @param previous - The record this binding last handled, or `undefined` before the first: then every field adopts.
 * @param next - The record just published.
 * @param patch - The fields this view's own write carried into `next`; they are never adopted. A foreign publication
 *   carries none.
 * @returns The adoptions, per owner.
 */
export function foreignChanges(
  previous: WorkbenchView | undefined,
  next: WorkbenchView,
  patch: ViewRecordPatch | undefined,
): ViewForeignChanges {
  const sectionChanged = !previous || (patch?.section === undefined && !same(previous.section, next.section));
  const camera = cameraChanges(previous, next, patch);
  return {
    graphics: graphicsChanges(previous, next, patch),
    ...(sectionChanged ? { section: next.section } : {}),
    ...(Object.keys(camera).length > 0 ? { camera } : {}),
  };
}

const poseCamera = (pose: PersistedCameraView): Extract<ViewCamera, { kind: 'pose' }> => ({
  kind: 'pose',
  frameId: pose.frameId,
  target: [...pose.target],
  direction: [...pose.direction],
  up: [...pose.up],
  verticalSpan: pose.verticalSpan,
  perspectiveZoom: pose.perspectiveZoom,
});

/**
 * The record the live owners' values make over `base` (`useViewSettingsSync`'s `persist`). Fields no owner holds
 * (the name, the entry, kernel views other than the selected one) stay as `base` has them.
 *
 * @param owners - The owners' current values.
 * @param base - The record the edit is made over: the latest published record.
 * @returns The record to edit to.
 */
export function nextRecord(owners: ViewOwners, base: WorkbenchView): WorkbenchView {
  const camera = owners.camera === undefined ? undefined : poseCamera(owners.camera);
  const selected = base.selectedKernelView;
  return {
    ...base,
    fieldOfView: owners.fieldOfView ?? base.fieldOfView,
    upDirection: owners.upDirection,
    display: { ...owners.display },
    grid: {
      unit: lengthUnits.includes(owners.gridUnit as WorkbenchView['grid']['unit'])
        ? (owners.gridUnit as WorkbenchView['grid']['unit'])
        : base.grid.unit,
    },
    section: owners.section,
    measurements: owners.measurements,
    camera: !selected && camera ? camera : base.camera,
    kernelViews:
      selected && camera
        ? base.kernelViews?.some((view) => view.id === selected)
          ? base.kernelViews.map((view) => (view.id === selected ? { ...view, camera } : view))
          : [...(base.kernelViews ?? []), { id: selected, camera }]
        : base.kernelViews,
  };
}

/** The owner values a record holds, for owners that have adopted it. */
export const ownersOf = (record: WorkbenchView): ViewOwners => ({
  display: record.display,
  upDirection: record.upDirection,
  gridUnit: record.grid.unit,
  measurements: record.measurements,
  section: record.section,
});
