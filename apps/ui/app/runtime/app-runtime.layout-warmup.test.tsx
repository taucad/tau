// @vitest-environment jsdom
/**
 * STO-25 SP5: the real runtime's open asks for the layout its viewport will mount as soon as the session module has
 * loaded, before the session is live and focus settles on it, so the layout's chunk graph no longer starts loading only
 * once the route shows the editor.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeEnvironmentHost } from '#runtime/environment.fixture.js';
import type * as AppRuntimeModule from '#runtime/app-runtime.js';

vi.mock('#services/project-agent-host-registration.js', () => ({
  registerProjectAgentHost: async () => ({ release: async () => undefined }),
}));

const chunks = vi.hoisted(() => ({
  requested: [] as string[],
  settleShell: undefined as (() => void) | undefined,
}));

/* Each row opens over a fresh module graph: its own runtime, its own unsettled session module and its own layout
 * imports, so no row leans on what another loaded, whatever order they run in. */
let runtimeModule: typeof AppRuntimeModule;
beforeEach(async () => {
  chunks.requested.length = 0;
  chunks.settleShell = undefined;
  vi.resetModules();
  /* The session module, held until the row lets it settle. */
  vi.doMock('#routes/w.$workspace.$project/project-live-sessions.js', async () => {
    chunks.requested.push('shell');
    await new Promise<void>((resolve) => {
      chunks.settleShell = resolve;
    });
    /* The real warm-up the session module exports, over the layouts mocked below. */
    const { warmWorkspaceLayout } = await import('#routes/w.$workspace.$project/chat-interface-layouts.js');
    return { LiveProjectSessions: () => null, ProjectChatRoute: () => null, warmWorkspaceLayout };
  });
  vi.doMock('#routes/w.$workspace.$project/chat-interface-desktop.js', () => {
    chunks.requested.push('desktop');
    return { ChatInterfaceDesktop: () => null };
  });
  vi.doMock('#routes/w.$workspace.$project/chat-interface-mobile.js', () => {
    chunks.requested.push('mobile');
    return { ChatInterfaceMobile: () => null };
  });
  runtimeModule = await import('#runtime/app-runtime.js');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Open `proj_<slug>` through the real runtime's focus. */
const openProject = (slug: string) => {
  const host = createFakeEnvironmentHost();
  const runtime = runtimeModule.createAppRuntime({ environment: () => host, idleFileManagers: true }).start();
  const { focus } = runtimeModule.selectRuntimeFocus(runtime);
  focus.send({
    type: 'routeRequested',
    requestId: `route:${slug}`,
    slugs: { workspaceSlug: 'w', projectSlug: slug },
    projectId: `proj_${slug}`,
  });
  return { runtime, focus };
};

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
    const { runtime, focus } = openProject('a');

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
    /* Only the layout's query goes unanswered; the runtime's own queries are answered as usual. */
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) =>
        query === '(max-width: 767px)'
          ? undefined
          : { matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() },
      ),
    );
    const { runtime, focus } = openProject('b');

    await vi.waitFor(() => {
      expect(chunks.settleShell).toBeDefined();
    });
    chunks.settleShell?.();
    await vi.waitFor(() => {
      expect(focus.getSnapshot().context.module).toBe('loaded');
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(chunks.requested).toEqual(['shell']);
    runtime.stop();
  });
});
