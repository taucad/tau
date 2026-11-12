/*
 * Conformance of `recordSync` with the layout record's policy to `specs/record-sync/RecordSync.tla` (graphics
 * event-driven state charter G2b; D6, I5, I12): the forward replay of the TLC-exported covering suite of
 * `record-sync.machine.conformance.test.ts`, with the bytes on the wire the layout codec's own.
 *
 * The model's two contents are two layout records whose bytes differ. Reads parse through `layoutPolicy.read`,
 * writes serialize through `layoutPolicy.serialize`, and the patch algebra is the layout's; only the model's pick of
 * a write's content (`merge`) and its rule that every edit owes a write (`isEmpty`) stand in for the model. The
 * harness steps are the ones the generic replay documents.
 *
 * `layoutPolicy.keepsBaseOnAbsence` changes only the diff base (`intended`) while the shown record is absent, in
 * `CompleteRead` and in `settle`. The model's
 * file is never absent and the model has no diff base, so the refinement mapping does not compare `intended`; that
 * part of `CompleteRead` is outside the spec (README, Not modelled), and the store rows cover it.
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
import type { WorkbenchLayout } from '@taucad/workbench';
import { layoutPolicy } from '#workbench-records/layout-policy.js';
import type { WorkbenchLayoutPatch } from '#workbench-records/layout-policy.js';
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
 * The model's two contents as layout records: they differ in one lane flag, so their bytes differ and each reads
 * back as itself through the layout codec.
 */
const layoutOf = (content: string): WorkbenchLayout => ({
  version: 1,
  lanes: { chat: content === 'a', workbench: true },
  viewer: { kind: 'group', tabs: [{ kind: 'view', view: 'v-abcd1234' }] },
  workbench: { kind: 'group', tabs: [{ kind: 'pane', pane: 'parameters' }] },
});
const textOf = (content: string): string => layoutPolicy.serialize(layoutOf(content));
/** The model content of some layout bytes or text; anything else is a divergence the replay reports. */
const contentOf = (text: string): string =>
  text === textOf('a') ? 'a' : text === textOf('b') ? 'b' : `unexpected bytes ${text}`;
const contentOfRecord = (layout: WorkbenchLayout | undefined): string =>
  layout === undefined ? initialBytes : contentOf(layoutPolicy.serialize(layout));

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
  // The layout record's own codec and patch algebra. The model's edits always owe a write, and it picks the bytes of
  // each write when the write is issued, so only `merge` and `isEmpty` stand in for the model; `same` leaves the
  // bytes that were read.
  const policy: RecordPolicy<WorkbenchLayout, WorkbenchLayoutPatch> = {
    ...layoutPolicy,
    merge(current) {
      const planned = plan[state.step];
      const shown = contentOfRecord(current);
      return layoutOf(planned === 'same' ? shown : (planned ?? otherThan(shown)));
    },
    isEmpty: () => false,
  };
  const { actor, commands, context } = createRecordSync({
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
  return { actor, commands, context, clock, state };
};

const bytesOf = (content: string): RecordBytes => encoder.encode(textOf(content));

const apply = async (harness: Harness, state: SpecState): Promise<void> => {
  const { actor, commands, clock, state: held } = harness;
  const { context } = actor.getSnapshot();
  held.step += 1;
  switch (state.act) {
    case 'Edit': {
      void commands.edit(layoutOf('b'));
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
      if (expected !== null && contentOf(decoder.decode(expected)) === held.file) {
        held.file = contentOf(data);
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

/**
 * The content the store shows: its bytes, which the record parsed from them must agree with, so a codec that reads
 * the wrong record diverges.
 */
const shownContent = (bytes: RecordBytes | null, record: WorkbenchLayout | undefined): string => {
  if (bytes === null) {
    return initialBytes;
  }
  const shown = contentOf(decoder.decode(bytes));
  const parsed = contentOfRecord(record);
  return shown === parsed ? shown : `record ${parsed} shown for bytes ${shown}`;
};

/** The model's fields this machine state stands for (the refinement mapping). */
const view = (harness: Harness): SpecView => {
  const { context, value } = harness.actor.getSnapshot();
  const { continued } = harness.state;
  const st = {
    origin: context.origin,
    bytes: shownContent(context.published.bytes, harness.context().published.record),
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
    // Rule 7: no write is issued after the fence, so the write counter is compared too.
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

describe('recordSync with the layout policy conforms to RecordSync.tla', () => {
  it('should replay the covering suite through the layout codec without divergence', async () => {
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

    expect(behaviours.length).toBeGreaterThan(0);
    expect(divergences).toEqual([]);
  });

  it('should write and read only layout records the codec accepts', () => {
    for (const content of ['a', 'b']) {
      expect(layoutPolicy.read(bytesOf(content))).toEqual({ status: 'current', record: layoutOf(content) });
    }
    expect(textOf('a')).not.toBe(textOf('b'));
  });
});
