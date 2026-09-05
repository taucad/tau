import type { IDockviewHeaderActionsProps } from 'dockview-react';
import { History, MessageCircle, PanelLeft, PanelRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { SidebarTrigger, useSidebar } from '#components/ui/sidebar.js';
import { useIsTopRightGroup } from '#components/panes/use-is-top-right-group.js';
import { useProject } from '#hooks/use-project.js';
import { useVisibleRevisions } from '#hooks/use-revisions.js';
import { ProjectShareAction } from '#routes/w.$workspace.$project/project-share-action.js';
import { ProjectExportAction } from '#routes/w.$workspace.$project/project-export-action.js';
import {
  resolveCompactAuxiliary,
  useProjectWorkspace,
} from '#routes/w.$workspace.$project/project-workspace-context.js';

type WorkbenchToggleProperties = {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

const WorkspacePaneToggle = ({
  icon: Icon,
  isOpen,
  label,
  tooltip,
  onOpenChange,
}: WorkbenchToggleProperties & {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly tooltip: string;
}): React.JSX.Element => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant='ghost'
        size='icon-sm'
        className='!size-7 rounded-sm bg-transparent text-muted-foreground hover:!bg-accent hover:text-foreground aria-pressed:bg-accent aria-pressed:text-foreground'
        aria-label={label}
        aria-pressed={isOpen}
        onClick={() => {
          onOpenChange(!isOpen);
        }}
      >
        <Icon aria-hidden className='size-3.5' />
      </Button>
    </TooltipTrigger>
    <TooltipContent>{tooltip}</TooltipContent>
  </Tooltip>
);

export const WorkbenchToggle = (properties: WorkbenchToggleProperties): React.JSX.Element => (
  <WorkspacePaneToggle {...properties} icon={PanelRight} label='Toggle Workbench lane' tooltip='Toggle Workbench' />
);

export const WorkbenchToggleSlot = (): React.JSX.Element => (
  <span aria-hidden className='size-7 shrink-0' data-testid='workbench-toggle-slot' />
);

export function ProjectWorkspaceActions(properties: IDockviewHeaderActionsProps): React.JSX.Element | undefined {
  const isTopRight = useIsTopRightGroup(properties.group, properties.containerApi);
  const { editorRef, projectRef } = useProject();
  const { setChatOpen, openPanel } = useProjectWorkspace();
  const { isMobile, openMobile } = useSidebar();
  const desktopLayout = useSelector(editorRef, (snapshot) => snapshot.context.panelState.desktopLayout);
  const projectName = useSelector(projectRef, (snapshot) => snapshot.context.project?.name) ?? 'Project';
  const { canReturnToLatest, headRevision, isDirty } = useVisibleRevisions();

  if (!isTopRight) {
    return undefined;
  }

  const getLaneVisibility = (lane: 'chat' | 'workbench'): boolean => {
    const workspace = properties.group.element.closest<HTMLElement>('[data-project-workspace]');
    const compact = workspace?.dataset['compact'] === 'true';
    const open = lane === 'chat' ? desktopLayout.chatOpen : desktopLayout.workbenchOpen;
    return open && (!compact || resolveCompactAuxiliary(desktopLayout) === lane);
  };
  const chatVisible = getLaneVisibility('chat');
  const workbenchVisible = getLaneVisibility('workbench');
  const revisionStatus = headRevision ? `Revision ${headRevision.n}${isDirty ? ' · modified' : ''}` : 'Baseline';

  return (
    <div className='flex h-full items-center gap-1'>
      {isMobile && !openMobile ? (
        <SidebarTrigger className='h-7 w-auto max-w-44 gap-1.5 px-2'>
          <PanelLeft aria-hidden className='size-3.5 shrink-0' />
          <span className='hidden truncate @xl/viewer:inline'>{projectName}</span>
        </SidebarTrigger>
      ) : null}

      {isMobile ? null : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='ghost'
              size='sm'
              className='gap-1.5 px-2'
              aria-label='Toggle Chat lane'
              aria-pressed={chatVisible}
              onClick={() => {
                setChatOpen(!chatVisible);
              }}
            >
              <MessageCircle aria-hidden className='size-3.5' />
              <span>Chat</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle Chat</TooltipContent>
        </Tooltip>
      )}

      {!isMobile && canReturnToLatest ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='ghost'
              size='sm'
              className='gap-1.5 px-2'
              aria-label={`Open historical revision status: ${revisionStatus}`}
              onClick={() => {
                openPanel('revisions');
              }}
            >
              <History aria-hidden className='size-3.5' />
              <span className='hidden @xl/viewer:inline'>{revisionStatus}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open historical revision status</TooltipContent>
        </Tooltip>
      ) : null}

      <ProjectShareAction />
      <ProjectExportAction />
      {!isMobile && !workbenchVisible ? <WorkbenchToggleSlot /> : undefined}
    </div>
  );
}
