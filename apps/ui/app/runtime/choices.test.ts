/**
 * `choices` over fake ports (plan § 4 A6a). Path table (one state):
 *
 * 1. `listening`: initial; each `choicesChanged` is folded into the parent's context
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor, setup, types } from 'xstate';
import { StepClock } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { selectLocalCompute, selectRemoteComputeDevice } from '@taucad/ui-core/lib/remote-compute-placement';
import { getComputeReuseMode, setComputeReuseMode } from '@taucad/ui-core/lib/compute-reuse-preference';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';
import type { CadAgentExecution } from '@taucad/chat';
import { eventSchemas } from '@taucad/ui-core/lib/xstate.lib';
import type { Model } from '#lib/model-catalog.js';
import { createChoicesLogic, readChoices } from '#runtime/choices.js';
import type {
  ChoicesChangedEvent,
  ChoicesCookieName,
  ChoicesModelCatalog,
  ChoicesPorts,
  ProjectChoices,
} from '#runtime/choices.js';

/** A listener set that counts what is still subscribed. */
const createSignal = (): Readonly<{
  subscribe: (listener: () => void) => () => void;
  emit: () => void;
  readonly size: number;
}> => {
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit: () => {
      for (const listener of listeners) {
        listener();
      }
    },
    get size() {
      return listeners.size;
    },
  };
};

const catalogRow = (id: string, flags: Partial<Pick<Model, 'recommended' | 'default'>> = {}): Model =>
  ({
    id,
    name: id,
    provider: { id: 'openai', name: 'Provider' },
    details: { family: 'gpt' },
    ...flags,
  }) as unknown as Model;

type FakePorts = ChoicesPorts &
  Readonly<{
    setCookie: (name: ChoicesCookieName, value: unknown) => void;
    setCatalog: (catalog: ChoicesModelCatalog) => void;
    setPinning: (on: boolean) => void;
    setPlaceable: (placeable: boolean) => void;
    listeners: () => number;
  }>;

const createFakePorts = (
  initial: Readonly<{ cookies?: Partial<Record<ChoicesCookieName, unknown>> }> = {},
): FakePorts => {
  const cookies = new Map<ChoicesCookieName, unknown>(
    Object.entries(initial.cookies ?? {}) as Array<[ChoicesCookieName, unknown]>,
  );
  const cookieSignals = new Map<ChoicesCookieName, ReturnType<typeof createSignal>>();
  const cookieSignal = (name: ChoicesCookieName): ReturnType<typeof createSignal> => {
    const signal = cookieSignals.get(name) ?? createSignal();
    cookieSignals.set(name, signal);
    return signal;
  };
  let catalog: ChoicesModelCatalog = { status: 'loading' };
  const catalogSignal = createSignal();
  let pinning = true;
  const flagSignal = createSignal();
  let placeable = true;
  const reachSignal = createSignal();
  return {
    cookies: {
      read: (name) => cookies.get(name),
      subscribe: (name, listener) => cookieSignal(name).subscribe(listener),
    },
    catalog: { read: () => catalog, subscribe: catalogSignal.subscribe },
    flags: { read: () => pinning, subscribe: (_flag, listener) => flagSignal.subscribe(listener) },
    reachability: { isPlaceable: () => placeable, subscribe: reachSignal.subscribe },
    setCookie: (name, value) => {
      cookies.set(name, value);
      cookieSignal(name).emit();
    },
    setCatalog: (next) => {
      catalog = next;
      catalogSignal.emit();
    },
    setPinning: (on) => {
      pinning = on;
      flagSignal.emit();
    },
    setPlaceable: (next) => {
      placeable = next;
      reachSignal.emit();
    },
    listeners: () =>
      [...cookieSignals.values()].reduce((total, signal) => total + signal.size, 0) +
      catalogSignal.size +
      flagSignal.size +
      reachSignal.size,
  };
};

/** A parent that keeps every `choicesChanged` it receives. */
const createParent = (ports: ChoicesPorts, clock: StepClock, inspect: ReturnType<typeof guardActors>['inspect']) => {
  const parent = setup({
    schemas: {
      context: types<{ received: ProjectChoices[] }>(),
      events: eventSchemas<ChoicesChangedEvent>(),
    },
    actors: { choices: createChoicesLogic(ports) },
  }).createMachine({
    id: 'choices-parent',
    context: { received: [] },
    initial: 'listening',
    states: {
      listening: {
        invoke: { id: 'choices', src: 'choices' },
        on: {
          choicesChanged: ({ context, event }) => ({ context: { received: [...context.received, event.choices] } }),
        },
      },
    },
  });
  return createActor(parent, { clock, inspect });
};

const received = (actor: ReturnType<typeof createParent>): ProjectChoices[] => actor.getSnapshot().context.received;

describe('choices', () => {
  afterEach(() => {
    selectLocalCompute();
    if (getComputeReuseMode() !== 'durable') {
      setComputeReuseMode('durable');
    }
  });

  it('should emit the values at start and once per port or store change, each with the new values', () => {
    const guard = guardActors();
    const ports = createFakePorts();
    const actor = createParent(ports, new StepClock(), guard.inspect);
    actor.start();
    expect(received(actor)).toHaveLength(1);

    const steps: ReadonlyArray<readonly [string, () => void, (choices: ProjectChoices) => unknown, unknown]> = [
      [
        'cookie',
        () => {
          ports.setCookie(cookieName.chatTestingEnabled, false);
        },
        (c) => c.testingEnabled,
        false,
      ],
      [
        'kernel cookie',
        () => {
          ports.setCookie(cookieName.cadKernel, 'replicad');
        },
        (c) => c.defaultKernel,
        'replicad',
      ],
      [
        'catalog',
        () => {
          ports.setCatalog({ status: 'loaded', models: [catalogRow('model-a', { default: true })] });
        },
        (c) => c.defaultExecution,
        { kind: 'tau', model: 'model-a' },
      ],
      [
        'flag',
        () => {
          ports.setPinning(false);
        },
        (c) => c.modelPinning,
        false,
      ],
      [
        'reachability',
        () => {
          ports.setPlaceable(false);
        },
        (c) => c.defaultExecution,
        { kind: 'tau', model: 'model-a' },
      ],
      [
        'placement',
        () => {
          selectRemoteComputeDevice('device-a');
        },
        (c) => c.computePlacement,
        { state: 'connecting', deviceId: 'device-a' },
      ],
      [
        'reuse',
        () => {
          setComputeReuseMode('memory');
        },
        (c) => c.computeReuseMode,
        'memory',
      ],
    ];
    for (const [index, [, change, read, expected]] of steps.entries()) {
      change();
      expect(received(actor)).toHaveLength(index + 2);
      expect(read(received(actor).at(-1)!)).toEqual(expected);
    }
    const last = received(actor).at(-1)!;
    expect(last.computeSelectionRevision).toBe(received(actor)[0]!.computeSelectionRevision + 1);
    expect(last.computeReuseRevision).toBe(received(actor)[0]!.computeReuseRevision + 1);
    actor.stop();
  });

  it('should stop every subscription with the actor', () => {
    const guard = guardActors();
    const ports = createFakePorts();
    const actor = createParent(ports, new StepClock(), guard.inspect);
    actor.start();
    expect(ports.listeners()).toBeGreaterThan(0);
    actor.stop();
    expect(ports.listeners()).toBe(0);
    // Every change re-reads the catalog port, so a store listener left behind would read it again.
    const reads = vi.spyOn(ports.catalog, 'read');
    selectRemoteComputeDevice('device-b');
    setComputeReuseMode('off');
    expect(reads).not.toHaveBeenCalled();
    ports.setCatalog({ status: 'unavailable' });
    expect(reads).not.toHaveBeenCalled();
    expect(received(actor)).toHaveLength(1);
  });

  describe('default execution', () => {
    const daemon: CadAgentExecution = { kind: 'tau', model: 'model-a', hostId: 'loopback:daemon-1' };

    it('should drop the host of a stored execution this tab cannot place', () => {
      const ports = createFakePorts({ cookies: { [cookieName.chatExecution]: daemon } });
      ports.setCatalog({ status: 'loaded', models: [catalogRow('model-a')] });
      expect(readChoices(ports).defaultExecution).toEqual(daemon);
      ports.setPlaceable(false);
      expect(readChoices(ports).defaultExecution).toEqual({ kind: 'tau', model: 'model-a' });
    });

    it('should keep an external agent it cannot place as it was', () => {
      const external: CadAgentExecution = { kind: 'acp', hostId: 'loopback:daemon-1', agentId: 'agent-a' };
      const ports = createFakePorts({ cookies: { [cookieName.chatExecution]: external } });
      ports.setPlaceable(false);
      expect(readChoices(ports).defaultExecution).toEqual(external);
    });

    it('should wait for the catalog before naming a model, and keep the stored one meanwhile', () => {
      const ports = createFakePorts({ cookies: { [cookieName.chatEffort]: 'high' } });
      expect(readChoices(ports).modelCatalog).toEqual({ status: 'loading' });
      expect(readChoices(ports).defaultExecution).toEqual({ kind: 'tau', model: '', effort: 'high' });
      ports.setCookie(cookieName.chatModel, 'model-b');
      expect(readChoices(ports).defaultExecution).toEqual({ kind: 'tau', model: 'model-b', effort: 'high' });
      ports.setCatalog({ status: 'loaded', models: [catalogRow('model-a', { recommended: true })] });
      // A stored model the loaded catalog no longer offers moves to the recommended one.
      expect(readChoices(ports).defaultExecution).toEqual({ kind: 'tau', model: 'model-a', effort: 'high' });
    });

    it('should not depend on pinning, which only shapes the picker', () => {
      const ports = createFakePorts({ cookies: { [cookieName.chatModel]: 'model-b' } });
      ports.setCatalog({ status: 'loaded', models: [catalogRow('model-a'), catalogRow('model-b')] });
      const pinned = readChoices(ports);
      ports.setPinning(false);
      const unpinned = readChoices(ports);
      expect(unpinned.modelPinning).toBe(false);
      expect(unpinned.defaultExecution).toEqual({ kind: 'tau', model: 'model-b' });
      expect(unpinned.defaultExecution).toEqual(pinned.defaultExecution);
    });

    it('should ignore a stored execution that fails the wire schema', () => {
      const ports = createFakePorts({
        cookies: { [cookieName.chatExecution]: { kind: 'tau', model: 'model-a', hostId: '' } },
      });
      ports.setCatalog({ status: 'loaded', models: [catalogRow('model-a', { default: true })] });
      expect(readChoices(ports).defaultExecution).toEqual({ kind: 'tau', model: 'model-a' });
    });
  });

  it('should default the testing cookie on and the kernel to a concrete one', () => {
    const choices = readChoices(createFakePorts());
    expect(choices.testingEnabled).toBe(true);
    expect(choices.defaultKernel).toBe('openscad');
  });
});
