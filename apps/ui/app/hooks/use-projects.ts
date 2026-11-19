/**
 * The app's binding of the project listing hook (`@taucad/files-ui/hooks/use-projects`): it passes the project
 * manager, the chat session store and this device's view exceptions, read through their app modules, so a suite that
 * mocks `#hooks/use-project-manager` or `#hooks/chat-session-store-provider` reaches the hook through them.
 */
import { useProjects as useProjectListing } from '@taucad/files-ui/hooks/use-projects';
import type { ProjectScope } from '@taucad/files-ui/types/project-library.types';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { viewExceptions } from '#workbench-records/view-exceptions.js';

// oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- let types be inferred
export function useProjects(options?: { scope?: ProjectScope }) {
  const chatSessions = useChatSessionStore();
  const projectManager = useProjectManager();
  return useProjectListing({ projectManager, chatSessions, viewExceptions }, options);
}
