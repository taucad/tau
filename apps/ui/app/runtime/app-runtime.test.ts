/**
 * The app runtime root without React (app state orchestration charter D5, D23, D26; plan § 4 A1a).
 *
 * The root is created unstarted with the clock, `inspect` and `onRejectedEvent` (MC-R4). It holds the static
 * children in one list; A1a attaches `environment` and `sessions`, A1b `fileManagerHost`, `rootFiles` and
 * `leases`, and A2 `projectLibrary` and `chatSessions`. Starting it starts them, and stopping it stops them and removes every DOM listener `environment` added.
 * `environment` reports document visibility, window focus and the memory class, and never listens for an unload
 * phase: `UnloadProvider` stays the one unload sequencer
 * until A5b (D26). The root keeps its first fault (D23).
 */
import { flush, StepClock } from '@taucad/xstate-testing/clock';
import { validated } from '@taucad/xstate-testing/inspect';
import { recordEmitted } from '@taucad/xstate-testing/fakes';
import { unansweredEvents } from '@taucad/xstate-testing/paths';
import { describe, expect, it, vi } from 'vitest';
import { createActor, createAsyncLogic, createCallbackLogic } from 'xstate';
import type { AnyEventObject, EventObject, InspectionEvent } from 'xstate';
import {
  appRuntimeAttachedChildren,
  appRuntimeChildren,
  appRuntimeEventTypes,
  appRuntimeIgnoredEvents,
  appRuntimeMachine,
} from '#runtime/app-runtime.machine.js';
import type { AppRuntimeEvent } from '#runtime/app-runtime.machine.js';
import type { sessionsMachine } from '#machines/sessions.machine.js';
import {
  createAppRuntime,
  noAnalytics,
  selectAppEnvironment,
  selectAppRuntimeFault,
  selectFileManagerHost,
  selectRootFiles,
  selectRuntimeChatSessions,
  selectRuntimeIdleFileManagers,
  selectRuntimeProjectLibrary,
  selectRuntimeQueryClient,
  selectSessionsRegistry,
} from '#runtime/app-runtime.js';
import { QueryClient } from '@tanstack/react-query';
import { ChatSessionStore } from '#services/chat-session-store.js';
import { createFakeEnvironmentHost } from '#runtime/environment.fixture.js';
import { createEnvironmentLogic } from '#runtime/environment.js';
import { sessionsRegistryLogic } from '#services/sessions-store.js';
import { store as preferences } from '#hooks/use-cookie.js';
import { metaConfig } from '#constants/meta.constants.js';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';
import { modelsQueryKey } from '#lib/model-catalog.js';

vi.mock('#services/project-agent-host-registration.js', () => ({
  registerProjectAgentHost: async () => ({ release: async () => undefined }),
}));

/* `rootFiles` as a root composed without the host builds it: waiting for Home's backend, never asked to connect. */
const idleRootFiles = { rootDirectory: '/', shouldInitializeOnStart: false, backendResolution: 'pending' } as const;

describe('app runtime root', () => {
  it('should list the nine static children once, and attach the seven A1a, A1b and A2 compose', () => {
    expect(appRuntimeChildren).toEqual([
      'environment',
      'choices',
      'fileManagerHost',
      'rootFiles',
      'leases',
      'projectLibrary',
      'chatSessions',
      'sessions',
      'focus',
    ]);
    expect(appRuntimeAttachedChildren).toEqual([
      'environment',
      'fileManagerHost',
      'rootFiles',
      'leases',
      'projectLibrary',
      'chatSessions',
      'sessions',
    ]);
  });

  it('should compose unstarted and start and stop its children with no React', () => {
    const host = createFakeEnvironmentHost();
    const runtime = createAppRuntime({ clock: new StepClock(), environment: () => host });

    /* Created, not started: the registry exists and answers its initial snapshot, and no DOM listener is in. */
    const registry = selectSessionsRegistry(runtime.getSnapshot());
    expect(registry.getSnapshot().matches('ready')).toBe(true);
    expect(registry.getSnapshot().context.refs).toEqual({});
    expect(host.listeners()).toEqual([]);
    expect(selectAppEnvironment(runtime.getSnapshot())).toEqual({
      visible: undefined,
      focused: undefined,
      constrained: undefined,
    });

    runtime.start();

    expect(host.listeners().toSorted()).toEqual([
      'coarsePointer:change',
      'document:visibilitychange',
      'window:blur',
      'window:focus',
    ]);
    expect(selectSessionsRegistry(runtime.getSnapshot())).toBe(registry);
    registry.send({ type: 'open', projectId: 'p1' });
    expect(Object.keys(registry.getSnapshot().context.refs)).toEqual(['p1']);

    runtime.stop();

    expect(host.listeners()).toEqual([]);
    expect(runtime.getSnapshot().status).toBe('stopped');
    expect(registry.getSnapshot().status).toBe('stopped');
  });

  it('should never listen for an unload phase (D26: UnloadProvider stays the one sequencer)', () => {
    const host = createFakeEnvironmentHost();
    const runtime = createAppRuntime({ environment: () => host }).start();

    const types = host.everAdded().map((listener) => listener.split(':')[1]);
    expect(types).not.toContain('pagehide');
    expect(types).not.toContain('beforeunload');
    expect(types).not.toContain('unload');
    expect(types).not.toContain('freeze');
    runtime.stop();
  });

  it('should report visibility, focus and the memory class, and emit each change', () => {
    const host = createFakeEnvironmentHost({ visibilityState: 'visible', focused: true, coarse: false });
    /* The factory's composition, under the harness's runtime schemas (MC-R30). */
    const runtime = createActor(
      validated(
        appRuntimeMachine.provide({
          actors: { environment: createEnvironmentLogic(() => host), sessions: sessionsRegistryLogic },
        }),
      ),
      { input: { sessions: {}, rootFiles: idleRootFiles } },
    );
    const emitted = recordEmitted(runtime);
    runtime.start();

    expect(selectAppEnvironment(runtime.getSnapshot())).toEqual({ visible: true, focused: true, constrained: false });

    host.setVisibility('hidden');
    host.blur();
    host.setCoarsePointer(true);

    expect(selectAppEnvironment(runtime.getSnapshot())).toEqual({ visible: false, focused: false, constrained: true });
    expect(emitted).toEqual([
      { type: 'visibilityChanged', visible: true },
      { type: 'focusChanged', focused: true },
      { type: 'memoryClassChanged', constrained: false },
      { type: 'visibilityChanged', visible: false },
      { type: 'focusChanged', focused: false },
      { type: 'memoryClassChanged', constrained: true },
    ]);
    runtime.stop();
  });

  it('should forward the clock, inspect and onRejectedEvent to the whole tree (MC-R4)', () => {
    const clock = new StepClock();
    const inspected: InspectionEvent[] = [];
    const onRejectedEvent = vi.fn();
    const runtime = createAppRuntime({
      clock,
      inspect: (event) => {
        inspected.push(event);
      },
      onRejectedEvent,
      environment: () => createFakeEnvironmentHost(),
    }).start();
    const registry = selectSessionsRegistry(runtime.getSnapshot());

    const registryRef: unknown = registry;

    /* The session's start bound is an `after` on the runtime's clock. */
    expect(clock.nextDue()).toBeUndefined();
    registry.send({ type: 'open', projectId: 'p1' });
    expect(clock.nextDue()).toBeDefined();
    expect(inspected.some((event) => event.type === '@xstate.transition' && event.actorRef === registryRef)).toBe(true);
    runtime.stop();

    /* A send to the stopped registry is a dead letter the whole tree reports through the one hook. */
    expect(onRejectedEvent).not.toHaveBeenCalled();
    registry.send({ type: 'touch', projectId: 'p1' });
    expect(onRejectedEvent).toHaveBeenCalledWith(expect.objectContaining({ reason: 'stopped', targetId: 'sessions' }));

    /* The library's actors report through the same hook. */
    onRejectedEvent.mockClear();
    selectRuntimeProjectLibrary(runtime).workspaceConnection.send({ type: 'beginSelection', operationId: 'op1' });
    expect(onRejectedEvent).toHaveBeenCalledWith(expect.objectContaining({ reason: 'stopped' }));
  });

  /* Programme control ruling: the client runtime captures workspace telemetry through `admittedAnalytics`; the server
   * runtime and every test runtime pass none and get the no-op client, so they capture nothing. */
  it('should capture workspace telemetry through its analytics port, and nothing without one (D15)', () => {
    const capture = vi.fn();
    const withPort = createAppRuntime({ environment: () => createFakeEnvironmentHost(), analytics: { capture } });
    const skipped = { workspaceId: 'w1', reason: 'permission' } as const;
    selectRootFiles(withPort.getSnapshot()).getSnapshot().context.onRootSkipped?.(skipped);
    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith(expect.any(String), expect.objectContaining(skipped));

    const noOp = vi.spyOn(noAnalytics, 'capture');
    const withoutPort = createAppRuntime({ environment: () => createFakeEnvironmentHost() });
    selectRootFiles(withoutPort.getSnapshot()).getSnapshot().context.onRootSkipped?.(skipped);
    expect(noOp).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledOnce();
    noOp.mockRestore();
  });

  /* The remote-host harness renders no file manager, so its runtime reads no Home engine and connects no worker. */
  it('should leave its file managers idle when asked to', async () => {
    const loadHomeBackend = vi.fn(async (): Promise<'opfs'> => 'opfs');
    const runtime = createAppRuntime({
      environment: () => createFakeEnvironmentHost(),
      loadHomeBackend,
      idleFileManagers: true,
    }).start();
    await flush();
    expect(loadHomeBackend).not.toHaveBeenCalled();
    expect(selectFileManagerHost(runtime.getSnapshot()).getSnapshot().value).toBe('resolving');
    expect(selectRootFiles(runtime.getSnapshot()).getSnapshot().value).toBe('initializing');
    expect(selectRuntimeIdleFileManagers(runtime)).toBe(true);
    expect(selectRuntimeIdleFileManagers(createAppRuntime({ environment: () => undefined }))).toBe(false);
    runtime.stop();
  });

  /* A2 (D9; row L3): the runtime builds the query client, the library and the chat store, and the library's actors
   * and worker start and stop with the root. */
  it('should build its query client, project library and chat store, and start and stop the library with the root', () => {
    const runtime = createAppRuntime({ environment: () => createFakeEnvironmentHost() });
    const library = selectRuntimeProjectLibrary(runtime);
    expect(selectRuntimeQueryClient(runtime)).toBeInstanceOf(QueryClient);
    expect(library.queryClient).toBe(selectRuntimeQueryClient(runtime));
    expect(selectRuntimeChatSessions(runtime)).toBeInstanceOf(ChatSessionStore);

    /* Created, not started: the library's actors exist and answer their initial snapshots, and no worker is asked for. */
    expect(library.projectManager.getSnapshot().status).toBe('active');
    expect(library.projectManager.getSnapshot().value).toBe('initializing');
    expect(library.workspaceConnection.getSnapshot().value).toBe('idle');

    runtime.start();
    /* Started with the root, and sent `initialize`: the worker is being created. */
    expect(library.projectManager.getSnapshot().value).not.toBe('initializing');
    expect(selectRuntimeProjectLibrary(runtime)).toBe(library);

    runtime.stop();
    expect(library.projectManager.getSnapshot().status).toBe('stopped');
    expect(library.workspaceConnection.getSnapshot().status).toBe('stopped');
  });

  it('should take the query client its composition passes', () => {
    const queryClient = new QueryClient();
    const runtime = createAppRuntime({ environment: () => undefined, queryClient });
    expect(selectRuntimeQueryClient(runtime)).toBe(queryClient);
    expect(selectRuntimeProjectLibrary(runtime).queryClient).toBe(queryClient);
  });

  /* The remote-host harness mounts no `ProjectManagerProvider`, so an idle runtime starts no project-manager worker. */
  it('should not start the library of an idle runtime', () => {
    const runtime = createAppRuntime({
      environment: () => createFakeEnvironmentHost(),
      idleFileManagers: true,
    }).start();
    expect(selectRuntimeProjectLibrary(runtime).projectManager.getSnapshot().value).toBe('initializing');
    runtime.stop();
  });

  /* A6b: `choices` is attached with its real ports (plan § 4 A6b): the preference store, the runtime's query cache, the
   * flag store and this tab's loopback admissions. It reads the catalog from the cache and never fetches it. */
  it('A6b: attaches choices with its real ports, reads the stored preferences and the cached catalog, and follows a change', () => {
    const queryClient = new QueryClient();
    const runtime = createAppRuntime({
      environment: () => createFakeEnvironmentHost(),
      idleFileManagers: true,
      queryClient,
    });
    const read = (): Record<string, unknown> | undefined =>
      (runtime.getSnapshot().context as { choices?: Record<string, unknown> }).choices;
    preferences.update(`${metaConfig.cookiePrefix}${cookieName.chatTestingEnabled}`, false);
    preferences.update(`${metaConfig.cookiePrefix}${cookieName.cadKernel}`, 'openscad');
    runtime.start();
    expect(read()).toMatchObject({
      testingEnabled: false,
      defaultKernel: 'openscad',
      modelCatalog: { status: 'loading' },
    });
    // The catalog comes from the cache, so attaching `choices` asks the API for nothing.
    expect(queryClient.getQueryState(modelsQueryKey)?.fetchStatus ?? 'idle').toBe('idle');

    preferences.update(`${metaConfig.cookiePrefix}${cookieName.chatTestingEnabled}`, true);
    queryClient.setQueryData(modelsQueryKey, [{ id: 'model-a', default: true }]);
    expect(read()).toMatchObject({ testingEnabled: true, modelCatalog: { status: 'loaded' } });
    runtime.stop();
    preferences.remove(`${metaConfig.cookiePrefix}${cookieName.chatTestingEnabled}`);
    preferences.remove(`${metaConfig.cookiePrefix}${cookieName.cadKernel}`);
  });

  it('should keep the first fault and keep answering (D23)', async () => {
    const first = createCallbackLogic<EventObject>(() => {
      throw new Error('environment failed first');
    });
    const later = createAsyncLogic<void>({
      run: async () => {
        await Promise.resolve();
        throw new Error('sessions failed later');
      },
    });
    const errors: string[] = [];
    const runtime = createActor(
      // A test double for each child: the root only sees that each one failed.
      validated(
        appRuntimeMachine.provide({
          actors: { environment: first, sessions: later as unknown as typeof sessionsMachine },
        }),
      ),
      {
        input: { sessions: {}, rootFiles: idleRootFiles },
        inspect: (inspection) => {
          if (inspection.type === '@xstate.transition' && inspection.event.type === 'xstate.error.actor') {
            errors.push(String((inspection.event as { actorId?: unknown }).actorId));
          }
        },
      },
    ).start();
    /* The environment double throws on start; the sessions double rejects after one microtask. */
    await flush();
    expect(errors).toEqual(['environment', 'sessions']);

    expect(selectAppRuntimeFault(runtime.getSnapshot())).toBe('environment failed first');
    expect(runtime.getSnapshot().status).toBe('active');
    runtime.send({ type: 'visibilityChanged', visible: false });
    expect(selectAppEnvironment(runtime.getSnapshot()).visible).toBe(false);
    runtime.stop();
  });
});

describe('app runtime root totality', () => {
  type Samples = { [T in AppRuntimeEvent['type']]: ReadonlyArray<Extract<AppRuntimeEvent, { type: T }>> };
  const samples: Samples = {
    visibilityChanged: [
      { type: 'visibilityChanged', visible: true },
      { type: 'visibilityChanged', visible: false },
    ],
    focusChanged: [
      { type: 'focusChanged', focused: true },
      { type: 'focusChanged', focused: false },
    ],
    memoryClassChanged: [
      { type: 'memoryClassChanged', constrained: true },
      { type: 'memoryClassChanged', constrained: false },
    ],
  };

  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...appRuntimeEventTypes].toSorted());
  });

  it('should answer every public event in every reachable state (MC-R17)', () => {
    const events: readonly AnyEventObject[] = Object.values(samples).flat();
    expect(
      unansweredEvents(appRuntimeMachine, {
        input: { sessions: {}, rootFiles: idleRootFiles },
        events,
        limit: 500,
        ignore: appRuntimeIgnoredEvents,
        serializeState: (snapshot) => JSON.stringify([snapshot.value, snapshot.context.environment]),
      }),
    ).toEqual([]);
    expect(appRuntimeIgnoredEvents).toEqual([]);
  });
});
