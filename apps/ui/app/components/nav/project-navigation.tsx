import { useMemo, useState } from 'react';
import { ChevronRight, Copy, Folder, FolderOpen, Forward, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
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
import { Skeleton } from '#components/ui/skeleton.js';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu.js';
import { InlineTextEditor } from '#components/inline-text-editor.js';
import { ProjectShareDialog } from '#components/publish/project-share-dialog.js';
import { ProjectChatList } from '#components/nav/project-chat-list.js';
import { toast } from '#components/ui/sonner.js';

const projectsPerPage = 5;

export const sortProjectsByActivity = (projects: readonly ProjectListItem[]): ProjectListItem[] =>
  [...projects].sort((left, right) => right.lastActivityAt - left.lastActivityAt || left.id.localeCompare(right.id));

export function ProjectNavigation(): React.JSX.Element {
  const { projects, isLoading, error, retry, deleteProject, duplicateProject, updateName } = useProjects();
  const { createChat } = useProjectManager();
  const { isProjectExpanded, setProjectDisclosure } = useAppUiPreferences();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [editingProjectId, setEditingProjectId] = useState<string | undefined>();
  const [publishProjectId, setPublishProjectId] = useState<string | undefined>();
  const [visibleCount, setVisibleCount] = useState(projectsPerPage);
  const sortedProjects = useMemo(() => sortProjectsByActivity(projects), [projects]);
  const visibleProjects = sortedProjects.slice(0, visibleCount);
  const publishTarget = projects.find((project) => project.id === publishProjectId);

  const handleCreateChat = async (project: ProjectListItem): Promise<void> => {
    if (!project.slugs) {
      return;
    }
    const chat = await createChat(project.id, { name: 'New chat', messages: [] });
    void queryClient.invalidateQueries({ queryKey: ['chats', project.id] });
    await navigate(projectChatUrl(project.slugs, chat.id));
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
    <>
      <SidebarGroup className='px-2 group-data-[collapsible=icon]:hidden'>
        <SidebarGroupLabel>Projects</SidebarGroupLabel>
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
              <SidebarMenuButton onClick={() => void retry()}>
                <span>Could not load projects</span>
                <span className='ml-auto text-xs text-muted-foreground'>Retry</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
          {!isLoading && !error && projects.length === 0 ? (
            <SidebarMenuItem>
              <div className='flex h-7 items-center px-2 text-xs text-muted-foreground'>No projects yet</div>
            </SidebarMenuItem>
          ) : null}
          {error && projects.length > 0 ? (
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => void retry()}>Projects could not be refreshed. Retry</SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
          {visibleProjects.map((project) => {
            const projectPath = projectUrlOr(project.slugs);
            const isActive = project.slugs !== undefined && location.pathname === projectPath;
            const isExpanded = isProjectExpanded(project.id, isActive);
            return (
              <ProjectNavigationItem
                key={project.id}
                project={project}
                isActive={isActive}
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
                  setPublishProjectId(project.id);
                }}
                onDelete={async () => {
                  await deleteProject(project.id);
                  toast.success(`Deleted ${project.name}`);
                }}
              />
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
      {publishTarget ? (
        <ProjectShareDialog
          open
          projectId={publishTarget.id}
          projectName={publishTarget.name}
          projectDescription={publishTarget.description}
          projectUpdatedAt={publishTarget.lastActivityAt}
          entryPath={publishTarget.assets.main.entryPath}
          parameters={{}}
          onOpenChange={(open) => {
            if (!open) {
              setPublishProjectId(undefined);
            }
          }}
        />
      ) : null}
    </>
  );
}

function ProjectNavigationItem({
  project,
  isActive,
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

  return (
    <SidebarMenuItem>
      <div
        data-slot='project-trigger'
        data-active={isActive}
        className='group/project-trigger flex h-7 w-full min-w-0 items-center gap-0.5 rounded-md px-1.5 text-sm text-sidebar-foreground transition-colors focus-within:bg-sidebar-accent hover:bg-sidebar-accent data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground'
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='group/disclosure size-5 shrink-0 hover:bg-transparent hover:text-foreground dark:hover:bg-transparent'
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${project.name}`}
              aria-expanded={isExpanded}
              aria-controls={chatsId}
              onClick={() => void onToggle()}
            >
              {isExpanded ? (
                <FolderOpen
                  aria-hidden
                  data-slot='project-folder-icon'
                  className='size-4 group-hover/project-trigger:hidden group-focus-visible/disclosure:hidden'
                />
              ) : (
                <Folder
                  aria-hidden
                  data-slot='project-folder-icon'
                  className='size-4 group-hover/project-trigger:hidden group-focus-visible/disclosure:hidden'
                />
              )}
              <ChevronRight
                aria-hidden
                data-slot='project-disclosure-icon'
                className={`hidden size-3.5 transition-transform group-hover/project-trigger:block group-focus-visible/disclosure:block motion-reduce:transition-none ${isExpanded ? 'rotate-90' : ''}`}
              />
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
          <Link
            to={target}
            aria-current={isActive ? 'page' : undefined}
            className='flex h-full min-w-0 flex-1 items-center overflow-hidden rounded-sm px-0.5 ring-sidebar-ring outline-hidden focus-visible:ring-2'
            onClick={onOpen}
          >
            <span className='truncate'>{project.name}</span>
          </Link>
        )}
        {isEditing ? null : (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='size-6 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=open]:opacity-100 md:opacity-0 md:group-focus-within/project-trigger:opacity-100 md:group-hover/project-trigger:opacity-100 dark:hover:bg-transparent'
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
                <DropdownMenuItem disabled={!project.slugs} onSelect={() => void onCreateChat()}>
                  <Plus aria-hidden />
                  New chat
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onRename}>
                  <Pencil aria-hidden />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void onDuplicate()}>
                  <Copy aria-hidden />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onShare}>
                  <Forward aria-hidden />
                  Share project
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant='destructive' onSelect={() => void onDelete()}>
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
                  className='size-6 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground md:opacity-0 md:group-focus-within/project-trigger:opacity-100 md:group-hover/project-trigger:opacity-100 dark:hover:bg-transparent'
                  aria-label={`New chat in ${project.name}`}
                  disabled={!project.slugs}
                  onClick={() => void onCreateChat()}
                >
                  <Plus aria-hidden className='size-3.5' />
                </Button>
              </TooltipTrigger>
              <TooltipContent side='right'>New chat</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
      {isExpanded ? <ProjectChatList project={project} isProjectActive={isActive} /> : null}
    </SidebarMenuItem>
  );
}
