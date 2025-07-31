import * as React from 'react';
import { Link } from 'react-router';
import { ColorToggle } from '#components/nav/color-toggle.js';
import { NavHistory } from '#components/nav/nav-history.js';
import { headerHeight } from '#components/page.js';
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
import { ThemeToggle } from '#components/nav/theme-toggle.js';
import { navRoutes } from '#constants/route.constants.js';

export function AppSidebar({ ...properties }: React.ComponentProps<typeof Sidebar>): React.JSX.Element {
  return (
    <Sidebar collapsible="icon" {...properties}>
      <SidebarHeader style={{ height: headerHeight }} className="border-b border-border">
        <SidebarMenuButton
          asChild
          tooltip="Home"
          className="gap-0 p-0! group-data-[collapsible=icon]:p-0! [&>svg]:size-7"
        >
          <Link to="/">
            <Tau className="overflow-clip rounded-md text-primary" />
            <h1 className="-mb-0.5 -ml-1 font-mono text-[calc(var(--spacing)*6)] font-semibold tracking-wider text-primary italic group-data-[collapsible=icon]:hidden">
              au
            </h1>
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
      <SidebarFooter className="flex flex-col items-end transition-transform duration-200 ease-linear group-data-[collapsible=icon]:items-center">
        <ColorToggle />
        <ThemeToggle />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
