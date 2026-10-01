import { beforeEach, describe, expect, it, vi } from 'vitest';

const desktop = vi.hoisted(() => ({
  enabled: false,
  retain: vi.fn(async () => undefined),
  release: vi.fn(async () => undefined),
  execute: vi.fn(async () => ({ type: 'tail' })),
  close: vi.fn(),
  open: vi.fn(),
}));

vi.mock('#flags/feature-flags.js', () => ({ isFeatureEnabled: () => desktop.enabled }));
vi.mock('#filesystem/desktop-bridge.js', () => ({
  desktopBridge: () => ({ agentHost: { retain: desktop.retain, release: desktop.release } }),
  isDesktopTarget: true,
}));
vi.mock('#lib/agent-host-placement.js', () => ({
  desktopWorkspaceRoot: async () => '/projects/widget',
  openAgentHostChannel: desktop.open,
}));
vi.mock('#services/agent-host-client.js', () => ({ probeBrowserAgentHostCapability: vi.fn() }));

const { registerProjectAgentHost } = await import('#services/project-agent-host-registration.js');
const { dialAgentHost } = await import('#chat-clients/_internal/turn-body.js');

describe('desktop GeoSpec engine selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    desktop.open.mockResolvedValue({ execute: desktop.execute, close: desktop.close });
  });

  it.each([false, true])('should ignore the stale opt-in %s for registration and turn dialing', async (enabled) => {
    desktop.enabled = enabled;
    const registration = await registerProjectAgentHost('project-widget', 'window-1');
    await dialAgentHost('desktop', 'project-widget');

    expect(desktop.open).toHaveBeenCalledTimes(2);
    for (const call of desktop.open.mock.calls) {
      expect(call).toEqual([
        'desktop',
        {
          workspaceRoot: '/projects/widget',
          projectId: 'project-widget',
        },
      ]);
    }
    expect(desktop.retain).toHaveBeenCalledExactlyOnceWith('/projects/widget', 'project-widget', 'window-1');
    expect(desktop.close).toHaveBeenCalledExactlyOnceWith('project-session-ready');
    await registration.release();
    expect(desktop.release).toHaveBeenCalledExactlyOnceWith('/projects/widget', 'project-widget', 'window-1');
  });
});
