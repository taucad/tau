import type { IDockviewHeaderActionsProps } from 'dockview-react';
import { PanelLeft } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { Separator } from '@taucad/ui/components/separator';
import { SidebarTrigger, useSidebar } from '#components/ui/sidebar.js';
import { ViewerHeaderActions } from '@taucad/workbench-panes/shell/viewer-header-actions';
import { useIsTopRightGroup } from '#components/panes/use-is-top-right-group.js';
import { useProject } from '#hooks/use-project.js';
import { RevisionStatusAction } from '#routes/w.$workspace.$project/revision-status-action.js';
import { RecordIssuesAction } from '#routes/w.$workspace.$project/record-issues-action.js';
import { useProjectWorkspace, useWorkspaceLanes } from '#routes/w.$workspace.$project/project-workspace-context.js';

export const WorkbenchToggleSlot = (): React.JSX.Element => (
  <span aria-hidden className='size-7 shrink-0' data-testid='workbench-toggle-slot' />
);

// The variant, not `h-4`: the separator's own `data-[orientation=vertical]:h-full` outranks a bare height.
const GroupSeparator = (): React.JSX.Element => (
  <Separator orientation='vertical' className='data-[orientation=vertical]:h-4' />
);

/**
 * The viewer's top-right cluster, the shared `ViewerHeaderActions`: the project group — the revision trigger,
 * the settings-records trigger when a record needs a person, Share and Export (folding to icons below `@xl/viewer`) —
 * and, while the workbench lane is hidden, the slot its floating toggle lands in. One geometry (`PaneButton`, 28 px) and a hairline
 * before every group, the first included, so the cluster reads apart from the
 * tabs on its left. The chat lane's toggle is not here: it heads the chat pane
 * header, or the viewer's tab bar while the lane is closed.
 *
 * @param properties - Dockview's header-action props for the group.
 * @returns The cluster in the top-right group, nothing in every other.
 */
export function ProjectWorkspaceActions(properties: IDockviewHeaderActionsProps): React.JSX.Element | undefined {
  const { openPanel, registerRecordRecoveryFocus, restoreRecordRecoveryFocus } = useProjectWorkspace();
  const isTopRight = useIsTopRightGroup(properties.group, properties.containerApi);
  const { projectRef } = useProject();
  const { workbench: workbenchVisible } = useWorkspaceLanes();
  const { isMobile, openMobile } = useSidebar();
  const projectName = useSelector(projectRef, (snapshot) => snapshot.context.project?.name) ?? 'Project';

  if (!isTopRight) {
    return undefined;
  }

  return (
    <ViewerHeaderActions
      shareRef={registerRecordRecoveryFocus}
      onOpenPane={openPanel}
      leading={
        <>
          {isMobile && !openMobile ? (
            <SidebarTrigger className='h-7 w-auto max-w-44 gap-1.5 px-2'>
              <PanelLeft aria-hidden className='size-3.5 shrink-0' />
              <span className='hidden truncate @xl/viewer:inline'>{projectName}</span>
            </SidebarTrigger>
          ) : null}
          <GroupSeparator />
          {/* S29/A19: always on — the chat may be working somewhere else at any
              time, and this is the one place outside the pane that says where you
              are (review R10). */}
          <RevisionStatusAction />
          {/* Settings records that need a person; nothing while every record is fine. */}
          <RecordIssuesAction fallbackFocus={restoreRecordRecoveryFocus} />
        </>
      }
      trailing={!isMobile && !workbenchVisible ? <WorkbenchToggleSlot /> : undefined}
    />
  );
}
