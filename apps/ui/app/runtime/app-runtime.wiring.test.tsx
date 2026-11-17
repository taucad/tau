// @vitest-environment jsdom
/**
 * The real runtime's wiring of focus, the unload sequencer and the library epoch (A5b review round 10): each row
 * composes `createAppRuntime`, so a port the root forgets to hand down fails here rather than only in the app.
 */
import { act } from 'react';
import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnyEventObject } from 'xstate';
import { AppRuntimeProvider } from '#runtime/app-runtime-provider.js';
import {
  createAppRuntime,
  selectRuntimeFocus,
  selectRuntimeProjectLibrary,
  selectRuntimeChatSessions,
  selectSessionsRegistry,
} from '#runtime/app-runtime.js';
import { createFakeEnvironmentHost } from '#runtime/environment.fixture.js';
import { SessionsProvider, useFocus } from '#hooks/use-sessions.js';
import { UnloadProvider, useFlushOnClose } from '#hooks/use-flush-on-close.js';

vi.mock('#services/project-agent-host-registration.js', () => ({
  registerProjectAgentHost: async () => ({ release: async () => undefined }),
}));

/** The session module's import, held until a row lets it settle (U1). */
const workspaceChunk = vi.hoisted(() => ({ settle: undefined as (() => void) | undefined }));
vi.mock('#lib/project-workspace-warmup.js', () => ({
  openProjectWorkspace: async () =>
    new Promise<void>((resolve) => {
      workspaceChunk.settle = resolve;
    }),
}));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the app runtime hands its focus, unload sequencer and library epoch down (round 10)', () => {
  it('should give useFocus under SessionsProvider the runtime focus', () => {
    const host = createFakeEnvironmentHost();
    const runtime = createAppRuntime({ environment: () => host });
    const seen: unknown[] = [];
    function Probe(): ReactNode {
      seen.push(useFocus().focus);
      return null;
    }
    render(
      <AppRuntimeProvider runtime={runtime}>
        <UnloadProvider>
          <SessionsProvider>
            <Probe />
          </SessionsProvider>
        </UnloadProvider>
      </AppRuntimeProvider>,
    );

    expect(seen.at(-1)).toBe(selectRuntimeFocus(runtime).focus);
    runtime.stop();
  });

  it("should flush a useFlushOnClose registrant on hidden through the runtime's environment", async () => {
    const host = createFakeEnvironmentHost();
    const runtime = createAppRuntime({ environment: () => host });
    const calls: string[] = [];
    function Producer(): ReactNode {
      useFlushOnClose(
        (phase) => {
          calls.push(phase);
        },
        { stage: 'producer' },
      );
      return null;
    }
    render(
      <AppRuntimeProvider runtime={runtime}>
        <UnloadProvider>
          <Producer />
        </UnloadProvider>
      </AppRuntimeProvider>,
    );

    act(() => {
      host.setVisibility('hidden');
    });

    await vi.waitFor(() => {
      expect(calls).toEqual(['hidden']);
    });
    runtime.stop();
  });

  it('should keep the project focus is on when a constrained page goes hidden', () => {
    const host = createFakeEnvironmentHost({ coarse: true });
    const releases: AnyEventObject[] = [];
    const runtime = createAppRuntime({
      environment: () => host,
      inspect: (inspection) => {
        if (inspection.type === '@xstate.transition' && inspection.event.type === 'releaseMemory') {
          releases.push(inspection.event);
        }
      },
    }).start();
    selectRuntimeFocus(runtime).focus.send({
      type: 'routeRequested',
      requestId: 'route:1',
      slugs: { workspaceSlug: 'w', projectSlug: 'a' },
      projectId: 'proj_a',
    });
    releases.length = 0;

    host.setVisibility('hidden');

    expect(releases.at(-1)).toEqual({ type: 'releaseMemory', keepProjectId: 'proj_a' });
    runtime.stop();
  });

  it('should hand a library change to focus and the registry as the new epoch (I7)', () => {
    const host = createFakeEnvironmentHost();
    const runtime = createAppRuntime({ environment: () => host, idleFileManagers: true }).start();
    const { focus } = selectRuntimeFocus(runtime);
    const before = focus.getSnapshot().context.epoch;

    selectRuntimeProjectLibrary(runtime).noteLibraryChanged();

    expect(focus.getSnapshot().context.epoch).toBe(before + 1);
    expect(selectSessionsRegistry(runtime.getSnapshot()).getSnapshot().context.libraryEpoch).toBe(before + 1);
    runtime.stop();
  });

  it('should keep focus waiting on the session module until the workspace chunk loads (U1, round 11)', async () => {
    const host = createFakeEnvironmentHost();
    const runtime = createAppRuntime({ environment: () => host, idleFileManagers: true }).start();
    const { focus } = selectRuntimeFocus(runtime);
    focus.send({
      type: 'routeRequested',
      requestId: 'route:1',
      slugs: { workspaceSlug: 'w', projectSlug: 'a' },
      projectId: 'proj_a',
    });

    await vi.waitFor(() => {
      expect(workspaceChunk.settle).toBeDefined();
    });
    expect(focus.getSnapshot().context.module).toBe('loading');
    workspaceChunk.settle?.();

    await vi.waitFor(() => {
      expect(focus.getSnapshot().context.module).toBe('loaded');
    });
    runtime.stop();
  });
});

describe('round 13: the runtime hands focus its route and flush ports', () => {
  it("should deliver focus's cloudOpen marker to the bound route sink", () => {
    const host = createFakeEnvironmentHost();
    const runtime = createAppRuntime({ environment: () => host, idleFileManagers: true }).start();
    const { focus, bindings } = selectRuntimeFocus(runtime);
    const commands: AnyEventObject[] = [];
    const unbind = bindings.bindRoute((command) => commands.push(command));
    focus.send({
      type: 'routeRequested',
      requestId: 'route:1',
      slugs: { workspaceSlug: 'w', projectSlug: 'a' },
      projectId: 'proj_a',
      cloudOpen: true,
    });
    expect(commands).toEqual([{ type: 'cloudOpenTaken', projectId: 'proj_a' }]);
    unbind();
    runtime.stop();
  });

  it("should ask a live project's session for its leave flush when focus asks, and answer with the session's (A7c)", async () => {
    const host = createFakeEnvironmentHost();
    const runtime = createAppRuntime({ environment: () => host, idleFileManagers: true }).start();
    const { focus } = selectRuntimeFocus(runtime);
    const { ports } = focus.getSnapshot().context;
    ports.registry.send({ type: 'open', requestId: 'open:1', projectId: 'proj_a' });
    const session = selectSessionsRegistry(runtime.getSnapshot()).getSnapshot().context.refs['proj_a'];
    const settled: unknown[] = [];
    session?.on('flushSettled', (event) => settled.push(event));
    ports.flush.send({ type: 'leaveFlushAsked', requestId: 'flush:1', projectId: 'proj_a' });
    await vi.waitFor(() => {
      expect(settled).toEqual([{ type: 'flushSettled', projectId: 'proj_a', requestId: 'flush:1', ok: true }]);
    });
    runtime.stop();
  });

  it("should bind each live project's session to the chat store with no binding mounted, and forget it on close (A7c, I5)", async () => {
    const host = createFakeEnvironmentHost();
    const runtime = createAppRuntime({ environment: () => host, idleFileManagers: true }).start();
    const registry = selectSessionsRegistry(runtime.getSnapshot());
    const chatSessions = selectRuntimeChatSessions(runtime);
    registry.send({ type: 'open', projectId: 'proj_a' });
    expect(Object.keys(chatSessions.getLivenessSnapshot().projects)).toEqual(['proj_a']);
    registry.send({ type: 'close', projectId: 'proj_a', reason: 'user' });
    await vi.waitFor(() => {
      expect(registry.getSnapshot().context.refs['proj_a']).toBeUndefined();
    });
    expect(chatSessions.getLivenessSnapshot().projects).toEqual({});
    runtime.stop();
  });

  it("should forward focus's open to the runtime's registry", () => {
    const host = createFakeEnvironmentHost();
    const runtime = createAppRuntime({ environment: () => host, idleFileManagers: true }).start();
    const { focus } = selectRuntimeFocus(runtime);
    const { ports } = focus.getSnapshot().context;
    ports.registry.send({ type: 'open', requestId: 'open:1', projectId: 'proj_a' });
    expect(selectSessionsRegistry(runtime.getSnapshot()).getSnapshot().context.refs['proj_a']).toBeDefined();
    runtime.stop();
  });
});
