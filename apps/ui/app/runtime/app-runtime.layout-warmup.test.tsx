// @vitest-environment jsdom
/**
 * STO-25 SP5: the real runtime's open asks for the layout its viewport will mount as focus starts opening the project,
 * while focus still waits on the session module, so the layout's chunk graph no longer starts loading only once the
 * project is live and its route shows the editor.
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
  return { LiveProjectSessions: () => null, ProjectChatRoute: () => null };
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
  it('should request the desktop shell while focus still waits on the session module', async () => {
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
      expect(chunks.requested).toContain('desktop');
    });
    /* Nothing has rendered a layout: focus is still loading the session module, so no route state is the editor yet. */
    expect(focus.getSnapshot().context.module).toBe('loading');
    expect(focus.getSnapshot().hasTag('focused')).toBe(false);
    expect(chunks.requested).not.toContain('mobile');

    chunks.settleShell?.();
    await vi.waitFor(() => {
      expect(focus.getSnapshot().context.module).toBe('loaded');
    });
    runtime.stop();
  });
});
