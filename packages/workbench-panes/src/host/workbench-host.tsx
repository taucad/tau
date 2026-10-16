import { createContext, useContext } from 'react';
import type { ActorRefFrom } from 'xstate';
import type { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import type { ExportSource } from '#export/export-source.js';
import type { KinematicsSource } from '#kinematics/kinematics-source.js';
import type { ModelSource } from '#model/model-source.js';
import type { ParametersSource } from '#parameters/parameters-source.js';
import type { ShareSource } from '#share/share-source.js';

/**
 * A viewer's graphics actor.
 *
 * @public
 */
export type GraphicsRef = ActorRefFrom<typeof graphicsMachine>;

/**
 * One geometry entry the panes list: a project file that renders a model.
 *
 * @public
 */
export type WorkbenchUnit = Readonly<{
  /** Project-relative path of the entry file. */
  entryPath: string;
  /** The graphics actor of a view showing this entry, or `undefined` when no renderer shows it. */
  graphicsRef: GraphicsRef | undefined;
}>;

/**
 * Everything a host hands the shared panes. A pane whose source is absent is not offered.
 *
 * @public
 */
export type WorkbenchPanesHost = Readonly<{
  /** The entries the panes list, main entry first. A hook: it is called during render. */
  useUnits: () => readonly WorkbenchUnit[];
  /**
   * Keep these entries' geometry current while a pane shows them.
   *
   * @returns Releases the claim.
   */
  claimUnits?: (entryPaths: readonly string[]) => () => void;
  kinematics?: KinematicsSource;
  parameters?: ParametersSource;
  model?: ModelSource;
  export?: ExportSource;
  share?: ShareSource;
}>;

const WorkbenchPanesHostContext = createContext<WorkbenchPanesHost | undefined>(undefined);

/**
 * Provides the host to every shared pane below it.
 *
 * @public
 */
export const WorkbenchPanesHostProvider = WorkbenchPanesHostContext.Provider;

/**
 * The host the panes run in.
 *
 * @returns The host from the nearest {@link WorkbenchPanesHostProvider}.
 * @public
 */
export function useWorkbenchPanesHost(): WorkbenchPanesHost {
  const host = useContext(WorkbenchPanesHostContext);
  if (host === undefined) {
    throw new Error('A workbench pane rendered outside WorkbenchPanesHostProvider.');
  }
  return host;
}
