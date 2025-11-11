import { Cog, List, LogIn, LogOut, Plus } from 'lucide-react';
import { useAuthenticate } from '@daveyplate/better-auth-ui';
import type { UIMatch } from 'react-router';
import { useCommandPaletteItems } from '#components/layout/commands.js';
import type { CommandPaletteItem } from '#components/layout/commands.js';

export function RootCommandPaletteItems({ match }: { readonly match: UIMatch }): undefined {
  const { data: authData } = useAuthenticate({ enabled: false });

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
    [authData],
  );

  return undefined;
}
