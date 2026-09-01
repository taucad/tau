import { BookOpen, ChartColumn, Files, Hammer, Import, Plug, Settings, Shuffle, UsersRound } from 'lucide-react';
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

export const navRoutes: {
  navMain: NavRoute[];
  navSecondary: NavRoute[];
} = {
  navMain: [
    {
      title: 'Projects',
      url: '/projects',
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
      url: '/community',
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
      url: 'https://docs.tau.new',
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
};
