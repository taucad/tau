// @vitest-environment jsdom
/**
 * STO-25 SP5: the real runtime's open asks for the layout its viewport will mount as soon as the session module has
 * loaded, before the session is live and focus settles on it, so the layout's chunk graph no longer starts loading only
 * once the route shows the editor.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppRuntime, selectRuntimeFocus } from '#runtime/app-runtime.js';
import { createFakeEnvironmentHost } from '#runtime/environment.fixture.js';

vi.mock('#services/project-agent-host-registration.js', () => ({
  registerProjectAgentHost: async () => ({ release: async () => undefined }),
}));

const chunks = vi.hoisted(() => ({
  requested: [] as string[],
  settleShell: undefined as (() => void) | undefined,
}));

/* The session module, held until the row lets it settle. */
vi.mock('#routes/w.$workspace.$project/project-live-sessions.js', async () => {
  chunks.requested.push('shell');
  await new Promise<void>((resolve) => {
    chunks.settleShell = resolve;
  });
  /* The real warm-up the session module exports, over the layouts mocked below. */
  const { warmWorkspaceLayout } = await import('#routes/w.$workspace.$project/chat-interface-layouts.js');
  return { LiveProjectSessions: () => null, ProjectChatRoute: () => null, warmWorkspaceLayout };
});
vi.mock('#routes/w.$workspace.$project/chat-interface-desktop.js', () => {
  chunks.requested.push('desktop');
  return { ChatInterfaceDesktop: () => null };
});
vi.mock('#routes/w.$workspace.$project/chat-interface-mobile.js', () => {
  chunks.requested.push('mobile');
  return { ChatInterfaceMobile: () => null };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the open warms the workspace layout beside the session module', () => {
  it('should request the desktop shell once the session module loads, before focus settles', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const host = createFakeEnvironmentHost();
    const runtime = createAppRuntime({ environment: () => host, idleFileManagers: true }).start();
    const { focus } = selectRuntimeFocus(runtime);
    expect(chunks.requested).toEqual([]);

    focus.send({
      type: 'routeRequested',
      requestId: 'route:1',
      slugs: { workspaceSlug: 'w', projectSlug: 'a' },
      projectId: 'proj_a',
    });

    await vi.waitFor(() => {
      expect(chunks.requested).toEqual(['shell']);
    });
    /* Focus waits on the session module alone: no layout is asked for before it, none is held behind it. */
    expect(focus.getSnapshot().context.module).toBe('loading');

    chunks.settleShell?.();
    await vi.waitFor(() => {
      expect(chunks.requested).toEqual(['shell', 'desktop']);
    });
    expect(focus.getSnapshot().context.module).toBe('loaded');
    /* Nothing has rendered a layout: no session is live, so focus has not settled and no route shows the editor. */
    expect(focus.getSnapshot().hasTag('focused')).toBe(false);
    runtime.stop();
  });

  it('should still load the session module when the viewport cannot be measured', async () => {
    chunks.requested.length = 0;
    /* Only the layout's query goes unanswered; the runtime's own queries are answered as usual. */
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) =>
        query === '(max-width: 767px)'
          ? undefined
          : { matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() },
      ),
    );
    const host = createFakeEnvironmentHost();
    const runtime = createAppRuntime({ environment: () => host, idleFileManagers: true }).start();
    const { focus } = selectRuntimeFocus(runtime);

    focus.send({
      type: 'routeRequested',
      requestId: 'route:2',
      slugs: { workspaceSlug: 'w', projectSlug: 'b' },
      projectId: 'proj_b',
    });

    /* The shell import is shared from the first row, already settled: the open reaches it all the same. */
    await vi.waitFor(() => {
      expect(focus.getSnapshot().context.module).toBe('loaded');
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(chunks.requested).toEqual([]);
    runtime.stop();
  });
});
