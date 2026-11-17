import { beforeEach, describe, expect, it, vi } from 'vitest';

const probe = vi.hoisted(() => vi.fn());
const readConfig = vi.hoisted(() => vi.fn());

vi.mock('@taucad/files-ui/filesystem/desktop-bridge', () => ({
  desktopBridge: () => undefined,
  isDesktopTarget: false,
}));
vi.mock('#lib/agent-host-placement.js', () => ({
  desktopWorkspaceRoot: vi.fn(),
  openAgentHostChannel: vi.fn(),
}));
vi.mock('#services/agent-host-client.js', () => ({ probeBrowserAgentHostCapability: probe }));
vi.mock('@taucad/files-ui/filesystem/handle-store', () => ({ getProjectFileSystemConfig: readConfig }));

const { registerProjectAgentHost } = await import('#services/project-agent-host-registration.js');

describe('project agent-host registration', () => {
  beforeEach(() => {
    probe.mockReset();
    readConfig.mockReset();
  });

  it('reports the functional browser worker probe result', async () => {
    probe.mockResolvedValueOnce({ supported: true });
    const registration = await registerProjectAgentHost('project-a', 'window-a');
    await expect(registration.release()).resolves.toBeUndefined();

    probe.mockResolvedValueOnce({ supported: false, reason: 'worker-protocol' });
    await expect(registerProjectAgentHost('project-b', 'window-a')).rejects.toThrow(
      'Browser agent host is unavailable: worker-protocol',
    );
  });

  it.each([
    ['opfs', 'exclusive-append'],
    ['indexeddb', 'transactional-rewrite'],
    ['webaccess', 'stream-append'],
    ['memory', 'ephemeral'],
  ] as const)('probes a %s project for the %s log its storage provides', async (backend, durability) => {
    readConfig.mockResolvedValueOnce({ projectId: 'project-a', backend, providerBasePath: 'project-a' });
    probe.mockResolvedValueOnce({ supported: true });

    await registerProjectAgentHost('project-a', 'window-a');

    expect(readConfig).toHaveBeenCalledWith('project-a');
    expect(probe).toHaveBeenCalledWith({ durability });
  });

  it('opens an IndexedDB project where the window has no origin-private filesystem', async () => {
    readConfig.mockResolvedValueOnce({ projectId: 'project-a', backend: 'indexeddb', providerBasePath: 'project-a' });
    probe.mockImplementation(async ({ durability }: { durability: string }) =>
      durability === 'exclusive-append' ? { supported: false, reason: 'STORAGE_NOT_WRITABLE' } : { supported: true },
    );

    await expect(registerProjectAgentHost('project-a', 'window-a')).resolves.toMatchObject({
      release: expect.any(Function) as unknown,
    });
  });

  it('probes the exclusive-append log for a project whose storage it cannot read', async () => {
    readConfig.mockResolvedValueOnce(undefined);
    probe.mockResolvedValueOnce({ supported: true });

    await registerProjectAgentHost('project-a', 'window-a');

    expect(probe).toHaveBeenCalledWith({ durability: 'exclusive-append' });
  });
});
