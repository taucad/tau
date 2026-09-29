import { describe, expect, it, vi } from 'vitest';

const { loadWorkspace, warmMonaco } = vi.hoisted(() => ({
  loadWorkspace: vi.fn(),
  warmMonaco: vi.fn(),
}));

vi.mock('#lib/monaco-warmup.js', () => ({ warmMonaco }));
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

    expect(warmMonaco).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => {
      expect(loadWorkspace).toHaveBeenCalledOnce();
    });
  });
});
