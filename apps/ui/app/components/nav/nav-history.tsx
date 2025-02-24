import { History, MoreHorizontal } from 'lucide-react';
import { storage } from '@/db/storage';
import { useEffect, useState } from 'react';
import { type Build } from '@/types/build';
import { NavLink, useMatch, useNavigate } from '@remix-run/react';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useKeydown } from '@/hooks/use-keydown';
import { KeyShortcut } from '../ui/key-shortcut';

const BUILDS_PER_PAGE = 5;

export function NavHistory() {
  const [builds, setBuilds] = useState<Build[]>([]);
  const [visibleCount, setVisibleCount] = useState(BUILDS_PER_PAGE);
  const [allBuilds, setAllBuilds] = useState<Build[]>([]);

  useEffect(() => {
    // Get all builds from storage and sort by most recently updated
    const builds = storage.getBuilds().sort((a, b) => b.updatedAt - a.updatedAt);
    setAllBuilds(builds);
    setBuilds(builds.slice(0, visibleCount));
  }, [visibleCount]);

  const handleLoadMore = () => {
    setVisibleCount((previous) => previous + BUILDS_PER_PAGE);
  };

  if (allBuilds.length === 0) {
    return;
  }

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Recent Builds</SidebarGroupLabel>
      <SidebarMenu>
        {builds.map((build, index) => (
          <NavHistoryItem key={build.id} build={build} index={index} />
        ))}
        {allBuilds.length > visibleCount && (
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLoadMore} className="text-sidebar-foreground/70">
              <MoreHorizontal className="size-4" />
              <span>Load More</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}

const NavHistoryItem = ({ build, index }: { build: Build; index: number }) => {
  const isMatch = useMatch(`/builds/${build.id}`);
  const navigate = useNavigate();
  const { formattedKeyCombination } = useKeydown(
    {
      key: `${index + 1}`,
      ctrlKey: true,
    },
    () => {
      if (isMatch) return;
      navigate(`/builds/${build.id}`);
    },
  );
  return (
    <SidebarMenuItem key={build.id}>
      <NavLink to={`/builds/${build.id}`} tabIndex={-1}>
        {({ isActive }) => (
          <SidebarMenuButton isActive={isActive}>
            <History className="size-4 shrink-0" />
            <span className="truncate flex-1">bld_{build.id.slice(0, 16)}...</span>
            {index < 10 && <KeyShortcut className="ml-2 shrink-0">{formattedKeyCombination}</KeyShortcut>}
          </SidebarMenuButton>
        )}
      </NavLink>
    </SidebarMenuItem>
  );
};
