/**
 * Fake actors, a fake parent and a manual clock for the revision machine suites.
 *
 * Every effect in a revision machine is an injected actor, so a suite replaces
 * the whole effect surface with scripted stubs, drives the machine in plain
 * Node and asserts states, recorded actor inputs, events sent to the parent and
 * emitted events. Nothing here imports a test framework.
 */

import { createActor, fromCallback, fromPromise } from 'xstate';
import type { AnyActorRef, AnyEventObject, CallbackActorLogic, PromiseActorLogic } from 'xstate';

/** One recorded invocation of a scripted promise actor. */
export type RecordedCall = Readonly<{ name: string; input: unknown }>;

/** A scripted promise-actor outcome. */
export type ScriptedOutcome = Readonly<{ output: unknown }> | Readonly<{ error: unknown }>;

type Settler = Readonly<{ resolve: (outcome: ScriptedOutcome) => void }>;

/** Scripted promise actors plus the record of what each was called with. */
export type FakePromiseActors = Readonly<{
  /** Every invocation in order, across every actor name. */
  calls: readonly RecordedCall[];
  /** Inputs recorded for one actor name, in invocation order. */
  inputsFor: (name: string) => readonly unknown[];
  /** Promise actor logic for `name`; records its input and settles from the script. */
  actor: <ActorOutput, ActorInput = unknown>(name: string) => PromiseActorLogic<ActorOutput, ActorInput>;
  /** Queue outcomes for `name`, consumed in invocation order. */
  script: (name: string, ...outcomes: readonly ScriptedOutcome[]) => void;
  /** Settle the oldest invocation of `name` that is still running. */
  settle: (name: string, outcome: ScriptedOutcome) => void;
  /** Invocations of `name` that have started and not yet settled. */
  running: (name: string) => number;
}>;

/**
 * Create the scripted promise-actor set one suite shares.
 *
 * @returns The scripted actors plus the record of every invocation.
 */
export const createFakePromiseActors = (): FakePromiseActors => {
  const calls: RecordedCall[] = [];
  const queued = new Map<string, ScriptedOutcome[]>();
  const waiting = new Map<string, Settler[]>();

  const take = <T>(map: Map<string, T[]>, name: string): T | undefined => map.get(name)?.shift();
  const put = <T>(map: Map<string, T[]>, name: string, value: T): void => {
    const list = map.get(name) ?? [];
    list.push(value);
    map.set(name, list);
  };

  return {
    calls,
    inputsFor: (name) => calls.filter((call) => call.name === name).map((call) => call.input),
    actor<ActorOutput, ActorInput = unknown>(name: string): PromiseActorLogic<ActorOutput, ActorInput> {
      return fromPromise<ActorOutput, ActorInput>(async ({ input }) => {
        calls.push({ name, input });
        const scripted = take(queued, name);
        const outcome =
          scripted ??
          (await new Promise<ScriptedOutcome>((resolve) => {
            put(waiting, name, { resolve });
          }));
        if ('error' in outcome) {
          throw outcome.error;
        }
        // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- the suite scripts this actor's output.
        return outcome.output as ActorOutput;
      });
    },
    script: (name, ...outcomes) => {
      for (const outcome of outcomes) {
        put(queued, name, outcome);
      }
    },
    settle: (name, outcome) => {
      const settler = take(waiting, name);
      if (settler === undefined) {
        throw new Error(`No running invocation of "${name}" to settle.`);
      }
      settler.resolve(outcome);
    },
    running: (name) => waiting.get(name)?.length ?? 0,
  };
};

/** One event a stubbed callback actor received, with the input it was started on. */
export type RecordedDelivery = Readonly<{ name: string; input: unknown; event: AnyEventObject }>;

/**
 * Callback-actor stubs, used both for held resources (the turn lease, the
 * checkout fence) and as stand-ins for spawned child machines, where what
 * matters is the input each child was started on and what it was sent.
 */
export type FakeCallbackActors = Readonly<{
  /** Callback actor logic for `name`; holds until the machine stops it. */
  actor: (name: string) => CallbackActorLogic<AnyEventObject>;
  /** Deliver an event from the held resource, e.g. `{ type: 'leaseGranted' }`. */
  sendBack: (name: string, event: AnyEventObject) => void;
  /** Live invocations of `name` — the resource is held while this is above zero. */
  active: (name: string) => number;
  /** Cleanups that have run for `name` — the resource was released this many times. */
  releases: (name: string) => number;
  /** Inputs every invocation of `name` was started on, in order. */
  inputsFor: (name: string) => readonly unknown[];
  /** Every event any stub received, with the input of the stub that received it. */
  deliveries: readonly RecordedDelivery[];
}>;

/**
 * Create the callback-actor stubs one suite shares.
 *
 * @returns The stubs plus their hold, release and delivery records.
 */
export const createFakeCallbackActors = (): FakeCallbackActors => {
  const holders = new Map<string, Array<(event: AnyEventObject) => void>>();
  const releases = new Map<string, number>();
  const inputs = new Map<string, unknown[]>();
  const deliveries: RecordedDelivery[] = [];

  return {
    actor: (name) =>
      fromCallback<AnyEventObject>(({ sendBack, receive, input }) => {
        const list = holders.get(name) ?? [];
        list.push(sendBack);
        holders.set(name, list);
        const started = inputs.get(name) ?? [];
        started.push(input);
        inputs.set(name, started);
        receive((event: AnyEventObject) => {
          deliveries.push({ name, input, event });
        });
        return () => {
          holders.set(
            name,
            (holders.get(name) ?? []).filter((entry) => entry !== sendBack),
          );
          releases.set(name, (releases.get(name) ?? 0) + 1);
        };
      }),
    sendBack: (name, event) => {
      const list = holders.get(name) ?? [];
      if (list.length === 0) {
        throw new Error(`No live "${name}" callback actor to send ${event.type} from.`);
      }
      for (const send of list) {
        send(event);
      }
    },
    active: (name) => holders.get(name)?.length ?? 0,
    releases: (name) => releases.get(name) ?? 0,
    inputsFor: (name) => inputs.get(name) ?? [],
    deliveries,
  };
};

/** A parent stand-in that records every event a child sends to it. */
export type FakeParent = Readonly<{ ref: AnyActorRef; events: readonly AnyEventObject[]; stop: () => void }>;

/**
 * Create a running actor usable as `parentRef`, recording what it receives.
 *
 * @returns The parent ref, the events it received and its stop function.
 */
export const createFakeParent = (): FakeParent => {
  const events: AnyEventObject[] = [];
  const ref = createActor(
    fromCallback<AnyEventObject>(({ receive }) => {
      receive((event) => {
        events.push(event);
      });
    }),
  );
  ref.start();
  return { ref, events, stop: () => ref.stop() };
};

/**
 * Record every event an actor emits, in order.
 *
 * @param actor - The actor to observe.
 * @returns The growing list of emitted events.
 */
export const recordEmitted = (actor: AnyActorRef): AnyEventObject[] => {
  const emitted: AnyEventObject[] = [];
  actor.on('*', (event: AnyEventObject) => {
    emitted.push(event);
  });
  return emitted;
};

/** A clock the suite advances by hand, so no test waits on real time. */
export type ManualClock = Readonly<{
  setTimeout: (callback: () => void, expiryTimeoutMilliseconds: number) => number;
  clearTimeout: (id: number) => void;
  /** Advance virtual time and run every timeout that comes due. */
  advance: (milliseconds: number) => void;
}>;

/**
 * Create the manual clock passed as `createActor(logic, { clock })`.
 *
 * @returns A clock whose virtual time only moves when the suite advances it.
 */
export const createManualClock = (): ManualClock => {
  const timeouts = new Map<number, Readonly<{ at: number; callback: () => void }>>();
  let now = 0;
  let nextId = 0;

  return {
    setTimeout(callback, expiryTimeoutMilliseconds) {
      nextId += 1;
      timeouts.set(nextId, { at: now + expiryTimeoutMilliseconds, callback });
      return nextId;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
    advance(milliseconds) {
      now += milliseconds;
      const due = [...timeouts.entries()]
        .filter(([, entry]) => entry.at <= now)
        .sort(([, left], [, right]) => left.at - right.at);
      for (const [id, entry] of due) {
        timeouts.delete(id);
        entry.callback();
      }
    },
  };
};
