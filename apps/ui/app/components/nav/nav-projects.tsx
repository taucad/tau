import { useMemo, useState } from 'react';
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
import { Loader } from '#components/ui/loader.js';
import { useProjects } from '#hooks/use-projects.js';
import { ProjectShareDialog } from '#components/publish/project-share-dialog.js';

function projectIdFromProjectsUrl(url: string): string | undefined {
  const match = /^\/projects\/([^/]+)\/?$/u.exec(url);
  return match?.[1];
}

export function NavProjects({
  projects: pinnedProjects,
}: {
  readonly projects: Array<{
    name: string;
    url: string;
    icon: LucideIcon;
  }>;
}): React.JSX.Element {
  const { isMobile } = useSidebar();
  const { projects: indexedProjects } = useProjects();
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishTargetId, setPublishTargetId] = useState<string | undefined>(undefined);

  const publishTarget = useMemo(() => {
    if (!publishTargetId) {
      return undefined;
    }

    return indexedProjects.find((project) => project.id === publishTargetId);
  }, [indexedProjects, publishTargetId]);

  return (
    <SidebarGroup className='group-data-[collapsible=icon]:hidden'>
      <SidebarGroupLabel>Projects</SidebarGroupLabel>
      <SidebarMenu>
        {pinnedProjects.map((item) => (
          <SidebarMenuItem key={item.name}>
            <NavLink to={item.url}>
              {({ isPending, isActive }) => (
                <SidebarMenuButton asChild isActive={isActive}>
                  <span>
                    {isPending ? <Loader /> : <item.icon />}
                    <span>{item.name}</span>
                  </span>
                </SidebarMenuButton>
              )}
            </NavLink>
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
                <DropdownMenuItem>
                  <Folder />
                  <span>View Project</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid='share-project'
                  onClick={() => {
                    const id = projectIdFromProjectsUrl(item.url);
                    if (id) {
                      setPublishTargetId(id);
                      setPublishOpen(true);
                    }
                  }}
                >
                  <Forward />
                  <span>Share Project</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Trash2 />
                  <span>Delete Project</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}
        <SidebarMenuItem>
          <SidebarMenuButton className='text-sidebar-foreground/70'>
            <MoreHorizontal className='text-sidebar-foreground/70' />
            <span>More</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      {publishTarget ? (
        <ProjectShareDialog
          open={publishOpen}
          onOpenChange={(next) => {
            setPublishOpen(next);
            if (!next) {
              setPublishTargetId(undefined);
            }
          }}
          projectId={publishTarget.id}
          projectName={publishTarget.name}
          projectDescription={publishTarget.description}
          projectUpdatedAt={publishTarget.updatedAt}
          entryFile={publishTarget.assets.mechanical?.main ?? 'main.ts'}
          parameters={publishTarget.assets.mechanical?.parameters ?? {}}
        />
      ) : null}
    </SidebarGroup>
  );
}
