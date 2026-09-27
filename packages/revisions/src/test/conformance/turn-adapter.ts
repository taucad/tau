/**
 * The conformance adapter between `turn.machine` and `specs/turn/TurnProtocol.tla` (promoted from
 * S6 by W1; W5 owns it). One table serves both bridges: forward replay maps each protocol action to
 * one harness operation, and the backward walk labels each machine event with the action it stands for.
 *
 * The graph is `TurnProtocol.pr.cfg`: the target machine under every host verb it accepts, so a
 * release is `turnAbandoned` and a completion is `turnCompleted`. W8's M1 completes only a placed
 * attempt and never releases after a cut (`TurnProtocol.target.cfg`); that is the host's discipline.
 */

import { createActor } from 'xstate';
import type { AnyEventObject, AnyMachineSnapshot } from 'xstate';
import type { ConformanceAdapter } from '@taucad/formal/replay';
import type { SpecView } from '@taucad/formal/graph';

import { selectTurnHoldsLease, turnIgnoredEvents } from '#turn.machine.js';
import type { TurnMachine, TurnMachineEvent, TurnMachineInput } from '#turn.machine.js';
import {
  createFakeCallbackActors,
  createFakeParent,
  createFakePromiseActors,
  recordEmitted,
} from '@taucad/xstate-testing/fakes';
import { guardActors } from '@taucad/xstate-testing/inspect';

/** A protocol action label, as `TurnProtocol.tla` writes `act`. */
export type ActionLabel = readonly [string, ...Array<string | boolean>];

export const portCodes = ['NONE', 'ENGINE_UNAVAILABLE'] as const;

const key = { chatId: 'chat-1', turnId: 'turn-1', runId: 'run-1', attempt: 0 } as const;

/** A fresh attempt's input. */
export const turnInput: TurnMachineInput = { key };

/** An attempt adopted from a lease record (the spec's `Adopted`). */
export const adoptedTurnInput: TurnMachineInput = {
  key,
  adopt: { checkoutId: 'checkout-1', headRevisionId: 'rev-1' },
};

export const preparedOutput = (dirty: boolean): Record<string, unknown> => ({
  checkoutId: 'checkout-1',
  branch: 'main',
  baseRevisionId: 'rev-1',
  dirty,
});

const lease = { key, checkoutId: 'checkout-1', headRevisionId: 'rev-1' };
const writtenOutput = { lease, leaseIds: ['run-1'], held: [] };

/** The value a rejected effect throws for a port code; `NONE` is an unclassified failure. */
export const failure = (code: string): Error =>
  code === 'NONE' ? new Error('refused') : Object.assign(new Error('refused'), { code });

/* The id of the cut the attempt waits on, in the wire format (RM-R1). */
const pendingCutId = (context: Record<string, unknown>, phase: string): string =>
  `run-1/0/${phase === 'basing' ? 'base' : 'result'}/${String(Number(context['cutSequence']) - 1)}`;

/** A cut answer as the parent routes it, naming the cut it answers. */
export const answer = (kind: string, requestId: string, revisionId: string): AnyEventObject => ({
  type: kind,
  requestId,
  ...(kind === 'revisionMinted' ? { revisionId } : {}),
  ...(kind === 'cutFailed' ? { reason: 'disk full' } : {}),
});

/** What each invoked effect resolves with when it succeeds, per protocol label. */
const doneOutputs: Readonly<Record<string, ReadonlyArray<readonly [ActionLabel, unknown]>>> = {
  prepare: [false, true].map((dirty): readonly [ActionLabel, unknown] => [['PrepareOk', dirty], preparedOutput(dirty)]),
  writeLease: [[['WriteLeaseOk'], writtenOutput]],
  capture: [[['CaptureOk'], { captureId: 'capture-1' }]],
  merge: [
    [['MergeOk', 'recorded'], { status: 'recorded' }],
    [['MergeOk', 'conflicted'], { status: 'conflicted', conflictRevisionId: 'rev-conflict' }],
  ],
  retireLease: [[['RetireDone', true], undefined]],
  find: [
    [['FindDone', true], { result: 'rev-found' }],
    [['FindDone', false], {}],
  ],
};

const errorLabels: Readonly<Record<string, (code: string) => ActionLabel>> = {
  prepare: (code) => ['PrepareErr', code],
  writeLease: (code) => ['WriteLeaseErr', code],
  capture: (code) => ['CaptureErr', code],
  merge: (code) => ['MergeErr', code],
};

const phaseOf = (snapshot: AnyMachineSnapshot): string => String(snapshot.value);

/** A sampled machine event and the protocol action it stands for (JSON of the label). */
export type LabelledEvent = Readonly<{ label: string; event: AnyEventObject }>;

const labelled = (label: ActionLabel, event: AnyEventObject): LabelledEvent => ({
  label: JSON.stringify(label),
  event: { ...event, label: JSON.stringify(label) },
});

const answerKinds = new Set(['revisionMinted', 'nothingToSave', 'cutFailed', 'casLost', 'cutCancelled']);

/**
 * Concrete events for one candidate transition of `turn.machine`.
 *
 * Events the root answers without a step of the protocol (a stale answer, a repeated signal, an
 * acknowledgement before settlement) sample to `[]`, as does a failed search, which the spec
 * does not model.
 *
 * @param eventType - The candidate's event type.
 * @param matches - The candidate's event pattern (`actorId`, `stateId`).
 * @param snapshot - The snapshot the candidate is enabled in.
 * @returns Labelled events; `[]` for an event type the protocol has no action for.
 */
export const sampleTurnEvents = (
  eventType: string,
  matches: Readonly<Record<string, unknown>>,
  snapshot: AnyMachineSnapshot,
): LabelledEvent[] => {
  const phase = phaseOf(snapshot);
  const context = snapshot.context as Record<string, unknown>;
  const actorId = typeof matches['actorId'] === 'string' ? matches['actorId'] : '';
  const child = (snapshot.children as Record<string, { src?: unknown; sessionId?: unknown } | undefined>)[actorId];
  const source = typeof child?.src === 'string' ? child.src : '';
  const session = child?.sessionId === undefined ? {} : { sessionId: child.sessionId };
  if (answerKinds.has(eventType)) {
    if (phase !== 'basing' && phase !== 'requesting') {
      return [];
    }
    if (eventType === 'cutCancelled' && context['releasing'] !== true) {
      return [];
    }
    return [
      labelled(
        [phase === 'basing' ? 'BaseAnswer' : 'CutAnswer', eventType],
        answer(eventType, pendingCutId(context, phase), phase === 'basing' ? 'rev-base' : 'rev-turn'),
      ),
    ];
  }
  switch (eventType) {
    case 'xstate.done.actor': {
      return (doneOutputs[source] ?? []).map(([label, output]) =>
        labelled(label, { type: eventType, actorId, ...session, output }),
      );
    }
    case 'xstate.error.actor': {
      if (source === 'retireLease') {
        return [labelled(['RetireDone', false], { type: eventType, actorId, ...session, error: new Error('gone') })];
      }
      const label = errorLabels[source];
      return label
        ? portCodes.map((code) => labelled(label(code), { type: eventType, actorId, ...session, error: failure(code) }))
        : [];
    }
    case 'leaseGranted': {
      return phase === 'acquiring' || phase === 'held' ? [labelled(['LeaseGranted'], { type: eventType })] : [];
    }
    case 'leaseRefused': {
      return phase === 'acquiring' ? [labelled(['LeaseRefused'], { type: eventType, reason: 'held elsewhere' })] : [];
    }
    case 'turnCompleted': {
      return [labelled(['TurnCompleted'], { type: eventType, key })];
    }
    case 'turnAbandoned': {
      return [labelled(['Release', eventType], { type: eventType, key })];
    }
    case 'acknowledge': {
      return phase === 'settled' ? [labelled(['Acknowledge'], { type: eventType, key })] : [];
    }
    default: {
      return [];
    }
  }
};

/** The protocol's `turn` for a machine snapshot: the refinement mapping. */
export const abstractTurn = (snapshot: AnyMachineSnapshot): Record<string, unknown> => {
  const context = snapshot.context as Record<string, unknown>;
  const phase = phaseOf(snapshot);
  const refused = phase === 'refusing' || phase === 'refused';
  return {
    phase,
    retries: context['casRetries'],
    completion: context['completionRequested'],
    outcome: refused ? 'refused' : (context['outcome'] ?? 'none'),
    code: context['code'] ?? 'NONE',
    base: context['baseRevisionId'] ?? 'none',
    revision: context['revisionId'] ?? 'none',
    releasing: context['releasing'],
    dirty: context['dirtyBase'],
    placed: context['placed'],
    found: context['foundRevisionId'] !== undefined,
    leased: context['lease'] !== undefined,
    cutRefused: Number(context['cutFailures']) > 0,
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
  refusing: ['retireLease'],
  adopting: ['find'],
  finding: ['find'],
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
    case 'turnRefused': {
      return `turnRefused:${String(event['code'] ?? 'NONE')}`;
    }
    case 'turnCutRefused': {
      return 'cutRefused';
    }
    default: {
      return event.type;
    }
  }
};

const orphanOutputs: Readonly<Record<string, unknown>> = {
  prepare: preparedOutput(false),
  writeLease: writtenOutput,
  capture: { captureId: 'capture-1' },
  merge: { status: 'recorded' },
  retireLease: undefined,
  find: {},
};

/* Protocol action → the effect it fails. */
const errorEffects = new Map([
  ['PrepareErr', 'prepare'],
  ['WriteLeaseErr', 'writeLease'],
  ['CaptureErr', 'capture'],
  ['MergeErr', 'merge'],
]);

const startHarness = (machine: TurnMachine, input: TurnMachineInput) => {
  const promises = createFakePromiseActors();
  const callbacks = createFakeCallbackActors();
  const parent = createFakeParent();
  const actor = createActor(
    machine.provide({
      actors: {
        prepare: promises.actor('prepare'),
        writeLease: promises.actor('writeLease'),
        retireLease: promises.actor('retireLease'),
        capture: promises.actor('capture'),
        merge: promises.actor('merge'),
        find: promises.actor('find'),
        lease: callbacks.actor('lease'),
      },
    }),
    /* RM-A15: the zero-microstep inspector over the covering suite; a dropped event fails the test. */
    {
      input: { ...input, parentRef: parent.ref },
      inspect: guardActors({ ignore: { turn: turnIgnoredEvents } }).inspect,
    },
  );
  const emitted = recordEmitted(actor);
  actor.start();
  return { actor, promises, callbacks, parent, emitted, seen: { sent: 0, emitted: 0 } };
};

export type TurnHarness = ReturnType<typeof startHarness>;

/* Let a settled promise actor's resolution reach the machine: every microtask drains before `setImmediate`. */
const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
};

const send = (harness: TurnHarness, event: AnyEventObject): void => {
  harness.actor.send(event as unknown as TurnMachineEvent);
};

/* The answer to the cut the attempt waits on now. */
const answerNow = (harness: TurnHarness, kind: string, revisionId: string): AnyEventObject => {
  const snapshot = harness.actor.getSnapshot() as AnyMachineSnapshot;
  return answer(kind, pendingCutId(snapshot.context as Record<string, unknown>, phaseOf(snapshot)), revisionId);
};

/* One protocol action, performed on the harness. */
const perform = (harness: TurnHarness, action: readonly unknown[]): void => {
  const [name, first, second] = action as [string, unknown, unknown];
  const { actor, promises, callbacks } = harness;
  switch (name) {
    case 'PrepareOk': {
      promises.settle('prepare', { output: preparedOutput(first === true) });
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
      send(harness, answerNow(harness, String(first), 'rev-base'));
      return;
    }
    case 'CutAnswer': {
      send(harness, answerNow(harness, String(first), 'rev-turn'));
      return;
    }
    case 'LateAnswer': {
      /* The cut the attempt stopped waiting on: its id is no longer pending, so the answer is ignored (RM-R1). */
      if (actor.getSnapshot().status === 'active') {
        send(harness, answer(String(first), 'run-1/0/late/0', 'rev-late'));
      }
      return;
    }
    case 'WriteLeaseOk': {
      promises.settle('writeLease', { output: writtenOutput });
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
      send(harness, { type: 'turnCompleted', key });
      return;
    }
    case 'Release': {
      /* Today's `release` and `turnAbandoned` reach the attempt as `turnAbandoned` (the root deletes `release`). */
      send(harness, { type: 'turnAbandoned', key });
      return;
    }
    case 'Acknowledge': {
      send(harness, { type: 'acknowledge', key });
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
    case 'FindDone': {
      promises.settle('find', { output: first === true ? { result: 'rev-found' } : {} });
      return;
    }
    case 'RetireDone': {
      promises.settle('retireLease', first === true ? { output: undefined } : { error: new Error('gone') });
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
 *
 * @param machine - The machine under test.
 * @param input - The attempt's input: {@link turnInput} for `Fresh`, {@link adoptedTurnInput} for `Adopted`.
 */
export const turnAdapter = (
  machine: TurnMachine,
  input: TurnMachineInput = turnInput,
): ConformanceAdapter<TurnHarness> & { readonly project: (state: SpecView) => SpecView } => ({
  start: () => startHarness(machine, input),
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
