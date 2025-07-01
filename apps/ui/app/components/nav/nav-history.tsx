import { History, MoreHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useMatch, useNavigate } from 'react-router';
import type { Build } from '~/types/build.types.js';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '~/components/ui/sidebar.js';
import { useKeydown } from '~/hooks/use-keydown.js';
import { KeyShortcut } from '~/components/ui/key-shortcut.js';
import { useBuilds } from '~/hooks/use-builds.js';

const buildsPerPage = 5;
const maxShortcutLength = 9;

export function NavHistory(): ReactNode {
  const [visibleCount, setVisibleCount] = useState(buildsPerPage);
  const { builds } = useBuilds();

  const visibleBuilds = useMemo(() => {
    const sortedBuilds = builds.sort((a, b) => b.updatedAt - a.updatedAt);
    return sortedBuilds.slice(0, visibleCount);
  }, [builds, visibleCount]);

  const handleLoadMore = () => {
    setVisibleCount((previous) => previous + buildsPerPage);
  };

  if (visibleBuilds.length === 0) {
    return null;
  }

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Recent Builds</SidebarGroupLabel>
      <SidebarMenu>
        {visibleBuilds.map((build, index) => (
          <NavHistoryItem key={build.id} build={build} index={index} />
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

function NavHistoryItem({ build, index }: { readonly build: Build; readonly index: number }) {
  const isMatch = useMatch(`/builds/${build.id}`);
  const navigate = useNavigate();
  const { formattedKeyCombination } = useKeydown(
    {
      key: `${index + 1}`,
      ctrlKey: true,
    },
    () => {
      if (isMatch) return;
      void navigate(`/builds/${build.id}`);
    },
  );
  return (
    <SidebarMenuItem key={build.id}>
      <NavLink to={`/builds/${build.id}`} tabIndex={-1}>
        {({ isActive }) => (
          <SidebarMenuButton isActive={isActive}>
            <History className="size-4 shrink-0" />
            <span className="flex-1 truncate">{build.name}</span>
            {index < maxShortcutLength && (
              <KeyShortcut className="ml-2 shrink-0">{formattedKeyCombination}</KeyShortcut>
            )}
          </SidebarMenuButton>
        )}
      </NavLink>
    </SidebarMenuItem>
  );
}
