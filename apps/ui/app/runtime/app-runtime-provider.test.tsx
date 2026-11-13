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
import { SessionsProvider, useLiveProjectIds, useSessions } from '#hooks/use-sessions.js';
import { UnloadProvider } from '#hooks/use-flush-on-close.js';

const sessionsStore = vi.hoisted(() => ({ created: 0 }));

vi.mock('#hooks/use-file-manager.js', () => ({ useSharedFileManagerWorker: () => undefined }));
vi.mock('#services/project-agent-host-registration.js', () => ({
  registerProjectAgentHost: async () => ({ release: async () => undefined }),
}));
vi.mock('#services/sessions-store.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('#services/sessions-store.js')>();
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
    /* environment started once: one listener per event, never a second set. */
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
});
