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
 */

import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import { describe, expect, it, vi } from 'vitest';

import * as machineModule from '#sync.machine.js';
import { selectSyncFacet, syncMachine } from '#sync.machine.js';
import type {
  SyncActors,
  SyncFetchActorOutput,
  SyncMachineEmitted,
  SyncMergeActorOutput,
  SyncPushActorOutput,
  SyncReadRemoteActorOutput,
} from '#sync.machine.js';
import type { SyncQueueRecord, SyncRefOutcome } from '#sync.types.js';
import {
  createFakeCallbackActors,
  createFakeParent,
  createFakePromiseActors,
  createManualClock,
  recordEmitted,
} from '#test/fake-actors.js';
import type { FakeCallbackActors, FakeParent, FakePromiseActors, ManualClock } from '#test/fake-actors.js';

const isMachine = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

const emptyQueue: SyncQueueRecord = { version: 1, entries: [] };
const mainRef = 'refs/heads/main';
const syncBranch = 'sync/tau/main';
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
  clock: ManualClock;
  emitted: ReadonlyArray<Record<string, unknown>>;
  stop: () => void;
}>;

/**
 * Start one scheduler over scripted effects and a manual clock.
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
  const clock = createManualClock();
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
  };
  const actor = createActor(syncMachine.provide({ actors }), {
    clock,
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

  /* D57: a merge the pull composed moved the branch its checkout shows. */
  it('tells the parent which revision a merged pull landed on', async () => {
    const harness = start();
    await settleWhenRunning(harness.effects, 'fetch', {
      output: { leases: { [mainRef]: 'remote-head' }, integration: 'diverged' } satisfies SyncFetchActorOutput,
    });
    await settleWhenRunning(harness.effects, 'merge', { output: { status: 'merged', revisionId: 'merged-head' } });

    await vi.waitFor(() => {
      expect(harness.parent.events).toContainEqual({
        type: 'branchMerged',
        branch: 'tau/main',
        into: 'main',
        revisionId: 'merged-head',
      });
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

    harness.actor.send({ type: 'revisionMinted', checkoutId: 'live', trigger: 'save', revisionId: 'r1' });
    harness.clock.advance(1000);
    harness.actor.send({ type: 'revisionMinted', checkoutId: 'live', trigger: 'save', revisionId: 'r2' });
    harness.clock.advance(1000);
    harness.actor.send({ type: 'revisionMinted', checkoutId: 'live', trigger: 'save', revisionId: 'r3' });
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

      harness.actor.send({ type: 'revisionMinted', checkoutId: 'live', trigger, revisionId: 'close-1' });

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
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });

    const facet = selectSyncFacet(harness.actor.getSnapshot());
    expect(facet.reason).toBe('quota');
    expect(facet.error).toContain('Tau: repository size limit exceeded');
    expect(facet.error).toContain('huge.bin (5000 bytes)');

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
   * call, so a retry can never succeed; only a new revision (the file removed)
   * or the person tries again. */
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

    harness.actor.send({ type: 'revisionMinted', checkoutId: 'live', trigger: 'save', revisionId: 'r-without-part' });
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
    harness.actor.send({ type: 'revisionMinted', checkoutId: 'live', trigger: 'close', revisionId: 'r-close' });
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
    expect(harness.actor.getSnapshot().context.pushId).toBeUndefined();

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
    const clock = createManualClock();
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
    });

    const first = createActor(syncMachine.provide({ actors: actors() }), {
      clock,
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
    first.send({ type: 'revisionMinted', checkoutId: 'live', trigger: 'close', revisionId: 'close-1' });
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

    harness.actor.send({ type: 'revisionMinted', checkoutId: 'live', trigger: 'save', revisionId: 'r1' });
    harness.clock.advance(2000);
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    /* Minted *during* the push: the pack on the wire was built before it. */
    harness.actor.send({ type: 'revisionMinted', checkoutId: 'live', trigger: 'save', revisionId: 'r2' });
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

    harness.actor.send({ type: 'revisionMinted', checkoutId: 'live', trigger: 'close', revisionId: 'r1' });
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

  it('row 34 (review 2 R9): a throw during a narrowed retry records only what it offered', async () => {
    const harness = start();
    await openCleanly(harness);

    /* One refused chat ref, so the queue holds that ref and the next offer is
     * narrowed to it. */
    harness.actor.send({ type: 'revisionMinted', checkoutId: 'live', trigger: 'close', revisionId: 'r1' });
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

    harness.clock.advance(5000);
    await settleWhenRunning(harness.effects, 'fetch', {
      output: { leases: {}, integration: 'upToDate' } satisfies SyncFetchActorOutput,
    });
    await vi.waitFor(() => {
      expect(harness.effects.running('push')).toBe(1);
    });
    expect(harness.effects.inputsFor('push').at(-1)).toMatchObject({ refs: [chatRef] });

    /* A transport throw reports no refs at all, so the outcome is synthesised —
     * from what this push offered, never from `refs/heads/main` by reflex. */
    harness.effects.settle('push', { error: new Error('the network is unreachable') });
    await settleWhenRunning(harness.effects, 'writePending', { output: undefined });
    await vi.waitFor(() => {
      expect(harness.actor.getSnapshot().matches('queued')).toBe(true);
    });
    expect(harness.actor.getSnapshot().context.pending.map((entry) => entry.ref)).toEqual([chatRef]);
    expect(selectSyncFacet(harness.actor.getSnapshot()).pendingCount).toBe(1);

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
   * **B7** (policy rule 20): *mint → push request issued, connected and online,
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
  it('B7 (rule 20): a mint on a connected, online project issues its push inside the debounce plus 100 ms', async () => {
    const harness = start();
    await openCleanly(harness);
    expect(selectSyncFacet(harness.actor.getSnapshot()).online).toBe(true);
    expect(harness.actor.getSnapshot().context.remote).toBe('tau');

    harness.actor.send({ type: 'revisionMinted', checkoutId: 'live', trigger: 'save', revisionId: 'r1' });

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

  it('B7: an offline or unconnected project issues nothing, which is what makes the row about the debounce', async () => {
    const offline = start({ online: false });
    offline.actor.send({ type: 'revisionMinted', checkoutId: 'live', trigger: 'save', revisionId: 'r1' });
    offline.clock.advance(2100);
    expect(offline.effects.running('push')).toBe(0);
    offline.stop();

    const unconnected = start({ remote: undefined });
    await vi.waitFor(() => {
      expect(unconnected.actor.getSnapshot().matches('noRemote')).toBe(true);
    });
    unconnected.actor.send({ type: 'revisionMinted', checkoutId: 'live', trigger: 'save', revisionId: 'r1' });
    unconnected.clock.advance(2100);
    expect(unconnected.effects.running('push')).toBe(0);
    unconnected.stop();
  });
});
