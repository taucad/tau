/**
 * The page's half of the saved view (closeout PAR-3): it reads what the project's `.tau/workbench` records keep for a
 * shown model through `app_workbench_state`, and seeds the graphics actor and its camera from it before the model's
 * first frame, the way the Tau app seeds a view from its record. A model of the same entry shown again keeps the live
 * view; another entry, or a reloaded page, starts from its record.
 */
import type { ActorRefFrom } from 'xstate';
import { tauViewerToolName } from '@taucad/mcp/viewer-protocol';
import type { TauViewerModel, TauViewerViewSettings, TauViewerWorkbenchState } from '@taucad/mcp/viewer-protocol';
import { selectGraphicsFramingIdentity } from '@taucad/viewer/machines/graphics.machine';
import type { GraphicsPendingPose, graphicsMachine } from '@taucad/viewer/machines/graphics.machine';

import type { WorkbenchView } from '@taucad/workbench';
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

/**
 * Seed the graphics actor, its camera and the entry's component display from the saved view, before the model's
 * first frame. Only a new entry is seeded: one already on screen keeps what the person did since.
 *
 * @param graphicsRef - The page's graphics actor.
 * @param entryPath - The shown model's entry.
 * @param saved - What the records keep for it.
 */
export const seedViewer = (
  graphicsRef: GraphicsActorRef,
  entryPath: string,
  saved: TauViewerWorkbenchState | undefined,
): void => {
  if (selectFramedEntry(graphicsRef) === entryPath) {
    return;
  }
  const { context } = graphicsRef.getSnapshot();
  const view = saved?.view;
  const record: WorkbenchView | undefined = view === undefined ? undefined : { ...view, version: 1, entryPath };
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
};

/**
 * The live view's settings, as the page reports them for the server to keep.
 *
 * @param graphicsRef - The page's graphics actor.
 * @returns The settings, or `undefined` before the page seeds the viewer for an entry.
 */
export const liveViewSettings = (graphicsRef: GraphicsActorRef): TauViewerViewSettings | undefined => {
  const snapshot = graphicsRef.getSnapshot();
  const { context } = snapshot;
  /* Seeding names the entry to framing; an SVG model has a view camera but no canvas or controls adapter. */
  return selectGraphicsFramingIdentity(snapshot) === undefined
    ? undefined
    : viewSettingsOf(context, context.cameraRef.getSnapshot().context.view.requestedVerticalFieldOfView);
};
