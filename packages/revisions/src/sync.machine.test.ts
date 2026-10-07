/**
 * `sync.machine`'s full path table (S47, I30).
 *
 * Hand-enumerated rather than graph-generated: every state but the four settled
 * ones is an invoked effect, and `getSimplePaths` never enters an `onError` —
 * which is half of what a scheduler is for.
 *
 * | # | Path | What it proves |
 * | --- | --- | --- |
 * | 1 | `reading → noRemote` | a project with no remote schedules nothing |
 * | 2 | `reading → opening → backedUp` | rehydration is the record plus git's remotes list (D29) |
 * | 3 | `reading.queue → onError → remote` | an unreadable queue is an empty queue, not a dead scheduler |
 * | 4 | `reading → opening → pushing` | **the queue is retried first on the next open** (D28) |
 * | 5 | `backedUp --revisionMinted(save)--> pending --after--> pushing → recording → backedUp` | the 2 s debounce, and a push that lands |
 * | 6 | `pending --revisionMinted--> pending` | three saves in a window are one push |
 * | 7 | `backedUp --revisionMinted(close)--> pushing` | **zero debounce on the close flush** (S41) |
 * | 8 | `backedUp --revisionMinted(hidden)--> pushing` | `hidden` is the real close |
 * | 9 | `pushing → recording → queued` (rejected record ref) | **a refused chat ref re-queues only itself; `main` is still acknowledged** |
 * | 10 | `pushing → recording → conflicted` (rejected `main`) | a rejected history ref is A22's conflict signal, and emits `syncConflict` |
 * | 11 | `pushing → onError → recording → queued` | a transport failure is retryable, never a refused ref (W11b R5) |
 * | 12 | `pushing → onError(reauthorization) → recording → failed` | the one push failure this host will not retry behind a person |
 * | 13 | `recording → onError → failed` | the queue write has its own failure edge (I29) |
 * | 14 | `queued --after--> opening` | the backoff retries, and **every retry pulls first** |
 * | 15 | `queued --offline--> (no retry) --online--> opening` | offline stops the backoff; `online` resumes it |
 * | 16 | `opening --offline at entry--> queued` | exit 1: offline skips the pull outright (F16) |
 * | 17 | `opening --after pullRenderWindow-->` facet leaves `checking` | exit 2: the row stops saying `Checking…` at 3 s |
 * | 18 | `opening --after pullDeadline--> queued` | exit 3: the pull is abandoned at 10 s and the project gets on with itself |
 * | 19 | `opening.fetching → fastForwarding → backedUp` | a clean checkout fast-forwards |
 * | 20 | `opening.fetching → merging → conflicted` | a diverged one merges, and this lane provides no `merge` (W10) |
 * | 21 | `opening.fetching → onError → queued` | the fetch has a failure edge |
 * | 22 | `opening.fastForwarding → onError → queued` | so does the apply |
 * | 23 | `syncNow { pushId } → pushSettled { pushId, outcome }` | **the only form `Sync now` has** (the `publish.machine` row) |
 * | 23b | `noRemote --syncNow { pushId, remote }--> pushing` | a first publish carries the remote it just created into the scheduler |
 * | 24 | `pushing → overQuota → parent quotaRefused` | the over-quota list is `remote.machine`'s, forwarded through the parent (P19) |
 * | 25 | `* --remoteDisconnected--> noRemote` | disconnecting stops the scheduler from any state |
 * | 26 | `noRemote --remoteConnected--> opening` | connecting starts it with a pull |
 * | 27 | `queued --pushAcknowledged--> recording → backedUp` | the `pagehide` POST the document made itself, answered (A32) |
 * | 28 | a `close` revision minted offline survives an actor restart | **red pin (a)**: rehydration through the record, not a snapshot |
 * | 29 | startup/stop, serializable context, one exported machine | the `create-machine` verify list |
 * | 30 | the push lease is what was last fetched | P18: `expected` per ref is the remote head this host saw |
 * | 35 | `backedUp --open--> opening` | a client reopening a retained native root fetches again |
 * | 36 | `pushing → recording → queued` (refused `main`, `upToDate` fetch) | **C3a**: exactly one push, then the backoff — never the unbounded fetch↔push cycle |
 * | 37 | `pushing → onError(REMOTE_NOT_ENTITLED) → recording → failed` | **C3b/N2**: a refusal no wait can satisfy is terminal and says why |
 * | 43 | `opening.fetching → onError(REMOTE_NOT_ENTITLED) → failed` | **C3b/N2**: the same, on the opening fetch rather than the push |
 * | 38 | `opening.fetching(ahead) → pushing` | **C15**: a device ahead of the remote pushes, instead of reading *Backed up* |
 * | 39 | `pushing --revisionMinted(close)--> recording → pushing` | **C17**: a close cut mid-push skips the debounce |
 * | 40 | `opening --offline--> queued` + `pushSettled { queued }` | **C18**: a correlated `syncNow` made offline settles instead of hanging |
 * | 41 | `pendingCount` excludes `projection` | **C19**: `n` is what the remote is owed; a failed inbound restore shows through `error` |
 * | 42 | a queue entry naming another remote is not offered | **C12**: disconnect pauses that destination's queue |
 * | 44 | `pushing --syncNow { pushId }--> recording → pushing` + one `pushSettled` | **L2-F3**: a correlated request is never dropped by a busy state |
 * | 45 | `opening --syncNow { pushId }--> pushing` | **L2-F3**: a pull that owes nothing still pushes for a waiting request |
 * | 46 | `opening --onError / pullDeadline--> queued` + `pushSettled { queued }` | **L2-F3**: every exit from the pull answers |
 * | 47 | `noRemote --syncNow { pushId }--> pushSettled { failed }` | **L2-F3**: nowhere to push is an answer, not a wait |
 * | 48 | `failed --revisionMinted--> failed` | **L2-F6**: a terminal class never re-enters the push on a save |
 * | 49 | `pushing --revisionMinted--> queued --syncBackoff--> opening` | **L2-F6**: a mid-push mint waits out the backoff |
 * | 50 | `pushing → onError(REMOTE_DAMAGED) → failed`; `REMOTE_UNAVAILABLE → queued → opening` | **D22**: a damaged repository is terminal after one attempt; a 503 still retries |
 * | 51 | `opening` → `watch`; `remoteDisconnected` → `unwatch` | **D13**: subscribed while a remote is connected, and only then |
 * | 52 | `backedUp --remoteMoved--> opening → fastForwarding → backedUp` | **D13/B6**: another device's push applies without reopening |
 * | 53 | `pushing --remoteMoved--> recording → opening` | a move that lands while busy is fetched once the work settles |
 * | 54 | `fastForwarding(held leased) → awaitingLease --leaseRetired--> opening` | **rule 9**: a leased checkout applies nothing, parks without backoff, shows the arrival, applies after the lease |
 * | 55 | `leaseRetired` during the pull, then a leased hold | the retirement is not lost: the pull runs again at once |
 * | 56 | `fastForwarding(held dirty) → minting --revisionMinted--> opening → merging → pushing` | **D12, rule 6**: a dirty checkout is minted by its checkout actor (trigger `merge`) and then composed |
 * | 57 | `minting --cutFailed / casLost / after--> queued` | a merge cut that does not land waits out the backoff; another requester's answer is not this one's |
 * | 58 | `backedUp --remoteRefused--> opening` | **rule 19, RV-W5b F5**: a refused stream is only the wake-up channel; the git fetch, with the same credential, is what the classifier reads |
 * | 61 | `minting --nothingToSave--> opening` once, then `queued` | **RV-W5b F2**: a hold the cut cannot mint re-pulls at most once, then backs off — a frozen clock fetches a bounded number of times |
 * | 62 | `awaitingLease --remoteMoved / pushAcknowledged--> recording → opening` | **RV-W5b F7**: a parked apply is remembered, so leaving the park any way re-pulls |
 * | 60 | `pending --revisionMinted every 500 ms--> pushing` within `syncDebounceMaxWaitMilliseconds` | **W13 follow-up**: a steady mint cadence faster than the window still pushes, at least once per bound |
 * | 59 | `merging(merged) → pushing` | **D12**: a diverged clean checkout merges, re-heads its actor, and pushes the merge revision under the fetched lease |
 * | 63 | `pushing / opening --429--> queued --Retry-After--> opening` | **W13d**: a rate limit waits the remote's own wait, a remote move does not cut it short, and it does not advance the doubling |
 * | 32d | `conflicted.offering → onError / refused → owed --syncBackoff--> opening → conflicted.offering` | **D14-P**: a conflict line the push could not offer is reported and offered again after the backoff, announced to the parent once however often it is re-pulled; a terminal class waits for a person |
 * | 64 | `pushing --onDone[updated]--> parent pushed` | **RV-W8 F9**: a push that moved a ref tells `remote.machine` its stored figure is stale; a refused one does not |
 * | 65 | `pushing / recording --syncNow { pushId }--> … → pushing → recording` + `pushSettled` | **W15 F1**: a correlated request is answered by a push that starts after it, so it carries the head current at the request |
 * | 66 | `pushing --syncNow { pushId }, open--> opening → pushing` + one `pushSettled` | **RV-W15**: a request parked behind a push that `open` abandons is not stranded |
 * | 67 | `pushing --syncNow { pushId }, remoteDisconnected--> noRemote` + one `pushSettled { failed }` | **RV-W15**: the disconnect answers a parked request exactly once |
 * | 68 | `pushing --syncNow { pushId }--> onError → recording → queued → opening → pushing` + one `pushSettled` | **RV-W15**: a push that throws hands its parked request to the retry, answered once |
 * | 69 | `syncNow` in every state, answered once by the push that carries it | **RM-R11**: while pulling, while pushing (the next push), and `failed` with no remote |
 * | 70 | `pushing --after pushDeadline--> recording → queued` | **A12**: a hung push ends, keeps what it owed and answers every carried requester |
 * | 71 | a mint on another branch is pushed but is not this branch's head | **RM-S3**: `revisionMinted` names its branch |
 */

import { createActor, createAsyncLogic } from 'xstate';
import type { Actor, AnyMachineSnapshot } from 'xstate';
import { describe, expect, it, vi } from 'vitest';

import * as machineModule from '#sync.machine.js';
import { selectSyncFacet, syncMachine } from '#sync.machine.js';
import type {
  SyncActors,
  SyncFetchActorOutput,
  SyncMachineEmitted,
  SyncMachineEvent,
  SyncMergeActorOutput,
  SyncPushActorOutput,
  SyncReadRemoteActorOutput,
} from '#sync.machine.js';
import type { SyncQueueRecord, SyncRefOutcome } from '#sync.types.js';
import { StepClock } from '@taucad/xstate-testing/clock';
import { RevisionPortError } from '#revision-port.js';
import {
  createFakeCallbackActors,
  createFakeParent,
  createFakePromiseActors,
  recordEmitted,
} from '@taucad/xstate-testing/fakes';
import type { FakeCallbackActors, FakeParent, FakePromiseActors } from '@taucad/xstate-testing/fakes';
import { guardActors } from '@taucad/xstate-testing/inspect';
import type { ActorGuard } from '@taucad/xstate-testing/inspect';
import { unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';

const isMachine = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

const emptyQueue: SyncQueueRecord = { version: 1, entries: [] };
const mainRef = 'refs/heads/main';
/* A divergence is recorded on this device's conflict line for `main` (D14). */
const syncBranch = 'conflicts/main/device-a';
const syncRef = `refs/heads/${syncBranch}`;
const chatRef = 'refs/tau/chats/c1';
const mergeConflict = {
  status: 'conflicted',
  branch: syncBranch,
  into: 'main',
  paths: ['main.scad'],
} satisfies SyncMergeActorOutput;

type Harness = Readonly<{
  actor: Actor<typeof syncMachine>;
  effects: FakePromiseActors;
  holds: FakeCallbackActors;
  parent: FakeParent;
  clock: StepClock;
  guard: ActorGuard;
  emitted: ReadonlyArray<Record<string, unknown>>;
  stop: () => void;
}>;

/**
 * Start one scheduler over scripted effects and a step clock.
 *
 * @param options - What the record and git's remotes list answer at start.
 * @returns The running actor and everything the suite asserts against.
 */
const start = (
  options: Readonly<{
    pending?: SyncQueueRecord;
    remote?: string | undefined;
    online?: boolean;
    queueError?: unknown;
  }> = {},
): Harness => {
  const effects = createFakePromiseActors();
  const holds = createFakeCallbackActors();
  const parent = createFakeParent();
  const guard = guardActors();
  const clock = new StepClock();
  effects.script(
    'readPending',
    options.queueError === undefined ? { output: options.pending ?? emptyQueue } : { error: options.queueError },
  );
  effects.script('readRemote', { output: { remote: 'remote' in options ? options.remote : 'tau' } });
  const actors: SyncActors = {
    readPending: effects.actor('readPending'),
    writePending: effects.actor('writePending'),
    readRemote: effects.actor('readRemote'),
    push: effects.actor('push'),
    fetch: effects.actor('fetch'),
    fastForward: effects.actor('fastForward'),
    merge: effects.actor('merge'),
    connectivity: holds.actor('connectivity'),
    remoteMoves: holds.actor('remoteMoves'),
  };
  const actor = createActor(syncMachine.provide({ actors }), {
    clock,
    inspect: guard.inspect,
    input: {
      projectId: 'p1',
      parentRef: parent.ref,
      ...(options.online === undefined ? {} : { online: options.online }),
    },
  });
  const emitted = recordEmitted(actor);
  actor.start();
  return {
    actor,
    effects,
    holds,
    parent,
    clock,
    guard,
    emitted,
    stop: () => {
      actor.stop();
      parent.stop();
    },
  };
};

/** Settle one scripted actor as soon as the machine has actually invoked it. */
const settleWhenRunning = async (
  effects: FakePromiseActors,
  name: string,
  outcome: Readonly<{ output: unknown }> | Readonly<{ error: unknown }>,
): Promise<void> => {
  await vi.waitFor(() => {
    expect(effects.running(name)).toBeGreaterThan(0);
  });
  effects.settle(name, outcome);
};

/** Drive the machine from `reading` through a clean pull into `backedUp`. */
const openCleanly = async (harness: Harness): Promise<void> => {
  await vi.waitFor(() => {
    expect(harness.effects.running('fetch')).toBe(1);
  });
  harness.effects.settle('fetch', {
    output: { leases: { [mainRef]: 'remote-head' }, integration: 'upToDate' } satisfies SyncFetchActorOutput,
  });
  await vi.waitFor(() => {
    expect(harness.actor.getSnapshot().matches('backedUp')).toBe(true);
  });
};

const pushResult = (...outcomes: readonly SyncRefOutcome[]): SyncPushActorOutput => ({ refs: outcomes });

describe('syncMachine', () => {
  it('row 1: a project with no remote schedules nothing', async () => {
    const harness = start({ remote: undefined });

    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('noRemote')).toBe(true);
    });
    expect(selectSyncFacet(harness.actor.getSnapshot()).state).toBe('noRemote');

    harness.stop();
  });

  it('row 2 + 19: rehydrates from the record and git’s remotes list, then fast-forwards', async () => {
    const harness = start();

    await vi.waitFor(() => {
      expect(harness.effects.running('fetch')).toBe(1);
    });
    expect(harness.effects.inputsFor('readPending')).toEqual([{ projectId: 'p1' }]);
    expect(selectSyncFacet(harness.actor.getSnapshot()).state).toBe('checking');

    harness.effects.settle('fetch', {
      output: { leases: { [mainRef]: 'remote-head' }, integration: 'fastForward' } satisfies SyncFetchActorOutput,
    });
    await vi.waitFor(() => {
      expect(harness.effects.running('fastForward')).toBe(1);
    });
    harness.effects.settle('fastForward', {
      output: { checkoutId: 'live', revisionId: 'remote-head', treeId: 'remote-tree' },
    });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('backedUp')).toBe(true);
    });
    expect(harness.parent.events).toContainEqual({
      type: 'checkoutChanged',
      checkoutId: 'live',
      revisionId: 'remote-head',
      treeId: 'remote-tree',
      branch: 'main',
    });

    harness.stop();
  });

  it('row 35: reopening a retained root fetches again', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({ type: 'open' });

    await vi.waitFor(() => {
      expect(harness.effects.inputsFor('fetch')).toHaveLength(2);
    });
    expect(harness.actor.getSnapshot().matches('opening')).toBe(true);

    harness.stop();
  });

  it('row 3: an unreadable queue is an empty queue, not a dead scheduler', async () => {
    const harness = start({ queueError: new Error('no store') });

    await vi.waitFor(() => {
      expect(harness.effects.running('fetch')).toBe(1);
    });
    expect(harness.actor.getSnapshot().context.pending).toEqual([]);

    harness.stop();
  });

  it('row 4 + 30: the queue is retried first on the next open, under the lease it recorded', async () => {
    const harness = start({
      pending: {
        version: 1,
        entries: [{ ref: chatRef, head: 'local', expected: 'remote-chat', reason: 'refused', recordedAt: 1 }],
      },
    });

    await vi.waitFor(() => {
      expect(harness.effects.running('fetch')).toBe(1);
    });
    harness.effects.settle('fetch', {
      output: { leases: { [chatRef]: 'remote-chat-2' }, integration: 'upToDate' } satisfies SyncFetchActorOutput,
    });

    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    expect(harness.actor.getSnapshot().context.leases).toEqual({ [chatRef]: 'remote-chat-2' });

    harness.stop();
  });

  it('row 5 + 6: three saves inside the window are one push', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'save',
      revisionId: 'r1',
      branch: 'main',
    });
    harness.clock.advance(1000);
    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'save',
      revisionId: 'r2',
      branch: 'main',
    });
    harness.clock.advance(1000);
    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'save',
      revisionId: 'r3',
      branch: 'main',
    });
    expect(harness.effects.running('push')).toBe(0);

    harness.clock.advance(2000);
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    expect(harness.effects.inputsFor('push')).toHaveLength(1);

    harness.effects.settle('push', { output: pushResult({ name: mainRef, status: 'updated', head: 'h1' }) });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('backedUp')).toBe(true);
    });
    expect(harness.effects.inputsFor('writePending')).toEqual([
      { projectId: 'p1', record: { version: 1, entries: [] } },
    ]);

    harness.stop();
  });

  it('rows 7 + 8: a close or hidden revision pushes with no debounce at all', async () => {
    for (const trigger of ['close', 'hidden'] as const) {
      const harness = start();
      // eslint-disable-next-line no-await-in-loop -- two independent schedulers, asserted in order.
      await openCleanly(harness);

      harness.actor.send({
        type: 'revisionMinted',
        checkoutId: 'live',
        trigger,
        revisionId: 'close-1',
        branch: 'main',
      });

      expect(harness.actor.getSnapshot().matches('pushing')).toBe(true);
      harness.stop();
    }
  });

  it('row 9: a refused record ref re-queues only itself while main stays acknowledged', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({ type: 'syncNow' });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    harness.effects.settle('push', {
      output: pushResult(
        { name: mainRef, status: 'updated', head: 'h1' },
        { name: chatRef, status: 'rejected', head: undefined, reason: 'non-fast-forward' },
      ),
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });

    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });
    const recorded = harness.effects.inputsFor('writePending').at(-1) as { record: SyncQueueRecord };
    expect(recorded.record.entries.map((entry) => entry.ref)).toEqual([chatRef]);
    expect(harness.actor.getSnapshot().context.leases[mainRef]).toBe('h1');
    expect(selectSyncFacet(harness.actor.getSnapshot())).toMatchObject({ state: 'queued', pendingCount: 1 });

    harness.stop();
  });

  /* D59: a new branch mints nothing; *Backed up* must not stand over it. */
  it('pushes from backed up when the refs change without a mint', async () => {
    const harness = start();
    await openCleanly(harness);
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('backedUp')).toBe(true);
    });

    harness.actor.send({ type: 'recordsChanged' });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('pending')).toBe(true);
    });
    harness.clock.advance(2000);
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    harness.stop();
  });

  it('pushes a durable record written while the current push is in flight', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({ type: 'syncNow' });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    harness.actor.send({ type: 'recordsChanged' });
    harness.effects.settle('push', { output: pushResult() });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('pending')).toBe(true);
    });

    harness.clock.advance(2000);
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    harness.stop();
  });

  it('row 10: a rejected main is the conflict signal and emits syncConflict', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({ type: 'syncNow' });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    harness.effects.settle('push', {
      output: pushResult({ name: mainRef, status: 'rejected', head: undefined, reason: 'leaseLost' }),
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    /* A refused history ref is a *retry*, so the pull that discovers the
     * divergence is reached through `queued`'s backoff — never straight from
     * `recording`, which was C3a's unbounded fetch↔push cycle. */
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });
    harness.clock.advance(5000);
    await settleWhenRunning(harness.effects, 'fetch', {
      output: { leases: { [mainRef]: 'remote-head' }, integration: 'diverged' } satisfies SyncFetchActorOutput,
    });
    await settleWhenRunning(harness.effects, 'merge', { output: mergeConflict });

    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('conflicted')).toBe(true);
    });
    expect(harness.emitted.filter((event) => event['type'] === 'syncConflict')).toEqual([
      {
        type: 'syncConflict',
        ref: syncRef,
        reason: 'The remote and this device changed the same files.',
      } satisfies SyncMachineEmitted,
    ]);
    expect(harness.parent.events).toContainEqual({
      type: 'mergeConflicted',
      branch: syncBranch,
      into: 'main',
      paths: ['main.scad'],
    });

    /* A re-pull that lands on the same waiting conflict announces nothing new. */
    harness.actor.send({ type: 'syncNow' });
    await settleWhenRunning(harness.effects, 'fetch', {
      output: { leases: { [mainRef]: 'remote-head' }, integration: 'diverged' } satisfies SyncFetchActorOutput,
    });
    await settleWhenRunning(harness.effects, 'merge', { output: mergeConflict });
    await vi.waitFor(() => {
      expect(harness.effects.inputsFor('merge')).toHaveLength(2);
      expect(harness.actor.getSnapshot().matches('conflicted')).toBe(true);
    });
    expect(harness.parent.events.filter((event) => event.type === 'mergeConflicted')).toHaveLength(1);

    harness.stop();
  });

  it('row 36 (C3a): a refused history ref pushes exactly once, then waits out the backoff', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({ type: 'syncNow' });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    /* Every refusal that is *not* a divergence — a `pre-receive` decline, the
     * allow-list, an atomic-set refusal, a protected branch — answers
     * `upToDate` on the next fetch. That combination used to cycle
     * `recording → opening → pushing` with no backoff at all. */
    harness.effects.settle('push', {
      output: pushResult({ name: mainRef, status: 'rejected', head: 'h1', reason: 'pre-receive hook declined' }),
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });

    expect(harness.effects.inputsFor('push')).toHaveLength(1);
    expect(harness.effects.running('fetch')).toBe(0);
    expect(selectSyncFacet(harness.actor.getSnapshot()).reason).toBe('rejected');

    /* And the retry that *does* happen pulls first, from `queued`'s backoff. */
    harness.clock.advance(5000);
    await vi.waitFor(() => {
      expect(harness.effects.running('fetch')).toBe(1);
    });
    expect(harness.effects.inputsFor('push')).toHaveLength(1);

    harness.stop();
  });

  /**
   * W10 defect 4: on the isomorphic-git leg D20's ceiling refusal arrives as a
   * per-ref result, not as a thrown transport error, and it used to be filed as
   * `rejected` — whose one affordance is *Sync now*, which replays the same
   * bytes and can never clear a ceiling. It is a quota answer, and the remote's
   * own sentence (with the file list the hook prints) is still what is shown.
   */
  it('files a per-ref ceiling refusal as quota, keeping the remote’s sentence', async () => {
    const harness = start();
    await openCleanly(harness);

    const sentence = [
      'Tau: repository size limit exceeded — this push needs 4080 bytes more than this repository may hold.',
      'Tau: the largest files it adds are:',
      'Tau:   huge.bin (5000 bytes)',
    ].join('\n');
    harness.actor.send({ type: 'syncNow' });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    harness.effects.settle('push', {
      output: pushResult({ name: mainRef, status: 'rejected', head: 'h1', reason: sentence }),
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    /* Terminal, as the thrown class is (rule 19): no backoff replays it. */
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('failed')).toBe(true);
    });

    const facet = selectSyncFacet(harness.actor.getSnapshot());
    expect(facet.reason).toBe('quota');
    expect(facet.error).toContain('Tau: repository size limit exceeded');
    expect(facet.error).toContain('huge.bin (5000 bytes)');

    harness.stop();
  });

  /**
   * FX1 Q: the browser leg settles an LFS batch refusal (413
   * `GIT_LFS_QUOTA_EXCEEDED`) as per-ref rejections carrying the batch body,
   * which has no hook marker. The file list is what makes it a storage answer,
   * so an owner is offered *Upgrade*, never *Sync now*.
   */
  it('files a per-ref LFS over-allowance refusal that names files as a terminal quota answer', async () => {
    const harness = start();
    await openCleanly(harness);

    const sentence = 'This push needs more storage than your plan includes.';
    harness.actor.send({ type: 'syncNow' });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    harness.effects.settle('push', {
      output: {
        refs: [{ name: mainRef, status: 'rejected', head: undefined, reason: sentence }],
        overQuota: ['over-allowance.step'],
      } satisfies SyncPushActorOutput,
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('failed')).toBe(true);
    });

    const facet = selectSyncFacet(harness.actor.getSnapshot());
    expect(facet).toMatchObject({ state: 'failed', reason: 'quota', error: sentence });
    expect(harness.parent.events).toContainEqual({
      type: 'remote',
      event: { type: 'quotaRefused', paths: ['over-allowance.step'] },
    });

    harness.stop();
  });

  it('keeps retrying when only a record ref is over quota, so history is never blocked (FX1 Q, I8)', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({ type: 'syncNow' });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    harness.effects.settle('push', {
      output: {
        refs: [
          { name: mainRef, status: 'updated', head: 'h1' },
          { name: 'refs/tau/evidence/exports', status: 'rejected', head: undefined, reason: 'over quota' },
        ],
        overQuota: ['exports/big.glb'],
      } satisfies SyncPushActorOutput,
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });
    expect(selectSyncFacet(harness.actor.getSnapshot()).reason).toBe('quota');

    harness.stop();
  });

  it('row 37 (C3b/N2): a refusal the plan will never satisfy is terminal, and names itself', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({ type: 'syncNow' });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    harness.effects.settle('push', {
      error: Object.assign(new Error('Syncing files to Tau Cloud is a paid plan feature.'), {
        code: 'REMOTE_NOT_ENTITLED',
      }),
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('failed')).toBe(true);
    });

    const facet = selectSyncFacet(harness.actor.getSnapshot());
    expect(facet.reason).toBe('notEntitled');
    expect(facet.error).toBe('Syncing files to Tau Cloud is a paid plan feature.');
    expect(facet.error).not.toMatch(/could not be reached/u);

    /* No backoff reaches a state that pushes: only the person does. */
    harness.clock.advance(600_000);
    expect(harness.effects.inputsFor('push')).toHaveLength(1);

    harness.stop();
  });

  /* Lane E2's two-client row 4 found this on the wire: a plan that lapses
   * answers the *opening fetch* first, and that edge went to `queued` for every
   * code, so the backoff re-fetched a refusal no wait can satisfy, forever. */
  it('row 43 (C3b/N2): a terminal refusal on the opening fetch fails instead of retrying on backoff', async () => {
    const harness = start();
    await vi.waitFor(() => {
      expect(harness.effects.running('fetch')).toBe(1);
    });
    harness.effects.settle('fetch', {
      error: Object.assign(new Error('Syncing files to Tau Cloud is a paid plan feature.'), {
        code: 'REMOTE_NOT_ENTITLED',
      }),
    });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('failed')).toBe(true);
    });

    const facet = selectSyncFacet(harness.actor.getSnapshot());
    expect(facet.reason).toBe('notEntitled');
    expect(facet.error).toBe('Syncing files to Tau Cloud is a paid plan feature.');

    /* No backoff re-opens the pull: only the person does. */
    harness.clock.advance(600_000);
    expect(harness.effects.inputsFor('fetch')).toHaveLength(1);

    harness.stop();
  });

  /* D11: a renamed or transferred GitHub repository answers the proxy's typed
   * 409 until the person confirms the new address, so the old one is never
   * fetched again on backoff. */
  it('row 43b (D11): a moved repository fails with its own class instead of retrying on backoff', async () => {
    const harness = start();
    await vi.waitFor(() => {
      expect(harness.effects.running('fetch')).toBe(1);
    });
    harness.effects.settle('fetch', {
      error: Object.assign(new Error('This repository moved to a new address.'), { code: 'REMOTE_MOVED' }),
    });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('failed')).toBe(true);
    });

    expect(selectSyncFacet(harness.actor.getSnapshot()).reason).toBe('moved');
    harness.clock.advance(600_000);
    expect(harness.effects.inputsFor('fetch')).toHaveLength(1);

    harness.stop();
  });

  /* D49: large files on a remote without LFS are refused before any network
   * call, so a retry can never succeed; the person tries again with *Sync now*
   * once the file is removed (rule 19). */
  it('row 43c (D49): a large-file refusal fails with its own class instead of retrying on backoff', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({ type: 'syncNow' });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    harness.effects.settle('push', {
      error: Object.assign(new Error('Large files cannot be backed up to a Git remote: part.step.'), {
        code: 'LFS_REMOTE_UNSUPPORTED',
      }),
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('failed')).toBe(true);
    });

    expect(selectSyncFacet(harness.actor.getSnapshot()).reason).toBe('largeFiles');
    harness.clock.advance(600_000);
    expect(harness.effects.inputsFor('push')).toHaveLength(1);

    /* Rule 19: a save (the file removed) waits for the person's *Sync now*, as every terminal class does. */
    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'save',
      revisionId: 'r-without-part',
      branch: 'main',
    });
    expect(harness.actor.getSnapshot().matches('failed')).toBe(true);
    harness.actor.send({ type: 'syncNow' });
    expect(harness.actor.getSnapshot().matches('failed')).toBe(false);

    harness.stop();
  });

  it('row 38 (C15): a pull that finds this device ahead pushes instead of saying Backed up', async () => {
    const harness = start();

    await vi.waitFor(() => {
      expect(harness.effects.running('fetch')).toBe(1);
    });
    harness.effects.settle('fetch', {
      output: { leases: { [mainRef]: 'remote-head' }, integration: 'ahead' } satisfies SyncFetchActorOutput,
    });

    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    expect(harness.actor.getSnapshot().matches('backedUp')).toBe(false);

    harness.stop();
  });

  it('row 39 (C17): a close cut that arrives during a push is not sent to the debounce', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({ type: 'syncNow' });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'close',
      revisionId: 'r-close',
      branch: 'main',
    });
    harness.effects.settle('push', { output: pushResult({ name: mainRef, status: 'updated', head: 'h1' }) });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });

    /* No clock advance: the document is unloading, and the 2 s window is time
     * it does not have. */
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('pushing')).toBe(true);
    });
    expect(harness.effects.inputsFor('push')).toHaveLength(2);

    harness.stop();
  });

  it('row 40 (C18): a correlated syncNow made offline settles as queued instead of hanging', async () => {
    const harness = start({ online: false });

    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });
    harness.actor.send({ type: 'syncNow', pushId: 'push-1' });

    await vi.waitFor(() => {
      expect(harness.emitted).toContainEqual({ type: 'pushSettled', pushId: 'push-1', outcome: 'queued' });
    });
    expect(harness.parent.events).toContainEqual({ type: 'pushSettled', pushId: 'push-1', outcome: 'queued' });
    expect(selectSyncFacet(harness.actor.getSnapshot()).reason).toBe('offline');

    harness.stop();
  });

  it('row 41 (C19): `Not backed up · n` counts what the remote is owed, not what a fetch could not restore', async () => {
    const harness = start();

    await vi.waitFor(() => {
      expect(harness.effects.running('fetch')).toBe(1);
    });
    harness.effects.settle('fetch', {
      output: {
        leases: {},
        integration: 'upToDate',
        records: [{ name: chatRef, status: 'rejected', head: 'c1', reason: 'This record could not be restored.' }],
      } satisfies SyncFetchActorOutput,
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });

    const facet = selectSyncFacet(harness.actor.getSnapshot());
    expect(facet.pendingCount).toBe(0);
    expect(facet.error).toBe('This record could not be restored.');

    harness.stop();
  });

  it('row 42 (C12): a queue recorded against another remote is paused, never offered to this one', async () => {
    const harness = start({
      pending: {
        version: 1,
        entries: [
          {
            ref: mainRef,
            operation: 'push',
            remote: 'github-42',
            head: 'h-old',
            expected: undefined,
            reason: 'The remote refused this ref.',
            recordedAt: 1,
          },
        ],
      },
    });

    await vi.waitFor(() => {
      expect(harness.effects.running('fetch')).toBe(1);
    });
    harness.effects.settle('fetch', {
      output: { leases: {}, integration: 'upToDate' } satisfies SyncFetchActorOutput,
    });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('backedUp')).toBe(true);
    });

    expect(harness.effects.inputsFor('push')).toEqual([]);
    expect(selectSyncFacet(harness.actor.getSnapshot()).pendingCount).toBe(0);
    /* Paused, not erased: the record still holds it for the remote that owns it. */
    expect(harness.actor.getSnapshot().context.pending).toHaveLength(1);

    harness.stop();
  });

  it('rows 11 + 12: a transport failure is retryable and a reauthorization is not', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({ type: 'syncNow' });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    harness.effects.settle('push', { error: new Error('Failed to fetch') });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });

    /* From `queued` every retry pulls first (row 14), so the second push is
     * reached through `opening`, not straight from the event. */
    harness.actor.send({ type: 'syncNow' });
    await settleWhenRunning(harness.effects, 'fetch', {
      output: { leases: {}, integration: 'upToDate' } satisfies SyncFetchActorOutput,
    });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    /* A thrown full-set push can fail before it reaches the record refs. Its
     * synthetic history queue entry must therefore retry the full set. */
    expect(harness.effects.inputsFor('push').at(-1)).not.toHaveProperty('refs');
    harness.effects.settle('push', {
      error: Object.assign(new Error('Reconnect GitHub'), { code: 'REMOTE_REAUTHORIZATION_REQUIRED' }),
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('failed')).toBe(true);
    });

    harness.stop();
  });

  it('row 13: a queue that will not write is a failure nothing can retry its way out of', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({ type: 'syncNow' });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    harness.effects.settle('push', { output: pushResult({ name: mainRef, status: 'updated', head: 'h1' }) });
    await settleWhenRunning(harness.effects, 'writePending', { error: new Error('read-only store') });

    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('failed')).toBe(true);
    });
    expect(selectSyncFacet(harness.actor.getSnapshot()).error).toBe('read-only store');

    harness.stop();
  });

  it('rows 14 + 15: the backoff retries by pulling first, and offline stops it', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({ type: 'syncNow' });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    harness.effects.settle('push', { error: new Error('offline') });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });

    harness.holds.sendBack('connectivity', { type: 'offline' });
    harness.clock.advance(600_000);
    expect(harness.actor.getSnapshot().matches('queued')).toBe(true);

    harness.holds.sendBack('connectivity', { type: 'online' });
    await vi.waitFor(() => {
      expect(harness.effects.running('fetch')).toBe(1);
    });

    harness.stop();
  });

  it('row 16: offline skips the open pull outright', async () => {
    const harness = start({ online: false });

    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });
    expect(harness.effects.running('fetch')).toBe(0);

    harness.holds.sendBack('connectivity', { type: 'online' });
    await vi.waitFor(() => {
      expect(harness.effects.running('fetch')).toBe(1);
    });

    harness.stop();
  });

  it('rows 17 + 18: the row stops saying Checking… at 3 s and the pull is abandoned at 10 s', async () => {
    const harness = start();

    await vi.waitFor(() => {
      expect(harness.effects.running('fetch')).toBe(1);
    });
    expect(selectSyncFacet(harness.actor.getSnapshot()).state).toBe('checking');

    harness.clock.advance(3000);
    expect(selectSyncFacet(harness.actor.getSnapshot()).state).toBe('pending');
    expect(harness.actor.getSnapshot().matches({ opening: 'fetching' })).toBe(true);

    harness.clock.advance(7000);
    expect(harness.actor.getSnapshot().matches('queued')).toBe(true);

    harness.stop();
  });

  it('row 20: a diverged branch records and announces its conflict', async () => {
    const harness = start();

    await vi.waitFor(() => {
      expect(harness.effects.running('fetch')).toBe(1);
    });
    harness.effects.settle('fetch', {
      output: { leases: { [mainRef]: 'remote-head' }, integration: 'diverged' } satisfies SyncFetchActorOutput,
    });
    await vi.waitFor(() => {
      expect(harness.effects.running('merge')).toBe(1);
    });
    harness.effects.settle('merge', { output: mergeConflict });

    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('conflicted')).toBe(true);
    });
    expect(selectSyncFacet(harness.actor.getSnapshot()).conflictRef).toBe(syncRef);
    expect(harness.parent.events).toContainEqual({
      type: 'mergeConflicted',
      branch: syncBranch,
      into: 'main',
      paths: ['main.scad'],
    });

    harness.stop();
  });

  it('rows 21 + 22: the fetch and the apply each have a failure edge', async () => {
    for (const failing of ['fetch', 'fastForward'] as const) {
      const harness = start();
      // eslint-disable-next-line no-await-in-loop -- two independent schedulers, asserted in order.
      await vi.waitFor(() => {
        expect(harness.effects.running('fetch')).toBe(1);
      });
      if (failing === 'fetch') {
        harness.effects.settle('fetch', { error: new Error('no route') });
      } else {
        harness.effects.settle('fetch', {
          output: { leases: {}, integration: 'fastForward' } satisfies SyncFetchActorOutput,
        });
        // eslint-disable-next-line no-await-in-loop -- see above.
        await vi.waitFor(() => {
          expect(harness.effects.running('fastForward')).toBe(1);
        });
        harness.effects.settle('fastForward', { error: new Error('tree busy') });
      }
      // eslint-disable-next-line no-await-in-loop -- see above.
      await vi.waitFor(() => {
        expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
      });
      harness.stop();
    }
  });

  it('integrates history while failed record projections stay durable and retryable', async () => {
    const harness = start();
    await settleWhenRunning(harness.effects, 'fetch', {
      output: {
        leases: { [mainRef]: 'remote-head' },
        integration: 'fastForward',
        records: [
          { name: chatRef, status: 'updated', head: 'chat-2' },
          { name: 'refs/tau/chats/broken', status: 'rejected', head: 'broken-2', reason: 'invalid chat' },
          { name: 'refs/tau/evidence/exports', status: 'rejected', head: 'exports-2', reason: 'disk full' },
        ],
      } satisfies SyncFetchActorOutput,
    });
    await settleWhenRunning(harness.effects, 'fastForward', {
      output: { checkoutId: 'live', revisionId: 'remote-head', treeId: 'remote-tree' },
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });
    expect(harness.parent.events).toContainEqual({
      type: 'checkoutChanged',
      checkoutId: 'live',
      revisionId: 'remote-head',
      treeId: 'remote-tree',
      branch: 'main',
    });
    expect(harness.actor.getSnapshot().context.pending).toEqual([
      expect.objectContaining({ ref: 'refs/tau/chats/broken', operation: 'projection', reason: 'invalid chat' }),
      expect.objectContaining({ ref: 'refs/tau/evidence/exports', operation: 'projection', reason: 'disk full' }),
    ]);

    harness.clock.advance(5000);
    await settleWhenRunning(harness.effects, 'fetch', {
      output: {
        leases: { [mainRef]: 'remote-head' },
        integration: 'upToDate',
        records: [
          { name: 'refs/tau/chats/broken', status: 'upToDate', head: 'broken-2' },
          { name: 'refs/tau/evidence/exports', status: 'upToDate', head: 'exports-2' },
        ],
      } satisfies SyncFetchActorOutput,
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('backedUp')).toBe(true);
    });
    expect(harness.actor.getSnapshot().context.pending).toEqual([]);

    harness.stop();
  });

  it('row 23: syncNow { pushId } is answered by exactly one correlated pushSettled', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({ type: 'syncNow', pushId: 'publish-1' });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    harness.effects.settle('push', { output: pushResult({ name: mainRef, status: 'updated', head: 'h1' }) });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });

    await vi.waitFor(() => {
      expect(harness.parent.events.filter((event) => event.type === 'pushSettled')).toEqual([
        { type: 'pushSettled', pushId: 'publish-1', outcome: 'backedUp' },
      ]);
    });
    expect(harness.emitted.filter((event) => event['type'] === 'pushSettled')).toEqual([
      { type: 'pushSettled', pushId: 'publish-1', outcome: 'backedUp' } satisfies SyncMachineEmitted,
    ]);
    expect(harness.actor.getSnapshot().context.pushIds).toEqual([]);

    harness.stop();
  });

  it('row 23b: a first publish carries its new remote into the correlated push', async () => {
    const harness = start({ remote: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('noRemote')).toBe(true);
    });

    harness.actor.send({ type: 'syncNow', pushId: 'publish-1', remote: 'tau' });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    expect(harness.effects.inputsFor('push')).toEqual([{ remote: 'tau', branch: 'main', leases: {} }]);

    harness.effects.settle('push', { output: pushResult({ name: mainRef, status: 'updated', head: 'h1' }) });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.parent.events).toContainEqual({
        type: 'pushSettled',
        pushId: 'publish-1',
        outcome: 'backedUp',
      });
    });

    harness.stop();
  });

  it('row 24: the over-quota file list is forwarded to remote.machine through the parent', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({ type: 'syncNow' });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    harness.effects.settle('push', {
      output: {
        refs: [{ name: mainRef, status: 'rejected', head: undefined, reason: 'over quota' }],
        overQuota: ['models/big.step'],
      } satisfies SyncPushActorOutput,
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });

    await vi.waitFor(() => {
      expect(harness.parent.events).toContainEqual({
        type: 'remote',
        event: { type: 'quotaRefused', paths: ['models/big.step'] },
      });
    });

    harness.stop();
  });

  it('row 64 (F9): a push that moved a ref asks remote.machine to read storage again; a refused one does not', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({ type: 'syncNow' });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    harness.effects.settle('push', {
      output: {
        refs: [{ name: mainRef, status: 'rejected', head: undefined, reason: 'over quota' }],
        overQuota: ['models/big.step'],
      } satisfies SyncPushActorOutput,
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.parent.events).toContainEqual(expect.objectContaining({ type: 'remote' }));
    });
    expect(harness.parent.events).not.toContainEqual({ type: 'remote', event: { type: 'pushed' } });
    harness.stop();

    const moved = start();
    await openCleanly(moved);
    moved.actor.send({ type: 'syncNow' });
    await vi.waitFor(() => {
      expect(moved.effects.running('push')).toBe(1);
    });
    moved.effects.settle('push', { output: pushResult({ name: mainRef, status: 'updated', head: 'h1' }) });
    await settleWhenRunning(moved.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(moved.parent.events).toContainEqual({ type: 'remote', event: { type: 'pushed' } });
    });
    moved.stop();
  });

  it('rows 25 + 26: disconnecting stops the scheduler and connecting starts it with a pull', async () => {
    const harness = start({ remote: undefined });

    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('noRemote')).toBe(true);
    });
    harness.actor.send({ type: 'remoteConnected', remote: 'tau' });
    await vi.waitFor(() => {
      expect(harness.effects.running('fetch')).toBe(1);
    });

    harness.actor.send({ type: 'remoteDisconnected' });
    expect(harness.actor.getSnapshot().matches('noRemote')).toBe(true);

    harness.stop();
  });

  it('row 27: a pagehide POST the document made itself is answered into the queue', async () => {
    const harness = start({
      pending: {
        version: 1,
        entries: [{ ref: mainRef, head: 'local', expected: undefined, reason: 'unacknowledged', recordedAt: 1 }],
      },
      online: false,
    });

    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });
    expect(selectSyncFacet(harness.actor.getSnapshot()).pendingCount).toBe(1);

    harness.actor.send({
      type: 'pushAcknowledged',
      refs: [{ name: mainRef, status: 'updated', head: 'local' }],
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });

    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('backedUp')).toBe(true);
    });
    expect(selectSyncFacet(harness.actor.getSnapshot()).pendingCount).toBe(0);

    harness.stop();
  });

  it('row 28 (red pin a): a close revision minted offline survives an actor restart through the record', async () => {
    const recorded: SyncQueueRecord[] = [];
    const effects = createFakePromiseActors();
    const holds = createFakeCallbackActors();
    const guard = guardActors();
    const clock = new StepClock();
    /* One durable record shared by the two lives of the scheduler: a restart
     * reads what the first life wrote, and nothing else (D29). */
    const store = { current: emptyQueue };
    const actors = (): SyncActors => ({
      readPending: createAsyncLogic({
        run: async () => {
          await Promise.resolve();
          return store.current;
        },
      }),
      writePending: createAsyncLogic({
        run: async ({ input }) => {
          await Promise.resolve();
          store.current = (input as { record: SyncQueueRecord }).record;
          recorded.push(store.current);
        },
      }),
      readRemote: createAsyncLogic<SyncReadRemoteActorOutput, Readonly<{ projectId: string }>>({
        run: async () => {
          await Promise.resolve();
          return { remote: 'tau' };
        },
      }),
      push: effects.actor('push'),
      fetch: effects.actor('fetch'),
      fastForward: effects.actor('fastForward'),
      merge: effects.actor('merge'),
      connectivity: holds.actor('connectivity'),
      remoteMoves: holds.actor('remoteMoves'),
    });

    const first = createActor(syncMachine.provide({ actors: actors() }), {
      clock,
      inspect: guard.inspect,
      input: { projectId: 'p1', online: true },
    });
    first.start();
    await vi.waitFor(() => {
      expect(effects.running('fetch')).toBe(1);
    });
    effects.settle('fetch', { output: { leases: {}, integration: 'upToDate' } satisfies SyncFetchActorOutput });
    await vi.waitFor(() => {
      expect(first.getSnapshot().matches('backedUp')).toBe(true);
    });

    holds.sendBack('connectivity', { type: 'offline' });
    first.send({ type: 'revisionMinted', checkoutId: 'live', trigger: 'close', revisionId: 'close-1', branch: 'main' });
    await vi.waitFor(() => {
      expect(effects.running('push')).toBe(1);
    });
    effects.settle('push', {
      output: pushResult({ name: mainRef, status: 'rejected', head: 'close-1', reason: 'the network is unreachable' }),
    });
    await vi.waitFor(() => {
      expect(recorded.at(-1)?.entries.map((entry) => entry.ref)).toEqual([mainRef]);
    });
    first.stop();

    const second = createActor(syncMachine.provide({ actors: actors() }), {
      clock,
      inspect: guard.inspect,
      input: { projectId: 'p1', online: false },
    });
    second.start();
    await vi.waitFor(() => {
      expect(second.getSnapshot().context.pending.map((entry) => entry.ref)).toEqual([mainRef]);
    });
    expect(selectSyncFacet(second.getSnapshot())).toMatchObject({ state: 'queued', pendingCount: 1 });

    second.stop();
  });

  it('row 31 (review 2 R4): a revision minted during a push that succeeds is pushed, not forgotten', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'save',
      revisionId: 'r1',
      branch: 'main',
    });
    harness.clock.advance(2000);
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    /* Minted *during* the push: the pack on the wire was built before it. */
    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'save',
      revisionId: 'r2',
      branch: 'main',
    });
    harness.effects.settle('push', { output: pushResult({ name: mainRef, status: 'updated', head: 'r1' }) });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });

    /* Not `Backed up` over an unsent revision: through `pending`, so the
     * debounce still coalesces, and then a second push. */
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('pending')).toBe(true);
    });
    harness.clock.advance(2000);
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    expect(harness.actor.getSnapshot().context.localHead).toBe('r2');

    harness.stop();
  });

  it('row 32 (review 2 R6): a composed conflict leaves `Needs resolution` by pulling again', async () => {
    const harness = start();
    const conflict = async (): Promise<void> => {
      await settleWhenRunning(harness.effects, 'fetch', {
        output: { leases: {}, integration: 'diverged' } satisfies SyncFetchActorOutput,
      });
      await settleWhenRunning(harness.effects, 'merge', { output: mergeConflict });
      await vi.waitFor(() => {
        expect(harness.actor.getSnapshot().matches('conflicted')).toBe(true);
      });
    };
    await conflict();

    /* W10's resolution settled on this branch; nothing else has happened, so
     * without this event the row would still read `Needs resolution`. */
    harness.actor.send({ type: 'conflictResolved', ref: mainRef });
    await vi.waitFor(() => {
      expect(harness.effects.running('fetch')).toBe(1);
    });
    expect(selectSyncFacet(harness.actor.getSnapshot())).toMatchObject({
      state: 'checking',
      conflictRef: undefined,
    });

    /* A resolution on some *other* branch is not this machine's conflict. */
    await conflict();
    harness.actor.send({ type: 'conflictResolved', ref: 'refs/heads/other' });
    expect(harness.actor.getSnapshot().matches('conflicted')).toBe(true);

    harness.stop();
  });

  it('row 32b (D14): a conflict pushes its line alone, and a remote move pulls the decision in', async () => {
    const harness = start();
    await settleWhenRunning(harness.effects, 'fetch', {
      output: { leases: { [mainRef]: 'remote-head' }, integration: 'diverged' } satisfies SyncFetchActorOutput,
    });
    await settleWhenRunning(harness.effects, 'merge', { output: mergeConflict });

    /* The line travels on its own: the diverged `main` would sink an atomic set. */
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    expect(harness.effects.inputsFor('push').at(-1)).toMatchObject({ refs: [syncRef] });
    harness.effects.settle('push', { output: pushResult({ name: syncRef, status: 'updated', head: 'c1' }) });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().context.leases[syncRef]).toBe('c1');
    });
    expect(harness.actor.getSnapshot().matches('conflicted')).toBe(true);

    /* Another device landed the decision: this one pulls rather than waiting for *Sync now*. */
    harness.actor.send({ type: 'remoteMoved', generation: 2, refs: [mainRef] });
    await vi.waitFor(() => {
      expect(harness.effects.running('fetch')).toBe(1);
    });

    harness.stop();
  });

  it('row 32d (D14-P): a conflict line the push could not offer is reported and offered again after the backoff', async () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = start();
    const reachConflict = async (): Promise<void> => {
      await settleWhenRunning(harness.effects, 'fetch', {
        output: { leases: { [mainRef]: 'remote-head' }, integration: 'diverged' } satisfies SyncFetchActorOutput,
      });
      await settleWhenRunning(harness.effects, 'merge', { output: mergeConflict });
      await vi.waitFor(() => {
        expect(harness.effects.running('push')).toBe(1);
      });
      expect(harness.effects.inputsFor('push').at(-1)).toMatchObject({ refs: [syncRef] });
    };
    await reachConflict();

    /* Another device's push committed first (`503 GIT_PUSH_RACE_LOST`): said, and still owed. */
    const thrown = new RevisionPortError('REMOTE_UNAVAILABLE', 'Another push for this project committed first; retry.');
    harness.effects.settle('push', { error: thrown });
    await vi.waitFor(() => {
      expect(reported).toHaveBeenCalledWith('[revisions] conflict line push', thrown);
    });
    expect(selectSyncFacet(harness.actor.getSnapshot()).state).toBe('conflicted');
    harness.clock.advance(5000);
    await reachConflict();

    /* A refused line is owed the same way. */
    harness.effects.settle('push', {
      output: pushResult({ name: syncRef, status: 'rejected', head: 'c1', reason: 'leaseLost' }),
    });
    await vi.waitFor(() => {
      expect(reported).toHaveBeenCalledWith('[revisions] conflict line refused', syncRef, 'leaseLost');
    });
    harness.clock.advance(10_000);
    await reachConflict();

    /* A terminal class waits for a person, as every terminal class does (rule 19). */
    harness.effects.settle('push', { error: new RevisionPortError('REMOTE_UNAUTHORIZED', 'Sign in again.') });
    await vi.waitFor(() => {
      expect(reported).toHaveBeenCalledTimes(3);
    });
    harness.clock.advance(300_000);
    expect(harness.effects.inputsFor('fetch')).toHaveLength(3);
    expect(harness.actor.getSnapshot().matches('conflicted')).toBe(true);
    /* Three pulls reached the one waiting conflict; the page heard it once (c460f9ec6). */
    expect(harness.parent.events.filter((event) => event.type === 'mergeConflicted')).toHaveLength(1);

    harness.stop();
    reported.mockRestore();
  });

  it('row 32c (D14): a decision landed while backed up is pushed like a mint', async () => {
    const harness = start();
    await openCleanly(harness);

    /* A conflict fetched from another device, decided here: the merge is this device's own and unsent. */
    harness.actor.send({ type: 'conflictResolved', ref: 'refs/heads/conflicts/main/device-b', revisionId: 'r-merge' });
    harness.clock.advance(2000);
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });

    harness.stop();
  });

  it('row 33 (review 2 R7): `close` while the pull is running is not dropped', async () => {
    const harness = start();
    await vi.waitFor(() => {
      expect(harness.effects.running('fetch')).toBe(1);
    });

    /* `opening` has no `close` handler of its own: the root remembers it, and
     * the state that finishes acts on it. */
    harness.actor.send({ type: 'close' });
    harness.effects.settle('fetch', {
      output: { leases: { [mainRef]: 'remote-head' }, integration: 'upToDate' } satisfies SyncFetchActorOutput,
    });

    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });

    harness.stop();
  });

  it('says a lost lease in words, never as the port code (D39)', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'close',
      revisionId: 'r1',
      branch: 'main',
    });
    await settleWhenRunning(harness.effects, 'push', {
      output: pushResult({ name: mainRef, status: 'rejected', head: undefined, reason: 'leaseLost' }),
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });

    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().context.error).toBe(
        'This branch changed on the remote; this project will catch up and try again.',
      );
    });
    harness.stop();
  });

  it('names another checkout’s branch whose lease was lost', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'close',
      revisionId: 'r1',
      branch: 'main',
    });
    await settleWhenRunning(harness.effects, 'push', {
      output: pushResult(
        { name: mainRef, status: 'updated', head: 'r1' },
        { name: 'refs/heads/feature', status: 'rejected', head: 'f1', reason: 'leaseLost' },
      ),
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });

    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().context.error).toBe(
        'feature changed on the remote; this project will catch up and try again.',
      );
    });
    harness.stop();
  });

  it('row 34 (review 2 R9, W13c C-c): a refused chat ref never narrows history away, and a throw records only what is owed', async () => {
    const harness = start();
    await openCleanly(harness);

    /* One refused chat ref, so the queue holds that ref and the next offer is
     * narrowed to it. */
    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'close',
      revisionId: 'r1',
      branch: 'main',
    });
    await settleWhenRunning(harness.effects, 'push', {
      output: pushResult(
        { name: mainRef, status: 'updated', head: 'r1' },
        { name: chatRef, status: 'rejected', head: undefined, reason: 'not allowed here' },
      ),
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });

    /* A revision minted while the chat ref is still owed. */
    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'save',
      revisionId: 'r2',
      branch: 'main',
    });
    harness.clock.advance(5000);
    await settleWhenRunning(harness.effects, 'fetch', {
      output: { leases: { [mainRef]: 'r1' }, integration: 'ahead' } satisfies SyncFetchActorOutput,
    });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    /* The retry offers both sets: a refused record never keeps `main` from the remote (rule 10). */
    expect(harness.effects.inputsFor('push').at(-1)).not.toHaveProperty('refs');

    /* A transport throw reports no refs at all, so the outcome is synthesised
     * from what is owed: the unsent `main` and the chat ref, nothing else. */
    harness.effects.settle('push', { error: new Error('the network is unreachable') });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });
    expect(harness.actor.getSnapshot().context.pending.map((entry) => [entry.ref, entry.head])).toEqual([
      [chatRef, undefined],
      [mainRef, 'r2'],
    ]);

    harness.stop();
  });

  it('offers the branch again when a revision is minted while a refused chat ref is retried', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'close',
      revisionId: 'r1',
      branch: 'main',
    });
    await settleWhenRunning(harness.effects, 'push', {
      output: pushResult(
        { name: mainRef, status: 'updated', head: 'r1' },
        { name: chatRef, status: 'rejected', head: undefined, reason: 'does not fast-forward' },
      ),
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });

    /* The chat is still refused, but `r2` has never been offered: the push
     * must carry both sets, not only the chat ref it is retrying. */
    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'close',
      revisionId: 'r2',
      branch: 'main',
    });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    expect(harness.effects.inputsFor('push').at(-1)).not.toHaveProperty('refs');

    harness.stop();
  });

  it('row 29: starts and stops headlessly, keeps a serializable context and exports one machine', async () => {
    const harness = start();

    await vi.waitFor(() => {
      expect(harness.effects.running('fetch')).toBe(1);
    });
    const { parentRef: _parentRef, ...serializable } = harness.actor.getSnapshot().context;
    expect(Object.values(serializable).every((value) => typeof value !== 'function')).toBe(true);
    /* `structuredClone` is the deep-copy rule's own answer, and it also proves
     * the point: a context holding a function or an actor ref would throw. */
    expect(structuredClone(serializable)).toBeTypeOf('object');
    expect(Object.values(machineModule).filter((value) => isMachine(value))).toEqual([syncMachine]);

    harness.actor.stop();
    expect(harness.actor.getSnapshot().status).toBe('stopped');
    harness.parent.stop();
  });

  /*
   * **B2** (policy rule 20): *mint → push request issued, connected and online,
   * within 2.1 s — the debounce plus 100 ms.*
   *
   * It lives here rather than in `apps/ui-e2e` for two reasons. The budget is a
   * property of this machine's debounce, and contract §7 gives a benchmark to
   * the lane that owns the file under test; and `apps/ui-e2e` boots no API, no
   * account and no remote, so it cannot reach the *connected and online*
   * precondition the row states (lane C proved that, `C-ui/report.md` §2.1).
   *
   * Driven by the machine's *own* clock, never a wall clock: a millisecond row
   * measured against `Date.now()` would be a reading of the machine this runs
   * on, and the coordinator's verification of lane B showed a B-row varying 5×
   * with load. What is asserted here is what the machine *schedules*, which is
   * a property of the code.
   */
  it('B2 (rule 20): a mint on a connected, online project issues its push inside the debounce plus 100 ms', async () => {
    const harness = start();
    await openCleanly(harness);
    expect(selectSyncFacet(harness.actor.getSnapshot()).online).toBe(true);
    expect(harness.actor.getSnapshot().context.remote).toBe('tau');

    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'save',
      revisionId: 'r1',
      branch: 'main',
    });

    /* Nothing at the debounce's last instant: the window is the whole of the
       wait, and a push before it would defeat the coalescing row 5 pins. */
    harness.clock.advance(1999);
    expect(harness.effects.running('push')).toBe(0);

    /* And the request is out within the remaining 101 ms of the budget. */
    harness.clock.advance(101);
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    expect(harness.effects.inputsFor('push')).toHaveLength(1);

    harness.effects.settle('push', { output: pushResult({ name: mainRef, status: 'updated', head: 'h1' }) });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });

    harness.stop();
  });

  it('B2: an offline or unconnected project issues nothing, which is what makes the row about the debounce', async () => {
    const offline = start({ online: false });
    offline.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'save',
      revisionId: 'r1',
      branch: 'main',
    });
    offline.clock.advance(2100);
    expect(offline.effects.running('push')).toBe(0);
    offline.stop();

    const unconnected = start({ remote: undefined });
    await vi.waitFor(() => {
      expect(unconnected.actor.getSnapshot().matches('noRemote')).toBe(true);
    });
    unconnected.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'save',
      revisionId: 'r1',
      branch: 'main',
    });
    unconnected.clock.advance(2100);
    expect(unconnected.effects.running('push')).toBe(0);
    unconnected.stop();
  });

  /* L7 F3, RM-R11: sync dropped `syncNow` in four states, and publish waited out its 60 s bound. */
  it('should answer every syncNow including one that arrives while pulling', async () => {
    const harness = start();
    await vi.waitFor(() => {
      expect(harness.effects.running('fetch')).toBe(1);
    });

    harness.actor.send({ type: 'syncNow', pushId: 'while-pulling' });
    harness.effects.settle('fetch', {
      output: { leases: { [mainRef]: 'remote-head' }, integration: 'ahead' } satisfies SyncFetchActorOutput,
    });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    harness.actor.send({ type: 'syncNow', pushId: 'while-pushing' });
    harness.effects.settle('push', { output: pushResult({ name: mainRef, status: 'updated', head: 'h1' }) });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    harness.effects.settle('push', { output: pushResult({ name: mainRef, status: 'updated', head: 'h1' }) });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });

    await vi.waitFor(() => {
      expect(harness.parent.events.filter((event) => event.type === 'pushSettled')).toEqual([
        { type: 'pushSettled', pushId: 'while-pulling', outcome: 'backedUp' },
        { type: 'pushSettled', pushId: 'while-pushing', outcome: 'backedUp' },
      ]);
    });

    harness.stop();
  });

  it('answers a syncNow on a project with no remote at once', async () => {
    const harness = start({ remote: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('noRemote')).toBe(true);
    });

    harness.actor.send({ type: 'syncNow', pushId: 'publish-1' });

    expect(harness.parent.events).toContainEqual({ type: 'pushSettled', pushId: 'publish-1', outcome: 'failed' });
    expect(harness.actor.getSnapshot().matches('noRemote')).toBe(true);

    harness.stop();
  });

  /* A12, RM-R3: `pushing` had no deadline, so publish kept its own 60 s bound on a peer. */
  it('should fail a push that exceeds its network deadline and answer every carried requester', async () => {
    const harness = start();
    await vi.waitFor(() => {
      expect(harness.effects.running('fetch')).toBe(1);
    });
    harness.actor.send({ type: 'syncNow', pushId: 'publish-1' });
    harness.actor.send({ type: 'syncNow', pushId: 'publish-2' });
    harness.effects.settle('fetch', {
      output: { leases: { [mainRef]: 'remote-head' }, integration: 'ahead' } satisfies SyncFetchActorOutput,
    });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });

    harness.clock.advance(60_000);
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });

    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });
    expect(harness.parent.events.filter((event) => event.type === 'pushSettled')).toEqual([
      { type: 'pushSettled', pushId: 'publish-1', outcome: 'queued' },
      { type: 'pushSettled', pushId: 'publish-2', outcome: 'queued' },
    ]);
    expect(harness.actor.getSnapshot().context).toMatchObject({ failure: 'retry', reason: 'offline' });
    expect(harness.actor.getSnapshot().context.pending.map((entry) => entry.ref)).toEqual([mainRef]);

    harness.stop();
  });

  it('pushes a mint on another branch without taking it for this branch’s head', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'linked',
      trigger: 'turn',
      revisionId: 'r-b',
      branch: 'agent/b',
    });

    expect(harness.actor.getSnapshot().context.localHead).toBeUndefined();
    expect(harness.actor.getSnapshot().matches('pending')).toBe(true);

    harness.stop();
  });

  it('should answer every public event in every reachable state', () => {
    const invokeOf = (path: string): string => syncMachine.getStateNodeById(`sync.${path}`).invoke[0]?.id ?? '';
    const [
      queueInvoke,
      remoteInvoke,
      fetchInvoke,
      fastForwardInvoke,
      mergeInvoke,
      pushInvoke,
      recordInvoke,
      offerInvoke,
    ] = [
      'reading.queue',
      'reading.remote',
      'opening.fetching',
      'opening.fastForwarding',
      'opening.merging',
      'pushing',
      'recording',
      'conflicted.offering',
    ].map((path) => invokeOf(path));
    const publicEvents: readonly SyncMachineEvent[] = [
      { type: 'revisionMinted', checkoutId: 'live', trigger: 'save', revisionId: 'r1', branch: 'main' },
      { type: 'revisionMinted', checkoutId: 'live', trigger: 'close', revisionId: 'r2', branch: 'main' },
      { type: 'recordsChanged' },
      { type: 'syncNow', pushId: 'push-1', remote: 'tau' },
      { type: 'open' },
      { type: 'close' },
      { type: 'remoteConnected', remote: 'tau' },
      { type: 'remoteDisconnected' },
      { type: 'online' },
      { type: 'offline' },
      { type: 'pushAcknowledged', refs: [{ name: mainRef, status: 'updated', head: 'r1' }] },
      { type: 'pushFailed', reason: 'the network is unreachable' },
      { type: 'conflictResolved', ref: syncRef, revisionId: 'r3' },
      { type: 'leaseRetired', runId: 'run-1' },
      { type: 'remoteMoved', generation: 1, refs: [mainRef] },
      { type: 'remoteRefused', code: 'NOT_FOUND', message: 'not a member' },
      { type: 'branchChanged', branch: 'feature' },
      /* The root's answers to this machine's own merge cut (`sync-<n>`, D12). */
      {
        type: 'revisionMinted',
        checkoutId: 'live',
        trigger: 'merge',
        revisionId: 'r4',
        branch: 'main',
        requestId: 'sync-1',
      },
      { type: 'nothingToSave', checkoutId: 'live', trigger: 'merge', requestId: 'sync-1' },
      { type: 'cutFailed', checkoutId: 'live', trigger: 'merge', requestId: 'sync-1', reason: 'disk full' },
      { type: 'casLost', checkoutId: 'live', trigger: 'merge', requestId: 'sync-1' },
    ];
    const options = {
      input: { projectId: 'p1' },
      /* Effect outcomes reach the states behind each invoke; they are not public. */
      events: [
        ...publicEvents,
        { type: `xstate.done.actor.${queueInvoke}`, output: emptyQueue },
        { type: `xstate.done.actor.${remoteInvoke}`, output: { remote: 'tau' } },
        { type: `xstate.done.actor.${remoteInvoke}`, output: { remote: undefined } },
        ...(['upToDate', 'ahead', 'fastForward', 'diverged'] as const).map((integration) => ({
          type: `xstate.done.actor.${fetchInvoke}`,
          output: { leases: { [mainRef]: 'remote-head' }, integration } satisfies SyncFetchActorOutput,
        })),
        { type: `xstate.error.actor.${fetchInvoke}`, error: new Error('offline') },
        {
          type: `xstate.done.actor.${fastForwardInvoke}`,
          output: { checkoutId: 'live', revisionId: 'remote-head', treeId: 'remote-tree' },
        },
        ...(['leased', 'dirty'] as const).map((hold) => ({
          type: `xstate.done.actor.${fastForwardInvoke}`,
          output: { status: 'held', hold, checkoutId: 'live', revisionId: 'remote-head' },
        })),
        { type: `xstate.done.actor.${mergeInvoke}`, output: mergeConflict },
        { type: `xstate.done.actor.${mergeInvoke}`, output: { status: 'merged' } },
        {
          type: `xstate.done.actor.${offerInvoke}`,
          output: pushResult({ name: syncRef, status: 'updated', head: 'r3' }),
        },
        {
          type: `xstate.done.actor.${offerInvoke}`,
          output: pushResult({ name: syncRef, status: 'rejected', head: 'r3', reason: 'pre-receive hook declined' }),
        },
        { type: `xstate.error.actor.${offerInvoke}`, error: new Error('offline') },
        {
          type: `xstate.done.actor.${pushInvoke}`,
          output: pushResult({ name: mainRef, status: 'updated', head: 'r1' }),
        },
        {
          type: `xstate.done.actor.${pushInvoke}`,
          output: pushResult({ name: mainRef, status: 'rejected', head: 'r1', reason: 'leaseLost' }),
        },
        {
          type: `xstate.error.actor.${pushInvoke}`,
          error: Object.assign(new Error('paid plan feature'), { code: 'REMOTE_NOT_ENTITLED' }),
        },
        { type: `xstate.done.actor.${recordInvoke}`, output: undefined },
        { type: `xstate.error.actor.${recordInvoke}`, error: new Error('read-only store') },
      ],
      limit: 5000,
      serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
    };

    expect(unansweredEvents(syncMachine, options)).toEqual([]);
    expect(unreachedStates(syncMachine, options)).toEqual([]);
  });

  const settledPushes = (harness: Harness): ReadonlyArray<Record<string, unknown>> =>
    harness.parent.events.filter((event) => event.type === 'pushSettled');

  it('row 44 (L2-F3): a syncNow that arrives mid-push settles once, with the next push, not at publish’s 60 s', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'close',
      revisionId: 'r1',
      branch: 'main',
    });
    expect(harness.actor.getSnapshot().matches('pushing')).toBe(true);
    harness.actor.send({ type: 'syncNow', pushId: 'publish-1', remote: 'tau' });
    harness.effects.settle('push', { output: pushResult({ name: mainRef, status: 'updated', head: 'r1' }) });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    /* The push that was running was assembled before the request (row 65). */
    await settleWhenRunning(harness.effects, 'push', {
      output: pushResult({ name: mainRef, status: 'upToDate', head: 'r1' }),
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });

    await vi.waitFor(() => {
      expect(settledPushes(harness)).toEqual([{ type: 'pushSettled', pushId: 'publish-1', outcome: 'backedUp' }]);
    });
    expect(harness.effects.inputsFor('push')).toHaveLength(2);

    harness.stop();
  });

  it('row 65 (W15 F1): a correlated syncNow during a running push is answered by a push that carries the head current at the request', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'save',
      revisionId: 'r1',
      branch: 'main',
    });
    harness.clock.advance(2000);
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    /* The requester mints, then asks: the pack on the wire was built before r2. */
    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'save',
      revisionId: 'r2',
      branch: 'main',
    });
    harness.actor.send({ type: 'syncNow', pushId: 'save-1' });
    harness.effects.settle('push', { output: pushResult({ name: mainRef, status: 'updated', head: 'r1' }) });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    expect(settledPushes(harness)).toEqual([]);
    expect(harness.actor.getSnapshot().context.localHead).toBe('r2');
    harness.effects.settle('push', { output: pushResult({ name: mainRef, status: 'updated', head: 'r2' }) });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(settledPushes(harness)).toEqual([{ type: 'pushSettled', pushId: 'save-1', outcome: 'backedUp' }]);
    });

    /* The same while the settled push is still being recorded. */
    harness.actor.send({ type: 'syncNow' });
    await settleWhenRunning(harness.effects, 'push', {
      output: pushResult({ name: mainRef, status: 'upToDate', head: 'r2' }),
    });
    await vi.waitFor(() => {
      expect(harness.effects.running('writePending')).toBe(1);
    });
    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'save',
      revisionId: 'r3',
      branch: 'main',
    });
    harness.actor.send({ type: 'syncNow', pushId: 'save-2' });
    harness.effects.settle('writePending', { output: undefined });
    await settleWhenRunning(harness.effects, 'push', {
      output: pushResult({ name: mainRef, status: 'updated', head: 'r3' }),
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(settledPushes(harness)).toEqual([
        { type: 'pushSettled', pushId: 'save-1', outcome: 'backedUp' },
        { type: 'pushSettled', pushId: 'save-2', outcome: 'backedUp' },
      ]);
    });
    expect(harness.effects.inputsFor('push')).toHaveLength(4);

    harness.stop();
  });

  /** Park a correlated request behind a running, uncorrelated push. */
  const parkBehindPush = async (harness: Harness): Promise<void> => {
    await openCleanly(harness);
    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'close',
      revisionId: 'r1',
      branch: 'main',
    });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    harness.actor.send({ type: 'syncNow', pushId: 'save-1' });
  };

  it('row 66 (RV-W15): a request parked behind a push that `open` abandons is answered once, by the reopened push', async () => {
    const harness = start();
    await parkBehindPush(harness);

    harness.actor.send({ type: 'open' });
    /* The abandoned push's answer reaches a stopped child and changes nothing. */
    harness.effects.settle('push', { output: pushResult({ name: mainRef, status: 'updated', head: 'r1' }) });
    await settleWhenRunning(harness.effects, 'fetch', {
      output: { leases: { [mainRef]: 'remote-head' }, integration: 'upToDate' } satisfies SyncFetchActorOutput,
    });
    await settleWhenRunning(harness.effects, 'push', {
      output: pushResult({ name: mainRef, status: 'updated', head: 'r1' }),
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });

    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('backedUp')).toBe(true);
    });
    expect(settledPushes(harness)).toEqual([{ type: 'pushSettled', pushId: 'save-1', outcome: 'backedUp' }]);

    harness.stop();
  });

  it('row 67 (RV-W15): a request parked behind a push is answered failed once when the remote is disconnected', async () => {
    const harness = start();
    await parkBehindPush(harness);

    harness.actor.send({ type: 'remoteDisconnected' });

    await vi.waitFor(() => {
      expect(settledPushes(harness)).toEqual([{ type: 'pushSettled', pushId: 'save-1', outcome: 'failed' }]);
    });
    expect(harness.actor.getSnapshot().matches('noRemote')).toBe(true);
    expect(harness.actor.getSnapshot().context.nextPushIds).toEqual([]);

    harness.stop();
  });

  it('row 68 (RV-W15): a request parked behind a push that throws is answered once, by the retry', async () => {
    const harness = start();
    await parkBehindPush(harness);

    harness.effects.settle('push', { error: new Error('network down') });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    /* The redelivered request retries at once rather than waiting out the backoff. */
    await settleWhenRunning(harness.effects, 'fetch', {
      output: { leases: { [mainRef]: 'remote-head' }, integration: 'upToDate' } satisfies SyncFetchActorOutput,
    });
    await settleWhenRunning(harness.effects, 'push', {
      output: pushResult({ name: mainRef, status: 'updated', head: 'r1' }),
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });

    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('backedUp')).toBe(true);
    });
    expect(settledPushes(harness)).toEqual([{ type: 'pushSettled', pushId: 'save-1', outcome: 'backedUp' }]);

    harness.stop();
  });

  it('row 45 (L2-F3): a syncNow during the open pull is served by a push once the pull lands', async () => {
    const harness = start();
    await vi.waitFor(() => {
      expect(harness.effects.running('fetch')).toBe(1);
    });

    harness.actor.send({ type: 'syncNow', pushId: 'publish-1' });
    harness.effects.settle('fetch', {
      output: { leases: { [mainRef]: 'remote-head' }, integration: 'upToDate' } satisfies SyncFetchActorOutput,
    });
    /* Nothing is owed and nothing was minted: the correlated request alone is
     * what makes this open push rather than settle into `backedUp` unanswered. */
    await settleWhenRunning(harness.effects, 'push', {
      output: pushResult({ name: mainRef, status: 'upToDate', head: 'remote-head' }),
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });

    await vi.waitFor(() => {
      expect(settledPushes(harness)).toEqual([{ type: 'pushSettled', pushId: 'publish-1', outcome: 'backedUp' }]);
    });

    harness.stop();
  });

  it('row 46 (L2-F3): a pull that fails or runs out of time answers a waiting syncNow as queued', async () => {
    const failing = start();
    await vi.waitFor(() => {
      expect(failing.effects.running('fetch')).toBe(1);
    });
    failing.actor.send({ type: 'syncNow', pushId: 'publish-1' });
    failing.effects.settle('fetch', { error: new Error('Failed to fetch') });
    await vi.waitFor(() => {
      expect(settledPushes(failing)).toEqual([{ type: 'pushSettled', pushId: 'publish-1', outcome: 'queued' }]);
    });
    failing.stop();

    const slow = start();
    await vi.waitFor(() => {
      expect(slow.effects.running('fetch')).toBe(1);
    });
    slow.actor.send({ type: 'syncNow', pushId: 'publish-2' });
    slow.clock.advance(10_000);
    expect(settledPushes(slow)).toEqual([{ type: 'pushSettled', pushId: 'publish-2', outcome: 'queued' }]);
    slow.stop();
  });

  it('row 47 (L2-F3): with no remote to push to, a syncNow is answered failed at once', async () => {
    const harness = start({ remote: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('noRemote')).toBe(true);
    });

    harness.actor.send({ type: 'syncNow', pushId: 'publish-1' });

    expect(settledPushes(harness)).toEqual([{ type: 'pushSettled', pushId: 'publish-1', outcome: 'failed' }]);
    expect(harness.effects.running('push')).toBe(0);

    harness.stop();
  });

  it('row 48 (L2-F6): a terminal refusal followed by a save pushes nothing until Sync now', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({ type: 'syncNow' });
    await settleWhenRunning(harness.effects, 'push', {
      error: Object.assign(new Error('Tau Cloud is not part of this plan.'), { code: 'REMOTE_NOT_ENTITLED' }),
    });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('failed')).toBe(true);
    });

    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'save',
      revisionId: 'r2',
      branch: 'main',
    });
    harness.clock.advance(600_000);

    expect(harness.actor.getSnapshot().matches('failed')).toBe(true);
    expect(harness.effects.inputsFor('push')).toHaveLength(1);
    expect(harness.effects.running('fetch')).toBe(0);

    /* The save is owed, not forgotten: Sync now pulls and then pushes it. */
    harness.actor.send({ type: 'syncNow' });
    await settleWhenRunning(harness.effects, 'fetch', {
      output: { leases: {}, integration: 'upToDate' } satisfies SyncFetchActorOutput,
    });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });

    harness.stop();
  });

  it('row 49 (L2-F6): a mint that lands during a failed push retries no earlier than the backoff', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.actor.send({ type: 'syncNow' });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'save',
      revisionId: 'r2',
      branch: 'main',
    });
    harness.effects.settle('push', { error: new Error('Failed to fetch') });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });

    /* A later save waits too: `queued` is left by its backoff, not by work. */
    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'save',
      revisionId: 'r3',
      branch: 'main',
    });
    harness.clock.advance(4999);
    expect(harness.effects.inputsFor('push')).toHaveLength(1);
    expect(harness.effects.running('fetch')).toBe(0);

    harness.clock.advance(1);
    await settleWhenRunning(harness.effects, 'fetch', {
      output: { leases: {}, integration: 'upToDate' } satisfies SyncFetchActorOutput,
    });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    expect(harness.effects.inputsFor('push')).toHaveLength(2);

    harness.stop();
  });

  it('row 50 (D22): a damaged repository fails after one push and stays failed; a race-lost 503 retries', async () => {
    const damaged = start();
    await openCleanly(damaged);
    damaged.actor.send({ type: 'syncNow' });
    await settleWhenRunning(damaged.effects, 'push', {
      error: Object.assign(new Error("Tau: this project's cloud copy is damaged"), { code: 'REMOTE_DAMAGED' }),
    });
    await settleWhenRunning(damaged.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(damaged.actor.getSnapshot().matches('failed')).toBe(true);
    });
    expect(selectSyncFacet(damaged.actor.getSnapshot()).reason).toBe('damaged');
    damaged.clock.advance(600_000);
    expect(damaged.effects.inputsFor('push')).toHaveLength(1);
    expect(damaged.effects.running('fetch')).toBe(0);
    damaged.stop();

    const busy = start();
    await openCleanly(busy);
    busy.actor.send({ type: 'syncNow' });
    await settleWhenRunning(busy.effects, 'push', {
      error: Object.assign(new Error('Try again shortly.'), { code: 'REMOTE_UNAVAILABLE' }),
    });
    await settleWhenRunning(busy.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(busy.actor.getSnapshot().matches('queued')).toBe(true);
    });
    busy.clock.advance(5000);
    await vi.waitFor(() => {
      expect(busy.effects.running('fetch')).toBe(1);
    });
    busy.stop();
  });

  it('L2-F9: the open pull’s deadline is exported for the bounds that wait on it', () => {
    expect(machineModule.syncPullDeadlineMilliseconds).toBe(10_000);
  });
});

describe('syncMachine, live and automatic (W5b: D12, D13)', () => {
  const moved = { type: 'remoteMoved', generation: 2, refs: [mainRef] } as const;

  /** Deliver one remote move, and wait for the pull it starts. */
  const moveRemote = async (harness: Harness, fetches: number): Promise<void> => {
    harness.holds.sendBack('remoteMoves', moved);
    await vi.waitFor(() => {
      expect(harness.effects.inputsFor('fetch')).toHaveLength(fetches);
    });
  };

  const fastForwardFetched = {
    output: { leases: { [mainRef]: 'remote-2' }, integration: 'fastForward' } satisfies SyncFetchActorOutput,
  };

  it('row 51 (D13): subscribes while a remote is connected, and stops when it goes', async () => {
    const harness = start();
    await openCleanly(harness);

    expect(harness.holds.inputsFor('remoteMoves')).toEqual([{ projectId: 'p1' }]);
    expect(harness.holds.deliveries).toContainEqual({
      name: 'remoteMoves',
      input: { projectId: 'p1' },
      event: { type: 'watch', remote: 'tau' },
    });

    harness.actor.send({ type: 'remoteDisconnected' });
    await vi.waitFor(() => {
      expect(harness.holds.deliveries.at(-1)?.event).toEqual({ type: 'unwatch' });
    });

    harness.stop();
  });

  it('row 52 (D13, B6): another device’s push reaches this checkout without reopening', async () => {
    const harness = start();
    await openCleanly(harness);

    await moveRemote(harness, 2);
    harness.effects.settle('fetch', fastForwardFetched);
    await settleWhenRunning(harness.effects, 'fastForward', {
      output: { checkoutId: 'live', revisionId: 'remote-2', treeId: 'tree-2' },
    });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('backedUp')).toBe(true);
    });
    expect(harness.parent.events).toContainEqual({
      type: 'checkoutChanged',
      checkoutId: 'live',
      revisionId: 'remote-2',
      treeId: 'tree-2',
      branch: 'main',
    });

    harness.stop();
  });

  it('row 53: a move that lands mid-push is fetched as soon as the push settles', async () => {
    const harness = start();
    await openCleanly(harness);
    harness.actor.send({ type: 'syncNow' });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });

    harness.holds.sendBack('remoteMoves', moved);
    expect(harness.effects.inputsFor('fetch')).toHaveLength(1);
    harness.effects.settle('push', { output: pushResult({ name: mainRef, status: 'updated', head: 'r1' }) });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });

    await vi.waitFor(() => {
      expect(harness.effects.inputsFor('fetch')).toHaveLength(2);
    });

    harness.stop();
  });

  it('row 54 (rule 9): a leased checkout applies nothing, parks without backing off, and applies after the lease', async () => {
    const harness = start();
    await openCleanly(harness);
    await moveRemote(harness, 2);
    harness.effects.settle('fetch', fastForwardFetched);
    await settleWhenRunning(harness.effects, 'fastForward', {
      output: { status: 'held', hold: 'leased', checkoutId: 'live', revisionId: 'remote-2' },
    });

    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('awaitingLease')).toBe(true);
    });
    expect(selectSyncFacet(harness.actor.getSnapshot())).toMatchObject({ state: 'backedUp', arrived: 'remote-2' });
    expect(harness.parent.events.some((event) => event.type === 'checkoutChanged')).toBe(false);

    /* Parked, not backing off: no amount of waiting fetches again. */
    harness.clock.advance(600_000);
    expect(harness.effects.inputsFor('fetch')).toHaveLength(2);

    harness.actor.send({ type: 'leaseRetired', runId: 'run-1' });
    await vi.waitFor(() => {
      expect(harness.effects.inputsFor('fetch')).toHaveLength(3);
    });
    harness.effects.settle('fetch', fastForwardFetched);
    await settleWhenRunning(harness.effects, 'fastForward', {
      output: { checkoutId: 'live', revisionId: 'remote-2', treeId: 'tree-2' },
    });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('backedUp')).toBe(true);
    });
    expect(selectSyncFacet(harness.actor.getSnapshot()).arrived).toBeUndefined();

    harness.stop();
  });

  it('row 55 (rule 9): a lease that retires while the pull is still deciding is not lost', async () => {
    const harness = start();
    await openCleanly(harness);
    await moveRemote(harness, 2);
    harness.effects.settle('fetch', fastForwardFetched);
    await vi.waitFor(() => {
      expect(harness.effects.running('fastForward')).toBe(1);
    });

    harness.actor.send({ type: 'leaseRetired', runId: 'run-1' });
    harness.effects.settle('fastForward', {
      output: { status: 'held', hold: 'leased', checkoutId: 'live', revisionId: 'remote-2' },
    });

    await vi.waitFor(() => {
      expect(harness.effects.inputsFor('fetch')).toHaveLength(3);
    });

    harness.stop();
  });

  it('row 56 (D12, rule 6): a dirty checkout is minted by its checkout actor, then composed and pushed', async () => {
    const harness = start();
    await openCleanly(harness);
    await moveRemote(harness, 2);
    harness.effects.settle('fetch', fastForwardFetched);
    await settleWhenRunning(harness.effects, 'fastForward', {
      output: { status: 'held', hold: 'dirty', checkoutId: 'live', revisionId: 'remote-2' },
    });

    await vi.waitFor(() => {
      expect(harness.parent.events).toContainEqual({
        type: 'cut',
        trigger: 'merge',
        checkoutId: 'live',
        leaseIds: [],
        requestId: 'sync-1',
      });
    });
    expect(harness.effects.running('merge')).toBe(0);

    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'live',
      trigger: 'merge',
      requestId: 'sync-1',
      revisionId: 'minted-1',
      branch: 'main',
    });
    await vi.waitFor(() => {
      expect(harness.effects.inputsFor('fetch')).toHaveLength(3);
    });
    harness.effects.settle('fetch', {
      output: { leases: { [mainRef]: 'remote-2' }, integration: 'diverged' } satisfies SyncFetchActorOutput,
    });
    await settleWhenRunning(harness.effects, 'merge', {
      output: {
        status: 'merged',
        moved: { checkoutId: 'live', revisionId: 'merged-1', treeId: 'tree-m' },
      } satisfies SyncMergeActorOutput,
    });

    /* The merge re-heads the checkout actor, and the minted and merged revisions go out. */
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    expect(harness.parent.events).toContainEqual({
      type: 'checkoutChanged',
      checkoutId: 'live',
      revisionId: 'merged-1',
      treeId: 'tree-m',
      branch: 'main',
    });

    harness.stop();
  });

  it('row 57: a merge cut that does not land waits out the backoff, and another requester’s answer is not this one’s', async () => {
    const harness = start();
    await openCleanly(harness);
    await moveRemote(harness, 2);
    harness.effects.settle('fetch', fastForwardFetched);
    await settleWhenRunning(harness.effects, 'fastForward', {
      output: { status: 'held', hold: 'dirty', checkoutId: 'live', revisionId: 'remote-2' },
    });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('minting')).toBe(true);
    });

    harness.actor.send({
      type: 'cutFailed',
      checkoutId: 'live',
      trigger: 'switch',
      requestId: 'branch-1',
      reason: 'x',
    });
    expect(harness.actor.getSnapshot().matches('minting')).toBe(true);

    harness.actor.send({
      type: 'casLost',
      checkoutId: 'live',
      trigger: 'merge',
      requestId: 'sync-1',
    });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });
    expect(selectSyncFacet(harness.actor.getSnapshot()).error).toBe(
      'Another writer moved this branch first; this project will try again.',
    );

    /* The backoff's pull asks for a new cut; a cut that never answers is bounded by the pull deadline. */
    harness.clock.advance(5000);
    await settleWhenRunning(harness.effects, 'fetch', fastForwardFetched);
    await settleWhenRunning(harness.effects, 'fastForward', {
      output: { status: 'held', hold: 'dirty', checkoutId: 'live', revisionId: 'remote-2' },
    });
    await vi.waitFor(() => {
      expect(harness.parent.events.findLast((event) => event.type === 'cut')).toMatchObject({
        requestId: 'sync-2',
      });
    });
    harness.clock.advance(10_000);
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });

    harness.stop();
  });

  it('row 59 (D12): a diverged clean checkout merges, re-heads its actor and pushes the merge revision', async () => {
    const harness = start();
    await openCleanly(harness);
    await moveRemote(harness, 2);
    harness.effects.settle('fetch', {
      output: { leases: { [mainRef]: 'remote-2' }, integration: 'diverged' } satisfies SyncFetchActorOutput,
    });
    await settleWhenRunning(harness.effects, 'merge', {
      output: {
        status: 'merged',
        moved: { checkoutId: 'live', revisionId: 'merged-1', treeId: 'tree-m' },
      } satisfies SyncMergeActorOutput,
    });

    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    expect(harness.effects.inputsFor('push').at(-1)).toMatchObject({ leases: { [mainRef]: 'remote-2' } });
    expect(harness.parent.events.filter((event) => event.type === 'checkoutChanged')).toHaveLength(1);

    harness.stop();
  });

  it('row 60 (W13): a mint cadence faster than the window still pushes within the bound, every bound', async () => {
    const harness = start();
    await openCleanly(harness);
    const pushStarts: number[] = [];

    /* An agent minting every 500 ms for 30 s: the 2 s window alone would restart forever. */
    for (let tick = 1; tick <= 60; tick += 1) {
      harness.actor.send({
        type: 'revisionMinted',
        checkoutId: 'live',
        trigger: 'save',
        revisionId: `r${String(tick)}`,
        branch: 'main',
      });
      harness.clock.advance(500);
      // oxlint-disable-next-line no-await-in-loop -- the machine's own invocations start on the next task.
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      if (harness.effects.running('push') > 0) {
        pushStarts.push(tick * 500);
        harness.effects.settle('push', { output: pushResult({ name: mainRef, status: 'updated', head: 'r' }) });
        // oxlint-disable-next-line no-await-in-loop -- the queue write settles each push before the next mint.
        await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
      }
    }

    expect(pushStarts[0]).toBeLessThanOrEqual(4000);
    const gaps = pushStarts.slice(1).map((at, index) => at - (pushStarts[index] ?? 0));
    expect(Math.max(...gaps)).toBeLessThanOrEqual(4500);
    expect(pushStarts.length).toBeGreaterThanOrEqual(6);
    expect(machineModule.syncDebounceMaxWaitMilliseconds).toBe(4000);

    harness.stop();
  });

  it('row 58 (rule 19, RV-W5b F5): a refused stream is only the wake-up channel; the git fetch is what is classified', async () => {
    const harness = start();
    await openCleanly(harness);

    harness.holds.sendBack('remoteMoves', {
      type: 'remoteRefused',
      code: 'REMOTE_UNAUTHORIZED',
      message: 'This credential cannot read the stream.',
    });

    /* A repository-scoped credential is refused on every non-git route (I10): the pull still works. */
    await vi.waitFor(() => {
      expect(harness.effects.inputsFor('fetch')).toHaveLength(2);
    });
    expect(harness.actor.getSnapshot().matches('failed')).toBe(false);
    harness.effects.settle('fetch', {
      output: { leases: { [mainRef]: 'remote-head' }, integration: 'upToDate' } satisfies SyncFetchActorOutput,
    });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('backedUp')).toBe(true);
    });

    /* The same refusal on the fetch is the one the classifier names. */
    harness.holds.sendBack('remoteMoves', { type: 'remoteRefused', code: 'REMOTE_NOT_FOUND', message: 'x' });
    await settleWhenRunning(harness.effects, 'fetch', {
      error: Object.assign(new Error('Project not found.'), { code: 'REMOTE_NOT_FOUND' }),
    });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('failed')).toBe(true);
    });
    expect(selectSyncFacet(harness.actor.getSnapshot())).toMatchObject({ reason: 'notFound' });

    harness.stop();
  });

  it('row 61 (RV-W5b F2): a hold the cut cannot mint re-pulls at most once, then backs off', async () => {
    const harness = start();
    await openCleanly(harness);
    await moveRemote(harness, 2);

    /* The clock never moves: every fetch here is an immediate re-pull. */
    for (let answer = 1; answer <= 6; answer += 1) {
      if (harness.effects.running('fetch') === 0) {
        break;
      }
      harness.effects.settle('fetch', fastForwardFetched);
      // eslint-disable-next-line no-await-in-loop -- one hold, one answer, in order.
      await settleWhenRunning(harness.effects, 'fastForward', {
        output: { status: 'held', hold: 'dirty', checkoutId: 'live', revisionId: 'remote-2' },
      });
      // eslint-disable-next-line no-await-in-loop -- one hold, one answer, in order.
      await vi.waitFor(() => {
        expect(harness.actor.getSnapshot().matches('minting')).toBe(true);
      });
      harness.actor.send({
        type: 'nothingToSave',
        checkoutId: 'live',
        trigger: 'merge',
        requestId: `sync-${String(answer)}`,
      });
      // eslint-disable-next-line no-await-in-loop -- let the answer settle before reading it.
      await vi.waitFor(() => {
        expect(harness.actor.getSnapshot().matches('minting')).toBe(false);
      });
    }

    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });
    expect(harness.effects.inputsFor('fetch')).toHaveLength(3);
    /* The backoff's pull asks again. */
    harness.clock.advance(5000);
    await vi.waitFor(() => {
      expect(harness.effects.inputsFor('fetch')).toHaveLength(4);
    });

    harness.stop();
  });

  it('row 62 (RV-W5b F7): a parked apply is remembered, so leaving the park any way pulls again', async () => {
    const harness = start();
    await openCleanly(harness);
    await moveRemote(harness, 2);
    harness.effects.settle('fetch', fastForwardFetched);
    await settleWhenRunning(harness.effects, 'fastForward', {
      output: { status: 'held', hold: 'leased', checkoutId: 'live', revisionId: 'remote-2' },
    });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('awaitingLease')).toBe(true);
    });

    /* The page's own keepalive POST is answered while parked (A32). */
    harness.actor.send({ type: 'pushAcknowledged', refs: [{ name: mainRef, status: 'upToDate', head: 'local' }] });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });

    await vi.waitFor(() => {
      expect(harness.effects.inputsFor('fetch')).toHaveLength(3);
    });

    harness.stop();
  });

  it('row 63 (W13d): a 429 waits its Retry-After, is not cut short by a move, and does not advance the doubling', async () => {
    const harness = start();
    await openCleanly(harness);
    const limited = (): RevisionPortError =>
      new RevisionPortError('REMOTE_UNAVAILABLE', 'Too many requests; retry shortly.', {
        retryAfterMilliseconds: 20_000,
      });

    harness.actor.send({ type: 'syncNow' });
    await settleWhenRunning(harness.effects, 'push', { error: limited() });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });

    /* The other device's move is remembered, not fetched into the same limit. */
    harness.holds.sendBack('remoteMoves', moved);
    harness.clock.advance(19_999);
    expect(harness.effects.inputsFor('fetch')).toHaveLength(1);

    harness.clock.advance(1);
    /* The pull's own 429 waits the same way. */
    await settleWhenRunning(harness.effects, 'fetch', { error: limited() });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });
    harness.clock.advance(19_999);
    expect(harness.effects.inputsFor('fetch')).toHaveLength(2);
    harness.clock.advance(1);
    await settleWhenRunning(harness.effects, 'fetch', {
      output: { leases: {}, integration: 'upToDate' } satisfies SyncFetchActorOutput,
    });

    /* Any other failure keeps the doubling — from its first step, because
     * neither 429 advanced it. */
    await settleWhenRunning(harness.effects, 'push', { error: new Error('Failed to fetch') });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });
    harness.clock.advance(4999);
    expect(harness.effects.inputsFor('fetch')).toHaveLength(3);
    harness.clock.advance(1);
    await vi.waitFor(() => {
      expect(harness.effects.inputsFor('fetch')).toHaveLength(4);
    });

    harness.stop();
  });
});

describe('syncMachine telemetry (W36 D1)', () => {
  const mint = (harness: Harness, revisionId: string): void => {
    harness.actor.send({ type: 'revisionMinted', checkoutId: 'live', trigger: 'save', revisionId, branch: 'main' });
  };
  const attempts = (harness: Harness): ReadonlyArray<Record<string, unknown>> =>
    harness.emitted.filter((event) => event['type'] === 'syncAttempt');

  it('reports each settled pull and push once, with the lag only on an acknowledged push', async () => {
    const harness = start();
    await openCleanly(harness);
    expect(attempts(harness)).toEqual([
      { type: 'syncAttempt', direction: 'pull', outcome: 'ok', durationMilliseconds: expect.any(Number) as unknown },
    ]);

    mint(harness, 'r1');
    harness.clock.advance(2000);
    await settleWhenRunning(harness.effects, 'push', {
      error: Object.assign(new Error('no route'), { code: 'ENGINE_FAILED' }),
    });
    await vi.waitFor(() => {
      expect(attempts(harness)).toHaveLength(2);
    });
    expect(attempts(harness)[1]).toEqual({
      type: 'syncAttempt',
      direction: 'push',
      outcome: 'offline',
      durationMilliseconds: expect.any(Number) as unknown,
      pending: 0,
    });

    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });
    harness.actor.send({ type: 'syncNow' });
    await settleWhenRunning(harness.effects, 'fetch', {
      output: { leases: { [mainRef]: 'remote-head' }, integration: 'upToDate' } satisfies SyncFetchActorOutput,
    });
    await settleWhenRunning(harness.effects, 'push', {
      output: pushResult({ name: mainRef, status: 'updated', head: 'h1' }),
    });
    await vi.waitFor(() => {
      expect(attempts(harness).at(-1)).toMatchObject({ direction: 'push', outcome: 'ok' });
    });
    const acknowledged = attempts(harness).at(-1);
    expect(acknowledged?.['pending']).toBe(1);
    expect(acknowledged?.['lagMilliseconds']).toEqual(expect.any(Number));
    expect(harness.actor.getSnapshot().context.unsyncedSince).toBeUndefined();

    harness.stop();
  });

  it('keeps the lag of a revision minted while the previous push was on the wire', async () => {
    const harness = start();
    await openCleanly(harness);

    mint(harness, 'r1');
    harness.clock.advance(2000);
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    mint(harness, 'r2');
    const mintedMidPush = harness.actor.getSnapshot().context.mintedSincePushAt;
    expect(mintedMidPush).toEqual(expect.any(Number) as unknown);
    harness.effects.settle('push', { output: pushResult({ name: mainRef, status: 'updated', head: 'h1' }) });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });

    await vi.waitFor(() => {
      expect(attempts(harness).at(-1)).toMatchObject({ direction: 'push', outcome: 'ok' });
    });
    /* Once r1 is acknowledged, r2 is still owed, and its lag runs from its own mint. */
    expect(harness.actor.getSnapshot().context.unsyncedSince).toBe(mintedMidPush);

    harness.stop();
  });

  it('reports a push the remote refused for storage as quota_refused', async () => {
    const harness = start();
    await openCleanly(harness);

    mint(harness, 'r1');
    harness.clock.advance(2000);
    await settleWhenRunning(harness.effects, 'push', {
      output: {
        refs: [{ name: mainRef, status: 'rejected', reason: 'storage quota exceeded' }],
        overQuota: ['big.step'],
      },
    });
    await vi.waitFor(() => {
      expect(attempts(harness).at(-1)).toMatchObject({ direction: 'push', outcome: 'quota_refused' });
    });
    expect(attempts(harness).at(-1)).not.toHaveProperty('lagMilliseconds');

    harness.stop();
  });

  it('reports an offline open as an offline pull', async () => {
    const harness = start({ online: false });

    await vi.waitFor(() => {
      expect(attempts(harness)).toContainEqual(expect.objectContaining({ direction: 'pull', outcome: 'offline' }));
    });

    harness.stop();
  });
});
