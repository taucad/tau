/**
 * M1's machine-level bridges (W7 RA-S15, RA-A2, RA-A11): enumeration and totality over its public alphabet, the
 * slot invariant (MC-R26) and spec action names on every transition, and the durable-driver readiness checks.
 */

import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

import { describe, expect, it } from 'vitest';
import { transition } from 'xstate';
import type { AnyEventObject, AnyMachineSnapshot, AnyStateMachine, InspectionEvent } from 'xstate';
import { getShortestPaths } from 'xstate/graph';

import { checkActionCorrespondence, machineActions, specOperators } from '@taucad/formal/drift';
import { StepClock } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';

import { createChatRunEffects } from '#host/chat-run-effects.js';
import type { ChatRunDeps } from '#host/chat-run-effects.js';
import type { ChatRunInput } from '#host/chat-run.machine.js';
import { chatRunIgnoredEvents, chatRunMachine } from '#host/chat-run.machine.js';
import { chatId, commands, createChatLog, createChatRunHarness, lifecycle } from '#host/chat-run.fixture.js';
import type { ChatRunHarness } from '#host/chat-run.fixture.js';
import type { ChatRunRow } from '#host/chat-run-events.js';
import { chatRunState, emptyChatLedger } from '#log/chat-ledger.js';
import type { ChatLedger } from '#log/chat-ledger.js';
import type { TurnAttemptKey } from '#waist/ports.js';

type Context = Readonly<{
  ledger: ChatLedger;
  seq: number;
  pending?: string;
  slot?: Readonly<{ commandId: string; kind: string; key: TurnAttemptKey }>;
  settle?: Readonly<{ key: TurnAttemptKey }>;
}>;

const contextOf = (snapshot: AnyMachineSnapshot): Context => snapshot.context as Context;

/** A value a durable host could journal: it comes back from JSON unchanged (S1 condition 3). */
const jsonSafe = (value: unknown): boolean =>
  // oxlint-disable-next-line unicorn/prefer-structured-clone -- the JSON round trip is the property under test.
  isDeepStrictEqual(JSON.parse(JSON.stringify(value)), value);

// ── ledgers the sampled outcomes carry: each one W3's fold of rows through the gate ─────────────────

const row = (body: ChatRunRow['body'], commandId?: string): ChatRunRow => ({
  runId: 'run-1',
  body,
  ...(commandId === undefined ? {} : { commandId }),
});
const requested = row({
  type: 'interrupt.recorded',
  interruptId: 'interrupt-1',
  phase: 'requested',
  reason: 'May I?',
  payload: { kind: 'approval', prompt: 'May I?' },
});
const resolved = row({
  type: 'interrupt.recorded',
  interruptId: 'interrupt-1',
  phase: 'resolved',
  reason: 'approved',
  payload: { outcome: 'approved' },
});
const externalMarker = row({
  type: 'message.appended',
  message: { id: 'turn-1', role: 'user', content: 'Hello.', metadata: { tauInternal: { kind: 'external-agent' } } },
});
const ledgerOf = (rows: readonly ChatRunRow[]): ChatLedger => {
  const log = createChatLog();
  log.append('epoch-seed', rows);
  return log.ledger();
};
const admitted = row(lifecycle('admitted'), 'cmd-1');
const runningRow = row(lifecycle('running'));
const settled = row({ type: 'turn.failed', chatId, turnId: 'turn-1', reason: 'Settled.' });
const pausedRun = [admitted, runningRow, requested, row(lifecycle('paused')), resolved];
const ledgers: readonly ChatLedger[] = [
  emptyChatLedger,
  ledgerOf([admitted]),
  ledgerOf([admitted, runningRow]),
  ledgerOf([admitted, runningRow, row(lifecycle('completed'))]),
  ledgerOf([admitted, runningRow, row(lifecycle('completed')), settled]),
  ledgerOf([admitted, runningRow, row(lifecycle('failed', { detail: { code: 'RUN_ABANDONED', message: 'Gone.' } }))]),
  ledgerOf([admitted, runningRow, requested, row(lifecycle('paused'))]),
  ledgerOf(pausedRun),
  ledgerOf([...pausedRun, settled]),
  ledgerOf([externalMarker, admitted, runningRow, requested, row(lifecycle('paused'))]),
];

// ── the sampled public alphabet, correlated from the snapshot (MC-R18) ──────────────────────────────

const staleKey: TurnAttemptKey = { chatId, turnId: 'turn-9', runId: 'run-9', attempt: 9 };
const timers: readonly AnyEventObject[] = [
  { type: 'xstate.after', delay: 'idleEviction', stateId: 'free' },
  { type: 'xstate.after', delay: 'idleEviction', stateId: 'paused' },
  { type: 'xstate.after', delay: 'driverStopBound', stateId: 'stopping' },
  { type: 'xstate.after', delay: 'cutRetry', stateId: 'backingOff' },
];

const sample = (snapshot: AnyMachineSnapshot): readonly AnyEventObject[] => {
  const context = contextOf(snapshot);
  const commandId = context.slot?.commandId ?? 'cmd-9';
  const key = context.slot?.key ?? staleKey;
  const settleKey = context.settle?.key ?? key;
  const appendKeys = [
    context.pending,
    `abandon:${String(context.seq)}`,
    `settle:${settleKey.runId}:${String(settleKey.attempt)}`,
    'stale:0',
  ];
  const verbs = Object.keys(commands) as ReadonlyArray<keyof typeof commands>;
  return [
    ...verbs.flatMap((verb) => [commands[verb]('cmd-1'), commands[verb]('cmd-2'), commands[verb]('cmd-3', 'run-2')]),
    ...ledgers.map((ledger) => ({ type: 'logOpened', ledger, repair: [] })),
    { type: 'logOpened', ledger: ledgers[2]!, repair: [row(lifecycle('failed', { detail: { message: 'Gone.' } }))] },
    { type: 'logOpenFailed', code: 'LOG_UNREADABLE', message: 'Unreadable.' },
    ...appendKeys.flatMap((appendKey) => [
      ...ledgers.map((ledger) => ({ type: 'rowsCommitted', key: appendKey, ledger, messageIds: [] })),
      { type: 'appendRefused', key: appendKey, code: 'CHAT_RUN_LIVE', message: 'Refused.', effect: 'not-applied' },
      { type: 'appendRefused', key: appendKey, code: 'LOG_FENCED', message: 'Fenced.', effect: 'unknown' },
      {
        type: 'appendRefused',
        key: appendKey,
        code: 'SETTLEMENT_CONFLICT',
        message: 'Settled.',
        effect: 'not-applied',
      },
    ]),
    ...ledgers.map((ledger) => ({ type: 'rowsCommitted', ledger, messageIds: ['steer:cmd-2'] })),
    ...(['tau', 'external'] as const).map((kind) => ({
      type: 'admissionPrepared',
      commandId,
      prepared: { kind, turnId: 'turn-1', intent: [lifecycle('admitted')], start: [] },
    })),
    { type: 'admissionRefused', commandId, code: 'HOST_MODEL_UNAVAILABLE', message: 'No model.' },
    ...(['start', 'continue', 'complete'] as const).map((mode) => ({
      type: 'resumePrepared',
      commandId,
      prepared: { kind: 'tau', turnId: 'turn-1', mode, intent: [lifecycle('running')] },
    })),
    { type: 'resumeRefused', commandId, code: 'RESUME_UNAVAILABLE', message: 'No.' },
    { type: 'placed', key, placement: { checkoutId: 'checkout-1', mode: 'direct' } },
    { type: 'placementRefused', key, code: 'CHECKOUT_UNKNOWN', message: 'No checkout.', effect: 'not-applied' },
    { type: 'placementRefused', key, code: 'SESSION_FENCED', message: 'Fenced.', effect: 'unknown' },
    { type: 'completeAnswered', key: settleKey, status: 'applied' },
    ...['CUT_FAILED', 'TURN_UNKNOWN', 'LEASE_HELD_ELSEWHERE'].map((code) => ({
      type: 'completeAnswered',
      key: settleKey,
      status: 'refused',
      code,
    })),
    { type: 'completeAnswered', key: settleKey, status: 'unknown' },
    {
      type: 'settlementPublished',
      key: settleKey,
      row: {
        type: 'turn.failed',
        chatId,
        turnId: settleKey.turnId,
        runId: settleKey.runId,
        attempt: settleKey.attempt,
        reason: 'Failed.',
      },
    },
    { type: 'acknowledged', key: settleKey },
    { type: 'abandoned', key },
    ...(['completed', 'failed', 'aborted'] as const).map((outcome) => ({ type: 'agentEnded', key, outcome })),
    { type: 'approvalRequested', key, interruptId: 'interrupt-2', request: { prompt: 'May I?' } },
    { type: 'logClosed' },
    { type: 'close' },
    { type: 'relinquish' },
    ...timers,
  ];
};

/** The blueprint's abstraction: state value, slot kind, chat run state, and whether an append is pending. */
const serializeState = (snapshot: AnyMachineSnapshot): string => {
  const context = contextOf(snapshot);
  return JSON.stringify([
    snapshot.value,
    context.slot?.kind,
    chatRunState(context.ledger),
    context.pending !== undefined,
  ]);
};

/* The stated limit of every claim below (N22): 50,000 traversal steps; the full abstract graph takes under 40,000. */
const limit = 50_000;
const inputs: readonly ChatRunInput[] = [
  { chatId, leaderEpoch: 'epoch-m1', placement: true },
  { chatId, leaderEpoch: 'epoch-m1', placement: false },
];
const optionsFor = (input: ChatRunInput) => ({ input, events: sample, limit, serializeState });

/** The machine as the graph walks it: every snapshot and event is sampled untyped. */
const walked: AnyStateMachine = chatRunMachine;

const reachable = (input: ChatRunInput): AnyMachineSnapshot[] =>
  getShortestPaths(walked, {
    ...optionsFor(input),
    serializeState: (snapshot: AnyMachineSnapshot) => `${snapshot.status}:${serializeState(snapshot)}`,
  }).map((path) => path.state as AnyMachineSnapshot);

describe('chatRun enumeration and totality (RA-A2)', () => {
  it.each(inputs)(
    'should answer every sampled public event in every reachable state (placement $placement)',
    (input) => {
      expect(unansweredEvents(chatRunMachine, { ...optionsFor(input), ignore: chatRunIgnoredEvents })).toEqual([]);
    },
  );

  it('should answer every timer it arms (MC-R16)', async () => {
    const guard = guardActors({ ignore: { 'chat-run': chatRunIgnoredEvents } });
    const clock = new StepClock();
    const harness = createChatRunHarness({ clock, inspect: guard.inspect });
    await harness.open();
    await harness.send(commands.start('cmd-1'));
    await harness.admit();
    await harness.commit();
    await harness.commit();
    await harness.send(commands.cancel('cmd-2'));

    /* The driver never reports: at the stop bound M1 records the ending itself (D13). */
    await clock.advanceAsync(30_000);
    await harness.commit();
    expect(harness.actor.getSnapshot().value).toEqual({ idle: 'free' });
    await clock.advanceAsync(300_000);

    expect(harness.actor.getSnapshot().value).toBe('closing');
    expect(harness.log.ledger().runs['run-1']?.lifecycle).toBe('cancelled');
  });

  it('should reach every state node under placement, and all but settling and fencing without it', () => {
    expect(unreachedStates(chatRunMachine, optionsFor(inputs[0]!))).toEqual([]);
    expect(unreachedStates(chatRunMachine, optionsFor(inputs[1]!))).toEqual([
      'placing',
      'fencing',
      'settling',
      'finishing',
      'backingOff',
      'appending',
      'retiring',
    ]);
  });
});

describe('chatRun invariants on every reachable snapshot', () => {
  const slotStates = ['reserving', 'running', 'ending'];

  /* The states whose snapshots break MC-R26: the slot's presence must match `inSlot`. `closing` may hold either. */
  const slotViolations = (inSlot: boolean): string[] => [
    ...new Set(
      inputs
        .flatMap((input) => reachable(input))
        .filter((snapshot) => snapshot.status === 'active' && !snapshot.matches('closing'))
        .filter((snapshot) => slotStates.some((state) => snapshot.matches(state)) === inSlot)
        .filter((snapshot) => (contextOf(snapshot).slot !== undefined) !== inSlot)
        .map((snapshot) => JSON.stringify(snapshot.value)),
    ),
  ];

  it('should hold the slot in every reserving, running and ending snapshot (MC-R26)', () => {
    expect(slotViolations(true)).toEqual([]);
  });

  /* Every transition that leaves an attempt returns to `idle`, whose entry drops the slot. */
  it('should hold no slot outside reserving, running, ending and closing (MC-R26)', () => {
    expect(slotViolations(false)).toEqual([]);
  });

  /* MC-R27: every transition's static label is an action `ChatRunSlot.tla` defines, and every system action is named. */
  it('should name a ChatRunSlot.tla action on every transition, and a transition for every system action', () => {
    const spec = readFileSync(new URL('../../specs/ChatRunSlot.tla', import.meta.url), 'utf8');
    const labelled = Object.entries(machineActions([chatRunMachine]));
    const actions = Object.fromEntries(labelled.filter(([, tla]) => tla !== 'Unmodelled'));

    expect(labelled.length).toBeGreaterThan(90);
    expect(
      checkActionCorrespondence(actions, {
        operators: specOperators(spec),
        next: [
          'start',
          'admissionPrepared',
          'admissionRefused',
          'agentEnded',
          'abandon',
          'abandoned',
          'rowsCommitted',
          'placed',
          'placementRefused',
          'resume',
          'resumePrepared',
          'resumeRefused',
          'approvalRequested',
          'steer',
          'cancel',
          'interrupt',
          'resolveInterrupt',
          'markAbandoned',
          'logOpened',
          'logFenced',
          'relinquish',
          'complete',
          'settlementPublished',
          'acknowledge',
          'close',
          'logClosed',
        ],
        /* The page, the registry, drivers, the gateway and faults; `today:` actions are the replaced behaviour. */
        environment: [],
      }),
    ).toEqual([]);
  });
});

/* W7.r1 finding 6: where one event holds a modelled and an unmodelled branch, each is its own labelled transition. */
describe('chatRun transition labels (W7.r1)', () => {
  it('should label each branch of a split transition, the unmodelled one first', () => {
    type Node = Readonly<{
      id: string;
      transitions?: ReadonlyMap<string, ReadonlyArray<Readonly<{ meta?: Readonly<{ tla?: string }> }>>>;
      states?: Readonly<Record<string, Node>>;
    }>;
    const nodes = (node: Node): Node[] => [node, ...Object.values(node.states ?? {}).flatMap((child) => nodes(child))];
    const split = nodes(chatRunMachine.root as unknown as Node).flatMap((node) =>
      [...(node.transitions ?? [])]
        .filter(([, transitions]) => transitions.length > 1)
        .map(([event, transitions]) => `${node.id} ${event}: ${transitions.map((each) => each.meta?.tla).join(' | ')}`),
    );

    expect(split.sort()).toEqual([
      'appending acknowledged: Unmodelled | acknowledge',
      'appending appendRefused: Unmodelled | logFenced',
      'fencing abandoned: Unmodelled | abandoned',
      'finishing completeAnswered: Unmodelled | complete',
      'journaling appendRefused: Unmodelled | logFenced',
      'retiring acknowledged: Unmodelled | acknowledge',
      /* `stopping`'s only delayed transition is `driverStopBound`. */
      'stopping xstate.after: Unmodelled | abandon',
      'writing appendRefused: Unmodelled | logFenced',
    ]);
  });
});

/* W7.r1's probes P1–P3, as the ordering each race must keep. */
describe('chatRun races (W7.r1)', () => {
  const toRunning = async (harness: ChatRunHarness, kind: 'tau' | 'external' = 'tau'): Promise<void> => {
    await harness.open();
    await harness.send(commands.start('cmd-start'));
    await harness.admit(kind);
    await harness.commit();
    await harness.commit();
  };

  // P1: the spec answers a steer `applied` once its row is durable, whatever ends the run next.
  it('should answer a steer applied when its row is durable before a cancel ends the run', async () => {
    const harness = createChatRunHarness();
    await toRunning(harness);
    await harness.send(commands.steer('s1'));
    await harness.send(commands.cancel('c1'));
    await harness.driverWrites([
      {
        runId: 'run-1',
        commandId: 's1',
        body: { type: 'message.appended', message: { id: 'steer:s1', role: 'user', content: 'Also this.' } },
      },
    ]);
    await harness.report('aborted');
    await harness.commit();

    expect(harness.answers.filter((answer) => answer.commandId === 's1')).toMatchObject([
      { status: 'applied', effect: 'durable' },
    ]);
  });

  // P2: a resolution whose row lands while a cancel stops the run is still answered, from the ledger.
  it('should answer a resolve-interrupt whose row lands while a cancel stops the run', async () => {
    const harness = createChatRunHarness();
    await toRunning(harness, 'external');
    await harness.drive({ type: 'approvalRequested', interruptId: 'interrupt-1', request: { prompt: 'May I?' } });
    await harness.commit();
    await harness.send(commands['resolve-interrupt']('r1'));
    await harness.send(commands.cancel('c1'));
    await harness.commit();
    await harness.report('aborted');
    await harness.commit();

    expect(harness.answers.filter((answer) => answer.commandId === 'r1')).toMatchObject([
      { status: 'applied', effect: 'durable' },
    ]);
  });

  // W7.r1 finding 9 (mutant M7): an agent that repeats a pending request writes nothing; the first one stands.
  it('should write one requested row when an external agent repeats a pending request', async () => {
    const harness = createChatRunHarness();
    await toRunning(harness, 'external');
    await harness.drive({ type: 'approvalRequested', interruptId: 'interrupt-1', request: { prompt: 'May I?' } });
    await harness.commit();

    await harness.drive({ type: 'approvalRequested', interruptId: 'interrupt-1', request: { prompt: 'May I?' } });

    expect(harness.pendingCalls()).not.toContain('append');
    expect(
      harness.log.rows.filter((event) => event.type === 'interrupt.recorded' && event.phase === 'requested'),
    ).toHaveLength(1);
  });

  // P2b (W7 round 2 N2): the driver ends before the resolution lands; the ending batch does not cancel it too.
  it('should write one resolved row when an external run ends before its resolution lands', async () => {
    const harness = createChatRunHarness();
    await toRunning(harness, 'external');
    await harness.drive({ type: 'approvalRequested', interruptId: 'interrupt-1', request: { prompt: 'May I?' } });
    await harness.commit();
    await harness.send(commands['resolve-interrupt']('r1'));
    await harness.send(commands.cancel('c1'));
    await harness.report('aborted');
    await harness.commit();
    await harness.commit();

    expect(
      harness.log.rows.filter((event) => event.type === 'interrupt.recorded' && event.phase === 'resolved'),
    ).toMatchObject([{ interruptId: 'interrupt-1', reason: 'approved' }]);
    expect(harness.answers.filter((answer) => answer.commandId === 'r1')).toHaveLength(1);
    expect(harness.answers.filter((answer) => answer.commandId === 'c1')).toMatchObject([{ status: 'applied' }]);
    expect(harness.actor.getSnapshot().value).toEqual({ idle: 'free' });
  });

  // P3: without placement, a resume opens attempt 2, so the first driver's late report ends nothing.
  it('should drop a stale driver report after a resume without placement', async () => {
    const clock = new StepClock();
    const harness = createChatRunHarness({ clock });
    await toRunning(harness);
    await harness.send(commands.interrupt('i1'));
    await clock.advanceAsync(30_000);
    await harness.commit();
    await harness.send(commands['resolve-interrupt']('r1'));
    await harness.commit();
    await harness.send(commands.resume('u1'));
    await harness.prepareResume();
    await harness.commit();
    expect(harness.actor.getSnapshot().value).toEqual({ running: 'tau' });

    await harness.drive({ type: 'agentEnded', outcome: 'completed' }, 0);

    expect(harness.actor.getSnapshot().value).toEqual({ running: 'tau' });
    expect(harness.log.ledger().runs['run-1']).toMatchObject({ attempt: 2, lifecycle: 'running' });
  });
});

/* W7.r1 finding 7: the placement paths, read off reachable snapshots under placement. */
describe('chatRun placement paths (W7.r1)', () => {
  type Effect = Readonly<{ type: string; args?: ReadonlyArray<Readonly<{ answer?: unknown }>> }>;
  const placed = reachable(inputs[0]!).filter((snapshot) => snapshot.status === 'active');
  const at = (test: (snapshot: AnyMachineSnapshot) => boolean): AnyMachineSnapshot => {
    const found = placed.find((snapshot) => test(snapshot));
    if (found === undefined) {
      throw new Error('No reachable snapshot matches.');
    }
    return found;
  };
  const step = (snapshot: AnyMachineSnapshot, event: AnyEventObject) =>
    transition(walked, snapshot, event) as unknown as readonly [AnyMachineSnapshot, readonly Effect[]];

  it('should close, writing no ending row, when an abandon fails', () => {
    const fencing = at((snapshot) => snapshot.matches({ ending: 'fencing' }));
    const [next] = step(fencing, { type: 'abandoned', key: contextOf(fencing).slot!.key, unknown: true });

    expect(next.value).toBe('closing');
  });

  it('should close, not rest, when an acknowledge fails', () => {
    const retiring = at((snapshot) => snapshot.matches({ settling: 'retiring' }));
    const [next] = step(retiring, { type: 'acknowledged', key: contextOf(retiring).settle!.key, unknown: true });

    expect(next.value).toBe('closing');
  });

  it('should abandon the placement when a fence ends a running attempt', () => {
    const running = at((snapshot) => snapshot.matches('running') && contextOf(snapshot).pending !== undefined);
    const [next, effects] = step(running, {
      type: 'appendRefused',
      key: contextOf(running).pending,
      code: 'LOG_FENCED',
      message: 'Fenced.',
      effect: 'unknown',
    });

    expect(next.value).toBe('closing');
    expect(effects.map((effect) => effect.type)).toContain('abandonPlacement');
  });

  it('should abandon the placement when a fault ends a running attempt', () => {
    const running = at((snapshot) => snapshot.matches('running'));
    /* A throwing effect or transition reaches `onError` as the actor's execution-error event. */
    const [next, effects] = step(running, { type: 'xstate.error.execution', error: new Error('A fault.') });

    expect(next.value).toBe('closing');
    expect(effects.map((effect) => effect.type)).toContain('abandonPlacement');
  });

  /* W8.r1 item 6: every command the attempt's settlement holds answers `settling`, the page's `wait` retry class. */
  it.each(['resolve-interrupt', 'start', 'resume', 'cancel'] as const)(
    'should answer a %s CHAT_RUN_LIVE{settling} while the attempt settles',
    (verb) => {
      const settling = at((snapshot) => snapshot.matches('settling'));
      const [, effects] = step(settling, commands[verb]('r9'));

      expect(
        effects.filter((effect) => effect.type === 'answer').map((effect) => effect.args?.[0]?.answer),
      ).toMatchObject([{ status: 'refused', code: 'CHAT_RUN_LIVE', details: { state: 'settling' } }]);
    },
  );
});

describe('chatRun durable-driver readiness (RA-A11)', () => {
  it('should provide every effect under a Function.name equal to its key', () => {
    const never = async (): Promise<never> =>
      new Promise<never>(() => {
        /* A call M1 never reaches here. */
      });
    const deps: ChatRunDeps = {
      services: {
        openLog: never,
        append: never,
        prepareAdmission: never,
        prepareResume: never,
        startDriver: () => ({ steer: () => undefined, abort: () => undefined, decide: () => undefined }),
        closeLog: never,
      },
      answer: () => undefined,
      redeliver: () => undefined,
    };
    const effects = createChatRunEffects(inputs[1]!, deps, () => undefined);

    expect(Object.entries(effects).filter(([name, effect]) => effect.name !== name)).toEqual([]);
    expect(Object.keys(effects).sort()).toEqual(Object.keys(chatRunMachine.sources.actions).sort());
  });

  it('should enqueue only effect arguments that survive JSON on driven paths', async () => {
    /* An action record's params are `{ action, args }`: the provided arrow, and the arguments it was enqueued with. */
    const executed: Array<Readonly<{ type: string; args: unknown }>> = [];
    const inspect = (event: InspectionEvent): void => {
      if (event.type === '@xstate.transition') {
        executed.push(
          ...event.actions
            /* Built-ins and a state's own entry patch (anonymous, no params) are not effects. */
            .filter((action) => !action.type.startsWith('@xstate.') && action.params !== undefined)
            .map((action) => ({ type: action.type, args: (action.params as Readonly<{ args: unknown }>).args })),
        );
      }
    };
    const drive = async (steps: (harness: ChatRunHarness) => Promise<void>) => {
      const harness = createChatRunHarness({ inspect });
      await harness.open();
      await steps(harness);
      harness.actor.stop();
    };
    const toRunning = async (harness: ChatRunHarness) => {
      await harness.send(commands.start('cmd-1'));
      await harness.admit();
      await harness.commit();
      await harness.commit();
    };

    await drive(async (harness) => {
      await toRunning(harness);
      await harness.send(commands.steer('cmd-2'));
      await harness.send(commands.interrupt('cmd-3'));
      await harness.report('aborted');
      await harness.commit();
      await harness.send(commands['resolve-interrupt']('cmd-4'));
      await harness.commit();
      await harness.send(commands.resume('cmd-5'));
      await harness.prepareResume();
      await harness.commit();
      await harness.send(commands.cancel('cmd-6'));
      await harness.report('aborted');
      await harness.commit();
      await harness.send({ type: 'close' });
      await harness.closeLog();
    });
    await drive(async (harness) => {
      await harness.send(commands.start('cmd-1'));
      await harness.refuseAdmission();
      await toRunning(harness);
      await harness.send({ type: 'relinquish' });
    });

    const names = Object.keys(chatRunMachine.sources.actions);
    expect(executed.filter((action) => !names.includes(action.type))).toEqual([]);
    expect(executed.filter((action) => !jsonSafe(action.args))).toEqual([]);
    expect(new Set(executed.map((action) => action.type))).toEqual(
      new Set([
        'openLog',
        'prepareAdmission',
        'appendRows',
        'answer',
        'startDriver',
        'steerDriver',
        'abortDriver',
        'prepareResume',
        'closeLog',
      ]),
    );
  });

  it('should enqueue only JSON-safe effect arguments from every reachable snapshot and sampled event', () => {
    type Effect = Readonly<{ type: string; params?: Readonly<{ args?: unknown }> }>;
    const unsafe = inputs
      .flatMap((input) => reachable(input).filter((snapshot) => snapshot.status === 'active'))
      .flatMap((snapshot) =>
        sample(snapshot).flatMap((event) =>
          (transition(walked, snapshot, event)[1] as readonly Effect[])
            .filter((effect) => effect.params?.args !== undefined && !jsonSafe(effect.params.args))
            .map((effect) => `${effect.type} on ${event.type} in ${JSON.stringify(snapshot.value)}`),
        ),
      );

    expect([...new Set(unsafe)]).toEqual([]);
  });
});
