import { Fragment, useMemo, useState } from 'react';
import { ChevronRight, Copy, Forward, MoreHorizontal, Pencil, SquarePen, Trash2, X } from 'lucide-react';
import { useLocation, useNavigate, useNavigation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { ProjectListItem } from '#types/project.types.js';
import { useProjects } from '#hooks/use-projects.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useAppUiPreferences } from '#hooks/use-app-ui-preferences.js';
import { projectChatUrl, projectUrl, projectUrlOr } from '#utils/project-url.utils.js';
import { searchParameterName } from '#constants/search-parameter.constants.js';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '#components/ui/sidebar.js';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { InlineTextEditor } from '#components/inline-text-editor.js';
import { ProjectChatList } from '#components/nav/project-chat-list.js';
import { toast } from '#components/ui/sonner.js';
import { StatusMark } from '#components/nav/status-mark.js';
import {
  SidebarFailureRow,
  SidebarRowActions,
  SidebarRowLink,
  SidebarRowSkeleton,
  sidebarRowButtonClass,
  sidebarRowClass,
  sidebarRowEditorClass,
} from '#components/nav/sidebar-row.js';
import { CloseProjectDialog } from '#components/nav/project-close-dialogs.js';
import { useLiveProjectIds } from '#hooks/use-sessions.js';
import {
  pluralize,
  selectProjectFacts,
  useLiveNow,
  useProjectSidebarRow,
  useSidebarCommands,
} from '#hooks/use-sidebar-status.js';

const projectsPerPage = 5;

export const sortProjectsByActivity = (projects: readonly ProjectListItem[]): ProjectListItem[] =>
  [...projects].sort((left, right) => right.lastActivityAt - left.lastActivityAt || left.id.localeCompare(right.id));

export function ProjectNavigation(): React.JSX.Element {
  const { projects, isLoading, error, deleteProject, duplicateProject, updateName } = useProjects();
  const { createChat } = useProjectManager();
  const { isProjectExpanded, setProjectDisclosure } = useAppUiPreferences();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const location = useLocation();
  const [editingProjectId, setEditingProjectId] = useState<string | undefined>();
  const [visibleCount, setVisibleCount] = useState(projectsPerPage);
  const liveProjectIds = useLiveProjectIds();
  const { closeProject } = useSidebarCommands();
  /* A29's temporal hiding: what is live now sits above what is not, and the
   * rest keeps its recency order. */
  const sortedProjects = useMemo(() => {
    const live = new Set(liveProjectIds);
    return sortProjectsByActivity(projects).sort(
      (left, right) => Number(live.has(right.id)) - Number(live.has(left.id)),
    );
  }, [liveProjectIds, projects]);
  const visibleProjects = sortedProjects.slice(0, visibleCount);
  const earlierFromId = useMemo(() => {
    const live = new Set(liveProjectIds);
    return visibleProjects.some((entry) => live.has(entry.id))
      ? visibleProjects.find((entry) => !live.has(entry.id))?.id
      : undefined;
  }, [liveProjectIds, visibleProjects]);
  const pendingUrl = navigation.location ? `${navigation.location.pathname}${navigation.location.search}` : undefined;

  /* `isActive` gates the merge: the open project's parameters belong to its own
   * URL, so they travel with a chat switch but never onto another project. */
  const handleCreateChat = async (project: ProjectListItem, isActive: boolean): Promise<void> => {
    if (!project.slugs) {
      return;
    }
    const chat = await createChat(project.id, { name: 'New chat', messages: [] });
    void queryClient.invalidateQueries({ queryKey: ['chats', project.id] });
    await navigate(projectChatUrl(project.slugs, chat.id, isActive ? location.search : undefined), {
      state: { focusChatComposer: true },
    });
  };

  const handleDuplicate = async (project: ProjectListItem): Promise<void> => {
    const duplicate = await duplicateProject(project.id);
    toast.success(`Duplicated ${project.name}`, {
      action: {
        label: 'Open',
        onClick() {
          void navigate(projectUrl(duplicate.slugs));
        },
      },
    });
  };

  return (
    /* R9: one row after another carries a tooltip, so a pointer travelling down
     * the list waits before the first and then skips the delay. */
    <TooltipProvider delayDuration={500} skipDelayDuration={300}>
      <SidebarGroup className='px-2 group-data-[collapsible=icon]:hidden'>
        <ProjectsLabel />
        {/* D10: collapsed rows sit flush at the row pitch; an expanded project
          takes its own separation. */}
        <SidebarMenu className='gap-0'>
          {isLoading && projects.length === 0
            ? Array.from({ length: 3 }, (_, index) => (
                <SidebarMenuItem key={index} aria-hidden data-testid='project-navigation-skeleton'>
                  <SidebarRowSkeleton />
                </SidebarMenuItem>
              ))
            : null}
          {/* D18: a failed refresh over a list already on screen shows nothing;
            the last good list stays. */}
          {error && projects.length === 0 ? (
            <SidebarMenuItem>
              <SidebarFailureRow what='projects' />
            </SidebarMenuItem>
          ) : null}
          {!isLoading && !error && projects.length === 0 && liveProjectIds.length === 0 ? (
            <SidebarMenuItem>
              <div className='flex h-7 items-center px-2 text-xs text-muted-foreground'>No projects yet</div>
            </SidebarMenuItem>
          ) : null}
          {visibleProjects.map((project) => {
            const projectPath = projectUrlOr(project.slugs);
            const isActive = project.slugs !== undefined && location.pathname === projectPath;
            const isExpanded = isProjectExpanded(project.id, isActive);
            return (
              <Fragment key={project.id}>
                {earlierFromId === project.id ? (
                  <SidebarMenuItem>
                    <div className='flex h-6 items-center px-1.5 text-xs text-muted-foreground/70'>Earlier</div>
                  </SidebarMenuItem>
                ) : null}
                <ProjectNavigationItem
                  project={project}
                  isActive={isActive}
                  isPending={pendingUrl === projectPath}
                  isExpanded={isExpanded}
                  isEditing={editingProjectId === project.id}
                  onToggle={async () => setProjectDisclosure(project.id, !isExpanded)}
                  onOpen={() => {
                    if (!isExpanded) {
                      void setProjectDisclosure(project.id, true);
                    }
                  }}
                  onCreateChat={async () => handleCreateChat(project, isActive)}
                  onRename={() => {
                    setEditingProjectId(project.id);
                  }}
                  onRenameSave={async (name) => {
                    await updateName(project.id, name);
                  }}
                  onEditingChange={(editing) => {
                    if (!editing) {
                      setEditingProjectId(undefined);
                    }
                  }}
                  onDuplicate={async () => handleDuplicate(project)}
                  onShare={() => {
                    if (!project.slugs) {
                      return;
                    }
                    const parameters = new URLSearchParams(isActive ? location.search : '');
                    parameters.set(searchParameterName.workbench, 'share');
                    void navigate(`${projectUrl(project.slugs)}?${parameters.toString()}`);
                  }}
                  onDelete={async () => {
                    closeProject(project.id);
                    await deleteProject(project.id);
                    toast.success(`Deleted ${project.name}`);
                  }}
                />
              </Fragment>
            );
          })}
          {visibleCount < sortedProjects.length ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                type='button'
                className='pr-1.5 pl-[30px] text-muted-foreground/55 hover:bg-transparent hover:text-muted-foreground/90 active:bg-transparent active:text-muted-foreground/90 dark:hover:bg-transparent'
                aria-label='Show more projects'
                onClick={() => {
                  setVisibleCount((count) => count + projectsPerPage);
                }}
              >
                Show more projects
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarGroup>
    </TooltipProvider>
  );
}

function ProjectNavigationItem({
  project,
  isActive,
  isPending,
  isExpanded,
  isEditing,
  onToggle,
  onOpen,
  onCreateChat,
  onRename,
  onRenameSave,
  onEditingChange,
  onDuplicate,
  onShare,
  onDelete,
}: {
  readonly project: ProjectListItem;
  readonly isActive: boolean;
  readonly isPending: boolean;
  readonly isExpanded: boolean;
  readonly isEditing: boolean;
  readonly onToggle: () => Promise<unknown>;
  readonly onOpen: () => void;
  readonly onCreateChat: () => Promise<void>;
  readonly onRename: () => void;
  readonly onRenameSave: (name: string) => Promise<void>;
  readonly onEditingChange: (isEditing: boolean) => void;
  readonly onDuplicate: () => Promise<void>;
  readonly onShare: () => void;
  readonly onDelete: () => Promise<void>;
}): React.JSX.Element {
  const { isMobile } = useSidebar();
  const chatsId = `project-chats-${project.id}`;
  const target = projectUrlOr(project.slugs);
  /* S46's "one coalesced status object per project", in the render tree too
   * (R10): the item reads the row once and hands it to everything that draws
   * it, instead of three folds and three subscription trees per row. */
  const row = useProjectSidebarRow(project.id);
  const facts = selectProjectFacts(row, isExpanded);
  /* D3: a mark sits on the disclosure control; hover or focus returns the
   * chevron, so the control always shows what it does when it is reached. */
  const hasMark = facts.mark !== 'none';
  const { closeProject } = useSidebarCommands();
  const [askingToClose, setAskingToClose] = useState(false);
  const [askingToDelete, setAskingToDelete] = useState(false);

  return (
    <SidebarMenuItem className={cn(isExpanded && 'my-1 first:mt-0 last:mb-0')}>
      <div data-slot='project-trigger' data-active={isActive} className={sidebarRowClass(isEditing)}>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className={sidebarRowButtonClass}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${project.name}`}
          aria-expanded={isExpanded}
          aria-controls={chatsId}
          onClick={() => {
            void onToggle();
          }}
        >
          {hasMark ? (
            <StatusMark facts={facts} className='group-focus-within/row:hidden group-hover/row:hidden' />
          ) : null}
          <ChevronRight
            aria-hidden
            className={cn(
              'size-3.5 transition-transform motion-reduce:transition-none',
              isExpanded && 'rotate-90',
              hasMark && 'hidden group-focus-within/row:block group-hover/row:block',
            )}
          />
        </Button>
        {isEditing ? (
          <InlineTextEditor
            value={project.name}
            variant='ghost'
            shouldStartEditing
            className={sidebarRowEditorClass}
            onSave={onRenameSave}
            onEditingChange={onEditingChange}
          />
        ) : (
          <>
            <SidebarRowLink
              to={target}
              name={project.name}
              sentence={facts.sentence}
              descriptionId={`project-status-${project.id}`}
              isActive={isActive}
              isPending={isPending}
              onClick={onOpen}
            />
            <SidebarRowActions>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className={sidebarRowButtonClass}
                    aria-label={`More actions for ${project.name}`}
                  >
                    <MoreHorizontal aria-hidden className='size-3.5' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side={isMobile ? 'bottom' : 'right'}
                  align={isMobile ? 'end' : 'start'}
                  className='w-48'
                >
                  <DropdownMenuItem
                    disabled={!project.slugs}
                    onSelect={() => {
                      void onCreateChat();
                    }}
                  >
                    <SquarePen aria-hidden />
                    New chat
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onRename}>
                    <Pencil aria-hidden />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      void onDuplicate();
                    }}
                  >
                    <Copy aria-hidden />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!project.slugs} onSelect={onShare}>
                    <Forward aria-hidden />
                    Share project
                  </DropdownMenuItem>
                  {row.glyph === 'none' ? null : (
                    <DropdownMenuItem
                      aria-label={`Close ${project.name}`}
                      onSelect={() => {
                        if (row.runs > 0) {
                          setAskingToClose(true);
                          return;
                        }
                        closeProject(project.id);
                      }}
                    >
                      <X aria-hidden />
                      Close
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant='destructive'
                    onSelect={() => {
                      if (row.runs > 0) {
                        setAskingToDelete(true);
                      } else {
                        void onDelete();
                      }
                    }}
                  >
                    <Trash2 aria-hidden />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className={sidebarRowButtonClass}
                    aria-label={`New chat in ${project.name}`}
                    disabled={!project.slugs}
                    onClick={() => {
                      void onCreateChat();
                    }}
                  >
                    <SquarePen aria-hidden className='size-3.5' />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side='right'>New chat</TooltipContent>
              </Tooltip>
            </SidebarRowActions>
          </>
        )}
      </div>
      <CloseProjectDialog row={row} name={project.name} isOpen={askingToClose} onOpenChange={setAskingToClose} />
      <CloseProjectDialog
        row={row}
        name={project.name}
        isOpen={askingToDelete}
        onOpenChange={setAskingToDelete}
        onConfirm={() => {
          void onDelete();
        }}
      />
      {isExpanded ? <ProjectChatList project={project} isProjectActive={isActive} /> : null}
    </SidebarMenuItem>
  );
}

/**
 * The group label: "Projects", how many are live, and *Close idle* (D5, D19).
 *
 * The budget stays stated (I28) in two words, and its way out — closing exactly
 * the projects the registry says a policy may close — is the label's overflow
 * menu, reachable on hover, focus and coarse pointers.
 *
 * @returns The label.
 */
function ProjectsLabel(): React.JSX.Element {
  const { projects, idleProjectIds } = useLiveNow();
  const { closeProject } = useSidebarCommands();
  return (
    <div className='group/label flex h-7 items-center gap-1 pr-0.5'>
      <SidebarGroupLabel className='min-w-0 flex-1'>
        Projects
        {projects > 0 ? <span className='ml-1.5 font-normal tabular-nums'>{`${String(projects)} live`}</span> : null}
      </SidebarGroupLabel>
      {idleProjectIds.length > 0 ? (
        <span className='hidden group-focus-within/label:flex group-hover/label:flex pointer-coarse:flex'>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className={sidebarRowButtonClass}
                aria-label='More actions for projects'
              >
                <MoreHorizontal aria-hidden className='size-3.5' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side='right' align='start' className='w-48'>
              <DropdownMenuItem
                onSelect={() => {
                  for (const projectId of idleProjectIds) {
                    closeProject(projectId);
                  }
                }}
              >
                <X aria-hidden />
                {`Close ${pluralize(idleProjectIds.length, 'idle project')}`}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      ) : null}
    </div>
  );
}
