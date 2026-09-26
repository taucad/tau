import { desktopBridge, isDesktopTarget } from '#filesystem/desktop-bridge.js';
import { desktopWorkspaceRoot, openAgentHostChannel } from '#lib/agent-host-placement.js';
import { probeBrowserAgentHostCapability } from '#services/agent-host-client.js';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';

export type ProjectAgentHostRegistration = Readonly<{ release: () => Promise<void> }>;

/**
 * Prove this project's local agent host is usable and retain its host resource.
 *
 * Browser registration runs the real worker capability request. Desktop opens
 * the real launcher channel and performs a read-only attach before the
 * session may report ready.
 */
export const registerProjectAgentHost = async (
  projectId: string,
  attachmentId: string,
): Promise<ProjectAgentHostRegistration> => {
  if (!isDesktopTarget) {
    const capability = await probeBrowserAgentHostCapability();
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
    const client = await openAgentHostChannel('desktop', { workspaceRoot, projectId });
    try {
      /* `attach` answers at once and opens nothing for a chat nothing wrote (W0.12); a `read` would park. */
      const answer = await client.execute({
        type: 'attach',
        commandId: generatePrefixedId(idPrefix.request),
        payload: { chatId: '00000000-0000-4000-8000-000000000000' },
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
