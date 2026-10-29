import { describe, expect, it, vi } from 'vitest';

const { loadWorkspace } = vi.hoisted(() => ({
  loadWorkspace: vi.fn(),
}));

vi.mock('#routes/w.$workspace.$project/project-live-sessions.js', () => {
  loadWorkspace();
  const liveProjectSessions = () => null;
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Mock the React component's exported name.
    LiveProjectSessions: liveProjectSessions,
  };
});

describe('warmProjectWorkspace', () => {
  it('waits for project-link intent and loads the workspace once', async () => {
    const { warmProjectWorkspace } = await import('#lib/project-workspace-warmup.js');
    expect(loadWorkspace).not.toHaveBeenCalled();

    warmProjectWorkspace();
    warmProjectWorkspace();

    await vi.waitFor(() => {
      expect(loadWorkspace).toHaveBeenCalledOnce();
    });
  });
});
