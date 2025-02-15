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
import { Taucad } from '@/components/icons/taucad';
import { NavChat } from '@/components/nav/nav-chat';
import { ModeToggle } from '@/components/mode-toggle';

// This is sample data.
const data = {
  user: {
    name: 'rifont',
    email: 'richard@fontein.co',
    avatar: '/avatar-sample.png',
  },
  teams: [
    {
      name: 'TauCAD',
      logo: Taucad,
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
      url: '/builds',
      icon: Hammer,
      isActive: true,
      // items: [
      //   {
      //     title: 'History',
      //     url: '#',
      //   },
      //   {
      //     title: 'Starred',
      //     url: '#',
      //   },
      //   {
      //     title: 'Settings',
      //     url: '#',
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
      url: '#',
      icon: Component,
    },
    {
      title: 'Documentation',
      url: '#',
      icon: BookOpen,
    },
    {
      title: 'Settings',
      url: '#',
      icon: Settings2,
    },
  ],
  projects: [
    {
      name: 'Design Engineering',
      url: '#',
      icon: Frame,
    },
    {
      name: 'Sales & Marketing',
      url: '#',
      icon: PieChart,
    },
    {
      name: 'Travel',
      url: '#',
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
      <SidebarContent>
        <NavChat />
        <NavMain items={data.navMain} />
        <NavProjects projects={data.projects} />
      </SidebarContent>
      <SidebarFooter className="flex flex-col transition-all duration-200 ease-linear items-end group-data-[collapsible=icon]:items-center">
        <ModeToggle />
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
