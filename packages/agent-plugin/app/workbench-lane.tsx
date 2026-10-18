/**
 * The tab's workbench panes (viewer parity R1, R3): the Tau app's own Parameters, Model, Kinematics, Export and Share
 * panes from `@taucad/workbench-panes`, in a lane beside the canvas, each fed by a page source over the host bridge.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { TauViewerModel } from '@taucad/mcp/viewer-protocol';
import type { GeometryComponentReference } from '@taucad/types';
import { WorkbenchPanesHostProvider } from '@taucad/workbench-panes/host/workbench-host';
import type { GraphicsRef, WorkbenchPanesHost, WorkbenchUnit } from '@taucad/workbench-panes/host/workbench-host';
import { ExportPane } from '@taucad/workbench-panes/export/export-pane';
import { KinematicsPane } from '@taucad/workbench-panes/kinematics/kinematics-pane';
import { PaneLane } from '@taucad/workbench-panes/lane/pane-lane';
import { ModelPane } from '@taucad/workbench-panes/model/model-pane';
import { ParametersPane } from '@taucad/workbench-panes/parameters/parameters-pane';
import type { ModelSource } from '@taucad/workbench-panes/model/model-source';
import type { WorkbenchPaneId } from '@taucad/workbench-panes/registry/pane-registry';
import { SharePane } from '@taucad/workbench-panes/share/share-pane';
import type { HostBridge } from '#app/host-bridge.js';
import type { ComponentReveal } from '#app/sources/component-menu.jsx';
import { createExportSource } from '#app/sources/export-source.js';
import { createKinematicsSource } from '#app/sources/kinematics-source.js';
import { createModelSource } from '#app/sources/model-source.js';
import { createParametersSource } from '#app/sources/parameters-source.js';
import { createShareSource } from '#app/sources/share-source.js';

/** The panes the page offers; Details, Files and Revisions belong to the agent's host (R3). */
const offeredPanes: readonly WorkbenchPaneId[] = ['parameters', 'model', 'kinematics', 'export', 'share'];

/** The tabs the lane opens with, as the workbench opens a project. */
const openingPanes: readonly WorkbenchPaneId[] = ['parameters', 'model', 'kinematics'];

type WorkbenchLaneProps = Readonly<{
  bridge: HostBridge;
  /** The shown model; the panes show nothing until there is one. */
  model: TauViewerModel | undefined;
  graphicsRef: GraphicsRef;
  /** The component selected in the Model pane, or `undefined` when cleared. */
  onSelect: (reference: GeometryComponentReference | undefined) => void;
  /** Show the model again after a parameter edit is written. */
  onParametersWritten: () => void;
  /** Where the part menu's reveal requests reach the Model and Kinematics panes. */
  reveal: ComponentReveal;
  /** The part menu on the Model pane's rows. */
  componentActions: ModelSource['componentActions'];
  /** Opens a pane when the part menu asks for one. */
  openPaneRequest: Readonly<{ pane: WorkbenchPaneId; requestId: number }> | undefined;
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
  graphicsRef,
  onSelect,
  onParametersWritten,
  reveal,
  componentActions,
  openPaneRequest,
}: WorkbenchLaneProps): React.JSX.Element {
  /* The page shows one model: its one unit is the source when it has one, else the drawn file. */
  const entryPath = model === undefined ? undefined : (model.sourceFile ?? model.path);
  const units = useMemo(
    (): readonly WorkbenchUnit[] => (entryPath === undefined ? [] : [{ entryPath, graphicsRef }]),
    [entryPath, graphicsRef],
  );
  /* One parameters source per bridge: it keeps each entry's last read, so a re-render does not read again. */
  const onWritten = useRef(onParametersWritten);
  onWritten.current = onParametersWritten;
  const parameters = useMemo(
    () =>
      createParametersSource(bridge, {
        onCommitted: () => {
          onWritten.current();
        },
      }),
    [bridge],
  );
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
      kinematics: { ...createKinematicsSource(bridge), subscribeReveal: reveal.subscribeKinematics },
      model: createModelSource(bridge, { onSelect, componentActions, reveal: reveal.model }),
      ...(model === undefined
        ? {}
        : { export: createExportSource(bridge, model), share: createShareSource(bridge, model) }),
    }),
    [bridge, componentActions, model, onSelect, parameters, reveal, units],
  );

  return (
    <WorkbenchPanesHostProvider value={host}>
      <PaneLane
        panes={offeredPanes}
        initialOpen={openingPanes}
        openRequest={openPaneRequest}
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
          }
        }}
      />
    </WorkbenchPanesHostProvider>
  );
}
