import { Code2, Cog, List, LogIn, LogOut, MessageCircle } from 'lucide-react';
import { useSession } from '@better-auth-ui/react';
import { authClient } from '#lib/auth-client.js';
import type { UIMatch } from 'react-router';
import { useCommandPaletteItems } from '#components/layout/command-palette.js';
import type { CommandPaletteItem } from '#components/layout/command-palette.js';
import { useAuthLinks } from '#hooks/use-auth-links.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';
import { ENV } from '#environment.config.js';
import { isDesktopTarget } from '#lib/build-target.js';

export function RootCommandPaletteItems({ match }: { readonly match: UIMatch }): undefined {
  const { data: authData } = useSession(authClient);
  const { signIn, signOut } = useAuthLinks();
  const { open: openSettings } = useSettingsDialog();

  useCommandPaletteItems(
    match.id,
    (): CommandPaletteItem[] => [
      {
        id: 'new-project-from-prompt',
        label: 'New project (from chat)',
        group: 'Projects',
        icon: <MessageCircle />,
        link: '/',
      },
      {
        id: 'new-project-from-code',
        label: 'New project (from code)',
        group: 'Projects',
        icon: <Code2 />,
        link: '/projects/new',
        shortcut: '⌃N',
      },
      {
        id: 'all-projects',
        label: 'All projects',
        group: 'Projects',
        icon: <List />,
        link: '/projects',
      },
      {
        id: 'open-settings',
        label: 'Settings',
        group: 'Settings',
        icon: <Cog />,
        action() {
          openSettings();
        },
        shortcut: '⌘,',
      },
      {
        id: 'geospec-performance',
        label: 'GeoSpec performance',
        group: 'Developer',
        icon: <Code2 />,
        link: '/debug/geospec',
        visible: ENV.TAU_DEBUG && !(isDesktopTarget() && import.meta.env.PROD),
      },
      {
        id: 'sign-in',
        label: 'Sign in',
        group: 'Settings',
        icon: <LogIn />,
        link: signIn,
        visible: !authData,
      },
      {
        id: 'sign-out',
        label: 'Sign out',
        group: 'Settings',
        icon: <LogOut />,
        link: signOut,
        visible: Boolean(authData),
      },
    ],
    [authData, signIn, signOut],
  );

  return undefined;
}
