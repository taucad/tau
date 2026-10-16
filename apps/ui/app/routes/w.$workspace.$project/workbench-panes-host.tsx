import { useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { randomUuid } from '@taucad/utils/id';
import { WorkbenchPanesHostProvider } from '@taucad/workbench-panes/host/workbench-host';
import type { WorkbenchPanesHost, WorkbenchUnit } from '@taucad/workbench-panes/host/workbench-host';
import { findEntryGraphics, listGeometryEntryPaths } from '@taucad/workbench-panes/units/geometry-units';
import { useProject } from '#hooks/use-project.js';

/**
 * The project's geometry entries as shared panes list them: every admitted unit, the main entry and every entry a
 * view shows, main first, each with the graphics of the view showing it.
 *
 * @returns The units.
 */
export function useProjectWorkbenchUnits(): readonly WorkbenchUnit[] {
  const { geometryUnits, mainEntryPath, viewGraphics, viewRecords, viewEntryPaths } = useProject();
  return useMemo(
    () =>
      listGeometryEntryPaths(geometryUnits, viewRecords, mainEntryPath).map(
        (entryPath): WorkbenchUnit => ({
          entryPath,
          graphicsRef: findEntryGraphics(viewGraphics, viewEntryPaths, entryPath),
        }),
      ),
    [geometryUnits, mainEntryPath, viewGraphics, viewEntryPaths, viewRecords],
  );
}

/**
 * Claims the entries' geometry units for as long as a pane shows them, so the project keeps them rendered, each under
 * its entry's render timeout.
 *
 * @returns The claim function the shared panes call.
 */
export function useProjectUnitClaims(): NonNullable<WorkbenchPanesHost['claimUnits']> {
  const { projectRef, entriesRecord } = useProject();
  return useCallback(
    (entryPaths: readonly string[]) => {
      const claims = entryPaths.map((entryPath) => {
        const claimId = randomUuid();
        projectRef.send({
          type: 'claimGeometryUnit',
          claimId,
          entryPath,
          operationTimeout: entriesRecord?.entries[entryPath]?.renderTimeout,
        });
        return claimId;
      });
      return () => {
        for (const claimId of claims) {
          projectRef.send({ type: 'releaseGeometryUnit', claimId });
        }
      };
    },
    [entriesRecord, projectRef],
  );
}

/**
 * Provides the shared panes with the project's units, claims and the given pane sources.
 *
 * @param props - The pane sources this subtree offers, and the panes.
 * @returns The provider.
 */
export function ProjectWorkbenchPanesHost({
  sources,
  children,
}: {
  readonly sources: Omit<WorkbenchPanesHost, 'useUnits' | 'claimUnits'>;
  readonly children: ReactNode;
}): React.JSX.Element {
  const claimUnits = useProjectUnitClaims();
  const host = useMemo(
    (): WorkbenchPanesHost => ({ ...sources, useUnits: useProjectWorkbenchUnits, claimUnits }),
    [claimUnits, sources],
  );
  return <WorkbenchPanesHostProvider value={host}>{children}</WorkbenchPanesHostProvider>;
}
