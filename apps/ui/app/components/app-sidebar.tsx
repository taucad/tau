import * as React from 'react';
import { BookOpen, Bot, Frame, Hammer, Map, PieChart, UsersRound, Workflow } from 'lucide-react';
import { Link } from 'react-router';
import { ColorToggle } from '~/components/nav/color-toggle.js';
import { NavHistory } from '~/components/nav/nav-history.js';
import { headerHeight } from '~/components/page.js';
import { NavMain } from '~/components/nav/nav-main.js';
import { NavProjects } from '~/components/nav/nav-projects.js';
import { NavUser } from '~/components/nav/nav-user.js';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenuButton,
  SidebarRail,
} from '~/components/ui/sidebar.js';
import { Tau } from '~/components/icons/tau.js';
import { NavChat } from '~/components/nav/nav-chat.js';
import { ModeToggle } from '~/components/nav/mode-toggle.js';

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
      // Items: [
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

export function AppSidebar({ ...properties }: React.ComponentProps<typeof Sidebar>): React.JSX.Element {
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
