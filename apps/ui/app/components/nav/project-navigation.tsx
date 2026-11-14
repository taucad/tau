import { Fragment, useMemo, useState } from 'react';
import { ChevronRight, Cloud, Copy, Forward, EllipsisVertical, Pencil, SquarePen, Trash2, X } from 'lucide-react';
import { useLocation, useNavigate, useNavigation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { ProjectListItem } from '#types/project-library.types.js';
import { useProjects } from '#hooks/use-projects.js';
import { useProjectListShape } from '#hooks/use-project-list-shape.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useAppUiPreferences } from '#hooks/use-app-ui-preferences.js';
import { projectChatUrl, projectUrl, projectUrlOr } from '#utils/project-url.utils.js';
import { searchParameterName } from '@taucad/ui-core/constants/search-parameter.constants';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '#components/ui/sidebar.js';
import { Button } from '@taucad/ui/components/button';
import { WaitIndicator } from '@taucad/ui/components/wait-indicator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { InlineTextEditor } from '#components/inline-text-editor.js';
import { ProjectChatList } from '#components/nav/project-chat-list.js';
import { sidebarDisclosureButtonClass } from '#components/nav/sidebar-disclosure.styles.js';
import { toast } from '@taucad/ui/components/sonner';
import { StatusMark } from '#components/nav/status-mark.js';
import { ProjectSyncStatus } from '#components/nav/project-sync-status.js';
import { useTauCloudIntent } from '#hooks/use-cloud-projects.js';
import {
  SidebarFailureRow,
  SidebarRowContextMenu,
  SidebarRowLink,
  SidebarRowMenuButton,
  sidebarRowButtonClass,
  sidebarRowClass,
  sidebarRowEditorClass,
} from '#components/nav/sidebar-row.js';
import type { SidebarRowMenuItems } from '#components/nav/sidebar-row.js';
import { CloseProjectDialog } from '#components/nav/project-close-dialogs.js';
import { useLiveProjectIds, useProjectLiveness } from '#hooks/use-sessions.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import type { ProjectClosePlan } from '#services/chat-session-store.js';
import {
  pluralize,
  selectProjectFacts,
  useLiveNow,
  useProjectSidebarRow,
  useSidebarCommands,
} from '#hooks/use-sidebar-status.js';

import { NativeFileManagerIcon, useOpenProjectInFileManager } from '#hooks/use-native-file-manager.js';

const projectsPerPage = 5;

/**
 * What a sidebar project row draws: a listed project, or a row the listing snapshot remembered (A13), which has no
 * locator until the listing names it.
 */
export type SidebarProject = Pick<ProjectListItem, 'id' | 'name' | 'lastActivityAt' | 'slugs'> &
  Partial<Pick<ProjectListItem, 'locator'>>;

export const sortProjectsByActivity = <Row extends Pick<ProjectListItem, 'id' | 'lastActivityAt'>>(
  projects: readonly Row[],
): Row[] =>
  [...projects].sort((left, right) => right.lastActivityAt - left.lastActivityAt || left.id.localeCompare(right.id));

/** The project a reload opened, while its session has not yet gone live; `ended` once it has, or the page moved on. */
type ReloadOpen = { readonly id: string; readonly pathname: string } | 'ended' | undefined;

/**
 * The projects the list draws as live: the live sessions, and the open project from the remembered rows until its
 * session first goes live. A reload draws the remembered rows, then the listing answers, and only then does the open
 * project's session go live; it would otherwise move above the rest at that point (U6). After that, once the page
 * leaves that project, or when its session is closed, only the registry says what is live (R1/P46).
 */
const useShownLiveIds = (
  liveProjectIds: readonly string[],
  rememberedProjects: readonly SidebarProject[] | undefined,
  pathname: string,
): ReadonlySet<string> => {
  const [reloadOpen, setReloadOpen] = useState<ReloadOpen>();
  const rememberedOpenId = rememberedProjects?.find(
    (project) => project.slugs !== undefined && pathname === projectUrlOr(project.slugs),
  )?.id;
  /* A closed session is the registry's answer already (R1/P46): the phone
   * sidebar mounts again over remembered rows when a failed listing keeps them. */
  const isOpenClosed = useProjectLiveness(rememberedOpenId ?? '').closedReason !== undefined;
  /* Render-time state adjustments, not effects: latched once, from the remembered rows, and ended once. */
  if (reloadOpen === undefined && rememberedOpenId !== undefined && !isOpenClosed) {
    setReloadOpen({ id: rememberedOpenId, pathname });
  }
  const pendingId =
    typeof reloadOpen === 'object' &&
    reloadOpen.pathname === pathname &&
    !liveProjectIds.includes(reloadOpen.id) &&
    !isOpenClosed
      ? reloadOpen.id
      : undefined;
  if (typeof reloadOpen === 'object' && pendingId === undefined) {
    setReloadOpen('ended');
  }
  const shownOpenId = pendingId ?? (reloadOpen === undefined && !isOpenClosed ? rememberedOpenId : undefined);
  return useMemo(
    () => new Set(shownOpenId === undefined ? liveProjectIds : [...liveProjectIds, shownOpenId]),
    [liveProjectIds, shownOpenId],
  );
};

export function ProjectNavigation({ className }: { readonly className?: string }): React.JSX.Element {
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
  /* R5, A13: until the worker lists, and when its first listing failed, the
   * rows are the ones the last listing had (the listing snapshot), as real
   * rows; the listing reconciles them by id in place. While the listing is
   * pending the list is busy and the label carries its wait (P-d), rows or
   * not. A last listing that had none says "No projects yet" up front
   * instead, so that list is not also shown as waiting. */
  const rememberedShape = useProjectListShape();
  const isAwaitingListing = isLoading && projects.length === 0;
  const isShowingRemembered = projects.length === 0 && (isAwaitingListing || error !== undefined);
  const rememberedProjects = isShowingRemembered ? rememberedShape?.projects : undefined;
  const rows: readonly SidebarProject[] = rememberedProjects ?? projects;
  const isWaiting = isAwaitingListing && rememberedShape?.count !== 0;
  /* A29's temporal hiding: what is live now sits above what is not, and the
   * rest keeps its recency order. The project a reload opened counts as
   * live from the first frame until its session goes live (U6). */
  const shownLiveIds = useShownLiveIds(liveProjectIds, rememberedProjects, location.pathname);
  const sortedProjects = useMemo(
    () =>
      sortProjectsByActivity(rows).sort(
        (left, right) => Number(shownLiveIds.has(right.id)) - Number(shownLiveIds.has(left.id)),
      ),
    [shownLiveIds, rows],
  );
  const visibleProjects = sortedProjects.slice(0, visibleCount);
  const earlierFromId = useMemo(
    () =>
      visibleProjects.some((entry) => shownLiveIds.has(entry.id))
        ? visibleProjects.find((entry) => !shownLiveIds.has(entry.id))?.id
        : undefined,
    [shownLiveIds, visibleProjects],
  );
  const isKnownEmpty = isAwaitingListing ? rememberedShape?.count === 0 : !isLoading && !error && projects.length === 0;
  const pendingUrl = navigation.location ? `${navigation.location.pathname}${navigation.location.search}` : undefined;

  /* `isActive` gates the merge: the open project's parameters belong to its own
   * URL, so they travel with a chat switch but never onto another project. */
  const handleCreateChat = async (project: SidebarProject, isActive: boolean): Promise<void> => {
    if (!project.slugs) {
      return;
    }
    const chat = await createChat(project.id, { name: 'New chat', messages: [] });
    void queryClient.invalidateQueries({ queryKey: ['chats', project.id] });
    await navigate(projectChatUrl(project.slugs, chat.id, isActive ? location.search : undefined), {
      state: { focusChatComposer: true },
    });
  };

  const handleDuplicate = async (project: SidebarProject): Promise<void> => {
    let duplicate: Awaited<ReturnType<typeof duplicateProject>>;
    try {
      duplicate = await duplicateProject(project.id);
    } catch (error) {
      /* A remembered row can name a project the listing no longer has (A13). */
      toast.error(`Could not duplicate ${project.name}`);
      console.error('Error duplicating project:', error);
      return;
    }
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
    /* Chat rows and New chat shortcuts share a delay as the pointer travels
     * down the list. Project status descriptions stay screen-reader-only. */
    <TooltipProvider delayDuration={500} skipDelayDuration={300}>
      <SidebarGroup className={cn('px-2 group-data-[collapsible=icon]:hidden', className)}>
        <ProjectsLabel
          isWaiting={isWaiting}
          onRetry={() => {
            void retry();
          }}
        />
        {/* One row pitch throughout: projects, a project and its first chat, and
          chats between themselves all sit `gap-0.5` apart, so expanding or
          collapsing a project shifts nothing. */}
        <SidebarMenu className='gap-0.5' aria-busy={isWaiting ? true : undefined}>
          {isKnownEmpty && liveProjectIds.length === 0 ? (
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
                    <div className='flex h-6 items-center px-1.5 text-xs text-muted-foreground'>Earlier</div>
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
                    try {
                      const trashed = await deleteProject(project.id);
                      if (trashed) {
                        toast.success(`Moved ${project.name} to Trash`);
                      } else {
                        toast.error(`Could not move ${project.name} to Trash`);
                      }
                    } catch (error) {
                      toast.error(`Could not move ${project.name} to Trash`);
                      console.error('Error trashing project:', error);
                    }
                  }}
                />
              </Fragment>
            );
          })}
          {/* D18: a failed refresh over a list already on screen shows nothing;
            the last good list stays. A first listing that failed keeps the
            remembered rows above its failure row (P-d). */}
          {error && projects.length === 0 ? (
            <SidebarMenuItem>
              <SidebarFailureRow what='projects' />
            </SidebarMenuItem>
          ) : null}
          {visibleCount < sortedProjects.length ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                type='button'
                className={sidebarDisclosureButtonClass}
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
  readonly project: SidebarProject;
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
  const openInFileManager = useOpenProjectInFileManager(project);
  const navigate = useNavigate();
  const location = useLocation();
  const chatsId = `project-chats-${project.id}`;
  const target = projectUrlOr(project.slugs);
  /* S46's "one coalesced status object per project", in the render tree too
   * (R10): the item reads the row once and hands it to everything that draws
   * it, instead of three folds and three subscription trees per row. */
  const row = useProjectSidebarRow(project.id);
  const facts = selectProjectFacts(row, isExpanded);
  const isCloudPending = useTauCloudIntent(project.id) === 'open';
  const canCreateChat = Boolean(project.slugs) && !isCloudPending;
  const openSyncDetails = (): void => {
    if (!project.slugs) {
      return;
    }
    const parameters = new URLSearchParams(isActive ? location.search : '');
    parameters.set(searchParameterName.workbench, 'revisions');
    void navigate(`${projectUrl(project.slugs)}?${parameters.toString()}`);
  };
  /* D3: a mark sits on the disclosure control; hover or focus returns the
   * chevron, so the control always shows what it does when it is reached. */
  const hasMark = facts.mark !== 'none';
  const { closeProject } = useSidebarCommands();
  const chatSessions = useChatSessionStore();
  const [askingToClose, setAskingToClose] = useState(false);
  const [askingToDelete, setAskingToDelete] = useState(false);
  const [closePlan, setClosePlan] = useState<ProjectClosePlan | undefined>();
  const askToClose = async (deleting: boolean): Promise<void> => {
    try {
      const plan = await chatSessions.getProjectClosePlan(project.id);
      setClosePlan(plan);
      if (deleting) {
        if (plan.continuingRuns.length > 0) {
          toast.error(`Can’t delete ${project.name} while work continues in another window or build.`);
          return;
        }
        if (plan.liveChatIds.length === 0) {
          await onDelete();
          return;
        }
        setAskingToDelete(true);
      } else {
        setAskingToClose(true);
      }
    } catch {
      toast.error(`Couldn’t check running work in ${project.name}. Try closing it again.`);
    }
  };

  const menuItems: SidebarRowMenuItems = ({ Item, Separator }) => (
    <>
      <Item
        disabled={!canCreateChat}
        onSelect={() => {
          if (canCreateChat) {
            void onCreateChat();
          }
        }}
      >
        <SquarePen aria-hidden />
        New chat
      </Item>
      {openInFileManager ? (
        <Item
          disabled={openInFileManager.isOpening}
          aria-busy={openInFileManager.isOpening}
          onSelect={() => {
            void openInFileManager.open();
          }}
        >
          <NativeFileManagerIcon icon={openInFileManager.icon} />
          {openInFileManager.label}
        </Item>
      ) : null}
      <Separator />
      <Item onSelect={onRename}>
        <Pencil aria-hidden />
        Rename
      </Item>
      <Item
        onSelect={() => {
          void onDuplicate();
        }}
      >
        <Copy aria-hidden />
        Duplicate
      </Item>
      <Item disabled={!project.slugs} onSelect={onShare}>
        <Forward aria-hidden />
        Share project
      </Item>
      <Item disabled={!project.slugs} onSelect={openSyncDetails}>
        <Cloud aria-hidden />
        View sync status
      </Item>
      <Separator />
      {row.glyph === 'none' ? null : (
        <Item
          aria-label={`Close ${project.name}`}
          onSelect={() => {
            if (row.runs > 0) {
              void askToClose(false);
              return;
            }
            closeProject(project.id);
          }}
        >
          <X aria-hidden />
          Close
        </Item>
      )}
      <Item
        variant='destructive'
        onSelect={() => {
          void askToClose(true);
        }}
      >
        <Trash2 aria-hidden />
        Move to Trash
      </Item>
    </>
  );

  return (
    <SidebarMenuItem>
      <SidebarRowContextMenu items={menuItems} isDisabled={isEditing} className='w-48'>
        <div
          data-slot='project-trigger'
          data-active={isActive}
          className={sidebarRowClass(isEditing)}
          onDoubleClick={isEditing ? undefined : onRename}
        >
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
            /* Two quick toggles are a toggle, not a rename. */
            onDoubleClick={(event) => {
              event.stopPropagation();
            }}
          >
            {hasMark || isPending ? (
              /* A loading row keeps its spinner under the pointer that started
               * it, so only a mark gives the chevron back on hover. */
              <StatusMark
                facts={facts}
                isPending={isPending}
                className={cn(!isPending && 'group-focus-within/row:hidden group-hover/row:hidden')}
              />
            ) : null}
            <ChevronRight
              aria-hidden
              className={cn(
                'size-3.5 transition-transform motion-reduce:transition-none',
                isExpanded && 'rotate-90',
                isPending ? 'hidden' : hasMark && 'hidden group-focus-within/row:block group-hover/row:block',
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
                hasTooltip={false}
                onClick={onOpen}
              />
              <span
                className='flex shrink-0 items-center'
                onClick={(event) => {
                  event.stopPropagation();
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <ProjectSyncStatus sync={row.sync} isCloudPending={isCloudPending} onOpenDetails={openSyncDetails} />
                {/* R13: the row's actions are for the row being reached: fine pointers see them on
                    hover or focus, coarse pointers always, and an open menu keeps its anchor (I3). */}
                <span
                  data-slot='project-row-actions'
                  className='hidden items-center group-focus-within/row:flex group-hover/row:flex has-[:is([aria-haspopup=menu],[aria-haspopup=dialog])[data-state=open]]:flex pointer-coarse:flex'
                >
                  <SidebarRowMenuButton isResponsive name={project.name} items={menuItems} className='w-48' />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className={sidebarRowButtonClass}
                        aria-label={`New chat in ${project.name}`}
                        aria-disabled={!canCreateChat}
                        onClick={() => {
                          if (canCreateChat) {
                            void onCreateChat();
                          }
                        }}
                      >
                        <SquarePen aria-hidden className='size-3.5' />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side='bottom'>
                      {isCloudPending
                        ? 'New chat — Wait for project files to be ready.'
                        : project.slugs
                          ? 'New chat'
                          : 'New chat — Project address is not ready.'}
                    </TooltipContent>
                  </Tooltip>
                </span>
              </span>
            </>
          )}
        </div>
      </SidebarRowContextMenu>
      <CloseProjectDialog
        row={row}
        name={project.name}
        closePlan={closePlan}
        isOpen={askingToClose}
        onOpenChange={setAskingToClose}
      />
      <CloseProjectDialog
        row={row}
        name={project.name}
        closePlan={closePlan}
        isBeforeDelete
        isOpen={askingToDelete}
        onOpenChange={setAskingToDelete}
        onConfirm={() => {
          closeProject(project.id);
        }}
      />
      <ProjectChatList project={project} isProjectActive={isActive} isExpanded={isExpanded} />
    </SidebarMenuItem>
  );
}

/**
 * The group label: "Recents", how many are live, and *Close idle* (D5, D19).
 *
 * The budget stays stated (I28) in two words, and its way out — closing exactly
 * the projects the registry says a policy may close — is the label's overflow
 * menu, reachable on hover, focus and coarse pointers. While the first listing
 * is pending, with remembered rows or none, the wait is the label's trailing
 * slot (blueprint P-d): words from 1 s, the slow words and Retry from 10 s,
 * and nothing below the label moves.
 *
 * @param props - Whether the list waits for its listing, and its Retry.
 * @returns The label.
 */
function ProjectsLabel({
  isWaiting,
  onRetry,
}: {
  readonly isWaiting: boolean;
  readonly onRetry: () => void;
}): React.JSX.Element {
  const { projects, idleProjectIds } = useLiveNow();
  const { closeProject } = useSidebarCommands();
  return (
    <div className='group/label flex h-7 items-center gap-1 pr-0.5'>
      {/* As quiet as the "Earlier" divider below it: the nav row above already says "Projects". */}
      <SidebarGroupLabel className='min-w-0 flex-1 text-xs font-normal text-muted-foreground'>
        Recents
        {projects > 0 ? <span className='ml-1.5 tabular-nums'>{`${String(projects)} live`}</span> : null}
      </SidebarGroupLabel>
      <WaitIndicator active={isWaiting} label='Loading projects' slowLabel='Still loading projects' onRetry={onRetry} />
      {idleProjectIds.length > 0 ? (
        <span className='hidden group-focus-within/label:flex group-hover/label:flex has-[:is([aria-haspopup=menu],[aria-haspopup=dialog])[data-state=open]]:flex pointer-coarse:flex'>
          <DropdownMenu isResponsive>
            <DropdownMenuTrigger asChild>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className={sidebarRowButtonClass}
                aria-label='More actions for recent projects'
              >
                <EllipsisVertical aria-hidden className='size-3.5' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent drawerTitle='Recents' side='right' align='start' className='w-48'>
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
