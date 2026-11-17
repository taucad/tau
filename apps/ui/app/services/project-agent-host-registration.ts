import { desktopBridge, isDesktopTarget } from '@taucad/files-ui/filesystem/desktop-bridge';
import { registrationProbeChatId } from '@taucad/ui-core/lib/chat-observation-guard';
import { desktopWorkspaceRoot, openAgentHostChannel } from '#lib/agent-host-placement.js';
import { probeBrowserAgentHostCapability } from '#services/agent-host-client.js';
import { getProjectFileSystemConfig } from '@taucad/files-ui/filesystem/handle-store';
import type { StorageDurabilityClass } from '@taucad/agent-host';
import type { FileSystemBackend } from '@taucad/types';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';

export type ProjectAgentHostRegistration = Readonly<{ release: () => Promise<void> }>;

/*
 * The log class each storage provider declares (`packages/filesystem` providers), which is what the worker's host
 * opens for the project. Only `exclusive-append` needs the origin-private filesystem and its sync access handle.
 */
const backendDurability: Readonly<Record<FileSystemBackend, StorageDurabilityClass>> = {
  opfs: 'exclusive-append',
  indexeddb: 'transactional-rewrite',
  webaccess: 'stream-append',
  memory: 'ephemeral',
  node: 'transactional-rewrite',
};

/* A project whose storage row cannot be read keeps the strictest probe. */
const projectDurability = async (projectId: string): Promise<StorageDurabilityClass> => {
  try {
    const config = await getProjectFileSystemConfig(projectId);
    return config === undefined ? 'exclusive-append' : backendDurability[config.backend];
  } catch {
    return 'exclusive-append';
  }
};

/**
 * Prove this project's local agent host is usable and retain its host resource.
 *
 * Browser registration runs the real worker capability request for the log the
 * project's own storage provides: an IndexedDB project needs no origin-private
 * filesystem, so a session without one still opens it. Desktop opens
 * the real launcher channel and performs a read-only attach before the
 * session may report ready.
 */
export const registerProjectAgentHost = async (
  projectId: string,
  attachmentId: string,
): Promise<ProjectAgentHostRegistration> => {
  if (!isDesktopTarget) {
    const capability = await probeBrowserAgentHostCapability({ durability: await projectDurability(projectId) });
    if (!capability.supported) {
      throw new Error(`Browser agent host is unavailable: ${capability.reason}`);
    }
    return { release: async () => undefined };
  }

  const bridge = desktopBridge();
  if (bridge === undefined) {
    throw new Error('The desktop agent-host bridge is unavailable.');
  }
  const workspaceRoot = await desktopWorkspaceRoot(projectId);
  await bridge.agentHost.retain(workspaceRoot, projectId, attachmentId);
  try {
    const client = await openAgentHostChannel('desktop', {
      workspaceRoot,
      projectId,
    });
    try {
      /* `attach` answers at once and opens nothing for a chat nothing wrote (W0.12); a `read` would park. */
      const answer = await client.execute({
        type: 'attach',
        commandId: generatePrefixedId(idPrefix.request),
        payload: { chatId: registrationProbeChatId },
      });
      if (answer.status === 'refused') {
        throw Object.assign(new Error(answer.message), { code: answer.code });
      }
    } finally {
      client.close('project-session-ready');
    }
  } catch (error) {
    await bridge.agentHost.release(workspaceRoot, projectId, attachmentId);
    throw error;
  }

  let released = false;
  return {
    release: async () => {
      if (released) {
        return;
      }
      await bridge.agentHost.release(workspaceRoot, projectId, attachmentId);
      released = true;
    },
  };
};
