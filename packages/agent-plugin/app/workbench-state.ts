/**
 * The page's half of the saved view (closeout PAR-3): it reads what the project's `.tau/workbench` records keep for a
 * shown model through `app_workbench_state`, and seeds the graphics actor and its camera from it before the model's
 * first frame, the way the Tau app seeds a view from its record. A model of the same entry shown again keeps the live
 * view; another entry, or a reloaded page, starts from its record.
 */
import type { ActorRefFrom } from 'xstate';
import { tauViewerToolName } from '@taucad/mcp/viewer-protocol';
import type {
  TauViewerModel,
  TauViewerViewFields,
  TauViewerViewState,
  TauViewerWorkbenchState,
} from '@taucad/mcp/viewer-protocol';
import { selectGraphicsFramingIdentity } from '@taucad/viewer/machines/graphics.machine';
import type { GraphicsCameraRef, GraphicsPendingPose, graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import type {
  ViewerViewFieldPath,
  ViewerViewFieldValues,
  ViewerViewFields,
} from '@taucad/viewer/cad/viewer-view-fields';

import {
  lengthUnits,
  resolveViewSettings,
  tauViewDefaults,
  viewFieldPaths,
  viewRecordV1Defaults,
  withViewField,
} from '@taucad/workbench';
import type { ViewFieldPath, ViewFieldSource, ViewFieldValues, WorkbenchView } from '@taucad/workbench';
import {
  createSourceModelInteractionUnitId,
  serializeModelComponentDisplayState,
} from '@taucad/viewer/machines/model-interaction.machine';
import {
  graphicsSettingsForView,
  viewCameraOrientation,
  viewSettingsOf,
} from '@taucad/workbench-panes/records/view-record';
import type { HostBridge } from '#app/host-bridge.js';

type GraphicsActorRef = ActorRefFrom<typeof graphicsMachine>;

/** The entry the page's framing frames. */
const selectFramedEntry = (graphicsRef: GraphicsActorRef): string | undefined =>
  selectGraphicsFramingIdentity(graphicsRef.getSnapshot());

/** A saved view's camera, as the pose framing applies after the entry's first frame. */
const pendingPoseOf = (record: WorkbenchView | undefined, entryPath: string): GraphicsPendingPose | undefined => {
  if (record === undefined) {
    return undefined;
  }
  const requestId = `saved:${entryPath}`;
  if (record.camera.kind === 'pose') {
    return { requestId, pose: record.camera };
  }
  const orientation = viewCameraOrientation(record);
  return orientation === undefined ? undefined : { requestId, orientation };
};

/**
 * The entry a shown model's records are kept under: its source, or the drawn file when it has none.
 *
 * @param model - The shown model.
 * @returns The project-relative entry path.
 */
export const entryPathOf = (model: TauViewerModel): string => model.sourceFile ?? model.path;

/**
 * Read the saved view of a shown model.
 *
 * @param callTool - The bridge's tool call.
 * @param model - The shown model.
 * @returns The saved state, or `undefined` when the server keeps none or is older than the tool.
 */
export const readWorkbenchState = async (
  callTool: HostBridge['callTool'],
  model: TauViewerModel,
): Promise<TauViewerWorkbenchState | undefined> => {
  try {
    const result = await callTool(tauViewerToolName.appWorkbenchState, { modelId: model.id });
    return typeof result === 'object' && result !== null ? (result as TauViewerWorkbenchState) : undefined;
  } catch {
    /* An older server, or a model it no longer shows: the page opens with its defaults. */
    return undefined;
  }
};

/** Where each leaf a seed showed comes from; a leaf it left alone is absent. */
type SeededSources = Readonly<Partial<Record<ViewFieldPath, ViewFieldSource>>>;

/**
 * Seed the graphics actor, its camera and the entry's component display from the saved view, before the model's
 * first frame. Only a new entry is seeded: one already on screen keeps what the person did since.
 *
 * @param graphicsRef - The page's graphics actor.
 * @param entryPath - The shown model's entry.
 * @param saved - What the records keep for it.
 * @returns Where each seeded leaf's value comes from, for {@link PageViewFields.seed}, or `undefined` when the entry
 * was already on screen and nothing was seeded.
 */
export const seedViewer = (
  graphicsRef: GraphicsActorRef,
  entryPath: string,
  saved: TauViewerWorkbenchState | undefined,
): SeededSources | undefined => {
  if (selectFramedEntry(graphicsRef) === entryPath) {
    return undefined;
  }
  const { context } = graphicsRef.getSnapshot();
  const view = saved?.view;
  const stored: WorkbenchView | undefined = view === undefined ? undefined : { ...view, version: 1, entryPath };
  /* The page has no person: a leaf the view does not set shows Tau's value. */
  const resolved = stored === undefined ? undefined : resolveViewSettings({ tau: tauViewDefaults, view: stored });
  const record = stored === undefined || resolved === undefined ? undefined : rendered(stored, resolved.values);
  /* A new entry is framed again, and the saved pose or side is applied over its first frame. */
  const pendingPose = pendingPoseOf(record, entryPath);
  graphicsRef.send({ type: 'entryChanged', identity: entryPath, ...(pendingPose ? { pendingPose } : {}) });
  if (record === undefined) {
    /* Cuts and measurements belong to the geometry they were made on. */
    graphicsRef.send({ type: 'adoptSectionView', section: { active: false, cuts: [] } });
    graphicsRef.send({ type: 'adoptPinnedMeasurements', measurements: [] });
  } else {
    const settings = graphicsSettingsForView(record);
    const visibility = [
      ['enableSurfaces', 'setSurfaceVisibility'],
      ['enableLines', 'setLinesVisibility'],
      ['enableGizmo', 'setGizmoVisibility'],
      ['enableGrid', 'setGridVisibility'],
      ['enableAxes', 'setAxesVisibility'],
      ['enableMatcap', 'setMatcapVisibility'],
      ['enablePostProcessing', 'setPostProcessingVisibility'],
    ] as const;
    for (const [key, type] of visibility) {
      if (context[key] !== settings[key]) {
        graphicsRef.send({ type, payload: settings[key] });
      }
    }
    if (context.upDirection !== settings.upDirection) {
      graphicsRef.send({ type: 'setUpDirection', payload: settings.upDirection });
    }
    if (context.displayUnits.length.symbol !== record.grid.unit) {
      graphicsRef.send({ type: 'setGridUnit', payload: { unit: record.grid.unit } });
    }
    graphicsRef.send({ type: 'adoptSectionView', section: record.section });
    graphicsRef.send({ type: 'adoptPinnedMeasurements', measurements: settings.pinnedMeasurements ?? [] });
    context.cameraRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: record.fieldOfView });
  }
  const components = saved?.components;
  if (components !== undefined) {
    const interaction = context.modelInteractionRef;
    const unitId = createSourceModelInteractionUnitId(entryPath);
    const live = interaction.getSnapshot().context.unitsById[unitId];
    interaction.send({
      type: 'restoreComponentDisplay',
      componentDisplay: {
        schemaVersion: 1,
        unitsById: {
          ...serializeModelComponentDisplayState(interaction.getSnapshot().context)?.unitsById,
          [unitId]: {
            hiddenComponentIds: [...components.hidden],
            isolatedComponentIds: [...components.isolated],
            opacityByComponentId: { ...live?.opacityByComponentId },
          },
        },
      },
    });
  }
  return resolved?.sources ?? {};
};

/** The page's camera actor. */
const selectCamera = (graphicsRef: GraphicsActorRef): GraphicsCameraRef => graphicsRef.getSnapshot().context.cameraRef;

/** The camera's requested vertical field of view. */
const selectRequestedFieldOfView = (graphicsRef: GraphicsActorRef): number =>
  selectCamera(graphicsRef).getSnapshot().context.view.requestedVerticalFieldOfView;

/**
 * The live view's section and pinned measurements, as the page reports them for the server to keep. The inheritable
 * leaves are not among them: the page reports those only as the person's commands ({@link PageViewFields.commanded}).
 *
 * @param graphicsRef - The page's graphics actor.
 * @returns The settings, or `undefined` before the page seeds the viewer for an entry.
 */
export const liveViewSettings = (graphicsRef: GraphicsActorRef): TauViewerViewState['settings'] => {
  const snapshot = graphicsRef.getSnapshot();
  /* Seeding names the entry to framing; an SVG model has a view camera but no canvas or controls adapter. */
  if (selectGraphicsFramingIdentity(snapshot) === undefined) {
    return undefined;
  }
  const { section, measurements } = viewSettingsOf(snapshot.context, selectRequestedFieldOfView(graphicsRef));
  return { section, measurements };
};

/** A record holding each resolved leaf, so seeding renders what resolution shows. */
const rendered = (record: WorkbenchView, values: Readonly<ViewFieldValues>): WorkbenchView => {
  let next = record;
  for (const leaf of viewFieldPaths) {
    next = renderedLeaf(next, values, leaf);
  }
  return next;
};
const renderedLeaf = <Leaf extends ViewFieldPath>(
  record: WorkbenchView,
  values: Readonly<ViewFieldValues>,
  leaf: Leaf,
): WorkbenchView => withViewField(record, leaf, values[leaf]);

/** The graphics event that shows each display leaf. */
const displayEvents = {
  'display.surfaces': 'setSurfaceVisibility',
  'display.lines': 'setLinesVisibility',
  'display.gizmo': 'setGizmoVisibility',
  'display.grid': 'setGridVisibility',
  'display.axes': 'setAxesVisibility',
  'display.matcap': 'setMatcapVisibility',
  'display.postProcessing': 'setPostProcessingVisibility',
} as const;

const isLengthUnit = (unit: string): unit is ViewFieldValues['grid.unit'] =>
  (lengthUnits as readonly string[]).includes(unit);

/* Show one leaf's value on the live graphics owner. */
const show = <Leaf extends ViewerViewFieldPath>(
  graphicsRef: GraphicsActorRef,
  leaf: Leaf,
  value: ViewerViewFieldValues[Leaf],
): void => {
  switch (leaf) {
    case 'upDirection': {
      graphicsRef.send({ type: 'setUpDirection', payload: value as ViewFieldValues['upDirection'] });
      break;
    }
    case 'fieldOfView': {
      selectCamera(graphicsRef).send({ type: 'setVerticalFieldOfView', verticalFieldOfView: value as number });
      break;
    }
    case 'grid.unit': {
      graphicsRef.send({ type: 'setGridUnit', payload: { unit: value as string } });
      break;
    }
    default: {
      graphicsRef.send({ type: displayEvents[leaf as keyof typeof displayEvents], payload: value as boolean });
    }
  }
};

/**
 * The page's view commands: the bar's settings menu, G and P keys and grid unit call these instead of changing the
 * live graphics owner, so the page can tell the server which inheritable leaves the person set, and no other.
 *
 * @public
 */
export type PageViewFields = ViewerViewFields &
  Readonly<{
    /** Start a newly seeded entry: no leaf commanded yet, and each leaf's source as resolution gave it. */
    seed: (sources: SeededSources) => void;
    /** The leaves the person set or reset since the entry was seeded, with the values to write. */
    commanded: () => TauViewerViewFields;
  }>;

/**
 * Create the page's view commands over its graphics actor. A set shows the value at once and is reported as the
 * view's own; a reset shows Tau's value and is reported as the format value, so the leaf inherits again.
 *
 * @param graphicsRef - The page's graphics actor.
 * @returns The commands.
 */
export const createPageViewFields = (graphicsRef: GraphicsActorRef): PageViewFields => {
  let commanded: Partial<Record<ViewFieldPath, ViewFieldValues[ViewFieldPath]>> = {};
  let sources: Partial<Record<ViewFieldPath, ViewFieldSource>> = {};
  return {
    set(leaf, value) {
      if (leaf === 'grid.unit' && !isLengthUnit(value as string)) {
        return;
      }
      commanded = { ...commanded, [leaf]: value };
      sources = { ...sources, [leaf]: 'view' };
      show(graphicsRef, leaf, value);
    },
    reset(leaf) {
      commanded = { ...commanded, [leaf]: viewRecordV1Defaults[leaf] };
      sources = { ...sources, [leaf]: 'tau' };
      show(graphicsRef, leaf, tauViewDefaults[leaf]);
    },
    sourceOf: (leaf) => sources[leaf] ?? 'tau',
    seed(next) {
      commanded = {};
      sources = { ...next };
    },
    commanded: () => commanded as TauViewerViewFields,
  };
};
