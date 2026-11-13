/**
 * The start boundary (app state orchestration charter D5, D15 boundary 2, I1; plan § 4 A1a).
 *
 * A server render and the first client render read the same unstarted runtime, so hydration matches; the client
 * runtime starts once, after hydration, in `AppRuntimeProvider`'s one effect. Under StrictMode nothing is created
 * and nothing is started twice: `SessionsProvider` reads the registry the runtime made instead of creating one.
 */
import { act, StrictMode } from 'react';
import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { useSelector } from '@xstate/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRuntimeProvider, useAppRuntime } from '#runtime/app-runtime-provider.js';
import { createAppRuntime, selectAppEnvironment, selectSessionsRegistry } from '#runtime/app-runtime.js';
import type { AppRuntime } from '#runtime/app-runtime.js';
import { createFakeEnvironmentHost } from '#runtime/environment.fixture.js';
import type { FakeEnvironmentHost } from '#runtime/environment.fixture.js';
import type * as SessionsStore from '#services/sessions-store.js';
import { SessionsProvider, useLiveProjectIds, useSessions } from '#hooks/use-sessions.js';
import { UnloadProvider } from '#hooks/use-flush-on-close.js';
import { useMemoryRelease } from '#hooks/use-memory-release.js';
import type { SessionsMachineEvent } from '#machines/sessions.machine.js';

const sessionsStore = vi.hoisted(() => ({ created: 0 }));

vi.mock('#hooks/use-file-manager.js', () => ({ useSharedFileManagerWorker: () => undefined }));
vi.mock('#services/project-agent-host-registration.js', () => ({
  registerProjectAgentHost: async () => ({ release: async () => undefined }),
}));
vi.mock('#services/sessions-store.js', async (importOriginal) => {
  const original = await importOriginal<typeof SessionsStore>();
  return {
    ...original,
    createSessionsActor: (...parameters: Parameters<typeof original.createSessionsActor>) => {
      sessionsStore.created += 1;
      return original.createSessionsActor(...parameters);
    },
  };
});

type RenderRecord = Readonly<{ listeners: number; liveProjects: number; visible: boolean | undefined }>;

function Probe({ host, renders }: { readonly host: FakeEnvironmentHost; readonly renders: RenderRecord[] }): ReactNode {
  const runtime = useAppRuntime();
  const liveProjects = useLiveProjectIds().length;
  const { visible } = useSelector(runtime, selectAppEnvironment);
  renders.push({ listeners: host.listeners().length, liveProjects, visible });
  return (
    <p data-testid='probe'>
      live {liveProjects}, visible {String(visible)}
    </p>
  );
}

const tree = (runtime: AppRuntime, host: FakeEnvironmentHost, renders: RenderRecord[]): React.JSX.Element => (
  <StrictMode>
    <AppRuntimeProvider runtime={runtime}>
      <UnloadProvider>
        <SessionsProvider>
          <Probe host={host} renders={renders} />
        </SessionsProvider>
      </UnloadProvider>
    </AppRuntimeProvider>
  </StrictMode>
);

afterEach(() => {
  document.body.innerHTML = '';
  sessionsStore.created = 0;
});

describe('AppRuntimeProvider start boundary', () => {
  it('should render the same unstarted snapshot on the server and the first client render', async () => {
    const serverHost = createFakeEnvironmentHost();
    const serverRuntime = createAppRuntime({ environment: () => serverHost });
    const serverRenders: RenderRecord[] = [];
    const html = renderToString(tree(serverRuntime, serverHost, serverRenders));

    /* The server never starts its runtime. */
    expect(serverHost.everAdded()).toEqual([]);

    const clientHost = createFakeEnvironmentHost({ visibilityState: 'hidden' });
    const clientRuntime = createAppRuntime({ environment: () => clientHost });
    const clientRenders: RenderRecord[] = [];
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    const recoverableError = vi.fn();

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, tree(clientRuntime, clientHost, clientRenders), {
        onRecoverableError: recoverableError,
      });
      await Promise.resolve();
    });

    expect(recoverableError).not.toHaveBeenCalled();
    /* The first client render read the runtime created and not started, as the server did. */
    expect(clientRenders[0]).toEqual(serverRenders[0]);
    expect(clientRenders[0]).toEqual({ listeners: 0, liveProjects: 0, visible: undefined });
    /* After hydration the one effect started it, and environment reported the hidden page. */
    expect(clientHost.listeners().length).toBeGreaterThan(0);
    expect(container.textContent).toBe('live 0, visible false');
    act(() => {
      root?.unmount();
    });
    clientRuntime.stop();
  });

  it('should create and start nothing twice under StrictMode', () => {
    const host = createFakeEnvironmentHost();
    const runtime = createAppRuntime({ environment: () => host });
    const registry = selectSessionsRegistry(runtime.getSnapshot());
    let seen: unknown;
    function Registry(): undefined {
      seen = useSessions();
      return undefined;
    }

    const view = render(
      <StrictMode>
        <AppRuntimeProvider runtime={runtime}>
          <UnloadProvider>
            <SessionsProvider>
              <Registry />
            </SessionsProvider>
          </UnloadProvider>
        </AppRuntimeProvider>
      </StrictMode>,
    );

    /* No registry was made in render: the provider reads the runtime's. */
    expect(sessionsStore.created).toBe(0);
    expect(seen).toBe(registry);
    /* The environment started once: one listener per event, never a second set. */
    expect(host.everAdded().toSorted()).toEqual([
      'coarsePointer:change',
      'document:visibilitychange',
      'window:blur',
      'window:focus',
    ]);
    expect(runtime.getSnapshot().status).toBe('active');

    /* Unmounting stops nothing: the runtime outlives the tree that read it. */
    view.unmount();
    expect(host.listeners().length).toBe(4);
    runtime.stop();
  });

  it('should start before the first commit sends: a first-commit send on a constrained direct open reaches a running registry', () => {
    const registry: { current?: unknown } = {};
    const processed: string[] = [];
    const runtime = createAppRuntime({
      environment: () => createFakeEnvironmentHost({ coarse: true }),
      inspect: (inspection) => {
        if (
          inspection.type === '@xstate.transition' &&
          inspection.actorRef === registry.current &&
          !inspection.event.type.startsWith('@xstate.')
        ) {
          processed.push(inspection.event.type);
        }
      },
    });
    registry.current = selectSessionsRegistry(runtime.getSnapshot());
    /* What the registry had processed at the moment each send left the first commit's passive effect. */
    const atSend: string[][] = [];
    function DirectOpen(): undefined {
      const sessions = useSessions();
      useMemoryRelease({
        sessions: {
          send: (event: SessionsMachineEvent) => {
            sessions.send(event);
            atSend.push([...processed]);
          },
        },
        focusedProjectId: 'p1',
        constrained: true,
      });
      return undefined;
    }

    render(
      <AppRuntimeProvider runtime={runtime}>
        <UnloadProvider>
          <SessionsProvider>
            <DirectOpen />
          </SessionsProvider>
        </UnloadProvider>
      </AppRuntimeProvider>,
    );

    /* Delivered synchronously, so the registry was running: not queued on an actor not yet started. */
    expect(atSend).toEqual([['releaseMemory']]);
    runtime.stop();
  });
});
