import * as React from 'react';
import {
  AudioWaveform,
  BookOpen,
  Command,
  Component,
  Frame,
  Hammer,
  Map,
  PieChart,
  Settings2,
  UsersRound,
  Workflow,
} from 'lucide-react';

import { NavMain } from '@/components/nav/nav-main';
import { NavProjects } from '@/components/nav/nav-projects';
import { NavUser } from '@/components/nav/nav-user';
import { TeamSwitcher } from '@/components/nav/team-switcher';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from '@/components/ui/sidebar';
import { Tau } from '@/components/icons/tau';
import { NavChat } from '@/components/nav/nav-chat';
import { ModeToggle } from '@/components/nav/mode-toggle';
import { ColorToggle } from './nav/color-toggle';
import { NavHistory } from './nav/nav-history';

// This is sample data.
const data = {
  user: {
    name: 'rifont',
    email: 'richard@fontein.co',
    avatar: '/avatar-sample.png',
  },
  teams: [
    {
      name: 'Tau',
      logo: () => <Tau className="size-8 text-primary bg-primary rounded-md overflow-clip" />,
      plan: 'Enterprise',
    },
    {
      name: 'Acme Corp.',
      logo: AudioWaveform,
      plan: 'Startup',
    },
    {
      name: 'Evil Corp.',
      logo: Command,
      plan: 'Free',
    },
  ],
  navMain: [
    {
      title: 'Builds',
      url: '/builds/library',
      icon: Hammer,
      isActive: true,
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
    },
    {
      title: 'Workflows',
      url: '/workflows',
      icon: Workflow,
    },
    {
      title: 'Specifications',
      url: '/specifications',
      icon: Component,
    },
    {
      title: 'Documentation',
      url: '/docs',
      icon: BookOpen,
    },
    {
      title: 'Settings',
      url: '/settings',
      icon: Settings2,
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
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent className="mt-[0.1875rem]">
        <NavChat />
        <NavHistory />
        <NavMain items={data.navMain} />
        <NavProjects projects={data.projects} />
      </SidebarContent>
      <SidebarFooter className="flex flex-col transition-all duration-200 ease-linear items-end group-data-[collapsible=icon]:items-center">
        <ColorToggle />
        <ModeToggle />
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
