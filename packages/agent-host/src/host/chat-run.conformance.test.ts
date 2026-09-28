/**
 * M1's conformance bridges (W7 RA-S15, RA-A6): forward replay of the TLC-generated covering suite of
 * `ChatRunSlotGraph.tla` (`ChatRunSlot` with each step labelled) on a live incarnation, log-state agreement after every
 * step, replay equality over the recorded transitions (MC-R6), the drift manifest (FM-R13), and a seeded mutant the
 * replay must catch.
 *
 * Scope (`ChatRunSlotGraph.export.cfg`): the native run with `cancel` and `steer`, no crash, no placement, one host.
 * External runs, interrupts, resume, opening, placement and the gateway are outside this graph (each is TLC-checked in
 * `ChatRunSlot.*.cfg` and driven by the machine and host tests); a bigger scope passes the 1 MB graph budget (FM-R7).
 *
 * The refinement mapping: the spec's `answered` (each command's last answer the page saw) and `LastOf(T)` as a class
 * (`admitted` and `running` are both `live`: M1 writes attempt 1's `running` row where the spec, without placement,
 * writes none). The adapter maps each spec action to the harness operations that perform it on M1:
 * - `send` (a page gesture) and `abandon` (W8's revocation, absent without placement) are stutters;
 * - `abandoned` is M1's stop bound, recorded with no fence until W8 (W8 closes D13 for the no-placement stop bound);
 * - `driverSteered` writes the steer row and M1 answers at once; the page sees that answer at `rowsCommitted(steer)`,
 *   where the spec answers it.
 */

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

import { describe, expect, it } from 'vitest';
import type { InspectionEvent } from 'xstate';

import { driftManifestProblems, hashFiles, machineActions, machineAlphabet } from '@taucad/formal/drift';
import { readSpecGraph, suiteBehaviours } from '@taucad/formal/graph';
import type { CoveringSuite, SpecView } from '@taucad/formal/graph';
import { replayEquality, replaySuite } from '@taucad/formal/replay';
import type { ConformanceAdapter } from '@taucad/formal/replay';
import { StepClock } from '@taucad/xstate-testing/clock';
import { guardActors, recordTransitions } from '@taucad/xstate-testing/inspect';

import { chatRunIgnoredEvents, chatRunMachine } from '#host/chat-run.machine.js';
import { chatId, commands, createChatRunHarness } from '#host/chat-run.fixture.js';
import type { ChatRunHarness, ChatRunHarnessOptions } from '#host/chat-run.fixture.js';
import { emptyChatLedger, foldChatLedger } from '#log/chat-ledger.js';
import type { ChatLedger } from '#log/chat-ledger.js';
import type { CommandAnswer } from '#wire/commands.schema.js';

const specs = path.resolve(import.meta.dirname, '../../specs');
const graph = readSpecGraph(path.join(specs, 'ChatRunSlotGraph/graph.json'));
const suite = JSON.parse(readFileSync(path.join(specs, 'ChatRunSlotGraph/suite.json'), 'utf8')) as CoveringSuite;
const behaviours = suiteBehaviours(graph, suite);
const simulated = process.env['FORMAL_SIMULATED'];

/** The spec's native run `T`; its start command's id is the run id. */
const run = 'r1';
/** The spec's `Cmds`, each the command id the adapter sends. */
const cmds = ['r1', 'r2', 'resume', 'steer', 'cancel', 'interrupt', 'resolve', 'attach'] as const;
const lifeTypes = new Set(['admitted', 'running', 'paused', 'completed', 'cancelled', 'failed', 'abandoned']);

/** `LastOf(T)` as a class: M1's attempt-1 `running` row and the spec's `admitted` are both live. */
const lifeClass = (last: string | undefined): string =>
  last === undefined || last === 'none' ? 'none' : last === 'admitted' || last === 'running' ? 'live' : last;

/** The spec's answer vocabulary: `a0` is W4's applied answer with nothing to do. */
const answerOf = (answer: CommandAnswer): string =>
  answer.status === 'applied' && answer.effect === 'not-applied' ? 'a0' : answer.status;

type SpecRow = Readonly<{ t: string; r: string }>;
const lastOf = (state: SpecView): string | undefined =>
  (state['log'] as readonly SpecRow[]).findLast((row) => row.r === run && lifeTypes.has(row.t))?.t;

type Replay = {
  readonly harness: ChatRunHarness;
  readonly clock: StepClock;
  readonly records: ReturnType<typeof recordTransitions>['records'];
  opened: boolean;
  /** The page has seen the steer's answer: at `steer` itself, or at `rowsCommitted(steer)`. */
  steerShown: boolean;
};

type Outcome = 'completed' | 'failed' | 'aborted';

/** Each spec action as harness operations; `next` is the state the action produced. */
const steps: Readonly<Record<string, (replay: Replay, argument: string, next: SpecView) => Promise<void>>> = {
  send: async () => undefined,
  abandon: async () => undefined,
  start: async ({ harness }) => harness.send(commands.start(run, run)),
  admissionPrepared: async ({ harness }) => harness.admit(),
  admissionRefused: async ({ harness }) => harness.refuseAdmission(),
  rowsCommitted: async (replay, argument) => {
    if (argument === 'steer') {
      replay.steerShown = true;
      return;
    }
    await replay.harness.commit();
  },
  /* Without placement, attempt 1's `running` row lands and the driver starts. */
  placed: async ({ harness }) => harness.commit(),
  agentEnded: async ({ harness }, _argument, next) => {
    const last = lastOf(next);
    await harness.report(last === 'cancelled' ? 'aborted' : (last as Outcome));
    await harness.commit();
  },
  abandoned: async ({ harness, clock }) => {
    await clock.advanceAsync(30_000);
    await harness.commit();
  },
  steer: async (replay) => {
    await replay.harness.send(commands.steer('steer', run));
    replay.steerShown = replay.harness.answers.some((answer) => answer.commandId === 'steer');
  },
  driverSteered: async ({ harness }) =>
    harness.driverWrites([
      {
        runId: run,
        commandId: 'steer',
        body: { type: 'message.appended', message: { id: 'steer:steer', role: 'user', content: 'Also this.' } },
      },
    ]),
  cancel: async ({ harness }) => harness.send(commands.cancel('cancel', run)),
};

const viewOf = ({ harness, steerShown }: Replay): SpecView => {
  const last = new Map(harness.answers.map((answer) => [answer.commandId, answerOf(answer)]));
  return {
    answered: Object.fromEntries(
      cmds.map((cmd) => [cmd, cmd === 'steer' && !steerShown ? 'none' : (last.get(cmd) ?? 'none')]),
    ),
    last: lifeClass(harness.log.ledger().runs[run]?.lifecycle),
  };
};

/** The M1 adapter; `options` seeds a mutant. `agreement` records every step where `context.ledger` left the log. */
const chatRunAdapter = (options: ChatRunHarnessOptions = {}, agreement: string[] = []): ConformanceAdapter<Replay> => ({
  start: () => {
    const clock = new StepClock();
    const recorder = recordTransitions();
    const inspect = (event: InspectionEvent): void => {
      recorder.inspect(event);
      const { inspect: observer } = options;
      if (typeof observer === 'function') {
        observer(event);
      } else {
        observer?.next?.(event);
      }
    };
    return {
      harness: createChatRunHarness({ ...options, clock, inspect }),
      clock,
      records: recorder.records,
      opened: false,
      steerShown: false,
    };
  },
  apply: async (replay, [act, next]) => {
    const [name, argument] = act as readonly [string, string];
    const step = steps[name];
    if (step === undefined) {
      throw new Error(`The adapter maps no M1 step to ${JSON.stringify(act)}.`);
    }
    if (!replay.opened) {
      replay.opened = true;
      await replay.harness.open();
    }
    await step(replay, argument, next as SpecView);
    const { ledger } = replay.harness.actor.getSnapshot().context as Readonly<{ ledger: ChatLedger }>;
    if (!isDeepStrictEqual(ledger, foldChatLedger(emptyChatLedger, replay.harness.log.rows))) {
      agreement.push(JSON.stringify(act));
    }
  },
  view: viewOf,
  project: (state) => ({ ...state, last: lifeClass(lastOf(state)) }),
  stop: ({ harness }) => {
    harness.actor.stop();
  },
});

const replay = async (options?: ChatRunHarnessOptions, agreement?: string[]) =>
  replaySuite(behaviours, chatRunAdapter(options, agreement), (state) => [state['act'], state]);

/** The seeded mutant: the machine never sees the applied set, so its replay guard cannot answer from it (RA-R2). */
const withoutAppliedSet: ChatRunHarnessOptions = { ledgerView: (ledger) => ({ ...ledger, applied: {} }) };

describe('chatRun conforms to ChatRunSlot.tla', () => {
  it('should replay the TLC covering suite without divergence, answering every delivery', async () => {
    /* Every delivery is answered, and nothing is dead-lettered (RA-A2). */
    const guard = guardActors({ ignore: { 'chat-run': chatRunIgnoredEvents } });

    expect(behaviours).toHaveLength(suite.behaviours.length);
    expect(await replay({ inspect: guard.inspect })).toEqual([]);
  });

  it.runIf(simulated !== undefined)(
    'should replay the simulated behaviours without divergence',
    async () => {
      const traces = readFileSync(path.join(simulated ?? '', 'ChatRunSlotGraph.ndjson'), 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line) as SpecView[]);

      expect(traces.length).toBeGreaterThan(0);
      expect(await replaySuite(traces, chatRunAdapter(), (state) => [state['act'], state])).toEqual([]);
    },
    120_000,
  );

  it('should keep context.ledger equal to the fold of the durable log after every replayed step', async () => {
    const agreement: string[] = [];

    expect(await replay(undefined, agreement)).toEqual([]);
    expect(agreement).toEqual([]);
  });

  it('should replay recorded transitions equally (MC-R6)', async () => {
    const adapter = chatRunAdapter();
    const divergences = [];
    for (const behaviour of behaviours) {
      const replayed = adapter.start();
      for (const state of behaviour.slice(1)) {
        // oxlint-disable-next-line no-await-in-loop -- each step settles before the next.
        await adapter.apply(replayed, [state['act'], state]);
      }
      const records = replayed.records().filter((record) => record.machineId === chatRunMachine.id);
      divergences.push(
        ...replayEquality(chatRunMachine, { chatId, leaderEpoch: 'epoch-m1', placement: false }, records),
      );
      adapter.stop?.(replayed);
    }

    expect(divergences).toEqual([]);
  });

  it('should fail replay when the applied-set guard is dropped', async () => {
    const divergences = await replay(withoutAppliedSet);

    /* The ending batch answers its cancel from the applied set: without it, a durable cancel is refused. */
    expect(divergences.length).toBeGreaterThan(0);
    expect(divergences).toContainEqual(
      expect.objectContaining({ field: 'answered.cancel', expected: 'applied', actual: 'refused' }),
    );
  });

  it('should match the committed drift manifest', () => {
    const machines = [chatRunMachine];
    expect(
      driftManifestProblems(path.join(specs, 'ChatRunSlotGraph/drift.json'), {
        alphabet: machineAlphabet(machines),
        versions: Object.fromEntries(machines.map((machine) => [machine.id, String(machine.version)])),
        tables: {},
        actions: machineActions(machines),
        specs: hashFiles(specs, ['ChatRunSlot.tla', 'ChatRunSlotGraph.tla']),
      }),
    ).toEqual([]);
  });
});
