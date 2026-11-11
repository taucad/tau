/*
 * Conformance of the entries record's `recordSync` to `specs/record-sync/RecordSync.tla` (graphics event-driven state
 * charter D6, I5, I12; package G2a): the TLC-exported covering suite replayed against the machine built over
 * `entriesPolicy`, with the policy's real codec, diff, combine and merge.
 *
 * `record-sync.machine.conformance.test.ts` replays the suite over opaque bytes, with a stand-in policy that writes
 * whatever the model picks. Here the model's two byte values are two entries files, which differ in one entry's
 * render timeout, and each edit asks for the timeout the model's next writes carry. The machine then computes every
 * write itself, through the policy: what it writes, and whether it finds nothing left to write.
 *
 * A field patch gives every write of one edit the same bytes, while the model may pick other bytes for a later
 * write of the same edit (after a conflict or a read-back). Those behaviours have no edit history that this policy
 * writes, so they are counted and left out; every other behaviour is replayed and must not diverge. The harness steps
 * are the ones described in the opaque replay.
 */
/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readSpecGraph, suiteBehaviours } from '@taucad/formal/graph';
import type { CoveringSuite, SpecView } from '@taucad/formal/graph';
import { replaySuite } from '@taucad/formal/replay';
import type { ConformanceAdapter } from '@taucad/formal/replay';
import { StepClock, flush } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { matchesState } from 'xstate';
import type { WorkbenchEntries } from '@taucad/workbench';
import { entriesPolicy } from '#workbench-records/entries-policy.js';
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

type Token = 'a' | 'b';

/** The entry whose render timeout tells the model's two byte values apart. */
const entryPath = 'main.ts';
const timeouts: Readonly<Record<Token, number>> = { a: 15_000, b: 30_000 };
const recordOf = (token: Token): WorkbenchEntries => ({
  version: 1,
  entries: { [entryPath]: { renderTimeout: timeouts[token] }, 'part.ts': { renderTimeout: 0 } },
});
const textOf = (token: Token): string => entriesPolicy.serialize(recordOf(token));
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const tokenOf = (text: string): Token => {
  if (text === textOf('a')) {
    return 'a';
  }
  if (text === textOf('b')) {
    return 'b';
  }
  throw new Error(`The machine wrote bytes the model has no value for: ${text}`);
};
const bytesOf = (token: Token): Uint8Array<ArrayBuffer> => encoder.encode(textOf(token));
const initialToken: Token = 'a';
const otherThan = (token: Token): Token => (token === 'a' ? 'b' : 'a');

/**
 * What each edit asks for: the bytes of the writes that follow it, or the bytes a `Forget` found already written.
 * `undefined` for an edit no write follows; `false` when the writes that follow it carry different bytes, which no
 * single field patch writes.
 */
const editPlan = (behaviour: readonly SpecState[]): ReadonlyMap<number, Token | undefined> | false => {
  const plan = new Map<number, Token | undefined>();
  let edit: number | undefined;
  for (const [step, state] of behaviour.entries()) {
    if (state.act === 'Edit') {
      edit = step;
      plan.set(step, undefined);
      continue;
    }
    const target =
      state.act === 'IssueWrite'
        ? (state.wr[state.nextId - 2]?.bytes as Token | undefined)
        : state.act === 'Forget'
          ? (state.st.bytes as Token)
          : undefined;
    if (target === undefined || edit === undefined) {
      continue;
    }
    const planned = plan.get(edit);
    if (planned !== undefined && planned !== target) {
      return false;
    }
    plan.set(edit, target);
  }
  return plan;
};

type Harness = ReturnType<typeof start>;

const machine = createRecordSyncMachine(entriesPolicy);

const start = (plan: ReadonlyMap<number, Token | undefined>) => {
  const guard = guardActors({ ignore: { 'record-sync': recordSyncIgnoredEvents } });
  const clock = new StepClock();
  const state = {
    step: 0,
    file: initialToken as Token,
    plan,
    /** The latest read the machine started, with the bytes the authority captured for it. */
    read: undefined as { bytes: Token; settle: (outcome: RecordReadOutcome) => void } | undefined,
    writes: new Map<number, { input: CheckedWriteInput; settle: (outcome: CheckedWriteOutcome) => void; fs: string }>(),
    /** The writer continued in the task of the read it waited for; the model has not taken that step yet. */
    continued: undefined as { issued: number | undefined; overlap: boolean } | undefined,
  };
  const { actor, commands, context } = createRecordSync({
    machine,
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
  return { actor, commands, context, clock, state };
};

const apply = async (harness: Harness, state: SpecState): Promise<void> => {
  const { actor, commands, context: current, clock, state: held } = harness;
  const { context } = actor.getSnapshot();
  const { step } = held;
  held.step += 1;
  switch (state.act) {
    case 'Edit': {
      const { published, intended } = current();
      const shown = published.bytes === null ? initialToken : tokenOf(decoder.decode(published.bytes));
      const token = held.plan.get(step) ?? otherThan(shown);
      const base = intended ?? published.record ?? recordOf(initialToken);
      void commands.edit({ ...base, entries: { ...base.entries, [entryPath]: { renderTimeout: timeouts[token] } } });
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
      if (expected !== null && tokenOf(decoder.decode(expected)) === held.file) {
        held.file = tokenOf(data);
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
            ? { status: 'applied', content: encoder.encode(write.input.data) }
            : { status: 'conflict' },
      );
      break;
    }
    case 'ForeignWrite': {
      held.file = state.file.bytes as Token;
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
    bytes: context.published.bytes === null ? initialToken : tokenOf(decoder.decode(context.published.bytes)),
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
  const nextId = context.nextWriteId - (continued?.issued === undefined ? 0 : 1);
  if (context.closeFenced) {
    return { phase: 'fenced', st, rd, nextId };
  }
  const kept = context.ownWrites.filter((write) => write.writeId !== continued?.issued);
  const waiting =
    context.cycle !== undefined && context.inFlight === undefined && !matchesState({ write: 'awaitingRefresh' }, value);
  return {
    phase: 'open',
    file: { bytes: harness.state.file },
    st,
    rd,
    nextId,
    kept: kept.map((write) => write.writeId),
    inFlight: kept.filter((write) => write.state === 'inFlight').map((write) => write.writeId),
    lost: kept.filter((write) => write.state === 'lost').map((write) => write.writeId),
    overlap: continued ? continued.overlap : context.overlap,
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
    return { phase: 'fenced', st, rd, nextId: state.nextId };
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

describe('the entries record conforms to RecordSync.tla', () => {
  it('should replay every covering behaviour a field patch writes without divergence', async () => {
    const behaviours = suiteBehaviours(graph, suite) as unknown as SpecState[][];
    const divergences = [];
    let replayed = 0;
    for (const [index, behaviour] of behaviours.entries()) {
      const plan = editPlan(behaviour);
      if (plan === false) {
        continue;
      }
      replayed += 1;
      const adapter: ConformanceAdapter<Harness> = {
        start: () => start(plan),
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

    expect({ behaviours: behaviours.length, replayed }).toEqual({ behaviours: 42, replayed: 41 });
    expect(divergences).toEqual([]);
  });
});
