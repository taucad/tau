/**
 * The view-record binding's two pure functions (graphics event-driven state charter G6; D2, D6, D20; I6, I7): what a
 * foreign view record asks the live owners to adopt, and the record the owners' current values make.
 *
 * They were extracted from `useViewSettingsSync`, which the wiring lane (G6b) deleted. Neither reads an actor's
 * snapshot, a clock or React state: the binding machine holds every value they read and calls them inside its
 * transitions.
 *
 * The ten inheritable leaves (up direction, field of view, the seven display flags and the grid unit) are command-written
 * and resolver-seeded (graphics charter ruling of 2026-11-12, amending D20, I6 and I7 for those leaves; onboarding
 * blueprint Finding 6): the live owners adopt `resolveViewSettings` output whenever the record (of any origin), the
 * person's defaults or the exceptions change, and {@link nextRecord} never writes them from the live owners. Camera,
 * section and measurements keep the charter's rule.
 */
import type { CameraOrientation, CameraPose, CameraUpAxis } from '@taucad/camera/machine';
import type { PersistedCameraView, PersistedSectionView } from '@taucad/viewer/graphics/graphics-settings';
import type { GraphicsEvent } from '@taucad/viewer/machines/graphics.machine';
import { resolveViewSettings, tauViewDefaults } from '@taucad/workbench';
import type { PersonViewFieldDefaults, ViewFieldPath, ViewFieldValues, WorkbenchView } from '@taucad/workbench';
import { viewCameraOrientation } from '@taucad/workbench-panes/records/view-record';
import type { ViewRecordPatch } from '#workbench-records/view-record-policy.js';

/** The display toggles: the graphics context key, the leaf path and the graphics event that sets it. */
export const viewDisplayOwners = [
  ['enableSurfaces', 'display.surfaces', 'setSurfaceVisibility'],
  ['enableLines', 'display.lines', 'setLinesVisibility'],
  ['enableGizmo', 'display.gizmo', 'setGizmoVisibility'],
  ['enableGrid', 'display.grid', 'setGridVisibility'],
  ['enableAxes', 'display.axes', 'setAxesVisibility'],
  ['enableMatcap', 'display.matcap', 'setMatcapVisibility'],
  ['enablePostProcessing', 'display.postProcessing', 'setPostProcessingVisibility'],
] as const;

/**
 * The levels above a view that its inheritable leaves resolve over: the person's defaults (absent on a host with no
 * person, or with `viewerControls` off) and this device's exceptions for the view.
 */
export type ViewResolutionLevels = Readonly<{
  person?: PersonViewFieldDefaults;
  exceptions?: readonly ViewFieldPath[];
}>;

/**
 * What the live owners show for a view's ten inheritable leaves.
 *
 * @param record - The view record.
 * @param levels - The levels above it.
 * @returns The resolved values.
 */
export const resolvedViewFields = (
  record: WorkbenchView,
  levels: ViewResolutionLevels = {},
): Readonly<ViewFieldValues> =>
  resolveViewSettings({
    tau: tauViewDefaults,
    ...(levels.person ? { person: levels.person } : {}),
    ...(levels.exceptions ? { exceptions: levels.exceptions } : {}),
    view: record,
  }).values;

/** The graphics events a foreign record adopts through: display, grid unit, up direction and pinned measurements. */
export type ViewGraphicsAdoption = Extract<
  GraphicsEvent,
  {
    type:
      | (typeof viewDisplayOwners)[number][2]
      | 'setGridUnit'
      | 'adoptUpDirection'
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
 * The live owners' values a view record holds. `camera` is present only while this view's person made the pose the
 * record should hold (D20, I7); absent, the record's own camera stands. The ten inheritable leaves are not here: they
 * are written by view commands only.
 */
export type ViewOwners = Readonly<{
  measurements: WorkbenchView['measurements'];
  section: WorkbenchView['section'];
  /** The pose a person made, for the selected kernel view when the record selects one. */
  camera?: PersistedCameraView;
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

/* Resolved leaves before and after; a leaf adopts when there was no `previous` or its resolution changed. */
type Resolution = Readonly<{
  before: Readonly<ViewFieldValues> | undefined;
  after: Readonly<ViewFieldValues>;
}>;

/* One publication as the adoption rules read it. */
type Publication = Readonly<{
  previous: WorkbenchView | undefined;
  next: WorkbenchView;
  patch: ViewRecordPatch | undefined;
  resolution: Resolution;
}>;

const seeds = (resolution: Resolution, leaf: ViewFieldPath): boolean =>
  resolution.before === undefined || resolution.before[leaf] !== resolution.after[leaf];

/* The graphics adoptions: display, grid unit and up direction when their resolution changed, whatever wrote the
 * record (a view command's write included), and pinned measurements when another view changed them. */
const graphicsChanges = ({ previous, next, patch, resolution }: Publication): ViewGraphicsAdoption[] => {
  const graphics: ViewGraphicsAdoption[] = [];
  for (const [, leaf, type] of viewDisplayOwners) {
    if (seeds(resolution, leaf)) {
      graphics.push({ type, payload: resolution.after[leaf] });
    }
  }
  if (seeds(resolution, 'grid.unit')) {
    graphics.push({ type: 'setGridUnit', payload: { unit: resolution.after['grid.unit'] } });
  }
  if (seeds(resolution, 'upDirection')) {
    graphics.push({ type: 'adoptUpDirection', payload: resolution.after.upDirection });
  }
  if (!previous || (patch?.measurements === undefined && !same(previous.measurements, next.measurements))) {
    graphics.push({ type: 'adoptPinnedMeasurements', measurements: next.measurements });
  }
  return graphics;
};

/* The camera adoption: the instruction when the view's camera changed, with field of view and up direction when their
 * resolution changed. */
const cameraChanges = ({ previous, next, patch, resolution }: Publication): ViewCameraAdoption => {
  const cameraChanged =
    !previous ||
    previous.selectedKernelView !== next.selectedKernelView ||
    (!ownsCamera(next, patch) && !same(activeViewCamera(previous), activeViewCamera(next)));
  return {
    ...(cameraChanged ? cameraAdoptionOf(next) : {}),
    ...(seeds(resolution, 'fieldOfView') ? { verticalFieldOfView: resolution.after.fieldOfView } : {}),
    ...(seeds(resolution, 'upDirection') ? { upDirection: resolution.after.upDirection } : {}),
  };
};

/** What a publication carried and the levels it resolves over (see {@link foreignChanges}). */
export type ForeignChangeOptions = Readonly<{
  patch?: ViewRecordPatch;
  levels?: ViewResolutionLevels;
  previousLevels?: ViewResolutionLevels;
}>;

/**
 * What `next` asks the live owners to adopt (the per-field logic of `useViewSettingsSync`'s record effect).
 *
 * @param previous - The record this binding last handled, or `undefined` before the first: then every field adopts.
 * @param next - The record just published.
 * @param options - `patch`: the fields this view's own write carried into `next`; camera, section and measurements in
 *   it are never adopted, and a foreign publication carries none. `levels`: the levels `next` resolves over.
 *   `previousLevels`: the levels `previous` resolved over, the same as `levels` unless they changed.
 * @returns The adoptions, per owner.
 */
export function foreignChanges(
  previous: WorkbenchView | undefined,
  next: WorkbenchView,
  options: ForeignChangeOptions = {},
): ViewForeignChanges {
  const { patch, levels = {}, previousLevels = levels } = options;
  const resolution: Resolution = {
    before: previous ? resolvedViewFields(previous, previousLevels) : undefined,
    after: resolvedViewFields(next, levels),
  };
  const publication: Publication = { previous, next, patch, resolution };
  const sectionChanged = !previous || (patch?.section === undefined && !same(previous.section, next.section));
  const camera = cameraChanges(publication);
  return {
    graphics: graphicsChanges(publication),
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
 * (the name, the entry, kernel views other than the selected one) stay as `base` has them, and so do the ten
 * inheritable leaves (`base.display`, `base.fieldOfView`, `base.upDirection`, `base.grid`): view commands write them.
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
  measurements: record.measurements,
  section: record.section,
});
