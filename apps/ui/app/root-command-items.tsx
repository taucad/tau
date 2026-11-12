import { Code2, Cog, List, LogIn, LogOut, MessageCircle, Sparkles } from 'lucide-react';
import { useSession } from '@better-auth-ui/react';
import { authClient } from '#lib/auth-client.js';
import type { UIMatch } from 'react-router';
import { useCommandPaletteItems } from '#components/layout/command-palette.js';
import type { CommandPaletteItem } from '#components/layout/command-palette.js';
import { useAuthLinks } from '#hooks/use-auth-links.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';
import { useFeature } from '#flags/use-feature.js';
import { setupEntryCopy } from '#components/onboarding/setup-copy.js';
import { setupHref } from '#components/onboarding/setup-entry.js';

export function RootCommandPaletteItems({ match }: { readonly match: UIMatch }): undefined {
  const { data: authData } = useSession(authClient);
  const { signIn, signOut } = useAuthLinks();
  const { open: openSettings } = useSettingsDialog();
  const isOnboardingEnabled = useFeature('onboarding');

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
        id: 'set-up-tau',
        label: setupEntryCopy.setUpTau,
        group: 'Settings',
        icon: <Sparkles />,
        link: setupHref('palette'),
        visible: isOnboardingEnabled,
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
    [authData, isOnboardingEnabled, signIn, signOut],
  );

  return undefined;
}
