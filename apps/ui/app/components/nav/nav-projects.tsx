import { Folder, Forward, MoreHorizontal, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router';
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
import { LoadingSpinner } from '#components/ui/loading-spinner.js';

export function NavProjects({
  projects,
}: {
  readonly projects: Array<{
    name: string;
    url: string;
    icon: LucideIcon;
  }>;
}): React.JSX.Element {
  const { isMobile } = useSidebar();

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Projects</SidebarGroupLabel>
      <SidebarMenu>
        {projects.map((item) => (
          <SidebarMenuItem key={item.name}>
            <NavLink to={item.url} tabIndex={-1}>
              {({ isPending, isActive }) => (
                <SidebarMenuButton isActive={isActive}>
                  {isPending ? <LoadingSpinner /> : <item.icon />}
                  <span>{item.name}</span>
                </SidebarMenuButton>
              )}
            </NavLink>
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
                <DropdownMenuItem>
                  <Folder className="text-muted-foreground" />
                  <span>View Project</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Forward className="text-muted-foreground" />
                  <span>Share Project</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Trash2 className="text-muted-foreground" />
                  <span>Delete Project</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}
        <SidebarMenuItem>
          <SidebarMenuButton className="text-sidebar-foreground/70">
            <MoreHorizontal className="text-sidebar-foreground/70" />
            <span>More</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
