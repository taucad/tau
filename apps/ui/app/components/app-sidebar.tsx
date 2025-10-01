import * as React from 'react';
import { Link } from 'react-router';
import { NavHistory } from '#components/nav/nav-history.js';
import { NavMain } from '#components/nav/nav-main.js';
import { NavProjects } from '#components/nav/nav-projects.js';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenuButton,
  SidebarRail,
} from '#components/ui/sidebar.js';
import { Tau } from '#components/icons/tau.js';
import { NavChat } from '#components/nav/nav-chat.js';
import { navRoutes } from '#constants/route.constants.js';
import { NavFooter } from '#components/nav/nav-footer.js';

export function AppSidebar({ ...properties }: React.ComponentProps<typeof Sidebar>): React.JSX.Element {
  return (
    <Sidebar variant='floating' collapsible='offcanvas' {...properties}>
      <SidebarHeader>
        <SidebarMenuButton
          asChild
          tooltip="Home"
          className="gap-0 p-0! group-data-[collapsible=icon]:p-0! [&>svg]:size-7"
        >
          <Link to="/">
            <Tau className="overflow-clip rounded-md text-primary" />
            <span className="sr-only">Home</span>
          </Link>
        </SidebarMenuButton>
      </SidebarHeader>
      <SidebarContent>
        <div className="sticky top-0 z-10">
          <NavChat />
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavHistory />
          <NavMain items={navRoutes.navMain} />
          <NavProjects projects={navRoutes.projects} />
        </div>
      </SidebarContent>
      <SidebarFooter className="border-t flex flex-row items-center justify-between">
        <NavFooter />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
