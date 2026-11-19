/**
 * The app's binding of the project manager (`@taucad/files-ui/hooks/project-manager-provider`).
 *
 * The provider and its context live in files-ui; this binding resolves the app runtime's project library and passes
 * what only the app supplies: the project-name client, the chat permission modes and the first-project tour. Each
 * service reads its app module when it is called, so a suite that mocks one of those modules reaches the provider
 * through it, and a suite that mocks this module replaces `useProjectManager` for every app reader.
 */
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { ProjectManagerProvider as ProjectManagerServiceProvider } from '@taucad/files-ui/hooks/project-manager-provider';
import type { ProjectManagerServices } from '@taucad/files-ui/hooks/project-manager-provider';
import { useProjectManager as useProjectManagerContext } from '@taucad/files-ui/hooks/use-project-manager';
import type { ProjectManagerContextType } from '@taucad/files-ui/hooks/use-project-manager';
import { removeChatPermission, seedChatPermission } from '#hooks/use-permission-mode.js';
import { useProjectNameClient } from '#chat-clients/use-project-name-client.js';
import type { ProjectLibrary } from '#runtime/project-library.js';
import { selectRuntimeProjectLibrary } from '#runtime/app-runtime.js';
import { useOptionalAppRuntime } from '#runtime/app-runtime-provider.js';
import { prepareFirstProjectTour } from '#components/tour/first-project-tour.js';

/** The app's services, bound to its modules; the project-name client is a hook, so the provider adds it. */
const projectManagerServices: Omit<ProjectManagerServices, 'generateProjectName'> = {
  seedChatPermission: async (projectId, chatId) => seedChatPermission(projectId, chatId),
  removeChatPermission: async (projectId, chatId) => removeChatPermission(projectId, chatId),
  prepareFirstProjectTour: async (readProjectCount) =>
    prepareFirstProjectTour({
      readProjectCount,
      async readAccount() {
        const { authClient } = await import('#lib/auth-client.js');
        const { data, error } = await authClient.getSession();
        if (error !== null) {
          throw new Error('The session could not be read');
        }
        return data === null ? { isSignedIn: false } : { isSignedIn: true, createdAt: data.user.createdAt };
      },
    }),
};

export function ProjectManagerProvider({
  children,
  library: composed,
}: {
  readonly children?: ReactNode;
  readonly library?: ProjectLibrary;
}): React.JSX.Element {
  const runtime = useOptionalAppRuntime();
  const library = composed ?? (runtime === undefined ? undefined : selectRuntimeProjectLibrary(runtime));
  if (library === undefined) {
    throw new Error('ProjectManagerProvider must be used within <AppRuntimeProvider>, or be given a library');
  }
  const { generate: generateProjectName } = useProjectNameClient();
  const services = useMemo<ProjectManagerServices>(
    () => ({ ...projectManagerServices, generateProjectName }),
    [generateProjectName],
  );

  return (
    <ProjectManagerServiceProvider library={library} services={services}>
      {children}
    </ProjectManagerServiceProvider>
  );
}

/**
 * The project manager, from files-ui's context. App readers import it from here, so a suite that mocks this module
 * replaces it for all of them.
 *
 * @returns The value the nearest `ProjectManagerProvider` supplies.
 */
export function useProjectManager(): ProjectManagerContextType {
  return useProjectManagerContext();
}
