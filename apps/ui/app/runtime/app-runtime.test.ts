/**
 * The app runtime root without React (app state orchestration charter D5, D23, D26; plan § 4 A1a).
 *
 * The root is created unstarted with the clock, `inspect` and `onRejectedEvent` (MC-R4). It holds the static
 * children in one list; A1a attaches `environment` and `sessions`. Starting it starts both, and stopping it stops
 * both and removes every DOM listener `environment` added. `environment` reports document visibility, window focus
 * and the memory class, and never listens for an unload phase: `UnloadProvider` stays the one unload sequencer
 * until A5b (D26). The root keeps its first fault (D23).
 */
import { StepClock } from '@taucad/xstate-testing/clock';
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
  selectAppEnvironment,
  selectAppRuntimeFault,
  selectSessionsRegistry,
} from '#runtime/app-runtime.js';
import { createFakeEnvironmentHost } from '#runtime/environment.fixture.js';

vi.mock('#services/project-agent-host-registration.js', () => ({
  registerProjectAgentHost: async () => ({ release: async () => undefined }),
}));

describe('app runtime root', () => {
  it('should list the nine static children once, and attach environment and sessions', () => {
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
    expect(appRuntimeAttachedChildren).toEqual(['environment', 'sessions']);
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
    const runtime = createAppRuntime({ environment: () => host });
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
      appRuntimeMachine.provide({
        actors: { environment: first, sessions: later as unknown as typeof sessionsMachine },
      }),
      {
        input: { sessions: {} },
        inspect: (inspection) => {
          if (inspection.type === '@xstate.transition' && inspection.event.type === 'xstate.error.actor') {
            errors.push(String((inspection.event as { actorId?: unknown }).actorId));
          }
        },
      },
    ).start();
    await vi.waitFor(() => {
      expect(errors).toEqual(['environment', 'sessions']);
    });

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
        input: { sessions: {} },
        events,
        limit: 500,
        ignore: appRuntimeIgnoredEvents,
        serializeState: (snapshot) => JSON.stringify([snapshot.value, snapshot.context.environment]),
      }),
    ).toEqual([]);
    expect(appRuntimeIgnoredEvents).toEqual([]);
  });
});
