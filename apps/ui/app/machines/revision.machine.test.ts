import { describe, it, expect, vi, afterEach } from 'vitest';
import { createActor } from 'xstate';
import type { AnyActorRef } from 'xstate';
import type { PersistedRevisionState } from '#types/project.types.js';
import type { AuthoritativeRevisionFinalization } from '#types/revision.types.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import type { RestorePlan } from '#lib/file-restore-timeline.js';
import { revisionMachine } from '#machines/revision.machine.js';
import type { ApplyPlanInput, ComputePlanInput, PlanComputedEvent } from '#machines/revision.machine.js';

// ===========================================================================
// Harness — real machine with mocked computePlan / applyPlan actors.
//
// The head is keyed on the user-message id (`headTurnId`); `''` is the tip
// sentinel. The mock resolves `isLatest` from the LATEST_SENTINEL anchor
// (+Infinity), mirroring `resolveRestore`: RETURN_TO_LATEST and UNDO-to-tip both
// target the sentinel, so the head collapses back to `''`.
// ===========================================================================

const makePlan = (over: Partial<RestorePlan> = {}): RestorePlan => ({
  write: over.write ?? new Map<string, string>(),
  remove: over.remove ?? new Set<string>(),
  unrecoverable: over.unrecoverable ?? new Set<string>(),
});

const finalization = (over: Partial<AuthoritativeRevisionFinalization> = {}): AuthoritativeRevisionFinalization => ({
  turnId: 'u1',
  revisionId: 'rev-auth-1',
  baseRevisionId: 'rev-base',
  treeId: 'tree-auth-1',
  branchName: 'main',
  publication: {
    status: 'updated',
    branchName: 'main',
    expectedHeadRevisionId: 'rev-base',
    previousHeadRevisionId: 'rev-base',
    headRevisionId: 'rev-auth-1',
  },
  changedPaths: ['main.ts'],
  provenance: { source: 'agent', actorId: 'tau-chat-runner', runId: 'run-1', createdAt: 100 },
  generatedSummary: 'Created the bracket',
  chatId: 'chat-a',
  jobIds: ['job-1'],
  workspaceId: 'workspace-1',
  nativeGit: { status: 'not-configured' },
  ...over,
});

let live: AnyActorRef[] = [];
afterEach(() => {
  for (const actor of live) {
    actor.stop();
  }
  live = [];
});

type Options = {
  initial?: PersistedRevisionState;
  plan?: RestorePlan;
  n?: number;
  computeFails?: boolean;
  applyFails?: boolean;
};

type EmittedEvent =
  | { readonly type: 'toast.restored'; readonly n: number; readonly unrecoverable: string[] }
  | { readonly type: 'toast.error'; readonly message: string }
  | { readonly type: 'forkMarker'; readonly atRevision: number };

function harness(options: Options = {}) {
  const computeSpy = vi.fn<(input: ComputePlanInput) => void>();
  const applySpy = vi.fn<(input: ApplyPlanInput) => void>();
  const persist = vi.fn<(state: PersistedRevisionState) => void>();
  const resolvedPlan = options.plan ?? makePlan();

  const machine = revisionMachine.provide({
    actors: {
      computePlan: fromSafeAsync<PlanComputedEvent, ComputePlanInput>(async ({ input }) => {
        computeSpy(input);
        if (options.computeFails) {
          throw new Error('Revision no longer exists');
        }
        // LATEST_SENTINEL → targeting the newest Revision (RETURN_TO_LATEST / UNDO-to-tip).
        const isLatest = input.target.anchor === Number.POSITIVE_INFINITY;
        return {
          type: 'planComputed',
          plan: resolvedPlan,
          target: { messageId: input.target.messageId || 'resolved', anchor: input.target.anchor },
          isLatest,
          n: options.n ?? 1,
        };
      }),
      applyPlan: fromSafeAsync<void, ApplyPlanInput>(async ({ input }) => {
        applySpy(input);
        if (options.applyFails) {
          throw new Error('write failed');
        }
      }),
    },
  });

  const actor = createActor(machine, {
    input: {
      projectId: 'p1',
      initial: options.initial ?? {
        headTurnId: '',
        supersededTurnIds: [],
        dirty: false,
      },
      persist,
    },
  });

  const emitted: EmittedEvent[] = [];
  actor.on('toast.restored', (event) => emitted.push(event));
  actor.on('toast.error', (event) => emitted.push(event));
  actor.on('forkMarker', (event) => emitted.push(event));

  const visited: string[] = [];
  actor.subscribe((s) => visited.push(String(s.value)));

  actor.start();
  live.push(actor);
  return { actor, computeSpy, applySpy, persist, emitted, visited };
}

// ===========================================================================

describe('revisionMachine', () => {
  it('RM-INIT: starts idle and adopts the persisted slice from input', () => {
    const { actor } = harness({
      initial: { headTurnId: 'u4', supersededTurnIds: ['u9'], dirty: false },
    });
    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('idle');
    expect(snapshot.context.headTurnId).toBe('u4');
    expect(snapshot.context.supersededTurnIds).toEqual(['u9']);
    expect(snapshot.context.dirty).toBe(false);
  });

  it('RM-RESTORE-CLEAN: a non-risky restore skips confirming, commits the head by id, and emits one toast.restored', async () => {
    const { actor, applySpy, persist, emitted, visited } = harness({
      plan: makePlan({ write: new Map([['main.ts', 'v1']]) }),
      n: 3,
    });

    actor.send({ type: 'RESTORE', target: { messageId: 'u1', anchor: 100 } });
    await vi.waitFor(() => {
      expect(actor.getSnapshot().context.headTurnId).toBe('u1');
    });

    expect(visited).not.toContain('confirming');
    expect(visited).toContain('applying');
    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(actor.getSnapshot().context.fromHeadTurnId).toBe(''); // Pre-restore head was the tip.
    expect(persist).toHaveBeenCalledWith({
      headTurnId: 'u1',
      supersededTurnIds: [],
      dirty: false,
    });
    expect(emitted.filter((event) => event.type === 'toast.restored')).toEqual([
      { type: 'toast.restored', n: 3, unrecoverable: [] },
    ]);
  });

  it('RM-RESTORE-RISKY-DELETE: a plan with deletions routes through confirming, applying only after CONFIRM', async () => {
    const { actor, applySpy } = harness({
      plan: makePlan({ remove: new Set(['gone.ts']) }),
    });

    actor.send({ type: 'RESTORE', target: { messageId: 'u1', anchor: 100 } });
    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe('confirming');
    });
    expect(applySpy).not.toHaveBeenCalled();

    actor.send({ type: 'CONFIRM' });
    await vi.waitFor(() => {
      expect(actor.getSnapshot().context.headTurnId).toBe('u1');
    });
    expect(applySpy).toHaveBeenCalledTimes(1);
  });

  it('RM-RESTORE-RISKY-DIRTY: a dirty FS routes a delete-free plan through confirming', async () => {
    const { actor } = harness({
      initial: { headTurnId: '', supersededTurnIds: [], dirty: true },
      plan: makePlan({ write: new Map([['main.ts', 'v1']]) }),
    });

    actor.send({ type: 'RESTORE', target: { messageId: 'u1', anchor: 100 } });
    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe('confirming');
    });
  });

  it('RM-CONFIRM-CANCEL: cancelling from confirming applies nothing and leaves the head unchanged', async () => {
    const { actor, applySpy } = harness({
      plan: makePlan({ remove: new Set(['gone.ts']) }),
    });

    actor.send({ type: 'RESTORE', target: { messageId: 'u1', anchor: 100 } });
    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe('confirming');
    });
    actor.send({ type: 'CANCEL' });
    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe('idle');
    });

    expect(applySpy).not.toHaveBeenCalled();
    expect(actor.getSnapshot().context.headTurnId).toBe('');
    expect(actor.getSnapshot().context.plan).toBeUndefined();
  });

  it('RM-PLAN-ERROR: a computePlan rejection surfaces toast.error and leaves the head unchanged', async () => {
    const { actor, emitted } = harness({
      computeFails: true,
      initial: { headTurnId: 'u7', supersededTurnIds: [], dirty: false },
    });

    actor.send({ type: 'RESTORE', target: { messageId: 'u1', anchor: 100 } });
    await vi.waitFor(() => {
      expect(emitted.some((event) => event.type === 'toast.error')).toBe(true);
    });

    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context.headTurnId).toBe('u7');
    expect(emitted.find((event) => event.type === 'toast.error')?.message).toBe('Revision no longer exists');
  });

  it('RM-APPLY-ERROR: an applyPlan rejection surfaces toast.error and does not commit the head', async () => {
    const { actor, emitted } = harness({
      applyFails: true,
      plan: makePlan({ write: new Map([['a.ts', '1']]) }),
    });

    actor.send({ type: 'RESTORE', target: { messageId: 'u1', anchor: 100 } });
    await vi.waitFor(() => {
      expect(emitted.some((event) => event.type === 'toast.error')).toBe(true);
    });

    expect(actor.getSnapshot().context.headTurnId).toBe(''); // Not committed
  });

  it('RM-NON-REENTRANT: a second RESTORE while planning is ignored (no double compute/apply)', async () => {
    const { actor, computeSpy, applySpy } = harness({
      plan: makePlan({ write: new Map([['a.ts', '1']]) }),
    });

    actor.send({ type: 'RESTORE', target: { messageId: 'u1', anchor: 100 } });
    actor.send({ type: 'RESTORE', target: { messageId: 'u2', anchor: 200 } }); // While planning — ignored
    await vi.waitFor(() => {
      expect(actor.getSnapshot().context.headTurnId).toBe('u1');
    });

    expect(computeSpy).toHaveBeenCalledTimes(1);
    expect(applySpy).toHaveBeenCalledTimes(1);
  });

  it('RM-RETURN-TO-LATEST: targets the newest Revision and lands the head on the tip', async () => {
    const { actor } = harness({
      initial: { headTurnId: 'u2', supersededTurnIds: [], dirty: false },
      plan: makePlan({ write: new Map([['a.ts', '1']]) }),
      n: 9,
    });

    actor.send({ type: 'RETURN_TO_LATEST' });
    await vi.waitFor(() => {
      expect(actor.getSnapshot().context.headTurnId).toBe(''); // Tip sentinel.
    });
  });

  it('RM-UNDO: after a restore, UNDO returns the head to where the user was (the tip)', async () => {
    const { actor } = harness({
      plan: makePlan({ write: new Map([['a.ts', '1']]) }),
    });

    actor.send({ type: 'RESTORE', target: { messageId: 'u1', anchor: 100 } });
    await vi.waitFor(() => {
      expect(actor.getSnapshot().context.headTurnId).toBe('u1');
    });
    expect(actor.getSnapshot().context.fromHeadTurnId).toBe('');

    actor.send({ type: 'UNDO' });
    await vi.waitFor(() => {
      expect(actor.getSnapshot().context.headTurnId).toBe(''); // Back to the pre-restore tip.
    });
  });

  it('RM-TURN-ADVANCE: TURN_COMPLETED advances the head to the tip and clears dirty', () => {
    const { actor, persist } = harness({
      initial: { headTurnId: 'u2', supersededTurnIds: [], dirty: true },
    });

    actor.send({ type: 'TURN_COMPLETED' });

    expect(actor.getSnapshot().context.headTurnId).toBe('');
    expect(actor.getSnapshot().context.dirty).toBe(false);
    expect(persist).toHaveBeenCalledWith({
      headTurnId: '',
      supersededTurnIds: [],
      dirty: false,
    });
  });

  it('RM-FORK: NEW_USER_TURN with abandoned ids grows supersededTurnIds, persists, and emits forkMarker', () => {
    const { actor, persist, emitted } = harness({
      initial: { headTurnId: 'u5', supersededTurnIds: [], dirty: false },
    });

    actor.send({
      type: 'NEW_USER_TURN',
      abandonedTurnIds: ['u6', 'u7'],
      atRevision: 5,
    });

    expect(actor.getSnapshot().context.supersededTurnIds).toEqual(['u6', 'u7']);
    expect(persist).toHaveBeenCalledWith({
      headTurnId: 'u5',
      supersededTurnIds: ['u6', 'u7'],
      dirty: false,
    });
    expect(emitted).toContainEqual({ type: 'forkMarker', atRevision: 5 });
  });

  it('RM-FORK-EMPTY: NEW_USER_TURN at head (no abandoned ids) changes nothing and emits no forkMarker', () => {
    const { actor, persist, emitted } = harness();

    actor.send({ type: 'NEW_USER_TURN', abandonedTurnIds: [], atRevision: 3 });

    expect(actor.getSnapshot().context.supersededTurnIds).toEqual([]);
    expect(persist).not.toHaveBeenCalled();
    expect(emitted).toHaveLength(0);
  });

  it('RM-REFORK: two forks accumulate disjoint superseded id sets', () => {
    const { actor } = harness({
      initial: { headTurnId: 'u5', supersededTurnIds: [], dirty: false },
    });

    actor.send({
      type: 'NEW_USER_TURN',
      abandonedTurnIds: ['u6', 'u7'],
      atRevision: 5,
    });
    actor.send({
      type: 'NEW_USER_TURN',
      abandonedTurnIds: ['u13'],
      atRevision: 3,
    });

    expect(actor.getSnapshot().context.supersededTurnIds).toEqual(['u6', 'u7', 'u13']);
  });

  it('RM-DIRTY-SET: a non-machine write to a design path sets dirty', () => {
    const { actor, persist } = harness();
    actor.send({ type: 'FS_WRITE', source: 'editor', path: 'main.ts' });
    expect(actor.getSnapshot().context.dirty).toBe(true);
    expect(persist).toHaveBeenCalledWith({
      headTurnId: '',
      supersededTurnIds: [],
      dirty: true,
    });
  });

  it('RM-DIRTY-IGNORE-MACHINE: a machine write (restore) never sets dirty', () => {
    const { actor, persist } = harness();
    actor.send({ type: 'FS_WRITE', source: 'machine', path: 'main.ts' });
    expect(actor.getSnapshot().context.dirty).toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });

  it('RM-DIRTY-IGNORE-TAU: a write to a .tau/ path never sets dirty (H10)', () => {
    const { actor } = harness();
    actor.send({
      type: 'FS_WRITE',
      source: 'editor',
      path: '.tau/parameters/main.json',
    });
    expect(actor.getSnapshot().context.dirty).toBe(false);
  });

  it('RM-DIRTY-CLEAR: a clean restore clears a previously-dirty flag', async () => {
    const { actor } = harness({
      initial: { headTurnId: '', supersededTurnIds: [], dirty: true },
      plan: makePlan({ write: new Map([['a.ts', '1']]) }),
    });

    // Dirty=true makes the plan risky (PC9), so confirm to reach applied.
    actor.send({ type: 'RESTORE', target: { messageId: 'u1', anchor: 100 } });
    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe('confirming');
    });
    actor.send({ type: 'CONFIRM' });
    await vi.waitFor(() => {
      expect(actor.getSnapshot().context.headTurnId).toBe('u1');
    });

    expect(actor.getSnapshot().context.dirty).toBe(false);
  });

  it('marks transcript completion without inventing a revision identity or expected-old publication', () => {
    const { actor, persist } = harness();
    actor.send({
      type: 'NEW_USER_TURN',
      abandonedTurnIds: [],
      atRevision: 0,
      newTurnId: 'u1',
      chatId: 'chat-a',
    });
    actor.send({ type: 'TURN_COMPLETED', turnId: 'u1', chatId: 'chat-a' });

    const { graph } = actor.getSnapshot().context;
    expect(graph.nodes['u1']).toMatchObject({
      turnId: 'u1',
      parentTurnIds: [],
      branchName: 'main',
      status: 'complete',
    });
    expect(graph.nodes['u1']?.revisionId).toBeUndefined();
    expect(graph.nodes['u1']?.publication).toBeUndefined();
    expect(graph.branches['main']).toEqual({ name: 'main' });
    expect(persist).toHaveBeenLastCalledWith(expect.objectContaining({ graph }));
  });

  it('registers a self-parenting turn as a root and records the anomaly instead of persisting a cycle', () => {
    const { actor } = harness();
    actor.send({
      type: 'NEW_USER_TURN',
      abandonedTurnIds: [],
      atRevision: 1,
      newTurnId: 'u1',
      chatId: 'chat-a',
      parentTurnId: 'u1',
    });

    const { graph } = actor.getSnapshot().context;
    expect(graph.nodes['u1']).toMatchObject({
      turnId: 'u1',
      parentTurnIds: [],
      parentAnomaly: 'self-parent',
      branchName: 'main',
    });
    expect(graph.nodes['u1']?.forkPointTurnId).toBeUndefined();
    expect(graph.branches['main']).toEqual({ name: 'main' });
  });

  it('places simultaneous children of one parent on isolated branches', () => {
    const { actor } = harness();
    actor.send({
      type: 'NEW_USER_TURN',
      abandonedTurnIds: [],
      atRevision: 1,
      newTurnId: 'u2',
      chatId: 'chat-a',
      parentTurnId: 'u1',
    });
    actor.send({
      type: 'NEW_USER_TURN',
      abandonedTurnIds: [],
      atRevision: 1,
      newTurnId: 'u3',
      chatId: 'chat-b',
      parentTurnId: 'u1',
    });

    const { graph } = actor.getSnapshot().context;
    expect(graph.nodes['u2']?.branchName).toBe('main');
    expect(graph.nodes['u3']?.branchName).toMatch(/^explore\//);
    expect(graph.nodes['u3']).toMatchObject({ parentTurnIds: ['u1'], forkPointTurnId: 'u1' });
    expect(graph.nodes['u2']?.branchName).not.toBe(graph.nodes['u3']?.branchName);
  });

  it('retires a chat-only pending turn so later work does not become a false fork', () => {
    const { actor } = harness();
    actor.send({
      type: 'NEW_USER_TURN',
      abandonedTurnIds: [],
      atRevision: 0,
      newTurnId: 'chat-only',
      chatId: 'chat-a',
    });
    actor.send({ type: 'DISCARD_PENDING_TURN', turnId: 'chat-only' });
    actor.send({
      type: 'NEW_USER_TURN',
      abandonedTurnIds: [],
      atRevision: 0,
      newTurnId: 'u1',
      chatId: 'chat-b',
    });

    const { graph } = actor.getSnapshot().context;
    expect(graph.nodes['chat-only']).toBeUndefined();
    expect(graph.nodes['u1']?.branchName).toBe('main');
  });

  it('persists an authoritative stale-head outcome without recalculating CAS in the projection', () => {
    const { actor } = harness();
    actor.send({
      type: 'authoritativeRevisionFinalized',
      result: finalization({
        turnId: 'u2',
        revisionId: 'rev-auth-2',
        treeId: 'tree-auth-2',
        publication: {
          status: 'conflicted',
          branchName: 'main',
          expectedHeadRevisionId: 'rev-base',
          actualHeadRevisionId: 'rev-auth-9',
          proposedHeadRevisionId: 'rev-auth-2',
        },
      }),
    });

    const { graph } = actor.getSnapshot().context;
    expect(graph.branches['main']?.headRevisionId).toBe('rev-auth-9');
    expect(graph.branches['main']?.publication).toEqual({
      status: 'conflicted',
      branchName: 'main',
      expectedHeadRevisionId: 'rev-base',
      actualHeadRevisionId: 'rev-auth-9',
      proposedHeadRevisionId: 'rev-auth-2',
    });
    expect(graph.nodes['u2']?.conflict).toEqual({
      type: 'stale-head',
      branchName: 'main',
      expectedHeadRevisionId: 'rev-base',
      actualHeadRevisionId: 'rev-auth-9',
      proposedHeadRevisionId: 'rev-auth-2',
    });

    actor.send({
      type: 'authoritativeRevisionFinalized',
      result: finalization({
        turnId: 'u2',
        revisionId: 'rev-auth-2',
        treeId: 'tree-auth-2',
        publication: {
          status: 'updated',
          branchName: 'main',
          expectedHeadRevisionId: 'rev-auth-9',
          previousHeadRevisionId: 'rev-auth-9',
          headRevisionId: 'rev-auth-2',
        },
      }),
    });
    expect(actor.getSnapshot().context.graph.nodes['u2']?.conflict).toBeUndefined();
  });

  it('records a background branch finalization without changing the viewed branch', () => {
    const { actor } = harness({
      initial: { headTurnId: 'u-viewed', supersededTurnIds: [], dirty: true },
    });
    actor.send({
      type: 'authoritativeRevisionFinalized',
      result: finalization({
        turnId: 'u-background',
        revisionId: 'rev-background',
        treeId: 'tree-background',
        branchName: 'exploration',
        publication: {
          status: 'updated',
          branchName: 'exploration',
          expectedHeadRevisionId: 'rev-base',
          previousHeadRevisionId: 'rev-base',
          headRevisionId: 'rev-background',
        },
      }),
    });

    const { graph } = actor.getSnapshot().context;
    expect(graph.activeBranch).toBe('main');
    expect(graph.branches['exploration']?.headRevisionId).toBe('rev-background');
    expect(actor.getSnapshot().context).toMatchObject({ headTurnId: '', dirty: false });
  });

  it('keeps a merge conflict inspectable after terminal transcript cleanup removed the pending node', () => {
    const { actor } = harness();
    actor.send({
      type: 'SET_REVISION_CONFLICT',
      turnId: 'u-conflicted',
      chatId: 'chat-a',
      branchName: 'explore/conflict',
      conflict: { type: 'merge', kind: 'text', paths: ['main.scad'] },
    });

    expect(actor.getSnapshot().context.graph.nodes['u-conflicted']).toMatchObject({
      status: 'pending',
      chatId: 'chat-a',
      branchName: 'explore/conflict',
      conflict: { type: 'merge', kind: 'text', paths: ['main.scad'] },
    });
  });

  it('serializes and reloads every finalized identity, provenance, publication, path, and native Git field', () => {
    const first = harness();
    const result = finalization({
      nativeGit: { status: 'stored', commitId: 'abcdef', objectFormat: 'sha1' },
      changedPaths: ['z.ts', 'main.ts', 'main.ts'],
    });
    first.actor.send({ type: 'authoritativeRevisionFinalized', result });
    first.actor.send({ type: 'TURN_COMPLETED', turnId: result.turnId, chatId: result.chatId });

    const persisted = structuredClone(first.persist.mock.lastCall?.[0]);
    expect(persisted?.graph?.nodes['u1']).toMatchObject({
      revisionId: 'rev-auth-1',
      baseRevisionId: 'rev-base',
      treeId: 'tree-auth-1',
      changedPaths: ['main.ts', 'z.ts'],
      provenance: { runId: 'run-1' },
      nativeGit: { status: 'stored', commitId: 'abcdef' },
      publication: { status: 'updated', headRevisionId: 'rev-auth-1' },
    });

    const second = harness({ initial: persisted });
    expect(second.actor.getSnapshot().context.graph).toEqual(persisted?.graph);
  });

  it('persists editable summaries, job associations, and merge-conflict metadata as serializable graph state', () => {
    const { actor } = harness();
    actor.send({
      type: 'NEW_USER_TURN',
      abandonedTurnIds: [],
      atRevision: 0,
      newTurnId: 'u1',
      chatId: 'chat-a',
    });
    actor.send({ type: 'EDIT_SUMMARY', turnId: 'u1', summary: '  Stable bracket exploration  ' });
    actor.send({ type: 'ASSOCIATE_JOB', turnId: 'u1', jobId: 'job-9' });
    actor.send({ type: 'ASSOCIATE_JOB', turnId: 'u1', jobId: 'job-9' });
    actor.send({
      type: 'SET_REVISION_CONFLICT',
      turnId: 'u1',
      conflict: { type: 'merge', kind: 'modify-delete', paths: ['main.ts'] },
    });

    const { graph } = actor.getSnapshot().context;
    expect(graph.nodes['u1']).toMatchObject({
      editedSummary: 'Stable bracket exploration',
      jobIds: ['job-9'],
      conflict: { type: 'merge', kind: 'modify-delete', paths: ['main.ts'] },
    });
    expect(structuredClone(graph)).toEqual(graph);
    expect(() => JSON.stringify(graph)).not.toThrow();
  });
});
