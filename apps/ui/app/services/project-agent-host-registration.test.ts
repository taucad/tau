import { beforeEach, describe, expect, it, vi } from 'vitest';

const probe = vi.hoisted(() => vi.fn());

vi.mock('#filesystem/desktop-bridge.js', () => ({
  desktopBridge: () => undefined,
  isDesktopTarget: false,
}));
vi.mock('#lib/agent-host-placement.js', () => ({
  desktopWorkspaceRoot: vi.fn(),
  openAgentHostChannel: vi.fn(),
}));
vi.mock('#services/agent-host-client.js', () => ({ probeBrowserAgentHostCapability: probe }));

const { registerProjectAgentHost } = await import('#services/project-agent-host-registration.js');

describe('project agent-host registration', () => {
  beforeEach(() => probe.mockReset());

  it('reports the functional browser worker probe result', async () => {
    probe.mockResolvedValueOnce({ supported: true });
    const registration = await registerProjectAgentHost('project-a', 'window-a');
    await expect(registration.release()).resolves.toBeUndefined();

    probe.mockResolvedValueOnce({ supported: false, reason: 'worker-protocol' });
    await expect(registerProjectAgentHost('project-b', 'window-a')).rejects.toThrow(
      'Browser agent host is unavailable: worker-protocol',
    );
  });
});
