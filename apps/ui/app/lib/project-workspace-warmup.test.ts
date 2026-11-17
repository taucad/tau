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

describe('loadProjectWorkspace', () => {
  it('shares one import and tags it fulfilled so a later render does not suspend', async () => {
    const { loadProjectWorkspace, warmProjectWorkspace } = await import('#lib/project-workspace-warmup.js');
    warmProjectWorkspace();
    const load = loadProjectWorkspace();
    expect(loadProjectWorkspace()).toBe(load);

    const module = await load;
    await Promise.resolve();

    expect(load).toMatchObject({ status: 'fulfilled', value: module });
  });
});

describe('openProjectWorkspace', () => {
  it('warms the layout through the shell once it loads, while link intent warms only the shell', async () => {
    vi.resetModules();
    const order: string[] = [];
    let settleShell: (() => void) | undefined;
    vi.doMock('#routes/w.$workspace.$project/project-live-sessions.js', async () => {
      order.push('shell requested');
      await new Promise<void>((resolve) => {
        settleShell = resolve;
      });
      order.push('shell loaded');
      return {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Mock the React component's exported name.
        LiveProjectSessions: () => null,
        warmWorkspaceLayout: () => {
          order.push('layout');
        },
      };
    });
    try {
      const { openProjectWorkspace, warmProjectWorkspace } = await import('#lib/project-workspace-warmup.js');

      warmProjectWorkspace();
      await vi.waitFor(() => {
        expect(order).toEqual(['shell requested']);
      });

      const load = openProjectWorkspace();
      expect(order).toEqual(['shell requested']);

      settleShell?.();
      await load;
      await vi.waitFor(() => {
        expect(order).toEqual(['shell requested', 'shell loaded', 'layout']);
      });
    } finally {
      vi.doUnmock('#routes/w.$workspace.$project/project-live-sessions.js');
    }
  });
});
