/**
 * The page's half of the saved view (closeout PAR-3): it reads what the project's `.tau/workbench` records keep for a
 * shown model through `app_workbench_state`, and seeds the graphics actor and its camera from it before the model's
 * first frame, the way the Tau app seeds a view from its record. A model of the same entry shown again keeps the live
 * view; another entry, or a reloaded page, starts from its record.
 */
import type { ActorRefFrom } from 'xstate';
import { tauViewerToolName } from '@taucad/mcp/viewer-protocol';
import type { TauViewerModel, TauViewerViewSettings, TauViewerWorkbenchState } from '@taucad/mcp/viewer-protocol';
import type { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import type { WorkbenchView } from '@taucad/workbench';
import {
  createSourceModelInteractionUnitId,
  serializeModelComponentDisplayState,
} from '@taucad/viewer/machines/model-interaction.machine';
import { acquireViewCameraSession, getViewCameraSession } from '@taucad/viewer/services/graphics-camera-registry';
import {
  graphicsSettingsForView,
  viewCameraOrientation,
  viewSettingsOf,
} from '@taucad/workbench-panes/records/view-record';
import type { HostBridge } from '#app/host-bridge.js';

type GraphicsActorRef = ActorRefFrom<typeof graphicsMachine>;

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
  if (getViewCameraSession(graphicsRef)?.framing.identity === entryPath) {
    return;
  }
  const view = saved?.view;
  const record: WorkbenchView | undefined = view === undefined ? undefined : { ...view, version: 1, entryPath };
  /* A new identity re-arms the first-frame framing, with the saved pose to apply once the model is framed. */
  const session = acquireViewCameraSession(graphicsRef, {
    identity: entryPath,
    camera: { cameraView: record?.camera.kind === 'pose' ? record.camera : undefined },
  });
  const { context } = graphicsRef.getSnapshot();
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
    const rig = session.rig.actorRef;
    rig.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: record.fieldOfView });
    const orientation = viewCameraOrientation(record);
    if (orientation !== undefined) {
      /* A preset or a look: face the model from that side, and let the first frame fit it without turning. */
      const current = rig.getSnapshot().context.view;
      rig.send({ type: 'setView', target: current.target, ...orientation, verticalSpan: current.verticalSpan });
      // oxlint-disable-next-line react/immutability -- The framing record is session state the first frame consumes.
      session.framing.preserveOrientationOnFirstFrame = true;
    }
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
 * @returns The settings, or `undefined` before the camera exists.
 */
export const liveViewSettings = (graphicsRef: GraphicsActorRef): TauViewerViewSettings | undefined => {
  const session = getViewCameraSession(graphicsRef);
  return session === undefined
    ? undefined
    : viewSettingsOf(
        graphicsRef.getSnapshot().context,
        session.rig.actorRef.getSnapshot().context.view.requestedVerticalFieldOfView,
      );
};
