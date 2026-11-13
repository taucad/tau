/**
 * `libraryRecovery` against the A0.4 recovery rows (`hooks/use-project-manager.recovery.test.ts`), written against the
 * machine: I8 `RetryOnlyWhenCleared` (no replay attempt is spent while the workspace is still gone), I8
 * `RecoveryGatesMutation` (a permanent delete waits for the bootstrap replay and for a retry replay) and
 * `RowAccounted` under programme control's ruling (a row fails on a terminal reason, on `workspace-unavailable`, or on
 * its third settled attempt). Every port is held by the test.
 *
 * Path table: pure traversal never answers the journal read, so `loading` is the one state it reaches; the `ready`
 * regions are swept on live actors in the totality rows instead.
 */
import { describe, expect, it } from 'vitest';
import { pathTable, unansweredEvents } from '@taucad/xstate-testing/paths';
import { StepClock, flush } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import type { AnyMachineSnapshot } from 'xstate';
import {
  createLibraryRecovery,
  libraryRecoveryEventTypes,
  libraryRecoveryIgnoredEvents,
  libraryRecoveryMachine,
  maxRecoveryAttempts,
  selectJournalReady,
  selectMutationGated,
  selectRecoveries,
} from '#machines/library-recovery.machine.js';
import type {
  LibraryRecoveryEmitted,
  LibraryRecoveryEvent,
  RecoveryRowInput,
  ReplayOutcome,
} from '#machines/library-recovery.machine.js';

type Held<I, O> = Readonly<{ input: I; resolve: (output: O) => void; reject: (error: unknown) => void }>;

const heldPort = <I, O>() => {
  const calls: Array<Held<I, O>> = [];
  const port = async (input: I): Promise<O> =>
    new Promise<O>((resolve, reject) => {
      calls.push({ input, resolve, reject });
    });
  return { calls, port };
};

const row = (operationId: string, projectId: string, workspaceId?: string): RecoveryRowInput =>
  ({
    operationId,
    projectId,
    kind: 'create',
    storage: { backend: 'webaccess', storageRootKey: 'root', relativeDirectory: projectId },
    ...(workspaceId === undefined ? {} : { workspaceId }),
  }) as unknown as RecoveryRowInput;

const recovered: ReplayOutcome = { status: 'recovered' };
const workspaceGone: ReplayOutcome = { status: 'failed', reason: 'workspace-unavailable' };

const start = () => {
  const guard = guardActors({ ignore: { 'library-recovery': libraryRecoveryIgnoredEvents } });
  const readJournal = heldPort<AbortSignal, readonly RecoveryRowInput[]>();
  const replay = heldPort<{ operationId: string; projectId: string }, ReplayOutcome>();
  const check = heldPort<{ rows: readonly RecoveryRowInput[] }, readonly string[]>();
  const discard = heldPort<{ operationId: string }, void>();
  const actor = createLibraryRecovery({
    clock: new StepClock(),
    inspect: guard.inspect,
    ports: {
      readJournal: readJournal.port,
      replay: async ({ operationId, projectId }) => replay.port({ operationId, projectId }),
      checkWorkspaces: async ({ rows }) => check.port({ rows }),
      discard: async ({ operationId }) => discard.port({ operationId }),
    },
  });
  const emitted: LibraryRecoveryEmitted[] = [];
  actor.on('*', (event) => {
    emitted.push(event as LibraryRecoveryEmitted);
  });
  actor.start();
  const send = (event: LibraryRecoveryEvent) => {
    actor.send(event);
  };
  const of = <T extends LibraryRecoveryEmitted['type']>(type: T) =>
    emitted.filter((event): event is Extract<LibraryRecoveryEmitted, { type: T }> => event.type === type);
  const statusOf = (operationId: string) => actor.getSnapshot().context.rows[operationId];
  return { actor, readJournal, replay, check, discard, emitted, send, of, statusOf, guard };
};

/** Read the journal and let the loop start. */
const ready = async (harness: ReturnType<typeof start>, rows: readonly RecoveryRowInput[]) => {
  harness.readJournal.calls[0]?.resolve(rows);
  await flush();
  harness.send({ type: 'discoveryReady' });
};

const settleReplay = async (harness: ReturnType<typeof start>, outcome: ReplayOutcome) => {
  harness.replay.calls.at(-1)?.resolve(outcome);
  await flush();
};

describe('libraryRecovery', () => {
  describe('the journal and the loop', () => {
    it('should read the journal, show every row as recovering, and replay only after the bootstrap pass', async () => {
      const harness = start();
      harness.readJournal.calls[0]?.resolve([row('o1', 'p1'), row('o2', 'p2')]);
      await flush();
      expect(harness.of('journalReady')).toEqual([{ type: 'journalReady', pending: 2 }]);
      expect(selectJournalReady(harness.actor.getSnapshot())).toBe(true);
      expect(selectRecoveries(harness.actor.getSnapshot()).map((recovery) => recovery.status)).toEqual([
        'recovering',
        'recovering',
      ]);
      expect(harness.replay.calls).toHaveLength(0);
      harness.send({ type: 'discoveryReady' });
      expect(harness.replay.calls.map((call) => call.input.operationId)).toEqual(['o1']);
    });

    it('should replay one row at a time, in journal order', async () => {
      const harness = start();
      await ready(harness, [row('o1', 'p1'), row('o2', 'p2')]);
      expect(harness.replay.calls).toHaveLength(1);
      await settleReplay(harness, recovered);
      expect(harness.replay.calls.map((call) => call.input.operationId)).toEqual(['o1', 'o2']);
      await settleReplay(harness, recovered);
      expect(selectRecoveries(harness.actor.getSnapshot())).toEqual([]);
      expect(harness.of('rowSettled').map((event) => event.operationId)).toEqual(['o1', 'o2']);
      expect(harness.of('rowStarted').map((event) => event.operationId)).toEqual(['o1', 'o2']);
    });

    it('should report a failed journal read and read again on load', async () => {
      const harness = start();
      harness.readJournal.calls[0]?.reject(new Error('idb closed'));
      await flush();
      expect(harness.of('journalFailed')).toEqual([{ type: 'journalFailed', message: 'idb closed' }]);
      expect(selectJournalReady(harness.actor.getSnapshot())).toBe(false);
      harness.send({ type: 'load' });
      harness.readJournal.calls[1]?.resolve([]);
      await flush();
      expect(selectJournalReady(harness.actor.getSnapshot())).toBe(true);
    });

    it('should fail a replay that threw with filesystem-error and never replay it again', async () => {
      const harness = start();
      await ready(harness, [row('o1', 'p1')]);
      harness.replay.calls[0]?.reject(new Error('boom'));
      await flush();
      expect(selectRecoveries(harness.actor.getSnapshot())).toEqual([
        expect.objectContaining({ operationId: 'o1', status: 'failed', reason: 'filesystem-error' }),
      ]);
      harness.send({ type: 'workspaceReturned' });
      harness.send({ type: 'retryRequested' });
      expect(harness.replay.calls).toHaveLength(1);
      expect(harness.check.calls).toHaveLength(0);
    });

    it('should restore a row the journal no longer holds and count no attempt for it', async () => {
      const harness = start();
      await ready(harness, [row('o1', 'p1')]);
      await settleReplay(harness, { status: 'absent' });
      // The restored row is waiting again, so the loop replays it at once: one attempt, not two.
      expect(harness.of('rowSettled')).toEqual([]);
      expect(harness.replay.calls).toHaveLength(2);
      expect(harness.statusOf('o1')).toEqual(expect.objectContaining({ status: 'replaying', attempts: 1 }));
    });
  });

  describe('RowAccounted', () => {
    it.each(['identity-conflict', 'filesystem-error', 'local-state-error'] as const)(
      'should stop at once on the terminal reason %s',
      async (reason) => {
        const harness = start();
        await ready(harness, [row('o1', 'p1', 'w1')]);
        await settleReplay(harness, { status: 'failed', reason });
        harness.send({ type: 'workspaceReturned' });
        expect(harness.replay.calls).toHaveLength(1);
        expect(harness.statusOf('o1')).toEqual(expect.objectContaining({ status: 'failed', reason, attempts: 1 }));
      },
    );

    it('should read failed after the first workspace-unavailable attempt (ruling 2)', async () => {
      const harness = start();
      await ready(harness, [row('o1', 'p1', 'w1')]);
      await settleReplay(harness, workspaceGone);
      expect(selectRecoveries(harness.actor.getSnapshot())).toEqual([
        expect.objectContaining({ status: 'failed', reason: 'workspace-unavailable' }),
      ]);
      expect(harness.replay.calls).toHaveLength(1);
    });

    it('should make no fourth attempt, however often the workspace returns', async () => {
      const harness = start();
      await ready(harness, [row('o1', 'p1', 'w1')]);
      for (let attempt = 1; attempt <= maxRecoveryAttempts; attempt += 1) {
        expect(harness.replay.calls).toHaveLength(attempt);
        // A lapsed permission counts as present (D14): the attempt is made, counted and fails.
        // oxlint-disable-next-line no-await-in-loop -- each step settles before the next is taken.
        await settleReplay(harness, workspaceGone);
        harness.send({ type: 'workspaceReturned', workspaceId: 'w1' });
      }
      expect(harness.replay.calls).toHaveLength(maxRecoveryAttempts);
      expect(harness.statusOf('o1')).toEqual(
        expect.objectContaining({ status: 'failed', reason: 'workspace-unavailable', attempts: maxRecoveryAttempts }),
      );
      harness.send({ type: 'retryRequested' });
      expect(harness.check.calls).toHaveLength(0);
    });
  });

  describe('a workspace-unavailable row waits for its workspace (I8 RetryOnlyWhenCleared)', () => {
    it('I8: should not spend replay attempts on root changes while the workspace is still gone', async () => {
      const harness = start();
      await ready(harness, [row('o1', 'p1', 'w1')]);
      await settleReplay(harness, workspaceGone);
      const before = selectRecoveries(harness.actor.getSnapshot());
      for (let change = 0; change < 3; change += 1) {
        harness.send({ type: 'retryRequested' });
        expect(harness.check.calls).toHaveLength(change + 1);
        expect(harness.check.calls[change]?.input.rows.map((input) => input.operationId)).toEqual(['o1']);
        harness.check.calls[change]?.resolve([]);
        // oxlint-disable-next-line no-await-in-loop -- each step settles before the next is taken.
        await flush();
      }
      expect(harness.replay.calls).toHaveLength(1);
      expect(harness.statusOf('o1')).toEqual(expect.objectContaining({ status: 'failed', attempts: 1 }));
      expect(selectRecoveries(harness.actor.getSnapshot())).toEqual(before);
      // The workspace returns: the check finds it and the row joins the loop.
      harness.send({ type: 'retryRequested' });
      harness.check.calls[3]?.resolve(['o1']);
      await flush();
      expect(harness.replay.calls).toHaveLength(2);
      await settleReplay(harness, recovered);
      expect(selectRecoveries(harness.actor.getSnapshot())).toEqual([]);
    });

    it('should run one more check for a retry that arrives during a check', async () => {
      const harness = start();
      await ready(harness, [row('o1', 'p1', 'w1')]);
      await settleReplay(harness, workspaceGone);
      harness.send({ type: 'retryRequested' });
      harness.send({ type: 'retryRequested' });
      harness.send({ type: 'retryRequested' });
      harness.check.calls[0]?.resolve([]);
      await flush();
      expect(harness.check.calls).toHaveLength(2);
      harness.check.calls[1]?.reject(new Error('picker gone'));
      await flush();
      expect(harness.check.calls).toHaveLength(2);
      expect(harness.replay.calls).toHaveLength(1);
    });

    it('should re-arm only the rows of the workspace that returned', async () => {
      const harness = start();
      await ready(harness, [row('o1', 'p1', 'w1'), row('o2', 'p2', 'w2')]);
      await settleReplay(harness, workspaceGone);
      await settleReplay(harness, workspaceGone);
      expect(harness.replay.calls).toHaveLength(2);
      harness.send({ type: 'workspaceReturned', workspaceId: 'w2' });
      expect(harness.replay.calls.at(-1)?.input.operationId).toBe('o2');
      await settleReplay(harness, recovered);
      expect(harness.replay.calls).toHaveLength(3);
      expect(harness.statusOf('o1')).toEqual(expect.objectContaining({ status: 'failed' }));
    });
  });

  describe('recovery gates mutation (I8 RecoveryGatesMutation)', () => {
    it('I8: should not admit a permanent delete of the project while its bootstrap replay is in flight', async () => {
      const harness = start();
      await ready(harness, [row('o1', 'p1', 'w1')]);
      harness.send({ type: 'mutationAsked', requestId: 'd1', projectId: 'p1' });
      harness.send({ type: 'mutationAsked', requestId: 'm2', projectId: 'p2' });
      expect(harness.of('mutationAdmitted')).toEqual([{ type: 'mutationAdmitted', requestId: 'm2' }]);
      expect(selectMutationGated(harness.actor.getSnapshot(), 'p1')).toBe(true);
      await settleReplay(harness, recovered);
      expect(harness.of('mutationAdmitted').map((event) => event.requestId)).toEqual(['m2', 'd1']);
    });

    it('I8: should not admit a permanent delete of the project while a retry replay is in flight', async () => {
      const harness = start();
      await ready(harness, [row('o1', 'p1', 'w1')]);
      await settleReplay(harness, workspaceGone);
      // A failed row does not gate (rule 4).
      expect(selectMutationGated(harness.actor.getSnapshot(), 'p1')).toBe(false);
      harness.send({ type: 'workspaceReturned' });
      expect(harness.replay.calls).toHaveLength(2);
      harness.send({ type: 'mutationAsked', requestId: 'd1', projectId: 'p1' });
      expect(harness.of('mutationAdmitted')).toEqual([]);
      await settleReplay(harness, recovered);
      expect(harness.of('mutationAdmitted')).toEqual([{ type: 'mutationAdmitted', requestId: 'd1' }]);
    });

    it('should hold a mutation until the journal is read', async () => {
      const harness = start();
      harness.send({ type: 'mutationAsked', requestId: 'm1', projectId: 'p1' });
      expect(harness.of('mutationAdmitted')).toEqual([]);
      harness.readJournal.calls[0]?.resolve([]);
      await flush();
      expect(harness.of('mutationAdmitted')).toEqual([{ type: 'mutationAdmitted', requestId: 'm1' }]);
    });

    it('should hold a second mutation of a project until the first settles, and release on abandon', async () => {
      const harness = start();
      await ready(harness, []);
      harness.send({ type: 'mutationAsked', requestId: 'm1', projectId: 'p1' });
      harness.send({ type: 'mutationAsked', requestId: 'm2', projectId: 'p1' });
      harness.send({ type: 'mutationAsked', requestId: 'm3', projectId: 'p1' });
      harness.send({ type: 'mutationJournaled', requestId: 'm1', row: row('o1', 'p1') });
      expect(harness.of('rowStarted')).toEqual([{ type: 'rowStarted', operationId: 'o1', projectId: 'p1' }]);
      // The mutation's own row replays beside the loop: the loop does not take it.
      expect(harness.replay.calls).toHaveLength(0);
      expect(harness.of('mutationAdmitted').map((event) => event.requestId)).toEqual(['m1']);
      // A late or foreign report does not settle the row.
      harness.send({ type: 'mutationSettled', operationId: 'o9', outcome: recovered });
      expect(harness.of('mutationAdmitted').map((event) => event.requestId)).toEqual(['m1']);
      harness.send({ type: 'mutationSettled', operationId: 'o1', outcome: recovered });
      expect(harness.of('mutationAdmitted').map((event) => event.requestId)).toEqual(['m1', 'm2']);
      harness.send({ type: 'mutationAbandoned', requestId: 'm2' });
      expect(harness.of('mutationAdmitted').map((event) => event.requestId)).toEqual(['m1', 'm2', 'm3']);
      expect(harness.statusOf('o1')).toEqual(expect.objectContaining({ status: 'recovered', attempts: 0 }));
    });
  });

  describe('the person', () => {
    it("should run createProject(id)'s replay after the loop drains, and answer whether the row is still held", async () => {
      const harness = start();
      await ready(harness, [row('o1', 'p1')]);
      harness.send({ type: 'replayAsked', requestId: 'c1', row: row('o2', 'p2') });
      expect(harness.replay.calls).toHaveLength(1);
      await settleReplay(harness, recovered);
      expect(harness.replay.calls.map((call) => call.input.operationId)).toEqual(['o1', 'o2']);
      await settleReplay(harness, workspaceGone);
      expect(harness.of('replaySettled')).toEqual([{ type: 'replaySettled', requestId: 'c1', held: true }]);
    });

    it('should answer a replay of a terminal row at once, held', async () => {
      const harness = start();
      await ready(harness, [row('o1', 'p1')]);
      await settleReplay(harness, { status: 'failed', reason: 'identity-conflict' });
      harness.send({ type: 'replayAsked', requestId: 'c1', row: row('o1', 'p1') });
      expect(harness.replay.calls).toHaveLength(1);
      expect(harness.of('replaySettled')).toEqual([{ type: 'replaySettled', requestId: 'c1', held: true }]);
    });

    it('should discard only a failed row, one at a time', async () => {
      const harness = start();
      harness.send({ type: 'discardAsked', requestId: 'x0', operationId: 'o1' });
      await ready(harness, [row('o1', 'p1'), row('o2', 'p2')]);
      harness.send({ type: 'discardAsked', requestId: 'x1', operationId: 'o1' });
      await settleReplay(harness, { status: 'failed', reason: 'local-state-error' });
      harness.send({ type: 'discardAsked', requestId: 'x2', operationId: 'o1' });
      harness.send({ type: 'discardAsked', requestId: 'x3', operationId: 'o1' });
      expect(harness.discard.calls).toHaveLength(1);
      harness.discard.calls[0]?.resolve();
      await flush();
      expect(harness.of('discardSettled')).toEqual([
        { type: 'discardSettled', requestId: 'x0', ok: false },
        { type: 'discardSettled', requestId: 'x1', ok: false },
        { type: 'discardSettled', requestId: 'x2', ok: true },
        { type: 'discardSettled', requestId: 'x3', ok: false },
      ]);
      expect(harness.of('rowSettled').map((event) => event.operationId)).toEqual(['o1', 'o1']);
      expect(harness.statusOf('o1')).toEqual(expect.objectContaining({ status: 'discarded' }));
      expect(selectRecoveries(harness.actor.getSnapshot()).map((recovery) => recovery.operationId)).toEqual(['o2']);
    });

    it('should keep a row whose discard failed, so the person can try again', async () => {
      const harness = start();
      await ready(harness, [row('o1', 'p1')]);
      await settleReplay(harness, { status: 'failed', reason: 'local-state-error' });
      harness.send({ type: 'discardAsked', requestId: 'x1', operationId: 'o1' });
      harness.discard.calls[0]?.reject(new Error('locked'));
      await flush();
      expect(harness.statusOf('o1')).toEqual(expect.objectContaining({ status: 'failed', discarding: false }));
      harness.send({ type: 'discardAsked', requestId: 'x2', operationId: 'o1' });
      expect(harness.discard.calls).toHaveLength(2);
      harness.discard.calls[1]?.resolve();
      await flush();
      expect(harness.of('discardSettled').map((event) => event.ok)).toEqual([false, true]);
    });
  });
});

/* Totality (MC-R17). */
type Samples = { [T in LibraryRecoveryEvent['type']]: ReadonlyArray<Extract<LibraryRecoveryEvent, { type: T }>> };

const samples: Samples = {
  load: [{ type: 'load' }],
  discoveryReady: [{ type: 'discoveryReady' }],
  mutationAsked: [{ type: 'mutationAsked', requestId: 'm', projectId: 'p1' }],
  mutationJournaled: [{ type: 'mutationJournaled', requestId: 'm', row: row('o9', 'p1') }],
  mutationAbandoned: [{ type: 'mutationAbandoned', requestId: 'm' }],
  mutationSettled: [{ type: 'mutationSettled', operationId: 'o9', outcome: recovered }],
  workspaceReturned: [{ type: 'workspaceReturned' }, { type: 'workspaceReturned', workspaceId: 'w1' }],
  retryRequested: [{ type: 'retryRequested' }],
  replayAsked: [{ type: 'replayAsked', requestId: 'c', row: row('o1', 'p1') }],
  discardAsked: [{ type: 'discardAsked', requestId: 'x', operationId: 'o1' }],
};

const options = {
  events: Object.values(samples).flat(),
  limit: 200,
  serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
};

/** Live states the traversal cannot reach, each with the steps that reach it. */
const liveStates: ReadonlyArray<readonly [name: string, reach: (harness: ReturnType<typeof start>) => Promise<void>]> =
  [
    [
      'loadFailed',
      async (harness) => {
        harness.readJournal.calls[0]?.reject(new Error('x'));
        await flush();
      },
    ],
    ['ready, idle', async (harness) => ready(harness, [])],
    ['ready, replaying', async (harness) => ready(harness, [row('o1', 'p1', 'w1')])],
    [
      'ready, checking and discarding',
      async (harness) => {
        await ready(harness, [row('o1', 'p1', 'w1'), row('o2', 'p2', 'w1')]);
        await settleReplay(harness, workspaceGone);
        await settleReplay(harness, { status: 'failed', reason: 'local-state-error' });
        harness.send({ type: 'retryRequested' });
        harness.send({ type: 'discardAsked', requestId: 'x', operationId: 'o2' });
      },
    ],
  ];

describe('libraryRecovery totality', () => {
  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...libraryRecoveryEventTypes].toSorted());
  });

  it('should reach only loading by traversal, since no read answers there', () => {
    expect(pathTable(libraryRecoveryMachine, options).map((entry) => entry.state)).toEqual(['loading']);
    expect(unansweredEvents(libraryRecoveryMachine, { ...options, ignore: libraryRecoveryIgnoredEvents })).toEqual([]);
  });

  it.each(liveStates)('should answer every sampled event in %s except the declared pairs', async (_name, reach) => {
    for (const event of options.events) {
      const harness = start();
      // oxlint-disable-next-line no-await-in-loop -- each step settles before the next is taken.
      await reach(harness);
      harness.send(event);
      // oxlint-disable-next-line no-await-in-loop -- each step settles before the next is taken.
      await flush();
      // `guardActors` fails the test on any unanswered pair it saw.
      expect(harness.guard.take('unanswered')).toEqual([]);
    }
  });

  it('should declare no pair that the machine answers', async () => {
    // A declared pair changes nothing: the snapshot and the emitted events stay as they were.
    const reachOf: Record<string, (harness: ReturnType<typeof start>) => Promise<void>> = {
      loading: async () => undefined,
      loadFailed: async (harness) => {
        harness.readJournal.calls[0]?.reject(new Error('x'));
        await flush();
      },
      ready: async (harness) => ready(harness, []),
    };
    for (const [state, eventType] of libraryRecoveryIgnoredEvents) {
      for (const event of options.events.filter((sample) => sample.type === eventType)) {
        const harness = start();
        // oxlint-disable-next-line no-await-in-loop -- each step settles before the next is taken.
        await reachOf[state]?.(harness);
        const before = harness.actor.getSnapshot();
        const emitted = harness.emitted.length;
        harness.send(event);
        // oxlint-disable-next-line no-await-in-loop -- each step settles before the next is taken.
        await flush();
        expect(harness.actor.getSnapshot().value, `${state} ${eventType}`).toEqual(before.value);
        expect(harness.actor.getSnapshot().context, `${state} ${eventType}`).toEqual(before.context);
        expect(harness.emitted.length, `${state} ${eventType}`).toBe(emitted);
        expect(
          harness.readJournal.calls.length + harness.check.calls.length,
          `${state} ${eventType}`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });
});
