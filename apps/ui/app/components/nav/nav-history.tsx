import { Copy, Edit, Forward, History, MoreHorizontal, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
import type { ProjectListItem } from '#types/project.types.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu.js';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '#components/ui/sidebar.js';
import { Skeleton } from '#components/ui/skeleton.js';
import { useProjects } from '#hooks/use-projects.js';
import { projectUrl, projectUrlOr } from '#utils/project-url.utils.js';
import { toast } from '#components/ui/sonner.js';
import { groupItemsByTimeHorizon } from '#utils/temporal.utils.js';
import { SearchInput } from '#components/search-input.js';
import { Loader } from '#components/ui/loader.js';

import { ProjectShareDialog } from '#components/publish/project-share-dialog.js';

const projectsPerPage = 5;

export function NavHistory(): ReactNode {
  const [visibleCount, setVisibleCount] = useState(projectsPerPage);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const { projects, isLoading, error, retry, deleteProject, duplicateProject, updateName } = useProjects();
  const navigate = useNavigate();

  // Filter projects based on search query
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) {
      return projects;
    }

    const query = searchQuery.toLowerCase().trim();
    return projects.filter(
      (project) => project.name.toLowerCase().includes(query) || project.description.toLowerCase().includes(query),
    );
  }, [projects, searchQuery]);

  const groupedProjects = useMemo(() => {
    return groupItemsByTimeHorizon(filteredProjects);
  }, [filteredProjects]);

  const visibleProjects = useMemo(() => {
    let totalShown = 0;
    const result = [];

    for (const group of groupedProjects) {
      const remainingSlots = visibleCount - totalShown;
      if (remainingSlots <= 0) {
        break;
      }

      const visibleItemsInGroup = group.items.slice(0, remainingSlots);
      if (visibleItemsInGroup.length > 0) {
        result.push({
          ...group,
          items: visibleItemsInGroup,
        });
        totalShown += visibleItemsInGroup.length;
      }
    }

    return result;
  }, [groupedProjects, visibleCount]);

  const totalVisibleProjectCount = useMemo(() => {
    return visibleProjects.reduce((sum, group) => sum + group.items.length, 0);
  }, [visibleProjects]);

  const handleLoadMore = () => {
    setVisibleCount((previous) => previous + projectsPerPage);
  };

  const handleRename = (projectId: string) => {
    setEditingId(projectId);
  };

  const handleRenameSubmit = async (projectId: string, newName: string) => {
    if (newName.trim()) {
      await updateName(projectId, newName.trim());
    }

    setEditingId(undefined);
  };

  const handleRenameCancel = () => {
    setEditingId(undefined);
  };

  const handleDelete = async (projectId: string) => {
    const project = projects.find((b) => b.id === projectId);
    await deleteProject(projectId);
    if (project) {
      toast.success(`Deleted ${project.name}`);
    }
  };

  const handleDuplicate = async (projectId: string) => {
    const project = projects.find((b) => b.id === projectId);
    const newProject = await duplicateProject(projectId);
    if (project) {
      toast.success(`Duplicated ${project.name}`, {
        action: {
          label: 'Open',
          onClick() {
            void navigate(projectUrl(newProject.slugs));
          },
        },
      });
    }
  };

  const [publishOpen, setPublishOpen] = useState(false);
  const [publishProjectId, setPublishProjectId] = useState<string | undefined>(undefined);

  const publishTarget = useMemo(() => {
    if (!publishProjectId) {
      return undefined;
    }

    return projects.find((project) => project.id === publishProjectId);
  }, [projects, publishProjectId]);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
    // Reset visible count when searching to show all results
    if (event.target.value.trim()) {
      setVisibleCount(Infinity);
    } else {
      setVisibleCount(projectsPerPage);
    }
  };

  const handleSearchClear = () => {
    setSearchQuery('');
    setVisibleCount(projectsPerPage);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Prevent the search from triggering sidebar navigation
    event.stopPropagation();
  };

  if (isLoading && projects.length === 0) {
    return (
      <SidebarGroup className='group-data-[collapsible=icon]:hidden'>
        <SidebarGroupLabel>Recent Projects</SidebarGroupLabel>
        <SidebarMenu data-testid='nav-history-skeleton'>
          {Array.from({ length: 3 }, (_, i) => (
            <SidebarMenuItem key={i}>
              <SidebarMenuButton>
                <Skeleton className='h-4 w-4 rounded' />
                <Skeleton className='h-4 flex-1' />
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    );
  }

  if (error && projects.length === 0) {
    return (
      <SidebarGroup className='group-data-[collapsible=icon]:hidden'>
        <SidebarGroupLabel>Recent Projects</SidebarGroupLabel>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => void retry()}>
              <span>Could not load projects</span>
              <span className='text-xs text-muted-foreground'>Retry</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    );
  }

  if (projects.length === 0) {
    return null;
  }

  return (
    <>
      {/* Search input */}
      {error ? (
        <SidebarGroup className='-mb-2 group-data-[collapsible=icon]:hidden'>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => void retry()}>Projects could not be refreshed. Retry</SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      ) : null}
      <SidebarGroup className='-mb-2 group-data-[collapsible=icon]:hidden'>
        <SidebarGroupLabel>Recent Projects</SidebarGroupLabel>
        <SearchInput
          placeholder='Search projects...'
          value={searchQuery}
          className='h-7 bg-background dark:bg-background'
          onChange={handleSearchChange}
          onKeyDown={handleSearchKeyDown}
          onClear={handleSearchClear}
        />
      </SidebarGroup>

      {/* Temporal groups */}
      {visibleProjects.map((group) => (
        <SidebarGroup key={group.name} className='group-data-[collapsible=icon]:hidden'>
          <SidebarGroupLabel>{group.name}</SidebarGroupLabel>
          <SidebarMenu>
            {group.items.map((project) => (
              <NavHistoryItem
                key={project.id}
                project={project}
                isEditing={editingId === project.id}
                onRename={handleRename}
                onRenameSubmit={handleRenameSubmit}
                onRenameCancel={handleRenameCancel}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
                onShare={() => {
                  setPublishProjectId(project.id);
                  setPublishOpen(true);
                }}
              />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ))}

      {/* Show "No results" message when searching with no results */}
      {searchQuery.trim() && filteredProjects.length === 0 && (
        <SidebarGroup className='group-data-[collapsible=icon]:hidden'>
          <SidebarMenu>
            <SidebarMenuItem>
              <div className='px-2 py-4 text-center text-sm text-muted-foreground'>
                No projects found for &ldquo;{searchQuery}&rdquo;
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      )}

      {/* Load More button */}
      {projects.length > totalVisibleProjectCount && !searchQuery.trim() && (
        <SidebarGroup className='group-data-[collapsible=icon]:hidden'>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton className='-mt-3.5 text-sidebar-foreground/70' onClick={handleLoadMore}>
                <MoreHorizontal className='size-4' />
                <span>Load More</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      )}
      {publishTarget ? (
        <ProjectShareDialog
          open={publishOpen}
          onOpenChange={(next) => {
            setPublishOpen(next);
            if (!next) {
              setPublishProjectId(undefined);
            }
          }}
          projectId={publishTarget.id}
          projectName={publishTarget.name}
          projectDescription={publishTarget.description}
          projectUpdatedAt={publishTarget.lastActivityAt}
          entryPath={publishTarget.assets.main.entryPath}
          parameters={{}}
        />
      ) : null}
    </>
  );
}

type NavHistoryItemProps = {
  readonly project: ProjectListItem;
  readonly isEditing: boolean;
  readonly onRename: (projectId: string) => void;
  readonly onRenameSubmit: (projectId: string, newName: string) => Promise<void>;
  readonly onRenameCancel: () => void;
  readonly onDuplicate: (projectId: string) => Promise<void>;
  readonly onDelete: (projectId: string) => Promise<void>;
  readonly onShare: () => void;
};

function NavHistoryItem({
  project,
  isEditing,
  onRename,
  onRenameSubmit,
  onRenameCancel,
  onDuplicate,
  onDelete,
  onShare,
}: NavHistoryItemProps) {
  const { isMobile } = useSidebar();
  const [editValue, setEditValue] = useState(project.name);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void onRenameSubmit(project.id, editValue);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setEditValue(project.name);
      onRenameCancel();
    }
  };

  const handleBlur = () => {
    void onRenameSubmit(project.id, editValue);
  };

  const handleRenameClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onRename(project.id);
  };

  const handleDuplicateClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    void onDuplicate(project.id);
  };

  const handleDeleteClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    void onDelete(project.id);
  };

  const handleShareClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onShare();
  };

  const handleInputClick = (event: React.MouseEvent) => {
    event.stopPropagation();
  };

  const handleInputFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    // Select all text when focusing
    event.target.select();
  };

  return (
    <SidebarMenuItem key={project.id}>
      {isEditing ? (
        // Show editing state without NavLink to prevent drag issues
        <SidebarMenuButton asChild className='bg-sidebar-accent'>
          <span>
            <History className='size-4 shrink-0' />
            <input
              autoFocus
              type='text'
              value={editValue}
              className='flex-1 border-none bg-transparent text-sidebar-foreground outline-none'
              onChange={(event) => {
                setEditValue(event.target.value);
              }}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              onFocus={handleInputFocus}
              onClick={handleInputClick}
            />
          </span>
        </SidebarMenuButton>
      ) : (
        <NavLink to={projectUrlOr(project.slugs)}>
          {({ isActive, isPending }) => (
            <SidebarMenuButton asChild isActive={isActive}>
              <span>
                {isPending ? <Loader /> : <History className='size-4 shrink-0' />}
                <span className='flex-1 truncate'>{project.name}</span>
              </span>
            </SidebarMenuButton>
          )}
        </NavLink>
      )}
      {!isEditing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuAction shouldShowOnHover>
              <MoreHorizontal />
              <span className='sr-only'>More</span>
            </SidebarMenuAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className='w-48 rounded-lg'
            side={isMobile ? 'bottom' : 'right'}
            align={isMobile ? 'end' : 'start'}
          >
            <DropdownMenuItem onClick={handleRenameClick}>
              <Edit />
              <span>Rename</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDuplicateClick}>
              <Copy />
              <span>Duplicate</span>
            </DropdownMenuItem>
            <DropdownMenuItem data-testid='share-project-history' onClick={handleShareClick}>
              <Forward />
              <span>Share Project</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant='destructive' onClick={handleDeleteClick}>
              <Trash2 />
              <span>Delete</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </SidebarMenuItem>
  );
}
