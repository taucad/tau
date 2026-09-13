/**
 * `publish.machine`'s full path table (S47, I30, AC27).
 *
 * Hand-enumerated rather than graph-generated: every state but `idle`,
 * `success` and `error` is an invoked effect, and `getSimplePaths` never enters
 * an `onError` or an `after`, which is where this machine's whole contract
 * lives.
 *
 * | # | Path | What it proves |
 * | --- | --- | --- |
 * | 1 | `idle --publish--> choosingVersion` | the names come from the graph, not from a snapshot |
 * | 2 | `choosingVersion → error` | `listVersions` has a failure edge (I29) |
 * | 3 | `choosingVersion --cancel--> idle` | Cancel before anything is written writes nothing |
 * | 4 | `choosingVersion --confirm--> tagging → pushing --pushSettled--> publishing → success` | the happy path, with `published` and the link |
 * | 5 | `tagging → error` | naming has a failure edge |
 * | 6 | `pushing → error` (rejected push) | a refused push is an error, never a silent publish |
 * | 7 | `pushing --after--> error` | **red pin (d)**: no settlement inside the bound lands in `error`, never hangs |
 * | 8 | `pushing --pushSettled(foreign)-->` | an uncorrelated settlement does not advance the push |
 * | 9 | `publishing → error` | the API call has a failure edge |
 * | 10 | `error --publish--> choosingVersion` | retry from a failure |
 * | 11 | `success --publish--> choosingVersion` | re-publish re-enters the picker with the names |
 * | 12 | `success --reset--> idle` | the dialog closes |
 * | 13 | `confirm` with no revision → `error` | a project with no revisions says so |
 * | 14 | `tagging --cancel--> idle`, `pushing --cancel--> idle` | both mid-flight cancels |
 * | 15 | startup/stop, serializable context, one exported machine | the `create-machine` verify list |
 * | 16 | `tagging` names the revision the dialog read, never a new one | W6-a2: `tagging` never cuts |
 * | 17 | `confirm` while `choosingVersion.reading` is in flight | *Publish* is one gesture: the panel's button and `tau publish <name>` confirm without waiting |
 * | 18 | `pushing --pushSettled(failed\|queued\|conflicted)--> error` | **P39**: a settlement that names this push but did not reach the remote never publishes |
 * | 19 | the push offers `refs/tags/<name>` with the remote's own value as its lease | **P38**: a re-publish moves the name under a lease, never a force |
 */

import { createActor, fromPromise } from 'xstate';
import type { Actor, PromiseActorLogic } from 'xstate';
import { describe, expect, it } from 'vitest';

import * as machineModule from '#publish.machine.js';
import { publishMachine, publishPushMilliseconds, selectPublishFacet } from '#publish.machine.js';
import type {
  PublishActors,
  PublishDraft,
  PublishMachineEmitted,
  PublishTagActorInput,
  PublishVersionsActorOutput,
} from '#publish.machine.js';
import { revisionId } from '@taucad/filesystem/revisions';

import type { RevisionTag } from '#revision-port.js';
import { createManualClock } from '#test/fake-actors.js';

const tagV1: RevisionTag = {
  name: 'v1',
  revisionId: revisionId('rev-1'),
  note: undefined,
  actor: undefined,
  createdAt: 1,
};

const draft: PublishDraft = {
  tag: 'v2',
  projectName: 'bracket',
  entryPath: 'main.ts',
  visibility: 'public',
  title: 'Bracket',
};

const isMachine = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

/** A stub that never settles: the state under test is the one in flight. */
const pending = <Output, Input>(): PromiseActorLogic<Output, Input> =>
  fromPromise<Output, Input>(
    async () =>
      new Promise<Output>(() => {
        /* Deliberately never settles. */
      }),
  );

/** A stub that takes its slot's failure edge (I29). */
const failing = <Output, Input>(message: string): PromiseActorLogic<Output, Input> =>
  fromPromise<Output, Input>(async () => {
    await Promise.resolve();
    throw new Error(message);
  });

const versions = (output: PublishVersionsActorOutput): PublishActors['listVersions'] => fromPromise(async () => output);

const head: PublishVersionsActorOutput = {
  tags: [tagV1],
  revisionId: 'rev-2',
  expected: 'rev-1',
  /* The remote holds `v1` at the revision the local tag names (P38). */
  remoteTags: { v1: 'rev-1' },
};

type Started = Readonly<{
  actor: Actor<typeof publishMachine>;
  emitted: PublishMachineEmitted[];
  clock: ReturnType<typeof createManualClock>;
  calls: Array<Readonly<{ name: string; input: unknown }>>;
}>;

/**
 * A machine already in `pushing`, waiting for the settlement that names it.
 *
 * The W13 seam: `sync.machine` owns the push and settles it by event. Reached
 * by snapshot because publish's own `push` actor raises `backedUp` the moment
 * it resolves, so no runtime path can deliver a non-success settlement here
 * today (review R3, P39).
 *
 * @param overrides - Actors this row replaces.
 * @returns The started actor, parked in `pushing` with `pushId` `push-1`.
 */
const startPushing = (overrides: Partial<PublishActors> = {}): Started =>
  start(
    { push: pending(), ...overrides },
    {
      value: 'pushing',
      context: {
        projectId: 'p1',
        branch: 'main',
        tags: [tagV1],
        revisionId: 'rev-2',
        expected: 'rev-1',
        remoteTags: { v1: 'rev-1' },
        tag: undefined,
        draft,
        pushId: 'push-1',
        publicationId: undefined,
        shareUrl: undefined,
        error: undefined,
      },
    },
  );

const start = (
  overrides: Partial<PublishActors> = {},
  from?: Parameters<typeof publishMachine.resolveState>[0],
): Started => {
  const calls: Array<Readonly<{ name: string; input: unknown }>> = [];
  const record = <Output, Input>(name: string, answer: (input: Input) => Output): PromiseActorLogic<Output, Input> =>
    // oxlint-disable-next-line @typescript-eslint/no-unsafe-return -- the generic pair is the slot's own.
    fromPromise<Output, Input>(async ({ input }) => {
      calls.push({ name, input });
      return answer(input);
    });

  const actors: PublishActors = {
    listVersions: versions(head),
    createTag: record<RevisionTag, PublishTagActorInput>('createTag', (input) => ({
      name: input.name,
      revisionId: revisionId(input.revisionId),
      note: input.note,
      actor: undefined,
      createdAt: 2,
    })),
    push: record('push', () => ({ pushId: 'push-1' })),
    createPublication: record('createPublication', () => ({ publicationId: 'pub_1', url: 'https://tau.new/p/pub_1' })),
    ...overrides,
  };
  const clock = createManualClock();
  const provided = publishMachine.provide({ actors });
  const actor =
    from === undefined
      ? createActor(provided, { clock, input: { projectId: 'p1' } })
      : createActor(provided, { clock, input: { projectId: 'p1' }, snapshot: provided.resolveState(from) });
  const emitted: PublishMachineEmitted[] = [];
  for (const type of ['published', 'toast.info', 'toast.error'] as const) {
    actor.on(type, (event) => emitted.push(event));
  }
  actor.start();
  return { actor, emitted, clock, calls };
};

const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 8; turn += 1) {
    // oxlint-disable-next-line no-await-in-loop -- draining the microtask queue between invoked steps.
    await Promise.resolve();
  }
};

describe('publishMachine', () => {
  it('1: reads this project’s names from the graph when the dialog opens', async () => {
    const { actor } = start();

    actor.send({ type: 'publish' });
    await settle();

    expect(actor.getSnapshot().matches({ choosingVersion: 'ready' })).toBe(true);
    expect(selectPublishFacet(actor.getSnapshot())).toStrictEqual({
      phase: 'choosingVersion',
      tags: [tagV1],
      publicationId: undefined,
      shareUrl: undefined,
      error: undefined,
    });
    actor.stop();
  });

  it('2: fails visibly when the names cannot be read', async () => {
    const { actor, emitted } = start({ listVersions: failing('graph unreadable') });

    actor.send({ type: 'publish' });
    await settle();

    expect(actor.getSnapshot().matches('error')).toBe(true);
    expect(selectPublishFacet(actor.getSnapshot()).error).toBe('graph unreadable');
    expect(emitted).toContainEqual({ type: 'toast.error', message: 'graph unreadable' });
    actor.stop();
  });

  it('3: writes nothing when the dialog is cancelled before confirming', async () => {
    const { actor, calls } = start();

    actor.send({ type: 'publish' });
    await settle();
    actor.send({ type: 'cancel' });

    expect(actor.getSnapshot().matches('idle')).toBe(true);
    expect(calls).toStrictEqual([]);
    actor.stop();
  });

  it('4: names, pushes and records the publication in one pass', async () => {
    const { actor, emitted, calls } = start();

    actor.send({ type: 'publish' });
    await settle();
    actor.send({ type: 'confirm', draft });
    await settle();

    expect(actor.getSnapshot().matches('success')).toBe(true);
    expect(calls.map((call) => call.name)).toStrictEqual(['createTag', 'push', 'createPublication']);
    expect(calls[1]?.input).toStrictEqual({ branch: 'main', tag: 'v2', expected: 'rev-1', expectedTag: undefined });
    expect(calls[2]?.input).toMatchObject({ projectId: 'p1', tag: 'v2', revisionId: 'rev-2', visibility: 'public' });
    expect(emitted).toContainEqual({
      type: 'published',
      publicationId: 'pub_1',
      url: 'https://tau.new/p/pub_1',
      tag: 'v2',
    });
    expect(selectPublishFacet(actor.getSnapshot()).shareUrl).toBe('https://tau.new/p/pub_1');
    actor.stop();
  });

  it('5: fails visibly when the name cannot be written', async () => {
    const { actor } = start({ createTag: failing('name already used by a branch') });

    actor.send({ type: 'publish' });
    await settle();
    actor.send({ type: 'confirm', draft });
    await settle();

    expect(actor.getSnapshot().matches('error')).toBe(true);
    expect(selectPublishFacet(actor.getSnapshot()).error).toBe('name already used by a branch');
    actor.stop();
  });

  it('6: treats a refused push as an error, never as a publication', async () => {
    const { actor, calls } = start({ push: failing('someone else moved main') });

    actor.send({ type: 'publish' });
    await settle();
    actor.send({ type: 'confirm', draft });
    await settle();

    expect(actor.getSnapshot().matches('error')).toBe(true);
    expect(selectPublishFacet(actor.getSnapshot()).error).toBe('someone else moved main');
    expect(calls.map((call) => call.name)).not.toContain('createPublication');
    actor.stop();
  });

  it('7: lands in error when no settlement names the push inside the bound', async () => {
    const { actor, clock } = start({ push: pending() });

    actor.send({ type: 'publish' });
    await settle();
    actor.send({ type: 'confirm', draft });
    await settle();
    expect(actor.getSnapshot().matches('pushing')).toBe(true);

    clock.advance(publishPushMilliseconds);
    await settle();

    expect(actor.getSnapshot().matches('error')).toBe(true);
    expect(selectPublishFacet(actor.getSnapshot()).error).toContain('could not confirm');
    actor.stop();
  });

  it('8: ignores a settlement that names another push', async () => {
    const { actor } = start({ push: pending() });

    actor.send({ type: 'publish' });
    await settle();
    actor.send({ type: 'confirm', draft });
    await settle();
    actor.send({ type: 'pushSettled', pushId: 'another-push', outcome: 'backedUp' });
    await settle();

    expect(actor.getSnapshot().matches('pushing')).toBe(true);
    actor.stop();
  });

  /*
   * The seam W13 lands on: `sync.machine` owns the push and settles it by
   * event. Asserted as a pure transition because publish's own `push` actor
   * raises `backedUp` the moment it resolves, so today no runtime path can
   * deliver a non-success settlement to this state (review R3, P39).
   */
  it.each([['failed'], ['queued'], ['conflicted']] as const)(
    '18: a %s settlement that names this push lands in error, never in publishing (P39)',
    async (outcome) => {
      const { actor, calls } = startPushing();
      expect(actor.getSnapshot().matches('pushing')).toBe(true);

      actor.send({ type: 'pushSettled', pushId: 'push-1', outcome });
      await settle();

      expect(actor.getSnapshot().matches('error')).toBe(true);
      expect(selectPublishFacet(actor.getSnapshot()).error).not.toBeUndefined();
      expect(calls.map((call) => call.name)).not.toContain('createPublication');
      actor.stop();
    },
  );

  it('18: a backedUp settlement that names this push publishes (P39)', async () => {
    const { actor } = startPushing();

    actor.send({ type: 'pushSettled', pushId: 'push-1', outcome: 'backedUp' });
    await settle();

    expect(actor.getSnapshot().matches('success')).toBe(true);
    actor.stop();
  });

  it('19: offers the name under the lease the remote advertised, never a force (P38)', async () => {
    const { actor, calls } = start();

    actor.send({ type: 'publish' });
    await settle();
    actor.send({ type: 'confirm', draft: { ...draft, tag: 'v1' } });
    await settle();

    const push = calls.find((call) => call.name === 'push');
    expect(push?.input).toMatchObject({ tag: 'v1', expected: 'rev-1', expectedTag: 'rev-1' });
    actor.stop();
  });

  it('19: leases "must not exist" for a name the remote does not hold (P38)', async () => {
    const { actor, calls } = start();

    actor.send({ type: 'publish' });
    await settle();
    actor.send({ type: 'confirm', draft: { ...draft, tag: 'v2' } });
    await settle();

    const push = calls.find((call) => call.name === 'push');
    expect(push?.input).toMatchObject({ tag: 'v2' });
    expect((push?.input as { expectedTag?: string }).expectedTag).toBeUndefined();
    actor.stop();
  });

  it('9: fails visibly when the publication cannot be recorded', async () => {
    const { actor } = start({ createPublication: failing('storage quota reached') });

    actor.send({ type: 'publish' });
    await settle();
    actor.send({ type: 'confirm', draft });
    await settle();

    expect(actor.getSnapshot().matches('error')).toBe(true);
    expect(selectPublishFacet(actor.getSnapshot()).error).toBe('storage quota reached');
    actor.stop();
  });

  it('10: retries from a failure without restarting the actor', async () => {
    const { actor } = start({ listVersions: failing('offline') });

    actor.send({ type: 'publish' });
    await settle();
    expect(actor.getSnapshot().matches('error')).toBe(true);

    actor.send({ type: 'publish' });

    expect(actor.getSnapshot().matches('choosingVersion')).toBe(true);
    expect(selectPublishFacet(actor.getSnapshot()).error).toBeUndefined();
    actor.stop();
  });

  it('11: re-publishing re-enters the picker with the names already taken', async () => {
    const { actor } = start();

    actor.send({ type: 'publish' });
    await settle();
    actor.send({ type: 'confirm', draft });
    await settle();
    expect(actor.getSnapshot().matches('success')).toBe(true);

    actor.send({ type: 'publish', tag: 'v2' });
    await settle();

    expect(actor.getSnapshot().matches('choosingVersion')).toBe(true);
    expect(actor.getSnapshot().context.tag).toBe('v2');
    actor.stop();
  });

  it('12: closes back to idle', async () => {
    const { actor } = start();

    actor.send({ type: 'publish' });
    await settle();
    actor.send({ type: 'confirm', draft });
    await settle();
    actor.send({ type: 'reset' });

    expect(actor.getSnapshot().matches('idle')).toBe(true);
    actor.stop();
  });

  it('13: refuses a project that has no revisions yet', async () => {
    const { actor } = start({
      listVersions: versions({ tags: [], revisionId: undefined, expected: undefined, remoteTags: {} }),
    });

    actor.send({ type: 'publish' });
    await settle();
    actor.send({ type: 'confirm', draft });
    await settle();

    expect(actor.getSnapshot().matches('error')).toBe(true);
    expect(selectPublishFacet(actor.getSnapshot()).error).toContain('no revisions yet');
    actor.stop();
  });

  it('14: cancels out of naming and out of pushing', async () => {
    const naming = start({ createTag: pending() });
    naming.actor.send({ type: 'publish' });
    await settle();
    naming.actor.send({ type: 'confirm', draft });
    await settle();
    expect(naming.actor.getSnapshot().matches('tagging')).toBe(true);
    naming.actor.send({ type: 'cancel' });
    expect(naming.actor.getSnapshot().matches('idle')).toBe(true);
    naming.actor.stop();

    const pushing = start({ push: pending() });
    pushing.actor.send({ type: 'publish' });
    await settle();
    pushing.actor.send({ type: 'confirm', draft });
    await settle();
    expect(pushing.actor.getSnapshot().matches('pushing')).toBe(true);
    pushing.actor.send({ type: 'cancel' });
    expect(pushing.actor.getSnapshot().matches('idle')).toBe(true);
    pushing.actor.stop();
  });

  it('15: starts headlessly, keeps a serializable context and exports one machine', () => {
    const actor = createActor(publishMachine, { input: { projectId: 'p1' } });

    actor.start();

    expect(actor.getSnapshot().matches('idle')).toBe(true);
    expect(() => JSON.stringify(actor.getSnapshot().context)).not.toThrow();
    expect(Object.values(machineModule).filter((value) => isMachine(value))).toStrictEqual([publishMachine]);

    actor.stop();
  });

  it('17: holds a confirm that arrives before the names have been read', async () => {
    const settler = Promise.withResolvers<PublishVersionsActorOutput>();
    const { actor, calls } = start({ listVersions: fromPromise(async () => settler.promise) });

    actor.send({ type: 'publish' });
    actor.send({ type: 'confirm', draft });
    await settle();
    expect(calls).toStrictEqual([]);

    settler.resolve(head);
    await settle();

    expect(actor.getSnapshot().matches('success')).toBe(true);
    expect(calls.map((call) => call.name)).toStrictEqual(['createTag', 'push', 'createPublication']);
    actor.stop();
  });

  it('16: names the revision the dialog read, and never asks for a new one', async () => {
    const { actor, calls } = start();

    actor.send({ type: 'publish' });
    await settle();
    actor.send({ type: 'confirm', draft: { ...draft, note: 'first release' } });
    await settle();

    expect(calls[0]).toStrictEqual({
      name: 'createTag',
      input: { name: 'v2', revisionId: 'rev-2', note: 'first release' },
    });
    actor.stop();
  });
});
