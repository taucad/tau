import { BookOpen, Bot, FileAxis3D, Frame, Hammer, Map, PieChart, Settings, UsersRound, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type NavRoute = {
  title: string;
  url: string;
  icon: LucideIcon;
};

type NavProject = {
  name: string;
  url: string;
  icon: LucideIcon;
};

export const navRoutes: {
  navMain: NavRoute[];
  projects: NavProject[];
} = {
  navMain: [
    {
      title: 'Builds',
      url: '/builds/library',
      icon: Hammer,
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
    },
    {
      title: 'Converter',
      url: '/converter',
      icon: FileAxis3D,
    },
    {
      title: 'Workflows',
      url: '/workflows',
      icon: Workflow,
    },
    {
      title: 'Models',
      url: '/models',
      icon: Bot,
    },
    {
      title: 'Documentation',
      url: '/docs',
      icon: BookOpen,
    },
    {
      title: 'Settings',
      url: '/settings',
      icon: Settings,
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
