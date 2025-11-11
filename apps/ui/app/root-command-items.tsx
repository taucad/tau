import { Cog, History, List, LogIn, LogOut, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useAuthenticate } from '@daveyplate/better-auth-ui';
import { useLocation } from 'react-router';
import type { UIMatch } from 'react-router';
import { useCommandPaletteItems } from '#components/layout/commands.js';
import type { CommandPaletteItem } from '#components/layout/commands.js';
import { useBuilds } from '#hooks/use-builds.js';

export function RootCommandPaletteItems({ match }: { readonly match: UIMatch }): undefined {
  const { data: authData } = useAuthenticate({ enabled: false });
  const { builds } = useBuilds();
  const location = useLocation();

  // Extract current build ID from pathname (e.g., /builds/abc123)
  const currentBuildId = location.pathname.startsWith('/builds/') ? location.pathname.split('/')[2] : undefined;

  // Filter out current build, sort by most recent, and take first 5
  const recentBuilds = useMemo(
    () =>
      builds
        .filter((build) => build.id !== currentBuildId)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 5),
    [builds, currentBuildId],
  );

  useCommandPaletteItems(
    match.id,
    (): CommandPaletteItem[] => [
      {
        id: 'new-build-from-prompt',
        label: 'New build (from prompt)',
        group: 'Builds',
        icon: <Plus />,
        link: '/',
        shortcut: '⌃N',
      },
      {
        id: 'new-build-from-code',
        label: 'New build (from code)',
        group: 'Builds',
        icon: <Plus />,
        link: '/builds/new',
      },
      {
        id: 'all-builds',
        label: 'All builds',
        group: 'Builds',
        icon: <List />,
        link: '/builds/library',
      },
      ...recentBuilds.map((build) => ({
        id: `recent-build-${build.id}`,
        label: build.name,
        group: 'Recent',
        icon: <History />,
        link: `/builds/${build.id}`,
      })),
      {
        id: 'open-settings',
        label: 'Open settings',
        group: 'Settings',
        icon: <Cog />,
        link: '/settings',
        visible: Boolean(authData),
      },
      {
        id: 'sign-in',
        label: 'Sign in',
        group: 'Settings',
        icon: <LogIn />,
        link: '/auth/sign-in',
        visible: !authData,
      },
      {
        id: 'sign-out',
        label: 'Sign out',
        group: 'Settings',
        icon: <LogOut />,
        link: '/auth/sign-out',
        visible: Boolean(authData),
      },
    ],
    [authData, recentBuilds],
  );

  return undefined;
}
