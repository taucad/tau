/*
 * Conformance of `recordSync` to `specs/record-sync/RecordSync.tla` (graphics event-driven state charter D6, I5,
 * I12): forward replay of the TLC-exported covering suite, the action correspondence (MC-R27) and the drift manifest
 * (FM-R13).
 *
 * The suite comes from `RecordSync.export.cfg`, the target with `EagerWriter`: the writer as this machine schedules
 * it. The harness holds every read and checked write, so each spec step is one thing the harness does:
 *
 *   Edit           the `edit` event; the edit waits in the debounce window
 *   IssueWrite     the debounce or retry timer fires, or nothing when the writer already continued (below)
 *   Resolve        the retry timer fires while a read-back is owed
 *   Forget         nothing: the writer found nothing left to write when the read it waited for returned
 *   FsDecide       the held file applies or refuses the write, by its expected bytes
 *   ReplyApplied, ReplyConflict, LoseReply   the held write's reply
 *   ForeignWrite   the held file changes
 *   WatchRead      the `read` event; the held file's bytes are captured
 *   ServeLater     the held read captures the file's bytes again
 *   CompleteRead   the held read returns its captured bytes
 *   CloseFence     the `close` event
 *
 * With `EagerWriter` the model takes `CompleteRead` and the `IssueWrite` or `Forget` that follows as two steps with
 * only authority and foreign steps between; the machine takes them in one. Between the two the view shows the
 * writer as the model does: about to continue (`readBack`), with nothing issued yet.
 *
 * The model's bytes are opaque and it picks the content of each write when the write is issued. The policy here
 * stands in for the merge and takes that pick from the behaviour being replayed.
 */
/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkActionCorrespondence,
  driftManifestProblems,
  hashFiles,
  machineActions,
  machineAlphabet,
  specOperators,
} from '@taucad/formal/drift';
import { readSpecGraph, suiteBehaviours } from '@taucad/formal/graph';
import type { CoveringSuite, SpecView } from '@taucad/formal/graph';
import { replaySuite } from '@taucad/formal/replay';
import type { ConformanceAdapter } from '@taucad/formal/replay';
import { StepClock, flush } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { matchesState } from 'xstate';
import { createRecordSync } from '#workbench-records/record-sync.js';
import {
  createRecordSyncMachine,
  maxRetryDelay,
  recordSyncIgnoredEvents,
} from '#workbench-records/record-sync.machine.js';
import type {
  CheckedWriteInput,
  CheckedWriteOutcome,
  RecordReadOutcome,
} from '#workbench-records/record-sync.machine.js';
import type { RecordBytes, RecordPolicy } from '#workbench-records/record-sync-policy.js';

const specs = path.resolve(import.meta.dirname, '../../specs/record-sync');
const graph = readSpecGraph(path.join(specs, 'RecordSync/graph.json'));
const suite = JSON.parse(readFileSync(path.join(specs, 'RecordSync/suite.json'), 'utf8')) as CoveringSuite;

/** The model's state, as far as the harness reads it. */
type SpecState = Readonly<{
  act: string;
  phase: 'open' | 'fenced';
  file: { bytes: string };
  st: { origin: 'none' | 'own' | 'foreign'; bytes: string };
  wr: ReadonlyArray<{ status: string; bytes: string; fs: 'pending' | 'applied' | 'refused' }>;
  nextId: number;
  kept: readonly number[];
  overlap: boolean;
  dirty: boolean;
  readBack: boolean;
  owed: boolean;
  rd: { active: boolean; purpose: string; forced: boolean; back: boolean };
}>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const initialBytes = 'a';
const otherThan = (content: string | undefined): string => (content === 'a' ? 'b' : 'a');

/**
 * What the writer writes next after each step of a behaviour: the bytes of the next `IssueWrite`, or `same` when a
 * `Forget` comes first; `undefined` when the behaviour ends before either.
 */
const writerPlan = (behaviour: readonly SpecState[]): ReadonlyArray<string | undefined> =>
  behaviour.map((_, step) => {
    const next = behaviour.slice(step).find((state) => state.act === 'IssueWrite' || state.act === 'Forget');
    return next === undefined ? undefined : next.act === 'Forget' ? 'same' : next.wr[next.nextId - 2]?.bytes;
  });

type Harness = ReturnType<typeof start>;

const start = (plan: ReadonlyArray<string | undefined>) => {
  const guard = guardActors({ ignore: { 'record-sync': recordSyncIgnoredEvents } });
  const clock = new StepClock();
  const state = {
    step: 0,
    file: initialBytes,
    /** The latest read the machine started, with the bytes the authority captured for it. */
    read: undefined as { bytes: string; settle: (outcome: RecordReadOutcome) => void } | undefined,
    writes: new Map<number, { input: CheckedWriteInput; settle: (outcome: CheckedWriteOutcome) => void; fs: string }>(),
    /** The writer continued in the task of the read it waited for; the model has not taken that step yet. */
    continued: undefined as { issued: number | undefined; overlap: boolean } | undefined,
  };
  const policy: RecordPolicy<string, string> = {
    read: (bytes) => ({ status: 'current', record: decoder.decode(bytes) }),
    serialize: (record) => record,
    diff: (_base, next) => next,
    combine: (_earlier, later) => later,
    // The model picks the bytes of a write when it is issued; `same` leaves the bytes that were read.
    merge(current) {
      const planned = plan[state.step];
      return planned === 'same' ? (current ?? initialBytes) : (planned ?? otherThan(current));
    },
    isEmpty: () => false,
  };
  const { actor, commands } = createRecordSync({
    machine: createRecordSyncMachine(policy),
    editDebounce: 100,
    clock,
    inspect: guard.inspect,
    ports: {
      read: async () =>
        new Promise<RecordReadOutcome>((resolve) => {
          state.read = { bytes: state.file, settle: resolve };
        }),
      write: async (input) =>
        new Promise<CheckedWriteOutcome>((resolve) => {
          state.writes.set(input.writeId, { input, settle: resolve, fs: 'pending' });
        }),
    },
  });
  actor.start();
  return { actor, commands, clock, state };
};

const bytesOf = (content: string): RecordBytes => encoder.encode(content);

const apply = async (harness: Harness, state: SpecState): Promise<void> => {
  const { actor, commands, clock, state: held } = harness;
  const { context } = actor.getSnapshot();
  held.step += 1;
  switch (state.act) {
    case 'Edit': {
      void commands.edit('edit');
      break;
    }
    case 'IssueWrite': {
      const { continued } = held;
      held.continued = undefined;
      if (continued?.issued === undefined) {
        clock.advance(maxRetryDelay);
      }
      break;
    }
    case 'Resolve': {
      clock.advance(maxRetryDelay);
      break;
    }
    case 'Forget': {
      held.continued = undefined;
      break;
    }
    case 'FsDecide': {
      const decided = [...held.writes].find(
        ([id, write]) => write.fs === 'pending' && state.wr[id - 1]?.fs !== 'pending',
      );
      if (!decided) {
        throw new Error('FsDecide: the harness holds no write the model decided.');
      }
      const [, write] = decided;
      const { expected, data } = write.input;
      if (expected !== null && decoder.decode(expected) === held.file) {
        held.file = data;
        write.fs = 'applied';
      } else {
        write.fs = 'refused';
      }
      break;
    }
    case 'ReplyApplied':
    case 'ReplyConflict':
    case 'LoseReply': {
      const write = held.writes.get(context.inFlight?.writeId ?? 0);
      if (!write) {
        throw new Error(`${state.act}: the machine has no write in flight.`);
      }
      write.settle(
        state.act === 'LoseReply'
          ? { status: 'failed', error: new Error('reply lost'), lost: true }
          : write.fs === 'applied'
            ? { status: 'applied', content: bytesOf(write.input.data) }
            : { status: 'conflict' },
      );
      break;
    }
    case 'ForeignWrite': {
      held.file = state.file.bytes;
      break;
    }
    case 'WatchRead': {
      void commands.read();
      break;
    }
    case 'ForcedRead': {
      void commands.retryRead();
      break;
    }
    case 'ServeLater': {
      if (held.read) {
        held.read.bytes = held.file;
      }
      break;
    }
    case 'CompleteRead': {
      const waited = matchesState({ write: 'awaitingBase' }, actor.getSnapshot().value);
      const before = context.nextWriteId;
      held.read?.settle({ status: 'read', bytes: bytesOf(held.read.bytes) });
      await flush();
      const after = actor.getSnapshot().context;
      if (waited) {
        held.continued = { issued: after.nextWriteId > before ? before : undefined, overlap: context.overlap };
      }
      break;
    }
    case 'CloseFence': {
      commands.close();
      break;
    }
    default: {
      throw new Error(`No harness step for the model's ${state.act}.`);
    }
  }
  await flush();
};

/** The model's fields this machine state stands for (the refinement mapping). */
const view = (harness: Harness): SpecView => {
  const { context, value } = harness.actor.getSnapshot();
  const { continued } = harness.state;
  const st = {
    origin: context.origin,
    bytes: context.published.bytes === null ? initialBytes : decoder.decode(context.published.bytes),
  };
  const reading = matchesState({ source: 'reading' }, value);
  const rd = reading
    ? {
        active: true,
        purpose: matchesState({ write: 'awaitingRefresh' }, value)
          ? 'refresh'
          : matchesState({ write: 'awaitingBase' }, value)
            ? (context.cycle?.attempt ?? 0) > 0
              ? 'conflict'
              : 'resolve'
            : 'watch',
        forced: context.readForced,
        back: context.readBack === 'reading',
      }
    : { active: false, purpose: 'none', forced: false, back: false };
  if (context.closeFenced) {
    return { phase: 'fenced', st, rd };
  }
  const kept = context.ownWrites.filter((write) => write.writeId !== continued?.issued);
  const waiting =
    context.cycle !== undefined && context.inFlight === undefined && !matchesState({ write: 'awaitingRefresh' }, value);
  return {
    phase: 'open',
    file: { bytes: harness.state.file },
    st,
    rd,
    nextId: context.nextWriteId - (continued?.issued === undefined ? 0 : 1),
    kept: kept.map((write) => write.writeId),
    inFlight: kept.filter((write) => write.state === 'inFlight').map((write) => write.writeId),
    lost: kept.filter((write) => write.state === 'lost').map((write) => write.writeId),
    overlap: continued ? continued.overlap : context.overlap,
    // What a failed write still owes is owed again only once no write is carrying it.
    dirty:
      continued !== undefined ||
      context.pending !== undefined ||
      waiting ||
      (context.deferred !== undefined && context.cycle === undefined),
    readBack: continued !== undefined,
    owed: context.readBack !== 'none',
  };
};

/** The same fields of a model state, without its ghost variables and bounds. */
const project = (spec: SpecView): SpecView => {
  const state = spec as unknown as SpecState;
  const st = { origin: state.st.origin, bytes: state.st.bytes };
  const rd = {
    active: state.rd.active,
    purpose: state.rd.active ? state.rd.purpose : 'none',
    forced: state.rd.active && state.rd.forced,
    back: state.rd.active && state.rd.back,
  };
  if (state.phase === 'fenced') {
    return { phase: 'fenced', st, rd };
  }
  const withStatus = (status: string): number[] =>
    state.kept.filter((id) => state.wr[id - 1]?.status === status).toSorted((left, right) => left - right);
  return {
    phase: 'open',
    file: { bytes: state.file.bytes },
    st,
    rd,
    nextId: state.nextId,
    kept: state.kept.toSorted((left, right) => left - right),
    inFlight: withStatus('inFlight'),
    lost: withStatus('lost'),
    overlap: state.overlap,
    dirty: state.dirty,
    readBack: state.readBack,
    owed: state.owed,
  };
};

const machine = createRecordSyncMachine<string, string>({
  read: (bytes) => ({ status: 'current', record: decoder.decode(bytes) }),
  serialize: (record) => record,
  diff: (_base, next) => next,
  combine: (_earlier, later) => later,
  merge: (_current, _next, patch) => patch,
  isEmpty: () => false,
});

describe('recordSync conforms to RecordSync.tla', () => {
  it('should replay the covering suite without divergence', async () => {
    const behaviours = suiteBehaviours(graph, suite) as unknown as SpecState[][];
    const divergences = [];
    for (const [index, behaviour] of behaviours.entries()) {
      const adapter: ConformanceAdapter<Harness> = {
        start: () => start(writerPlan(behaviour)),
        apply: async (harness, [state]) => apply(harness, state as SpecState),
        view,
        project,
        stop(harness) {
          harness.actor.stop();
        },
      };
      // oxlint-disable-next-line no-await-in-loop -- each behaviour replays on its own actor, in order.
      const found = await replaySuite([behaviour as unknown as SpecView[]], adapter, (state) => [state]);
      divergences.push(
        ...found.map((divergence) => ({ ...divergence, behaviour: index, action: behaviour[divergence.step]?.act })),
      );
    }

    expect(behaviours).toHaveLength(42);
    expect(divergences).toEqual([]);
  });

  it('should take every action of the model in the suite', () => {
    const taken = new Set(suiteBehaviours(graph, suite).flatMap((behaviour) => behaviour.map((state) => state['act'])));

    // No forced read is in the export's bounds: in the target it differs from a change event only in publishing
    // bytes that are already shown, which the model does not observe.
    expect([...taken].map(String).toSorted((left, right) => left.localeCompare(right))).toEqual([
      'CloseFence',
      'CompleteRead',
      'Edit',
      'ForeignWrite',
      'Forget',
      'FsDecide',
      'Init',
      'IssueWrite',
      'LoseReply',
      'ReplyApplied',
      'ReplyConflict',
      'Resolve',
      'ServeLater',
      'WatchRead',
    ]);
  });

  it('should name a model action on every refining transition, and a transition for every store action (MC-R27)', () => {
    // `machineActions` keeps one label per state and event; a port's `onDone` here carries one per outcome.
    type Node = {
      id: string;
      states?: Record<string, Node>;
      transitions?: Map<string, Array<{ meta?: { tla?: string } }>>;
    };
    const nodesOf = (node: Node): Node[] => [
      node,
      ...Object.values(node.states ?? {}).flatMap((child) => nodesOf(child)),
    ];
    const actions = Object.fromEntries(
      nodesOf(machine.root as unknown as Node).flatMap((node) =>
        [...(node.transitions ?? [])].flatMap(([eventType, transitions]) =>
          transitions.flatMap((transition, index) =>
            transition.meta?.tla === undefined || transition.meta.tla === 'Unmodelled'
              ? []
              : [[`${node.id}.${eventType}#${index}`, transition.meta.tla]],
          ),
        ),
      ),
    );

    expect(new Set(Object.values(actions)).size).toBe(9);

    expect(
      checkActionCorrespondence(actions, {
        operators: specOperators(readFileSync(path.join(specs, 'RecordSync.tla'), 'utf8')),
        next: [
          'Edit',
          'IssueWrite',
          'Resolve',
          'Forget',
          'FsDecide',
          'ReplyApplied',
          'ReplyConflict',
          'LoseReply',
          'ForeignWrite',
          'WatchRead',
          'ForcedRead',
          'ServeLater',
          'CompleteRead',
          'CloseFence',
        ],
        // The authority and other writers act on the file, not on the store. `Resolve` and `Forget` are outcomes
        // of the writer's `IssueWrite` step: it reads back first, or finds nothing left to write.
        environment: ['FsDecide', 'ForeignWrite', 'ServeLater', 'Resolve', 'Forget'],
      }),
    ).toEqual([]);
  });

  it('should match the committed drift manifest', () => {
    expect(
      driftManifestProblems(path.join(specs, 'RecordSync/drift.json'), {
        alphabet: machineAlphabet([machine]),
        versions: { [machine.id]: String(machine.version) },
        tables: {},
        actions: machineActions([machine]),
        specs: hashFiles(specs, ['RecordSync.tla']),
      }),
    ).toEqual([]);
  });
});
