import { Edit, History, MoreHorizontal, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import type { Build } from '~/types/build.types.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu.js';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '~/components/ui/sidebar.js';
import { useBuilds } from '~/hooks/use-builds.js';
import { toast } from '~/components/ui/sonner.js';

const buildsPerPage = 5;

export function NavHistory(): ReactNode {
  const [visibleCount, setVisibleCount] = useState(buildsPerPage);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const { builds, deleteBuild, updateName } = useBuilds();

  const visibleBuilds = useMemo(() => {
    const sortedBuilds = builds.sort((a, b) => b.updatedAt - a.updatedAt);
    return sortedBuilds.slice(0, visibleCount);
  }, [builds, visibleCount]);

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

  if (visibleBuilds.length === 0) {
    return null;
  }

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Recent Builds</SidebarGroupLabel>
      <SidebarMenu>
        {visibleBuilds.map((build) => (
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
        {builds.length > visibleCount && (
          <SidebarMenuItem>
            <SidebarMenuButton shouldAutoClose className="text-sidebar-foreground/70" onClick={handleLoadMore}>
              <MoreHorizontal className="size-4" />
              <span>Load More</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </SidebarGroup>
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
          {({ isActive }) => (
            <SidebarMenuButton isActive={isActive}>
              <History className="size-4 shrink-0" />
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
