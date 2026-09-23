import type { IDockviewHeaderActionsProps } from 'dockview-react';
import { DownloadIcon, PanelLeft, PanelRight, Share2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { Separator } from '@taucad/ui/components/separator';
import { SidebarTrigger, useSidebar } from '#components/ui/sidebar.js';
import { PaneButton } from '#components/ui/pane-button.js';
import { useIsTopRightGroup } from '#components/panes/use-is-top-right-group.js';
import { useProject } from '#hooks/use-project.js';
import { RevisionStatusAction } from '#routes/w.$workspace.$project/revision-status-action.js';
import { useProjectWorkspace, useWorkspaceLanes } from '#routes/w.$workspace.$project/project-workspace-context.js';
import type { WorkbenchPanelId } from '#routes/w.$workspace.$project/project-workspace-context.js';

type WorkbenchToggleProperties = {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

export const WorkbenchToggle = ({ isOpen, onOpenChange }: WorkbenchToggleProperties): React.JSX.Element => (
  <PaneButton
    className='aria-pressed:text-foreground'
    aria-label='Toggle Workbench lane'
    aria-pressed={isOpen}
    tooltip='Toggle Workbench'
    onClick={() => {
      onOpenChange(!isOpen);
    }}
  >
    <PanelRight aria-hidden className='size-3.5' />
  </PaneButton>
);

export const WorkbenchToggleSlot = (): React.JSX.Element => (
  <span aria-hidden className='size-7 shrink-0' data-testid='workbench-toggle-slot' />
);

/**
 * Share or Export: a labelled `PaneButton` while the viewer is roomy, folding
 * to its icon below `@xl/viewer` (Q5).
 */
const ProjectPaneAction = ({
  icon: Icon,
  label,
  tooltip,
  panel,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly tooltip: string;
  readonly panel: WorkbenchPanelId;
}): React.JSX.Element => {
  const { openPanel } = useProjectWorkspace();
  return (
    <PaneButton
      size='label'
      aria-label={label}
      tooltip={tooltip}
      className='@max-xl/viewer:w-7 @max-xl/viewer:px-0'
      onClick={() => {
        openPanel(panel);
      }}
    >
      <Icon aria-hidden className='size-3.5' />
      <span className='hidden @xl/viewer:inline'>{label}</span>
    </PaneButton>
  );
};

// The variant, not `h-4`: the separator's own `data-[orientation=vertical]:h-full` outranks a bare height.
const GroupSeparator = (): React.JSX.Element => (
  <Separator orientation='vertical' className='data-[orientation=vertical]:h-4' />
);

/**
 * The viewer's top-right cluster: the project group — the revision trigger,
 * Share and Export — and, while the workbench lane is hidden, the slot its
 * floating toggle lands in. One geometry (`PaneButton`, 28 px) and a hairline
 * before every group, the first included, so the cluster reads apart from the
 * tabs on its left. The chat lane's toggle is not here: it heads the chat pane
 * header, or the viewer's tab bar while the lane is closed.
 *
 * @param properties - Dockview's header-action props for the group.
 * @returns The cluster in the top-right group, nothing in every other.
 */
export function ProjectWorkspaceActions(properties: IDockviewHeaderActionsProps): React.JSX.Element | undefined {
  const isTopRight = useIsTopRightGroup(properties.group, properties.containerApi);
  const { projectRef } = useProject();
  const { workbench: workbenchVisible } = useWorkspaceLanes();
  const { isMobile, openMobile } = useSidebar();
  const projectName = useSelector(projectRef, (snapshot) => snapshot.context.project?.name) ?? 'Project';

  if (!isTopRight) {
    return undefined;
  }

  return (
    <div className='flex h-full items-center gap-1'>
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
      <ProjectPaneAction icon={Share2} label='Share' tooltip='Share project' panel='share' />
      <ProjectPaneAction icon={DownloadIcon} label='Export' tooltip='Open exporter' panel='export' />

      {!isMobile && !workbenchVisible ? (
        <>
          <GroupSeparator />
          <WorkbenchToggleSlot />
        </>
      ) : undefined}
    </div>
  );
}
