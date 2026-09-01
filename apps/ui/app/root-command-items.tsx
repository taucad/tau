import { Code2, Cog, History, List, LogIn, LogOut, MessageCircle } from 'lucide-react';
import { useMemo } from 'react';
import { useSession } from '@better-auth-ui/react';
import { authClient } from '#lib/auth-client.js';
import { useLocation } from 'react-router';
import type { UIMatch } from 'react-router';
import { useCommandPaletteItems } from '#components/layout/command-palette.js';
import type { CommandPaletteItem } from '#components/layout/command-palette.js';
import { useProjects } from '#hooks/use-projects.js';
import { useAuthLinks } from '#hooks/use-auth-links.js';
import { openSettingsDialog } from '#hooks/use-settings-dialog.js';

export function RootCommandPaletteItems({ match }: { readonly match: UIMatch }): undefined {
  const { data: authData } = useSession(authClient);
  const { projects } = useProjects();
  const { signIn, signOut } = useAuthLinks();
  const location = useLocation();

  // Extract current project ID from pathname (e.g., /projects/abc123)
  const currentProjectId = location.pathname.startsWith('/projects/') ? location.pathname.split('/')[2] : undefined;

  // Filter out current project, sort by most recent, and take first 5
  const recentProjects = useMemo(
    () =>
      projects
        .filter((project) => project.id !== currentProjectId)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 5),
    [projects, currentProjectId],
  );

  useCommandPaletteItems(
    match.id,
    (): CommandPaletteItem[] => [
      {
        id: 'new-project-from-prompt',
        label: 'New project (from chat)',
        group: 'Projects',
        icon: <MessageCircle />,
        link: '/',
        shortcut: '⌃N',
      },
      {
        id: 'new-project-from-code',
        label: 'New project (from code)',
        group: 'Projects',
        icon: <Code2 />,
        link: '/projects/new',
      },
      {
        id: 'all-projects',
        label: 'All projects',
        group: 'Projects',
        icon: <List />,
        link: '/projects/library',
      },
      ...recentProjects.map((project) => ({
        id: `recent-project-${project.id}`,
        label: project.name,
        group: 'Recent',
        icon: <History />,
        link: `/projects/${project.id}`,
      })),
      {
        id: 'open-settings',
        label: 'Settings',
        group: 'Settings',
        icon: <Cog />,
        action() {
          openSettingsDialog();
        },
        shortcut: '⌘,',
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
    [authData, recentProjects, signIn, signOut],
  );

  return undefined;
}
