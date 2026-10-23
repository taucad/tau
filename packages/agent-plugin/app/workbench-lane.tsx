/**
 * The tab's workbench panes (viewer parity R1, R3, PAR-9): the Tau app's own Parameters, Model, Kinematics, Export,
 * Share and Files panes from `@taucad/workbench-panes`, in a lane beside the canvas, each fed by a page source over the
 * host bridge.
 */
import { useEffect, useMemo } from 'react';
import type { TauViewerEntryStatus, TauViewerModel } from '@taucad/mcp/viewer-protocol';
import { WorkbenchPanesHostProvider } from '@taucad/workbench-panes/host/workbench-host';
import type { GraphicsRef, WorkbenchPanesHost, WorkbenchUnit } from '@taucad/workbench-panes/host/workbench-host';
import { ExportPane } from '@taucad/workbench-panes/export/export-pane';
import { FilesPane } from '@taucad/workbench-panes/files/files-pane';
import { KinematicsPane } from '@taucad/workbench-panes/kinematics/kinematics-pane';
import { PaneLane } from '@taucad/workbench-panes/lane/pane-lane';
import { ModelPane } from '@taucad/workbench-panes/model/model-pane';
import { ParametersPane } from '@taucad/workbench-panes/parameters/parameters-pane';
import type { ModelSource } from '@taucad/workbench-panes/model/model-source';
import type { WorkbenchPaneId } from '@taucad/workbench-panes/registry/pane-registry';
import { SharePane } from '@taucad/workbench-panes/share/share-pane';
import type { ExportNotices } from '@taucad/workbench-panes/export/export-source';
import { Toaster, toast } from '@taucad/ui/components/sonner';
import type { HostBridge } from '#app/host-bridge.js';
import type { LaneStore } from '#app/lane-store.js';
import type { PartThumbnails } from '#app/part-previews.jsx';
import type { ComponentReveal } from '#app/sources/component-menu.jsx';
import { createExportSource } from '#app/sources/export-source.js';
import type { PageFilesSource } from '#app/sources/files-source.js';
import { createKinematicsSource } from '#app/sources/kinematics-source.js';
import { createModelSource } from '#app/sources/model-source.js';
import { createParametersSource } from '#app/sources/parameters-source.js';
import { createShareSource } from '#app/sources/share-source.js';

/** The Export pane's outcomes, as the Tau app reports them: in a toast. */
const exportNotices: ExportNotices = {
  success: (message) => {
    toast.success(message);
  },
  error: (message) => {
    toast.error(message);
  },
};

/** The panes the page offers; Details and Revisions belong to the agent's host (R3). */
const offeredPanes: readonly WorkbenchPaneId[] = ['parameters', 'model', 'kinematics', 'export', 'share', 'files'];

/** The tabs the lane opens with, as the workbench opens a project. */
const openingPanes: readonly WorkbenchPaneId[] = ['parameters', 'model', 'kinematics'];

type WorkbenchLaneProps = Readonly<{
  bridge: HostBridge;
  /** The shown model; the panes show nothing until there is one. */
  model: TauViewerModel | undefined;
  /** The server's live state of the shown sources, by project-relative path: their build and issues. */
  status: Readonly<Record<string, TauViewerEntryStatus>> | undefined;
  graphicsRef: GraphicsRef;
  /** The Files pane's source: the shown model's project, and how this page opens another of its files. */
  files: PageFilesSource;
  /** The project's lane store: the lane's tabs and width and the Model pane's sections. */
  store: LaneStore;
  /** The shown model's part previews. */
  thumbnails: PartThumbnails | undefined;
  /** Opens the page's part gallery. */
  openPartGallery: NonNullable<ModelSource['openPartGallery']>;
  /** Where the part menu's reveal requests reach the Model and Kinematics panes. */
  reveal: ComponentReveal;
  /** The part menu on the Model pane's rows. */
  componentActions: ModelSource['componentActions'];
  /** Opens a pane when the part menu asks for one. */
  openPaneRequest: Readonly<{ pane: WorkbenchPaneId; requestId: number }> | undefined;
  /** The page's workbench toggle, at the end of the lane's tabs in the page's one top row. */
  headerEnd: React.ReactNode;
}>;

/**
 * The lane, for whichever model the tab shows.
 *
 * @param props - The bridge, the shown model and its graphics, and what the page does with the panes' results.
 * @returns The lane.
 */
export function WorkbenchLane({
  bridge,
  model,
  status,
  graphicsRef,
  files,
  store,
  thumbnails,
  openPartGallery,
  reveal,
  componentActions,
  openPaneRequest,
  headerEnd,
}: WorkbenchLaneProps): React.JSX.Element {
  /* The page shows one model: its one unit is the source when it has one, else the drawn file. */
  const entryPath = model === undefined ? undefined : (model.sourceFile ?? model.path);
  const units = useMemo(
    (): readonly WorkbenchUnit[] => (entryPath === undefined ? [] : [{ entryPath, graphicsRef }]),
    [entryPath, graphicsRef],
  );
  /* One parameters source per bridge: it keeps each entry's last read, so a re-render does not read again. A written
   * edit is a sidecar change the server's watched document renders, and the newer model reaches the page unasked. */
  const parameters = useMemo(() => createParametersSource(bridge), [bridge]);
  /* One kinematics source per bridge, reading the newest status the page holds. */
  const kinematics = useMemo(() => createKinematicsSource(), []);
  useEffect(() => {
    kinematics.setStatus(status);
  }, [kinematics, status]);
  useEffect(() => {
    files.setShownFile(entryPath);
  }, [entryPath, files]);
  /* A model shown for another reason (the agent changed the source) may carry other parameters. */
  const modelSha = model?.sha256;
  useEffect(() => {
    if (modelSha !== undefined && entryPath !== undefined) {
      parameters.refresh(entryPath);
    }
  }, [entryPath, modelSha, parameters]);
  const host = useMemo(
    (): WorkbenchPanesHost => ({
      useUnits: () => units,
      parameters,
      kinematics: { useUnitStatus: kinematics.useUnitStatus, subscribeReveal: reveal.subscribeKinematics },
      model: createModelSource({ store, thumbnails, openPartGallery, componentActions, reveal: reveal.model }),
      files,
      ...(model === undefined
        ? {}
        : {
            export: createExportSource(bridge, model, {
              notices: exportNotices,
            }),
            share: createShareSource(bridge, model),
          }),
    }),
    [bridge, componentActions, files, kinematics, model, openPartGallery, parameters, reveal, store, thumbnails, units],
  );
  /* Read once per store: the lane restores what it last showed in this project. */
  const initialLayout = useMemo(() => store.readLane(), [store]);

  return (
    <WorkbenchPanesHostProvider value={host}>
      <PaneLane
        panes={offeredPanes}
        initialOpen={openingPanes}
        initialLayout={initialLayout}
        onLayoutChange={store.writeLaneLayout}
        openRequest={openPaneRequest}
        headerEnd={headerEnd}
        renderPane={(pane) => {
          switch (pane) {
            case 'parameters': {
              return <ParametersPane />;
            }
            case 'model': {
              return <ModelPane />;
            }
            case 'kinematics': {
              return <KinematicsPane />;
            }
            case 'export': {
              return <ExportPane />;
            }
            case 'share': {
              return <SharePane />;
            }
            case 'files': {
              return <FilesPane />;
            }
          }
        }}
      />
      <Toaster />
    </WorkbenchPanesHostProvider>
  );
}
