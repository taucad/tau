import { useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import { useSelector } from '@xstate/react';
import type { DockviewPanelApi } from 'dockview-react';
import type { KernelIssue } from '@taucad/runtime';
import { KinematicsPane } from '@taucad/workbench-panes/kinematics/kinematics-pane';
import type { KinematicsSource, KinematicsUnitStatus } from '@taucad/workbench-panes/kinematics/kinematics-source';
import { useProjectAvailability } from '#hooks/use-project-availability.js';
import { useProject } from '#hooks/use-project.js';
import { ProjectSyncPlaceholder } from '#routes/w.$workspace.$project/project-sync-placeholder.js';
import { WorkspaceLanesContext } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { ProjectWorkbenchPanesHost } from '#routes/w.$workspace.$project/workbench-panes-host.js';

/** The replicad kernel reports a rejected mechanism as a warning whose `details.mechanism` holds the reason. */
const isMechanismIssue = (issue: KernelIssue): boolean =>
  typeof issue.details === 'object' && issue.details !== null && 'mechanism' in issue.details;

/** The dockview API of the workbench panel hosting the pane; dockview keeps a hidden panel mounted. */
type KinematicsHostPanelApi = Pick<DockviewPanelApi, 'isVisible' | 'onDidVisibilityChange'>;

/** An entry's build status from its CAD actor: building while tagged `cad-loading`, and the kernel's mechanism issue. */
function useProjectKinematicsUnitStatus(entryPath: string): KinematicsUnitStatus {
  const { geometryUnits } = useProject();
  const cadRef = geometryUnits.get(entryPath);
  const isUpdating = useSelector(cadRef, (state) => state?.hasTag('cad-loading') ?? false);
  const mechanismIssue = useSelector(cadRef, (state) =>
    state?.context.kernelIssues.get(entryPath)?.find((issue) => isMechanismIssue(issue)),
  );
  return useMemo(() => ({ isUpdating, mechanismIssue }), [isUpdating, mechanismIssue]);
}

/** Whether the workbench panel and its lane are on screen; a hidden panel and a hidden lane both stay mounted. */
function useWorkbenchPanelShown(panelApi: KinematicsHostPanelApi | undefined): boolean {
  const subscribeVisibility = useCallback(
    (onChange: () => void) => {
      const subscription = panelApi?.onDidVisibilityChange(onChange);
      return () => {
        subscription?.dispose();
      };
    },
    [panelApi],
  );
  // Without a host panel API the pane counts as shown for as long as it is mounted.
  const isPanelShown = useSyncExternalStore(
    subscribeVisibility,
    () => panelApi?.isVisible ?? true,
    () => true,
  );
  // Pages without lanes always show the workbench.
  const lanes = useContext(WorkspaceLanesContext);
  return isPanelShown && (lanes?.workbench ?? true);
}

function KinematicsPanelBodyContent({ panelApi }: { readonly panelApi?: KinematicsHostPanelApi }): React.JSX.Element {
  const { editorRef } = useProject();
  const sources = useMemo((): { kinematics: KinematicsSource } => {
    const useIsShown = (): boolean => useWorkbenchPanelShown(panelApi);
    return {
      kinematics: {
        useIsShown,
        // "Show kinematics" from the part menu.
        subscribeReveal(listener) {
          const subscription = editorRef.on('kinematicsRevealRequested', (event) => {
            listener({ entryPath: event.entryPath, componentId: event.componentId });
          });
          return () => {
            subscription.unsubscribe();
          };
        },
        useUnitStatus: useProjectKinematicsUnitStatus,
      },
    };
  }, [editorRef, panelApi]);

  return (
    <ProjectWorkbenchPanesHost sources={sources}>
      <KinematicsPane />
    </ProjectWorkbenchPanesHost>
  );
}

export function KinematicsPanelBody(props: Parameters<typeof KinematicsPanelBodyContent>[0]): React.JSX.Element {
  const availability = useProjectAvailability();
  return availability === 'ready' ? (
    <KinematicsPanelBodyContent {...props} />
  ) : (
    <ProjectSyncPlaceholder state={availability} />
  );
}
