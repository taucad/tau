import { BookOpen, Bot, FileAxis3D, Frame, Hammer, Map, PieChart, UsersRound, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { KeyCombination } from '#utils/keys.js';

type NavRoute = {
  title: string;
  url: string;
  icon: LucideIcon;
  keyCombination: KeyCombination;
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
      title: 'Converter',
      url: '/converter',
      icon: FileAxis3D,
      keyCombination: {
        key: 'o',
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
