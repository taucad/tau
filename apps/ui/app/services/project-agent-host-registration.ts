import { desktopBridge, isDesktopTarget } from '#filesystem/desktop-bridge.js';
import { desktopWorkspaceRoot, openAgentHostChannel } from '#lib/agent-host-placement.js';
import { probeBrowserAgentHostCapability } from '#services/agent-host-client.js';

export type ProjectAgentHostRegistration = Readonly<{ release: () => Promise<void> }>;

/**
 * Prove this project's local agent host is usable and retain its host resource.
 *
 * Browser registration runs the real worker capability request. Desktop opens
 * the real launcher channel and performs a read-only tail request before the
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
      const response = await client.execute({
        type: 'tail',
        chatId: '00000000-0000-4000-8000-000000000000',
        cursor: 0,
        limit: 1,
      });
      if (response.type !== 'tail') {
        throw new Error(`Desktop agent host returned ${response.type} during registration.`);
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
