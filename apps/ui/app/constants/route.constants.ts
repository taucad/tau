import {
  BookOpen,
  ChartColumn,
  Files,
  Frame,
  Hammer,
  Import,
  Map,
  PieChart,
  Plug,
  Settings,
  Shuffle,
  UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { openSettingsDialog } from '#hooks/use-settings-dialog.js';
import type { FeatureFlagName } from '#flags/flag.constants.js';

type NavRoute = {
  title: string;
  url: string;
  icon: LucideIcon;
  featureFlag?: FeatureFlagName;
  /** When set, clicking the item calls this instead of navigating to `url`. */
  action?: () => void;
};

type NavProject = {
  name: string;
  url: string;
  icon: LucideIcon;
};

export const navRoutes: {
  navMain: NavRoute[];
  navSecondary: NavRoute[];
  projects: NavProject[];
} = {
  navMain: [
    {
      title: 'Projects',
      url: '/projects/library',
      icon: Hammer,
      // Items: [
      //   {
      //     title: 'History',
      //     url: '/projects/history',
      //   },
      //   {
      //     title: 'Starred',
      //     url: '/projects/starred',
      //   },
      //   {
      //     title: 'Settings',
      //     url: '/projects/settings',
      //   },
      // ],
    },
    {
      title: 'Community',
      url: '/projects/community',
      icon: UsersRound,
    },
    {
      title: 'Convert',
      url: '/convert',
      icon: Shuffle,
    },
    {
      title: 'Import',
      url: '/import',
      icon: Import,
    },
    // {
    //   title: 'Workflows',
    //   url: '/workflows',
    //   icon: Workflow,
    // },
    {
      title: 'Plugins',
      url: '/plugins',
      icon: Plug,
      featureFlag: 'pluginsStore',
    },
    {
      title: 'Usage',
      url: '/usage',
      icon: ChartColumn,
    },
  ],
  navSecondary: [
    {
      title: 'Files',
      url: '/files',
      icon: Files,
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
      action(): void {
        openSettingsDialog();
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
