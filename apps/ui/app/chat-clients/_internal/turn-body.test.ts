// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CadAgentExecution } from '@taucad/chat';
import { dialAgentHost } from '#chat-clients/_internal/turn-body.js';
import { AgentHostPlacementError, daemonPlacementOf } from '#lib/agent-host-placement.js';
import { createAgentHostClient } from '#services/agent-host-client.js';
import { createDaemonAgentHostTransport } from '#services/daemon-agent-host-client.js';

const storage = vi.hoisted(() => ({
  getProjectFileSystemConfig: vi.fn(async (): Promise<{ backend: 'memory' }> => ({ backend: 'memory' })),
}));

vi.mock('#flags/feature-flags.js', () => ({ isFeatureEnabled: () => false }));
vi.mock('#filesystem/handle-store.js', () => ({ getProjectFileSystemConfig: storage.getProjectFileSystemConfig }));

/** A chat placed on Tau Desktop, exactly as its stored `activeExecution` reads once synced to the web. */
const desktopExecution: CadAgentExecution = { kind: 'tau', model: 'openai-gpt-5.5', hostId: 'desktop' };

describe('dialAgentHost', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should refuse a persisted desktop placement on the web without resolving or dialling it', async () => {
    const hostId = daemonPlacementOf(desktopExecution);

    expect(hostId).toBe('desktop');
    const dial = dialAgentHost(hostId!, 'project-widget');

    await expect(dial).rejects.toBeInstanceOf(AgentHostPlacementError);
    await expect(dial).rejects.toHaveProperty('code', 'DESKTOP_ROOT_NOT_GRANTED');
    await expect(dial).rejects.toThrow(/Tau desktop app/);
    expect(storage.getProjectFileSystemConfig).not.toHaveBeenCalled();
  });

  it('should leave no unhandled rejection when a desktop chat is opened on the web (TAU-UI-5)', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      // The project route's read connector, for a chat whose stored execution names the desktop launcher.
      const hostId = daemonPlacementOf(desktopExecution)!;
      const client = createAgentHostClient(
        createDaemonAgentHostTransport(async () => dialAgentHost(hostId, 'project-widget')),
      );
      // The observer detaches before it ever reads, as a project switch or a republished connector does.
      await client.close();
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });

      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
