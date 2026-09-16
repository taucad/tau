import { Fragment, useMemo, useState } from 'react';
import { ChevronRight, Copy, Forward, MoreHorizontal, Pencil, SquarePen, Trash2, X } from 'lucide-react';
import { Link, useLocation, useNavigate, useNavigation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { ProjectListItem } from '#types/project.types.js';
import { useProjects } from '#hooks/use-projects.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useAppUiPreferences } from '#hooks/use-app-ui-preferences.js';
import { projectChatUrl, projectUrl, projectUrlOr } from '#utils/project-url.utils.js';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '#components/ui/sidebar.js';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { Button } from '@taucad/ui/components/button';
import { nestedActionVariants } from '@taucad/ui/components/nested-action.variants';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { InlineTextEditor } from '#components/inline-text-editor.js';
import { ProjectChatList } from '#components/nav/project-chat-list.js';
import { Loader } from '#components/ui/loader.js';
import { toast } from '#components/ui/sonner.js';
import { BranchChip } from '#components/nav/chat-status-glyph.js';
import { LivenessGlyph, ProjectSyncGlyph, projectRowDescription } from '#components/nav/liveness-glyph.js';
import { CloseProjectDialog } from '#components/nav/project-close-dialogs.js';
import { useLiveProjectIds } from '#hooks/use-sessions.js';
import { liveNowText, useLiveNow, useProjectSidebarRow, useSidebarCommands } from '#hooks/use-sidebar-status.js';
import type { ProjectSidebarRow } from '#hooks/use-sidebar-status.js';

const projectsPerPage = 5;

export const sortProjectsByActivity = (projects: readonly ProjectListItem[]): ProjectListItem[] =>
  [...projects].sort((left, right) => right.lastActivityAt - left.lastActivityAt || left.id.localeCompare(right.id));

export function ProjectNavigation(): React.JSX.Element {
  const { projects, isLoading, error, retry, deleteProject, duplicateProject, updateName } = useProjects();
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

  const handleCreateChat = async (project: ProjectListItem): Promise<void> => {
    if (!project.slugs) {
      return;
    }
    const chat = await createChat(project.id, { name: 'New chat', messages: [] });
    void queryClient.invalidateQueries({ queryKey: ['chats', project.id] });
    await navigate(projectChatUrl(project.slugs, chat.id), { state: { focusChatComposer: true } });
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
    <SidebarGroup className='px-2 group-data-[collapsible=icon]:hidden'>
      <SidebarGroupLabel>Projects</SidebarGroupLabel>
      <LiveNowHeader projectIds={liveProjectIds} />
      <SidebarMenu className='gap-2'>
        {isLoading && projects.length === 0
          ? Array.from({ length: 3 }, (_, index) => (
              <SidebarMenuItem key={index} data-testid='project-navigation-skeleton'>
                <div className='flex h-7 items-center gap-2 px-2'>
                  <Skeleton className='size-4 rounded-sm' />
                  <Skeleton className='h-4 flex-1' />
                </div>
              </SidebarMenuItem>
            ))
          : null}
        {error && projects.length === 0 ? (
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => {
                void retry();
              }}
            >
              <span>Could not load projects</span>
              <span className='ml-auto text-xs text-muted-foreground'>Retry</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
        {!isLoading && !error && projects.length === 0 && liveProjectIds.length === 0 ? (
          <SidebarMenuItem>
            <div className='flex h-7 items-center px-2 text-xs text-muted-foreground'>No projects yet</div>
          </SidebarMenuItem>
        ) : null}
        {error && projects.length > 0 ? (
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => {
                void retry();
              }}
            >
              Projects could not be refreshed. Retry
            </SidebarMenuButton>
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
                onCreateChat={async () => handleCreateChat(project)}
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
                  parameters.set('workbench', 'share');
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
  const { closeProject } = useSidebarCommands();
  const [askingToClose, setAskingToClose] = useState(false);
  const [askingToDelete, setAskingToDelete] = useState(false);

  return (
    <SidebarMenuItem>
      <div
        data-slot='project-trigger'
        data-active={isActive}
        className='group/project-trigger flex min-h-7 w-full min-w-0 items-center gap-0.5 rounded-md px-0.5 text-sm text-sidebar-foreground transition-colors focus-within:bg-sidebar-accent hover:bg-sidebar-accent data-[active=true]:bg-sidebar-accent'
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className={nestedActionVariants({ className: 'size-6 shrink-0 text-muted-foreground' })}
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${project.name}`}
              aria-expanded={isExpanded}
              aria-controls={chatsId}
              onClick={() => {
                void onToggle();
              }}
            >
              {isPending ? (
                <Loader className='size-4' />
              ) : (
                <ChevronRight
                  aria-hidden
                  className={`size-3.5 transition-transform motion-reduce:transition-none ${isExpanded ? 'rotate-90' : ''}`}
                />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side='right'>{isExpanded ? 'Collapse project' : 'Expand project'}</TooltipContent>
        </Tooltip>
        {isEditing ? (
          <InlineTextEditor
            value={project.name}
            variant='ghost'
            shouldStartEditing
            className='h-7 min-w-0 flex-1 [&_[data-slot=button]]:hidden [&_[data-slot=input]]:h-7'
            onSave={onRenameSave}
            onEditingChange={onEditingChange}
          />
        ) : (
          <ProjectRowContent
            project={project}
            row={row}
            target={target}
            isActive={isActive}
            isPending={isPending}
            onOpen={onOpen}
          />
        )}
        {isEditing ? null : (
          <span className='relative flex shrink-0 items-center'>
            <span className='pointer-events-none absolute right-2 hidden items-center gap-1 transition-opacity md:flex md:group-focus-within/project-trigger:opacity-0 md:group-hover/project-trigger:opacity-0'>
              <LivenessGlyph row={row} />
              <ProjectSyncGlyph row={row} />
            </span>
            <span className='flex items-center transition-opacity md:opacity-0 md:group-focus-within/project-trigger:opacity-100 md:group-hover/project-trigger:opacity-100'>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className={nestedActionVariants({
                      className: 'size-6 shrink-0 text-muted-foreground',
                    })}
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
                    className={nestedActionVariants({
                      className: 'size-6 shrink-0 text-muted-foreground',
                    })}
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
            </span>
          </span>
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
 * The `Live now` header (S46, I28).
 *
 * Progressive disclosure: it exists only while something is live, and it names
 * the budget's own way out — *Close all idle* closes exactly the projects the
 * registry says a policy may close.
 *
 * @param props - The live set, in the registry's order.
 * @returns The header, while anything is live.
 */
function LiveNowHeader({ projectIds }: { readonly projectIds: readonly string[] }): React.JSX.Element | undefined {
  const summary = useLiveNow(projectIds);
  const { closeProject } = useSidebarCommands();
  if (summary.projects === 0) {
    return undefined;
  }
  return (
    <div className='flex min-w-0 items-center gap-2 px-1.5 pb-1'>
      <span className='flex min-w-0 flex-col'>
        <span className='text-xs font-medium text-foreground'>Live now</span>
        <span className='truncate text-xs text-muted-foreground'>{liveNowText(summary)}</span>
      </span>
      {summary.idleProjectIds.length > 0 ? (
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='ml-auto h-6 shrink-0 px-1.5 text-xs text-muted-foreground hover:text-foreground'
          onClick={() => {
            for (const projectId of summary.idleProjectIds) {
              closeProject(projectId);
            }
          }}
        >
          Close all idle
        </Button>
      ) : null}
    </div>
  );
}

/**
 * A project row's whole status surface — one subscriber, one repaint.
 *
 * The glyph, the second line and the branch chip sit outside the link, so the
 * link's accessible name stays the project's name.
 *
 * @param props - The project and the link's own state.
 * @returns The row's content.
 */
function ProjectRowContent({
  project,
  row,
  target,
  isActive,
  isPending,
  onOpen,
}: {
  readonly project: ProjectListItem;
  readonly row: ProjectSidebarRow;
  readonly target: string;
  readonly isActive: boolean;
  readonly isPending: boolean;
  readonly onOpen: () => void;
}): React.JSX.Element {
  const descriptionId = `project-status-${project.id}`;
  return (
    <>
      <span className='flex min-w-0 flex-1 flex-col justify-center px-0.5 py-0.5'>
        <Link
          to={target}
          aria-current={isActive ? 'page' : undefined}
          aria-busy={isPending}
          aria-describedby={descriptionId}
          className='flex min-w-0 items-center overflow-hidden rounded-sm outline-hidden focus-visible:focus-outline'
          onClick={onOpen}
        >
          <span className='truncate'>{project.name}</span>
        </Link>
        {row.detail === undefined ? null : (
          <span className='truncate text-xs leading-tight text-muted-foreground'>{row.detail}</span>
        )}
      </span>
      <BranchChip branch={row.branch} isDirty={row.dirty} />
      <span id={descriptionId} className='sr-only'>
        {projectRowDescription(project.name, row)}
      </span>
    </>
  );
}
