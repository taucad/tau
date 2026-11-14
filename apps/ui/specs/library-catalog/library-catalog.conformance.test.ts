/*
 * Conformance of `libraryDiscovery`, `libraryRecovery` and `libraryAccess` to `LibraryCatalog.tla` (app state
 * orchestration charter D2, D3, D4; invariants I4, I7, I8, I9, I17, I18): forward replay of the TLC-exported covering
 * suite (`LibraryCatalog.export.cfg`) and the action correspondence (MC-R27). The drift manifest is
 * `library-catalog.drift.test.ts`.
 *
 * The three machines run together, with the relays the library service will add (A3b): discovery's `epochMoved`, and
 * recovery's `journalReady`, `recoveriesChanged` and `rowStarted` (as `recoveryStarted`), reach route access; a
 * recovery `rowSettled` invalidates the listing. Route access's discovery-pass port is the one stand-in: the model's
 * route read observes storage directly (`Observe`) and starts no pass, so the port answers with the epoch it was asked
 * at and storage as it is when it returns, and the pass join itself (`passRequested`, the pass's own epoch) is pinned
 * by the machine rows instead. The harness holds the scan, each replay, each discard and each
 * route read, and keeps the journal and the project storage, so each spec step is one thing it does:
 *
 *   PassStarted       the listing query asks for the owed pass (`passRequested`); the scan captures storage now
 *   PassSettled       the held scan returns what it captured, and the plan finds nothing to write
 *   ReplayStarted     the bootstrap pass is announced to recovery (`discoveryReady`); the loop starts its replay
 *   ReplaySettled     the held replay settles as the model's next state says: recovered, or failed terminally
 *   MutationJournaled a mutation on the project asks the gate, is admitted, and journals its row
 *   MutationApplied   the mutation's own apply settles as the model's next state says
 *   PersonDiscarded   the person discards the failed row; the held discard completes
 *   AccessAsked       nothing yet: the question is held until the model's next access step
 *   AccessRead        the held question is asked; the query starts its first read, which the harness holds
 *   AccessAnswered    the held question is asked and answered at the top of its loop, or the held read returns
 *   AccessReread      the held read returns a listing that no longer stands
 *
 * Two pairs of model steps are one machine step, as `RecordSync`'s `CompleteRead` and `IssueWrite` are. The model
 * asks (`AccessAsked`) and then takes the top of the loop (`AccessTop`); the query takes the top as soon as it is
 * asked, so the harness holds the ask until the model's top. The model rereads (`AccessReread`) and then takes the top
 * again; the query does both in the transition that found the fence broken. After a reread the view shows the
 * question as the model does, asking again with nothing read, and holds back what the query's new top did: an answer
 * from a held row, or a read. Any other answer is not held back, so a fenced answer that should have been a reread
 * diverges. Every suite behaviour that rereads ends there.
 *
 * The model's journal-loaded tab is a tab whose journal read has returned; until it does, the view reads the journal
 * the harness holds, each row waiting with no attempts. Route access hears the bootstrap pass at the start: the model
 * has no bootstrap pass, and today's wait for it (`ensureDiscoveryReady`) only delays a question.
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkActionCorrespondence, specOperators } from '@taucad/formal/drift';
import { readSpecGraph, suiteBehaviours } from '@taucad/formal/graph';
import type { CoveringSuite, SpecView } from '@taucad/formal/graph';
import { replaySuite } from '@taucad/formal/replay';
import type { ConformanceAdapter } from '@taucad/formal/replay';
import { StepClock, flush } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import type { AnyStateMachine } from 'xstate';
import type { ProjectDiscoveryResult } from '@taucad/filesystem';
import {
  createLibraryDiscovery,
  libraryDiscoveryIgnoredEvents,
  libraryDiscoveryMachine,
} from '#machines/library-discovery.machine.js';
import {
  createLibraryRecovery,
  libraryRecoveryIgnoredEvents,
  libraryRecoveryMachine,
} from '#machines/library-recovery.machine.js';
import type { RecoveryRow, RecoveryRowInput, ReplayOutcome } from '#machines/library-recovery.machine.js';
import {
  createLibraryAccess,
  libraryAccessIgnoredEvents,
  libraryAccessMachine,
  libraryAccessQueryIgnoredEvents,
  libraryAccessQueryMachine,
} from '#machines/library-access.machine.js';
import type { AccessAnswer, AccessPass, AccessQueryContext } from '#machines/library-access.machine.js';

const specs = import.meta.dirname;
const graph = readSpecGraph(path.join(specs, 'LibraryCatalog/graph.json'));
const suite = JSON.parse(readFileSync(path.join(specs, 'LibraryCatalog/suite.json'), 'utf8')) as CoveringSuite;

type RowView = Readonly<{ st: string; att: number; why: string; via: string }>;
type QuestionView = Readonly<{
  st: string;
  p: string;
  gen: number;
  k: number;
  cur: boolean;
  rs: boolean;
  ans: string;
}>;
type Listing = Readonly<{ ok: boolean; roots: readonly string[] }>;

/** The model's state, as far as the harness reads it. */
type SpecState = Readonly<{
  act: string;
  storage: readonly string[];
  journal: readonly string[];
  rowProj: Readonly<Record<string, string>>;
  rowOp: Readonly<Record<string, string>>;
  owed: boolean;
  redo: boolean;
  skipped: boolean;
  stopped: boolean;
  pass: Readonly<{ st: string; cur: boolean; seen: Listing }>;
  catalog: Listing;
  rec: Readonly<Record<string, RowView>>;
  acc: Readonly<Record<string, QuestionView>>;
  replies: ReadonlyArray<Readonly<{ id: string; gen: number; p: string }>>;
  deliveries: Readonly<Record<string, Readonly<Record<string, number>>>>;
}>;

const rows = ['r1', 'r2'] as const;
const question = 'q1';
const noListing: Listing = { ok: false, roots: [] };
const noQuestion: QuestionView = {
  st: 'unasked',
  p: 'none',
  gen: 0,
  k: 0,
  cur: false,
  rs: false,
  ans: 'none',
};

const listingOf = (roots: readonly string[]): ProjectDiscoveryResult =>
  ({
    entries: roots.map((projectId) => ({
      status: 'valid',
      projectId,
      manifest: { name: projectId },
      locator: { backend: 'indexeddb', storageRootKey: 'home', relativeDirectory: projectId },
    })),
    roots: [],
  }) as unknown as ProjectDiscoveryResult;

/** The model's `"create"` and `"delete"` rows, as the journal holds a create and a permanent delete. */
const rowInput = (operationId: string, projectId: string, kind: string): RecoveryRowInput => ({
  operationId,
  projectId,
  kind: kind === 'create' ? 'create' : 'permanent-delete',
  storage: { backend: 'indexeddb', providerBasePath: projectId },
});

type Pending<O> = { resolve: (output: O) => void } | undefined;

const start = (initial: SpecState) => {
  const guard = guardActors({
    ignore: {
      'library-discovery': libraryDiscoveryIgnoredEvents,
      'library-recovery': libraryRecoveryIgnoredEvents,
      'library-access': libraryAccessIgnoredEvents,
      'library-access-query': libraryAccessQueryIgnoredEvents,
    },
  });
  const clock = new StepClock();
  const held = {
    storage: [...initial.storage],
    journal: [...initial.journal],
    // The model's `None` is the string `none`: a free row.
    ops: Object.fromEntries(Object.entries(initial.rowOp).filter(([, kind]) => kind !== 'none')),
    projects: Object.fromEntries(Object.entries(initial.rowProj).filter(([, projectId]) => projectId !== 'none')),
    scan: undefined as (Pending<ProjectDiscoveryResult> & { seen: Listing }) | undefined,
    replay: undefined as Pending<ReplayOutcome>,
    discard: undefined as Pending<void>,
    read: undefined as (Pending<AccessPass> & { epoch: number }) | undefined,
    catalog: noListing,
    /** Passes the listing query asked for. */
    listings: 0,
    ask: undefined as { projectId: string } | undefined,
    answers: [] as AccessAnswer[],
    /** What the query's new top did after a reread, held back from the view (see the header). */
    continued: undefined as { answers: number; read: boolean } | undefined,
  };
  const discovery = createLibraryDiscovery({
    clock,
    inspect: guard.inspect,
    ports: {
      scan: async () =>
        new Promise<ProjectDiscoveryResult>((resolve) => {
          held.scan = { resolve, seen: { ok: true, roots: [...held.storage] } };
        }),
      plan: async ({ result }) => ({ result, writes: { upserts: [], deletes: [] } }),
      apply: async () => {
        throw new Error('The suite has no pass with writes.');
      },
    },
  });
  const recovery = createLibraryRecovery({
    clock,
    inspect: guard.inspect,
    ports: {
      readJournal: async () =>
        held.journal.map((operationId) =>
          rowInput(operationId, held.projects[operationId] ?? 'none', held.ops[operationId] ?? 'none'),
        ),
      replay: async () =>
        new Promise<ReplayOutcome>((resolve) => {
          held.replay = { resolve };
        }),
      checkWorkspaces: async () => {
        throw new Error('The suite has no workspace check.');
      },
      discard: async () =>
        new Promise<void>((resolve) => {
          held.discard = { resolve };
        }),
    },
  });
  const access = createLibraryAccess({
    clock,
    inspect: guard.inspect,
    ports: {
      verifyProjectRoute: async () => {
        throw new Error('The suite always has a row pending at the journal read, so discovery decides.');
      },
      // The second reads answer at once: with `Reads = 1` the model's one read is the discovery pass.
      ensureProjectLibraryState: async () => ({}),
      // The pass carries the epoch it was asked at and the storage it found when it returned.
      discoveryPass: async () =>
        new Promise<AccessPass>((resolve) => {
          held.read = {
            epoch: discovery.getSnapshot().context.epoch,
            resolve: (output) => {
              resolve(output);
            },
          };
        }),
      getProjectFileSystemConfig: async () => 'missing',
    },
  });
  // The library service's relays (A3b).
  discovery.on('epochMoved', (event) => {
    access.send(event);
  });
  discovery.on('*', () => {
    const { snapshot } = discovery.getSnapshot().context;
    if (snapshot !== undefined) {
      held.catalog = {
        ok: true,
        roots: snapshot.result.entries.flatMap((entry) => ('projectId' in entry ? [entry.projectId] : [])),
      };
    }
  });
  recovery.on('journalReady', (event) => {
    access.send(event);
  });
  recovery.on('journalFailed', (event) => {
    access.send(event);
  });
  recovery.on('recoveriesChanged', (event) => {
    access.send(event);
  });
  recovery.on('rowStarted', (event) => {
    access.send({ type: 'recoveryStarted', projectId: event.projectId });
  });
  recovery.on('rowSettled', () => {
    discovery.send({ type: 'invalidated' });
  });
  access.on('accessAnswered', (event) => {
    held.answers.push(event.answer);
  });
  discovery.start();
  access.start();
  recovery.start();
  access.send({ type: 'discoveryReady' });
  return { discovery, recovery, access, held, guard };
};

type Harness = ReturnType<typeof start>;

/** The outcome the model's next state gives row `r`. */
const outcomeOf = (next: SpecState, operationId: string): ReplayOutcome => {
  const row = next.rec[operationId];
  if (row?.st === 'recovered') {
    return { status: 'recovered' };
  }
  if (row?.st === 'failed' && row.why === 'terminal') {
    return { status: 'failed', reason: 'identity-conflict' };
  }
  if (row?.st === 'failed' && row.why === 'workspace') {
    return { status: 'failed', reason: 'workspace-unavailable' };
  }
  throw new Error(`No replay outcome gives ${JSON.stringify(row)}.`);
};

/** A settled row: the journal and the storage change as the model's `ReplaySettled` changes them. */
const settled = (harness: Harness, operationId: string, outcome: ReplayOutcome): void => {
  const { held } = harness;
  if (outcome.status !== 'recovered') {
    return;
  }
  held.journal = held.journal.filter((id) => id !== operationId);
  const projectId = held.projects[operationId] ?? 'none';
  held.storage =
    held.ops[operationId] === 'create'
      ? [...new Set([...held.storage, projectId])].toSorted()
      : held.storage.filter((id) => id !== projectId);
};

const queryOf = (harness: Harness) => {
  const open = harness.access.getSnapshot().context.questions[question];
  return open === undefined ? undefined : (open.ref.getSnapshot() as { context: AccessQueryContext; value: unknown });
};

/** A route read is held (a function, so a read the query started since the last check is seen). */
const readHeld = (harness: Harness): boolean => harness.held.read !== undefined;

/** The held route read returns: the epoch it was asked at, and storage as it is now. */
const returnRead = async (harness: Harness): Promise<void> => {
  const { held } = harness;
  const { read } = held;
  if (read === undefined) {
    throw new Error('No route read is held.');
  }
  held.read = undefined;
  read.resolve({ epoch: read.epoch, result: listingOf(held.storage), cached: false });
  await flush();
};

const askHeld = (harness: Harness): void => {
  const { ask } = harness.held;
  if (ask === undefined) {
    throw new Error('The model takes the top of the loop with no question asked.');
  }
  harness.held.ask = undefined;
  harness.access.send({ type: 'accessAsked', requestId: question, projectId: ask.projectId });
};

const apply = async (harness: Harness, state: SpecState): Promise<void> => {
  const { discovery, recovery, held } = harness;
  // The journal read returns before the tab's first step.
  await flush();
  switch (state.act) {
    case 'PassStarted': {
      // An owed pass starts when the listing query asks for it (it refetches on every invalidation); one not owed
      // is a poll (`MaxPolls`, 0 in the export).
      if (discovery.getSnapshot().context.owed) {
        held.listings += 1;
        discovery.send({ type: 'passRequested', requestId: `listing-${String(held.listings)}`, reuse: true });
      } else {
        discovery.send({ type: 'poll' });
      }
      break;
    }
    case 'PassSettled': {
      const { scan } = held;
      held.scan = undefined;
      scan?.resolve(listingOf(scan.seen.roots));
      break;
    }
    case 'ReplayStarted': {
      recovery.send({ type: 'discoveryReady' });
      break;
    }
    case 'ReplaySettled':
    case 'MutationApplied': {
      const operationId = rows.find(
        (id) => recovery.getSnapshot().context.rows[id]?.status === 'replaying' && state.rec[id]?.st !== 'replaying',
      );
      if (operationId === undefined) {
        throw new Error(`${state.act}: no replaying row settles.`);
      }
      const outcome = outcomeOf(state, operationId);
      settled(harness, operationId, outcome);
      if (state.act === 'ReplaySettled') {
        held.replay?.resolve(outcome);
        held.replay = undefined;
      } else {
        recovery.send({ type: 'mutationSettled', operationId, outcome });
      }
      break;
    }
    case 'MutationJournaled': {
      const operationId = rows.find((id) => !held.journal.includes(id) && held.projects[id] === undefined);
      const projectId = operationId === undefined ? undefined : state.rowProj[operationId];
      const kind = operationId === undefined ? undefined : state.rowOp[operationId];
      if (operationId === undefined || projectId === undefined || kind === undefined) {
        throw new Error('MutationJournaled: no free row.');
      }
      const admitted: string[] = [];
      const subscription = recovery.on('mutationAdmitted', (event) => {
        admitted.push(event.requestId);
      });
      recovery.send({ type: 'mutationAsked', requestId: 'm1', projectId });
      subscription.unsubscribe();
      if (!admitted.includes('m1')) {
        throw new Error('MutationJournaled: the gate held a mutation the model admits.');
      }
      held.projects[operationId] = projectId;
      held.ops[operationId] = kind;
      held.journal = [...held.journal, operationId];
      recovery.send({ type: 'mutationJournaled', requestId: 'm1', row: rowInput(operationId, projectId, kind) });
      break;
    }
    case 'PersonDiscarded': {
      const operationId = rows.find((id) => state.rec[id]?.st === 'discarded');
      if (operationId === undefined) {
        throw new Error('PersonDiscarded: no row is discarded.');
      }
      recovery.send({ type: 'discardAsked', requestId: 'x1', operationId });
      await flush();
      held.journal = held.journal.filter((id) => id !== operationId);
      held.discard?.resolve();
      held.discard = undefined;
      break;
    }
    case 'AccessAsked': {
      held.ask = { projectId: state.acc[question]?.p ?? 'none' };
      break;
    }
    case 'AccessRead':
    case 'AccessAnswered': {
      if (held.continued !== undefined) {
        // The query's new top after a reread already did this step.
        held.continued = undefined;
      } else if (state.act === 'AccessAnswered' && readHeld(harness)) {
        // An answer delivered after its last read: the held read returns.
        await returnRead(harness);
      } else {
        askHeld(harness);
      }
      break;
    }
    case 'AccessReread': {
      const before = held.answers.length;
      await returnRead(harness);
      held.continued = { answers: held.answers.length - before, read: readHeld(harness) };
      break;
    }
    default: {
      throw new Error(`No harness step for the model's ${state.act}.`);
    }
  }
  await flush();
};

const statusOfAnswer = (answer: AccessAnswer | undefined): string => answer?.status ?? 'none';

const rowView = (row: RecoveryRow | undefined, waiting: boolean): RowView => {
  if (row === undefined) {
    return waiting
      ? { st: 'waiting', att: 0, why: 'none', via: 'journal' }
      : { st: 'unseen', att: 0, why: 'none', via: 'journal' };
  }
  switch (row.status) {
    case 'waiting':
    case 'replaying': {
      return { st: row.status, att: row.attempts, why: 'none', via: row.via === 'mutation' ? 'mutation' : 'journal' };
    }
    case 'failed': {
      // A terminal row is never replayed again, so the model keeps no attempts for it.
      return row.reason === 'workspace-unavailable'
        ? { st: 'failed', att: row.attempts, why: 'workspace', via: 'journal' }
        : { st: 'failed', att: 0, why: 'terminal', via: 'journal' };
    }
    default: {
      return { st: row.status, att: 0, why: 'none', via: 'journal' };
    }
  }
};

const reading = (value: unknown): boolean =>
  typeof value === 'string'
    ? ['verifying', 'ensuring', 'classifying'].includes(value)
    : JSON.stringify(value) === JSON.stringify({ discovering: 'passing' });

/** The model's fields these machine states stand for (the refinement mapping). */
const view = (harness: Harness): SpecView => {
  const { discovery, recovery, access, held } = harness;
  const found = discovery.getSnapshot();
  const library = recovery.getSnapshot();
  const loading = library.matches('loading');
  const route = access.getSnapshot().context;
  const open = route.questions[question];
  const query = queryOf(harness);
  const { continued } = held;
  // Hold back what the query's new top did after a reread, if it is something the model's top could do next.
  const heldBack =
    continued === undefined
      ? 0
      : continued.answers > 0 && ['recovering', 'recovery-failed'].includes(statusOfAnswer(held.answers.at(-1)))
        ? continued.answers
        : 0;
  const delivered = held.answers.length - heldBack;
  const projectId = held.ask?.projectId ?? open?.projectId ?? 'p1';
  const gen = route.generations[question] ?? 0;
  const ask = (): QuestionView => {
    if (held.ask === undefined && open === undefined && held.answers.length === 0) {
      return noQuestion;
    }
    const asking =
      held.ask !== undefined ||
      (continued !== undefined && (heldBack > 0 || continued.read)) ||
      (query !== undefined && !reading(query.value));
    if (asking) {
      return { ...noQuestion, st: 'asking', p: projectId, gen };
    }
    if (query === undefined) {
      return { ...noQuestion, st: 'answered', p: projectId, gen, ans: statusOfAnswer(held.answers.at(-1)) };
    }
    return {
      ...noQuestion,
      st: 'reading',
      p: projectId,
      gen,
      k: 1,
      cur: query.context.readEpoch === route.facts.epoch,
      rs: query.context.started,
    };
  };
  const questionView = ask();
  return {
    owed: found.context.owed,
    redo: found.context.redo,
    skipped: found.context.skipped,
    stopped: found.matches({ stop: 'stopped' }),
    pass: found.matches({ pass: 'idle' })
      ? { st: 'idle', cur: false, seen: noListing }
      : { st: 'reading', cur: found.context.passEpoch === found.context.epoch, seen: held.scan?.seen ?? noListing },
    catalog: held.catalog,
    journal: [...held.journal].toSorted(),
    rec: Object.fromEntries(
      rows.map((id) => [
        id,
        rowView(loading ? undefined : library.context.rows[id], loading && held.journal.includes(id)),
      ]),
    ),
    acc: { [question]: questionView },
    replies:
      questionView.st === 'reading' && held.read !== undefined
        ? [{ id: question, gen: open?.gen ?? 0, p: projectId }]
        : [],
    deliveries: { [question]: { '0': delivered } },
  };
};

/** The same fields of a model state. */
const project = (spec: SpecView): SpecView => {
  const state = spec as unknown as SpecState;
  return {
    owed: state.owed,
    redo: state.redo,
    skipped: state.skipped,
    stopped: state.stopped,
    pass: state.pass,
    catalog: { ok: state.catalog.ok, roots: [...state.catalog.roots].toSorted() },
    journal: [...state.journal].toSorted(),
    rec: state.rec,
    // A question's first-read value is kept only for a later read; with `Reads = 1` there is none, so it is unchecked.
    acc: Object.fromEntries(
      Object.entries(state.acc).map(([id, { st, p, gen, k, cur, rs, ans }]) => [id, { st, p, gen, k, cur, rs, ans }]),
    ),
    replies: state.replies,
    deliveries: state.deliveries,
  };
};

const machines: readonly AnyStateMachine[] = [
  libraryDiscoveryMachine,
  libraryRecoveryMachine,
  libraryAccessMachine,
  libraryAccessQueryMachine,
];

describe('the library machines conform to LibraryCatalog.tla', () => {
  it('should replay the covering suite without divergence', async () => {
    const behaviours = suiteBehaviours(graph, suite) as unknown as SpecState[][];
    const divergences = [];
    for (const [index, behaviour] of behaviours.entries()) {
      const [initial] = behaviour;
      if (initial === undefined) {
        continue;
      }
      const adapter: ConformanceAdapter<Harness> = {
        start: () => start(initial),
        apply: async (harness, [state]) => apply(harness, state as SpecState),
        view,
        project,
        stop(harness) {
          harness.access.stop();
          harness.recovery.stop();
          harness.discovery.stop();
        },
      };
      // oxlint-disable-next-line no-await-in-loop -- each behaviour replays on its own actors, in order.
      const found = await replaySuite([behaviour as unknown as SpecView[]], adapter, (state) => [state]);
      divergences.push(
        ...found.map((divergence) => ({ ...divergence, behaviour: index, action: behaviour[divergence.step]?.act })),
      );
    }

    expect(behaviours).toHaveLength(20);
    expect(divergences).toEqual([]);
  });

  it('should take the actions the export bounds allow', () => {
    const taken = new Set(suiteBehaviours(graph, suite).flatMap((behaviour) => behaviour.map((state) => state['act'])));

    // The export is the target with one project, one question, one read and no crash, stop, bump or second ask.
    expect([...taken].map(String).toSorted((left, right) => left.localeCompare(right))).toEqual([
      'AccessAnswered',
      'AccessAsked',
      'AccessRead',
      'AccessReread',
      'Init',
      'MutationApplied',
      'MutationJournaled',
      'PassSettled',
      'PassStarted',
      'PersonDiscarded',
      'ReplaySettled',
      'ReplayStarted',
    ]);
  });

  it('should name a model action on every refining transition, and a transition for every tab action (MC-R27)', () => {
    // `machineActions` keeps one label per state and event; a port's `onDone` here carries one per outcome.
    type Node = {
      id: string;
      states?: Record<string, Node>;
      transitions?: Map<string, Array<{ meta?: { tla?: string } }>>;
      always?: Array<{ meta?: { tla?: string } }>;
    };
    const nodesOf = (node: Node): Node[] => [
      node,
      ...Object.values(node.states ?? {}).flatMap((child) => nodesOf(child)),
    ];
    const nodes = machines.flatMap((machine) => nodesOf(machine.root as unknown as Node));
    const labelled = nodes.flatMap((node) =>
      [...(node.transitions ?? []), ['always', node.always ?? []] as const].flatMap(([eventType, transitions]) =>
        transitions.map((transition, index): readonly [string, string | undefined] => [
          `${node.id}.${eventType}#${String(index)}`,
          transition.meta?.tla,
        ]),
      ),
    );
    const actions = Object.fromEntries(
      labelled.filter(
        (entry): entry is readonly [string, string] => entry[1] !== undefined && entry[1] !== 'Unmodelled',
      ),
    );

    expect(new Set(Object.values(actions))).toEqual(
      new Set([
        'PassStarted',
        'PassSettled',
        'EpochBumped',
        'WriteStopBegan',
        'WriteStopEnded',
        'MutationJournaled',
        'ReplayStarted',
        'ReplaySettled',
        'PersonDiscarded',
        'WorkspaceReturned',
        'AccessAsked',
        'AccessCancelled',
        'AccessTop',
        'AccessReadDone',
      ]),
    );

    expect(
      checkActionCorrespondence(actions, {
        operators: specOperators(readFileSync(path.join(specs, 'LibraryCatalog.tla'), 'utf8')),
        next: [
          'PassStarted',
          'PassSettled',
          'CatalogApplied',
          'EpochBumped',
          'WriteStopBegan',
          'WriteStopEnded',
          'MutationJournaled',
          'ReplayStarted',
          'ReplaySettled',
          'PersonDiscarded',
          'WorkspaceLost',
          'WorkspaceReturned',
          'Crash',
          'AccessTop',
          'AccessNextRead',
          'AccessCancelled',
          'AccessReadDone',
          'AccessAsked',
          'EnvChangedStorage',
          'EnvAddedRow',
          'EnvSettledRow',
        ],
        // `CatalogApplied` is today's `ref` fence only: the target publishes in `PassSettled`. The workspace, a
        // reload and other tabs act on the tab from outside; the watch reports a lost workspace as `EpochBumped`.
        // `AccessNextRead` is the start of a later read, which the query takes in the transition that settled the
        // read before it (`AccessReadDone`).
        environment: [
          'CatalogApplied',
          'WorkspaceLost',
          'Crash',
          'AccessNextRead',
          'EnvChangedStorage',
          'EnvAddedRow',
          'EnvSettledRow',
        ],
      }),
    ).toEqual([]);
  });
});
