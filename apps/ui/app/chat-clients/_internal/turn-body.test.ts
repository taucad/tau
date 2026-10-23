// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CadAgentExecution } from '@taucad/chat';
import { dialExecutionHost } from '#chat-clients/_internal/turn-body.js';
import { AgentHostPlacementError, daemonPlacementOf } from '#lib/agent-host-placement.js';
import { createAgentHostClient } from '#services/agent-host-client.js';
import { createDaemonAgentHostTransport } from '#services/daemon-agent-host-client.js';

const storage = vi.hoisted(() => ({
  getProjectFileSystemConfig: vi.fn(async (): Promise<{ backend: 'memory' }> => ({ backend: 'memory' })),
}));

vi.mock('#flags/feature-flags.js', () => ({ isFeatureEnabled: () => false }));
vi.mock('#filesystem/handle-store.js', () => ({ getProjectFileSystemConfig: storage.getProjectFileSystemConfig }));

/** A Tau chat placed on Tau Desktop, exactly as its stored `activeExecution` reads once synced to the web. */
const desktopTauExecution: CadAgentExecution = { kind: 'tau', model: 'openai-gpt-5.5', hostId: 'desktop' };
/** An external agent started in Tau Desktop: its CLI is on that computer, so the pin is real. */
const desktopCodexExecution: CadAgentExecution = { kind: 'acp', hostId: 'desktop', agentId: 'codex' };

describe('placing a chat started in Tau Desktop, on the web', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should place a stored desktop Tau chat on this page’s own worker instead of refusing it', () => {
    // `undefined` is the browser worker: the read connector and admission take that branch, never a dial.
    expect(daemonPlacementOf(desktopTauExecution)).toBeUndefined();
  });

  it('should refuse an external agent pinned to Tau Desktop with a typed reason, without resolving or dialling it', async () => {
    const dial = dialExecutionHost(desktopCodexExecution, 'project-widget');

    await expect(dial).rejects.toBeInstanceOf(AgentHostPlacementError);
    await expect(dial).rejects.toHaveProperty('code', 'HOST_NOT_ON_THIS_DEVICE');
    await expect(dial).rejects.toThrow(/Tau desktop app/);
    expect(storage.getProjectFileSystemConfig).not.toHaveBeenCalled();
  });

  it('should leave no unhandled rejection when a desktop external-agent chat is observed on the web (TAU-UI-5)', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      // The project route's read connector, for a chat whose stored execution names the desktop launcher.
      const client = createAgentHostClient(
        createDaemonAgentHostTransport(async () => dialExecutionHost(desktopCodexExecution, 'project-widget')),
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
