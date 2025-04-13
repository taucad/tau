import * as React from 'react';
import { BookOpen, Bot, Frame, Hammer, Map, PieChart, UsersRound, Workflow } from 'lucide-react';

import { NavMain } from '@/components/nav/nav-main';
import { NavProjects } from '@/components/nav/nav-projects';
import { NavUser } from '@/components/nav/nav-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenuButton,
  SidebarRail,
} from '@/components/ui/sidebar';
import { Tau } from '@/components/icons/tau';
import { NavChat } from '@/components/nav/nav-chat';
import { ModeToggle } from '@/components/nav/mode-toggle';
import { ColorToggle } from './nav/color-toggle';
import { NavHistory } from './nav/nav-history';
import { Link } from '@remix-run/react';
import { headerHeight } from './page';

// This is sample data.
const data = {
  user: {
    name: 'rifont',
    email: 'richard@fontein.co',
    avatar: '/avatar-sample.png',
  },
  navMain: [
    {
      title: 'Builds',
      url: '/builds/library',
      icon: Hammer,
      isActive: true,
      keyCombination: {
        key: 'b',
        ctrlKey: true,
      },
      // items: [
      //   {
      //     title: 'History',
      //     url: '/builds/history',
      //   },
      //   {
      //     title: 'Starred',
      //     url: '/builds/starred',
      //   },
      //   {
      //     title: 'Settings',
      //     url: '/builds/settings',
      //   },
      // ],
    },
    {
      title: 'Community',
      url: '/builds/community',
      icon: UsersRound,
      keyCombination: {
        key: 'g',
        ctrlKey: true,
      },
    },
    {
      title: 'Workflows',
      url: '/workflows',
      icon: Workflow,
      keyCombination: {
        key: 'w',
        ctrlKey: true,
      },
    },
    {
      title: 'Models',
      url: '/models',
      icon: Bot,
      keyCombination: {
        key: 'm',
        ctrlKey: true,
      },
    },
    {
      title: 'Documentation',
      url: '/docs',
      icon: BookOpen,
      keyCombination: {
        key: 'd',
        ctrlKey: true,
      },
    },
  ],
  projects: [
    {
      name: 'Design Engineering',
      url: '/projects/design-engineering',
      icon: Frame,
    },
    {
      name: 'Sales & Marketing',
      url: '/projects/sales-marketing',
      icon: PieChart,
    },
    {
      name: 'Travel',
      url: '/projects/travel',
      icon: Map,
    },
  ],
};

export function AppSidebar({ ...properties }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...properties}>
      <SidebarHeader style={{ height: headerHeight }} className="border-b border-border">
        <Link to="/" tabIndex={-1}>
          <SidebarMenuButton tooltip="Home" className="p-0! group-data-[collapsible=icon]:p-0! [&>svg]:size-8">
            <Tau className="overflow-clip rounded-md bg-primary text-primary" />
            <h1 className="font-mono text-2xl font-semibold tracking-wider">Tau</h1>
            <span className="sr-only">Home</span>
          </SidebarMenuButton>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <NavChat />
        <NavHistory />
        <NavMain items={data.navMain} />
        <NavProjects projects={data.projects} />
      </SidebarContent>
      <SidebarFooter className="flex flex-col items-end transition-transform duration-200 ease-linear group-data-[collapsible=icon]:items-center">
        <ColorToggle />
        <ModeToggle />
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
