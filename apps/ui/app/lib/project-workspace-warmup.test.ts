import { beforeEach, describe, expect, it, vi } from 'vitest';

type WorkspaceModule = Record<string, unknown>;

const { loadWorkspace, standInWorkspace, workspaceMock } = vi.hoisted(() => {
  const load = vi.fn();
  /** The workspace module's stand-in, which counts its loads. */
  const standIn = (): WorkspaceModule => {
    load();
    const liveProjectSessions = () => null;
    return {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Mock the React component's exported name.
      LiveProjectSessions: liveProjectSessions,
    };
  };
  /**
   * The module the one registered mock builds: the stand-in, or a row's own. A row swaps this rather than calling
   * `vi.doMock` again: Vitest resolves the queued registrations of an id in parallel and keeps whichever resolves
   * last, so a row's second registration could lose to `beforeEach`'s and the row would import the stand-in (#2964).
   */
  const mock: { build: () => Promise<WorkspaceModule> | WorkspaceModule } = { build: standIn };
  return { loadWorkspace: load, standInWorkspace: standIn, workspaceMock: mock };
});

vi.mock('#routes/w.$workspace.$project/project-live-sessions.js', async () => workspaceMock.build());

beforeEach(() => {
  /* Each row starts with no workspace import: the module holds the one shared import. */
  vi.resetModules();
  /* A fresh factory too: a mock module's result outlives `resetModules`, and the stand-in counts its own loads. */
  workspaceMock.build = standInWorkspace;
  vi.doMock('#routes/w.$workspace.$project/project-live-sessions.js', async () => workspaceMock.build());
  loadWorkspace.mockClear();
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
    const order: string[] = [];
    let settleShell: (() => void) | undefined;
    workspaceMock.build = async () => {
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
    };
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
  });
});
