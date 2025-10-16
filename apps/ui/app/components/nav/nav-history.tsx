import { Edit, History, MoreHorizontal, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import type { Build } from '#types/build.types.js';
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
import { useBuilds } from '#hooks/use-builds.js';
import { toast } from '#components/ui/sonner.js';
import { groupItemsByTimeHorizon } from '#utils/temporal.utils.js';
import { SearchInput } from '#components/search-input.js';
import { LoadingSpinner } from '#components/ui/loading-spinner.js';

const buildsPerPage = 5;

export function NavHistory(): ReactNode {
  const [visibleCount, setVisibleCount] = useState(buildsPerPage);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const { builds, deleteBuild, updateName } = useBuilds();

  // Filter builds based on search query
  const filteredBuilds = useMemo(() => {
    if (!searchQuery.trim()) {
      return builds;
    }

    const query = searchQuery.toLowerCase().trim();
    return builds.filter(
      (build) => build.name.toLowerCase().includes(query) || build.description.toLowerCase().includes(query),
    );
  }, [builds, searchQuery]);

  const groupedBuilds = useMemo(() => {
    return groupItemsByTimeHorizon(filteredBuilds);
  }, [filteredBuilds]);

  const visibleBuilds = useMemo(() => {
    let totalShown = 0;
    const result = [];

    for (const group of groupedBuilds) {
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
  }, [groupedBuilds, visibleCount]);

  const totalVisibleBuildCount = useMemo(() => {
    return visibleBuilds.reduce((sum, group) => sum + group.items.length, 0);
  }, [visibleBuilds]);

  const handleLoadMore = () => {
    setVisibleCount((previous) => previous + buildsPerPage);
  };

  const handleRename = (buildId: string) => {
    setEditingId(buildId);
  };

  const handleRenameSubmit = async (buildId: string, newName: string) => {
    if (newName.trim()) {
      await updateName(buildId, newName.trim());
    }

    setEditingId(undefined);
  };

  const handleRenameCancel = () => {
    setEditingId(undefined);
  };

  const handleDelete = async (buildId: string) => {
    const build = builds.find((b) => b.id === buildId);
    await deleteBuild(buildId);
    if (build) {
      toast.success(`Deleted ${build.name}`);
    }
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
    // Reset visible count when searching to show all results
    if (event.target.value.trim()) {
      setVisibleCount(Infinity);
    } else {
      setVisibleCount(buildsPerPage);
    }
  };

  const handleSearchClear = () => {
    setSearchQuery('');
    setVisibleCount(buildsPerPage);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Prevent the search from triggering sidebar navigation
    event.stopPropagation();
  };

  if (builds.length === 0) {
    return null;
  }

  return (
    <>
      {/* Search input */}
      <SidebarGroup className="-mb-2 group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>Recent Builds</SidebarGroupLabel>
        <SearchInput
          placeholder="Search builds..."
          value={searchQuery}
          className="h-7 bg-background dark:bg-background"
          onChange={handleSearchChange}
          onKeyDown={handleSearchKeyDown}
          onClear={handleSearchClear}
        />
      </SidebarGroup>

      {/* Temporal groups */}
      {visibleBuilds.map((group) => (
        <SidebarGroup key={group.name} className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>{group.name}</SidebarGroupLabel>
          <SidebarMenu>
            {group.items.map((build) => (
              <NavHistoryItem
                key={build.id}
                build={build}
                isEditing={editingId === build.id}
                onRename={handleRename}
                onRenameSubmit={handleRenameSubmit}
                onRenameCancel={handleRenameCancel}
                onDelete={handleDelete}
              />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ))}

      {/* Show "No results" message when searching with no results */}
      {searchQuery.trim() && filteredBuilds.length === 0 && (
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                No builds found for &ldquo;{searchQuery}&rdquo;
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      )}

      {/* Load More button */}
      {builds.length > totalVisibleBuildCount && !searchQuery.trim() && (
        <SidebarGroup className="-mt-3.5 group-data-[collapsible=icon]:hidden">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton className="text-sidebar-foreground/70" onClick={handleLoadMore}>
                <MoreHorizontal className="size-4" />
                <span>Load More</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      )}
    </>
  );
}

type NavHistoryItemProps = {
  readonly build: Build;
  readonly isEditing: boolean;
  readonly onRename: (buildId: string) => void;
  readonly onRenameSubmit: (buildId: string, newName: string) => Promise<void>;
  readonly onRenameCancel: () => void;
  readonly onDelete: (buildId: string) => Promise<void>;
};

function NavHistoryItem({ build, isEditing, onRename, onRenameSubmit, onRenameCancel, onDelete }: NavHistoryItemProps) {
  const { isMobile } = useSidebar();
  const [editValue, setEditValue] = useState(build.name);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void onRenameSubmit(build.id, editValue);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setEditValue(build.name);
      onRenameCancel();
    }
  };

  const handleBlur = () => {
    void onRenameSubmit(build.id, editValue);
  };

  const handleRenameClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onRename(build.id);
  };

  const handleDeleteClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    void onDelete(build.id);
  };

  const handleInputClick = (event: React.MouseEvent) => {
    event.stopPropagation();
  };

  const handleInputFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    // Select all text when focusing
    event.target.select();
  };

  return (
    <SidebarMenuItem key={build.id}>
      {isEditing ? (
        // Show editing state without NavLink to prevent drag issues
        <SidebarMenuButton className="bg-sidebar-accent">
          <History className="size-4 shrink-0" />
          <input
            autoFocus
            type="text"
            value={editValue}
            className="flex-1 border-none bg-transparent text-sidebar-foreground outline-none"
            onChange={(event) => {
              setEditValue(event.target.value);
            }}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onFocus={handleInputFocus}
            onClick={handleInputClick}
          />
        </SidebarMenuButton>
      ) : (
        <NavLink to={`/builds/${build.id}`} tabIndex={-1}>
          {({ isActive, isPending }) => (
            <SidebarMenuButton isActive={isActive}>
              {isPending ? <LoadingSpinner /> : <History className="size-4 shrink-0" />}
              <span className="flex-1 truncate">{build.name}</span>
            </SidebarMenuButton>
          )}
        </NavLink>
      )}
      {!isEditing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuAction shouldShowOnHover>
              <MoreHorizontal />
              <span className="sr-only">More</span>
            </SidebarMenuAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-48 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align={isMobile ? 'end' : 'start'}
          >
            <DropdownMenuItem onClick={handleRenameClick}>
              <Edit className="text-muted-foreground" />
              <span>Rename</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="hover:text-destructive [&:hover>svg]:text-destructive"
              onClick={handleDeleteClick}
            >
              <Trash2 className="text-muted-foreground" />
              <span>Delete</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </SidebarMenuItem>
  );
}
