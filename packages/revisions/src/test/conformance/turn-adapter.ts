/**
 * The conformance adapter between `turn.machine` and `specs/turn/TurnProtocol.tla` (promoted from
 * S6 by W1; W5 owns it). One table serves both bridges: forward replay maps each protocol action to
 * one harness operation, and the backward walk labels each machine event with the action it stands for.
 */

import { createActor } from 'xstate';
import type { AnyEventObject, AnyMachineSnapshot } from 'xstate';
import type { ConformanceAdapter } from '@taucad/formal/replay';
import type { SpecView } from '@taucad/formal/graph';

import { selectTurnHoldsLease, turnCutSettlementMilliseconds } from '#turn.machine.js';
import type { TurnMachine, TurnMachineEvent } from '#turn.machine.js';
import { StepClock } from '@taucad/xstate-testing/clock';
import {
  createFakeCallbackActors,
  createFakeParent,
  createFakePromiseActors,
  recordEmitted,
} from '@taucad/xstate-testing/fakes';

/** A protocol action label, as `TurnProtocol.tla` writes `act`. */
export type ActionLabel = readonly [string, ...Array<string | boolean>];

export const portCodes = ['NONE', 'ENGINE_UNAVAILABLE'] as const;

export const turnInput = { turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' } as const;

export const preparedOutput = (dirty: boolean, stale: boolean): Record<string, unknown> => ({
  checkoutId: 'checkout-1',
  branch: 'main',
  baseRevisionId: 'rev-1',
  dirty,
  staleRunIds: stale ? ['run-old'] : [],
});

/** The value a rejected effect throws for a port code; `NONE` is an unclassified failure. */
export const failure = (code: string): Error =>
  code === 'NONE' ? new Error('refused') : Object.assign(new Error('refused'), { code });

/** A cut answer as the parent routes it; the revision id names which cut it answers. */
export const answer = (kind: string, revisionId: string): AnyEventObject => ({
  type: kind,
  trigger: 'turn',
  turnId: 'turn-1',
  ...(kind === 'revisionMinted' ? { revisionId } : {}),
  ...(kind === 'cutFailed' ? { reason: 'disk full' } : {}),
});

/** What each invoked effect resolves with when it succeeds, per protocol label. */
const doneOutputs: Readonly<Record<string, ReadonlyArray<readonly [ActionLabel, unknown]>>> = {
  prepare: [false, true].flatMap((dirty) =>
    [false, true].map((stale): readonly [ActionLabel, unknown] => [
      ['PrepareOk', dirty, stale],
      preparedOutput(dirty, stale),
    ]),
  ),
  writeLease: [[['WriteLeaseOk'], { leaseIds: ['run-1'] }]],
  capture: [[['CaptureOk'], { captureId: 'capture-1' }]],
  merge: [
    [['MergeOk', 'recorded'], { status: 'recorded' }],
    [['MergeOk', 'conflicted'], { status: 'conflicted', conflictRevisionId: 'rev-conflict' }],
  ],
  retireLease: [[['RetireDone', true], undefined]],
};

const errorLabels: Readonly<Record<string, (code: string) => ActionLabel>> = {
  prepare: (code) => ['PrepareErr', code],
  writeLease: (code) => ['WriteLeaseErr', code],
  capture: (code) => ['CaptureErr', code],
  merge: (code) => ['MergeErr', code],
};

const phaseOf = (snapshot: AnyMachineSnapshot): string => {
  const value: unknown = snapshot.value;
  return typeof value === 'string' ? value : String(Object.values(value as Record<string, unknown>)[0]);
};

/** A sampled machine event and the protocol action it stands for (JSON of the label). */
export type LabelledEvent = Readonly<{ label: string; event: AnyEventObject }>;

const labelled = (label: ActionLabel, event: AnyEventObject): LabelledEvent => ({
  label: JSON.stringify(label),
  event: { ...event, label: JSON.stringify(label) },
});

/**
 * Concrete events for one candidate transition of `turn.machine`.
 *
 * @param eventType - The candidate's event type.
 * @param matches - The candidate's event pattern (`actorId`, `delay`, `stateId`).
 * @param snapshot - The snapshot the candidate is enabled in.
 * @returns Labelled events; `[]` for an event type the protocol has no action for.
 */
export const sampleTurnEvents = (
  eventType: string,
  matches: Readonly<Record<string, unknown>>,
  snapshot: AnyMachineSnapshot,
): LabelledEvent[] => {
  const phase = phaseOf(snapshot);
  const actorId = typeof matches['actorId'] === 'string' ? matches['actorId'] : '';
  const child = (snapshot.children as Record<string, { src?: unknown; sessionId?: unknown } | undefined>)[actorId];
  const source = typeof child?.src === 'string' ? child.src : '';
  const session = child?.sessionId === undefined ? {} : { sessionId: child.sessionId };
  switch (eventType) {
    case 'xstate.done.actor': {
      return (doneOutputs[source] ?? []).map(([label, output]) =>
        labelled(label, { type: eventType, actorId, ...session, output }),
      );
    }
    case 'xstate.error.actor': {
      return source === 'retireLease'
        ? [
            labelled(['RetireDone', false], {
              type: eventType,
              actorId,
              ...session,
              error: new Error('lease file gone'),
            }),
          ]
        : portCodes.flatMap((code) => {
            const label = errorLabels[source];
            return label ? [labelled(label(code), { type: eventType, actorId, ...session, error: failure(code) })] : [];
          });
    }
    case 'xstate.after': {
      return [labelled([phase === 'basing' ? 'BaseTimeout' : 'CutTimeout'], { type: eventType, ...matches })];
    }
    case 'revisionMinted':
    case 'nothingToSave':
    case 'cutFailed':
    case 'casLost': {
      return [
        labelled(
          [phase === 'basing' ? 'BaseAnswer' : 'CutAnswer', eventType],
          answer(eventType, phase === 'basing' ? 'rev-base' : 'rev-turn'),
        ),
      ];
    }
    case 'leaseGranted': {
      return [labelled(['LeaseGranted'], { type: eventType })];
    }
    case 'leaseRefused': {
      return [labelled(['LeaseRefused'], { type: eventType, reason: 'held elsewhere' })];
    }
    case 'turnCompleted': {
      return [labelled(['TurnCompleted'], { type: eventType })];
    }
    case 'release':
    case 'turnAbandoned': {
      return [labelled(['Release', eventType], { type: eventType })];
    }
    default: {
      return [];
    }
  }
};

/** The protocol's `turn` for a machine snapshot: the refinement mapping. */
export const abstractTurn = (snapshot: AnyMachineSnapshot): Record<string, unknown> => {
  const context = snapshot.context as Record<string, unknown>;
  return {
    phase: phaseOf(snapshot),
    retries: context['casRetries'],
    completion: context['completionRequested'],
    outcome: context['outcome'] ?? 'none',
    code: context['code'] ?? 'NONE',
    base: context['baseRevisionId'] ?? 'none',
    revision: context['revisionId'] ?? 'none',
  };
};

/** `Invoked(p)` from the spec: the effects the turn holds in each phase. */
const invoked: Readonly<Record<string, readonly string[]>> = {
  resolving: ['prepare'],
  writingLease: ['writeLease'],
  acquiring: ['lease'],
  held: ['lease'],
  capturing: ['capture'],
  merging: ['merge'],
  retiring: ['retireLease'],
};

export const invokedIn = (phase: string): string[] => [...(invoked[phase] ?? [])];

/** A message the turn sent or emitted, in the spec's vocabulary. */
export const messageOf = (event: AnyEventObject): string => {
  switch (event.type) {
    case 'turnReleased': {
      return `turnReleased:${String(event['outcome'])}:${String(event['code'] ?? 'NONE')}`;
    }
    case 'turnFinalized':
    case 'turnConflicted': {
      return `${event.type}:${String(event['revisionId'] ?? 'none')}`;
    }
    default: {
      return event.type;
    }
  }
};

const orphanOutputs: Readonly<Record<string, unknown>> = {
  prepare: preparedOutput(false, false),
  writeLease: { leaseIds: ['run-1'] },
  capture: { captureId: 'capture-1' },
  merge: { status: 'recorded' },
  retireLease: undefined,
};

/* Protocol action → the effect it fails. */
const errorEffects = new Map([
  ['PrepareErr', 'prepare'],
  ['WriteLeaseErr', 'writeLease'],
  ['CaptureErr', 'capture'],
  ['MergeErr', 'merge'],
]);

const startHarness = (machine: TurnMachine) => {
  const promises = createFakePromiseActors();
  const callbacks = createFakeCallbackActors();
  const parent = createFakeParent();
  const clock = new StepClock();
  const actor = createActor(
    machine.provide({
      actors: {
        prepare: promises.actor('prepare'),
        writeLease: promises.actor('writeLease'),
        retireLease: promises.actor('retireLease'),
        capture: promises.actor('capture'),
        merge: promises.actor('merge'),
        lease: callbacks.actor('lease'),
      },
    }),
    { clock, input: { ...turnInput, parentRef: parent.ref } },
  );
  const emitted = recordEmitted(actor);
  actor.start();
  return { actor, promises, callbacks, parent, emitted, clock, seen: { sent: 0, emitted: 0 } };
};

export type TurnHarness = ReturnType<typeof startHarness>;

/* Let a settled promise actor's resolution reach the machine: every microtask drains before `setImmediate`. */
const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
};

/* One protocol action, performed on the harness. */
const perform = (harness: TurnHarness, action: readonly unknown[]): void => {
  const [name, first, second] = action as [string, unknown, unknown];
  const { actor, promises, callbacks, clock } = harness;
  switch (name) {
    case 'PrepareOk': {
      promises.settle('prepare', { output: preparedOutput(first === true, second === true) });
      return;
    }
    case 'PrepareErr':
    case 'WriteLeaseErr':
    case 'CaptureErr':
    case 'MergeErr': {
      promises.settle(errorEffects.get(name) ?? name, { error: failure(String(first)) });
      return;
    }
    case 'BaseAnswer': {
      actor.send(answer(String(first), 'rev-base') as unknown as TurnMachineEvent);
      return;
    }
    case 'CutAnswer': {
      actor.send(answer(String(first), 'rev-turn') as unknown as TurnMachineEvent);
      return;
    }
    case 'LateAnswer': {
      /* A settled turn's ref is already dropped by the root (R12), so the answer never reaches it. */
      if (actor.getSnapshot().status === 'active') {
        actor.send(answer(String(first), 'rev-late') as unknown as TurnMachineEvent);
      }
      return;
    }
    case 'BaseTimeout':
    case 'CutTimeout': {
      clock.advance(turnCutSettlementMilliseconds);
      return;
    }
    case 'WriteLeaseOk': {
      promises.settle('writeLease', { output: { leaseIds: ['run-1'] } });
      return;
    }
    case 'LeaseGranted': {
      callbacks.sendBack('lease', { type: 'leaseGranted' });
      return;
    }
    case 'LeaseRefused': {
      callbacks.sendBack('lease', { type: 'leaseRefused', reason: 'held elsewhere' });
      return;
    }
    case 'TurnCompleted': {
      actor.send({ type: 'turnCompleted' });
      return;
    }
    case 'Release': {
      actor.send({ type: String(first) } as unknown as TurnMachineEvent);
      return;
    }
    case 'CaptureOk': {
      promises.settle('capture', { output: { captureId: 'capture-1' } });
      return;
    }
    case 'MergeOk': {
      promises.settle('merge', {
        output:
          first === 'recorded' ? { status: 'recorded' } : { status: 'conflicted', conflictRevisionId: 'rev-conflict' },
      });
      return;
    }
    case 'RetireDone': {
      promises.settle('retireLease', first === true ? { output: undefined } : { error: new Error('lease file gone') });
      return;
    }
    case 'OrphanDone': {
      promises.settle(
        String(first),
        second === true ? { output: orphanOutputs[String(first)] } : { error: new Error('late failure') },
      );
      return;
    }
    default: {
      throw new Error(`No adapter for protocol action ${name}.`);
    }
  }
};

const runningOf = (snapshot: AnyMachineSnapshot): string[] =>
  Object.values(snapshot.children as Record<string, { src?: unknown } | undefined>)
    .map((child) => (typeof child?.src === 'string' ? child.src : '?'))
    .sort();

/**
 * The forward-replay adapter. `view` reports the messages sent and emitted since the previous view,
 * which is one step's `out` and `emits`; `project` adds the facts the spec implies per phase.
 */
export const turnAdapter = (
  machine: TurnMachine,
): ConformanceAdapter<TurnHarness> & { readonly project: (state: SpecView) => SpecView } => ({
  start: () => startHarness(machine),
  apply: async (harness, action) => {
    perform(harness, action);
    await flush();
  },
  view: (harness) => {
    const snapshot = harness.actor.getSnapshot() as AnyMachineSnapshot;
    const out = harness.parent.events.slice(harness.seen.sent).map((event) => messageOf(event));
    const emits = harness.emitted.slice(harness.seen.emitted).map((event) => messageOf(event));
    harness.seen.sent = harness.parent.events.length;
    harness.seen.emitted = harness.emitted.length;
    return {
      turn: abstractTurn(snapshot),
      running: runningOf(snapshot),
      holdsLease: selectTurnHoldsLease(harness.actor.getSnapshot()),
      out,
      emits,
    };
  },
  project: (state) => {
    const phase = String((state['turn'] as Record<string, unknown> | undefined)?.['phase']);
    return { ...state, running: invokedIn(phase).sort(), holdsLease: phase === 'held' };
  },
  stop: (harness) => {
    harness.actor.stop();
    harness.parent.stop();
  },
});
