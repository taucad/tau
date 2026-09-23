/**
 * `remote.machine`'s full path table (S47, I30).
 *
 * Hand-enumerated rather than graph-generated: every state but `connected` is
 * an invoked effect, and `getSimplePaths` never enters an `onError`, which is
 * exactly half of what this machine is for.
 *
 * | # | Path | What it proves |
 * | --- | --- | --- |
 * | 1 | `reading → none` | a project with no remote starts disconnected |
 * | 2 | `reading → connected` | rehydration is git's remotes list, not a snapshot (D29) |
 * | 3 | `reading → failed` | the read has a failure edge (I29) |
 * | 4 | `none --connect none-->` | *No remote* on a project with none is a no-op |
 * | 5 | `none → choosing → authorizing → validating → initialSync → connected` | the happy path, with `remoteConnected` and a toast |
 * | 6 | `choosing → failed` | `writeRemote` has a failure edge |
 * | 7 | `authorizing --authorized--> validating` | an out-of-band consent finishes the step (W12) |
 * | 8 | `authorizing → failed` | `authorize` has a failure edge |
 * | 9 | `validating --validated--> initialSync` | a host that validated itself, with storage |
 * | 10 | `validating → failed` | `validate` has a failure edge |
 * | 11 | `initialSync → failed` | a failed first sync toasts and does not claim *Backed up* |
 * | 12 | `connected --disconnect--> disconnecting → none` | disconnecting keeps history and emits |
 * | 13 | `disconnecting → failed` | `removeRemote` has a failure edge |
 * | 14 | `authorizing --cancel--> disconnecting → none` | cancelling mid-connect removes what was written |
 * | 15 | `connected --quotaRefused-->` | the over-quota file list reaches the facet (D16, AC16) |
 * | 16 | `failed --connect--> choosing` | retry from a failure |
 * | 17 | `connected --connect none--> disconnecting` | picking *No remote* disconnects |
 * | 18 | startup/stop, serializable context, one exported machine | the `create-machine` verify list |
 * | 19 | `choosing --cancel--> none` | Cancel before anything is written removes nothing and fails nothing |
 * | 20 | `initialSync --onDone[overQuota]--> connected` | a storage refusal keeps the remote and raises `quotaRefused` (P19) |
 * | 21 | `validating --cancel--> disconnecting → none` | the last `cancel` edge |
 * | 22 | `validating → reconnectRequired` | a credential the session can no longer mint is not a failed remote (W12) |
 * | 23 | `reconnectRequired --authorized--> validating → … → connected` | *Reconnect GitHub* re-validates without rewriting the remote |
 * | 24 | `initialSync → reconnectRequired` | the same rule on the push, so a rotated `AUTH_SECRET` never reads as a failed push |
 * | 25 | `authorizing → reconnectRequired` | the third `onError` edge into it, so all three are covered |
 * | 26 | `reconnectRequired --connect--> choosing` | the edge *Reconnect GitHub* actually takes |
 * | 27 | `reconnectRequired --disconnect--> disconnecting → none` | leaving a remote whose credential died |
 * | 28 | `reading --connect--> choosing → … → connected` | an opening gesture is not lost behind config rehydration |
 *
 * | 29 | `authorizing|validating|initialSync → abandoning → failed` | **C10**: a failed attempt removes the remote it wrote, so the next open is not `connected` |
 * | 30 | `reconnectRequired --authorized--> validating → failed` | **C10**: and an attempt that wrote nothing removes nothing |
 *
 * With rows 25–27 every transition in the machine has a row (W12 review R6).
 */

import { createActor, createAsyncLogic, setup } from 'xstate';
import type { Actor, AsyncActorLogic } from 'xstate';
import { describe, expect, it } from 'vitest';

import * as machineModule from '#remote.machine.js';
import { remoteMachine, selectRemoteFacet } from '#remote.machine.js';
import { reauthorizationRequired } from '#remotes.js';
import { RevisionPortError } from '#revision-port.js';
import type { RevisionPortErrorCode } from '#revision-port.js';
import type { SyncFailureReason } from '#sync.types.js';
import type {
  RemoteActors,
  RemoteInitialSyncActorOutput,
  RemoteMachineEmitted,
  RemoteRecord,
  RemoteValidateActorOutput,
} from '#remote.machine.js';

const tauRemote: RemoteRecord = { name: 'tau', url: 'https://api.tau.new/v1/git/p1.git', kind: 'tau' };

const isMachine = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

/*
 * Every stub is typed by the slot it fills.
 *
 * `PromiseActorLogic` carries its output *and* its input inside the snapshot
 * type, which `transition` both takes and returns — so the slot is invariant in
 * both and a narrower stub (`{ remote: RemoteRecord }` for a slot declared
 * `{ remote: RemoteRecord | undefined }`, or a `never`-returning failure) is
 * genuinely not assignable. The fix is to say what each stub is, never to erase
 * it with an assertion: `pending`/`failing` take their two parameters from the
 * contextual type of the property they are written into, and the resolving
 * stubs are annotated with the slot type itself.
 */

/** A stub that never settles: the state under test is the one in flight. */
const pending = <Output, Input>(): AsyncActorLogic<Output, Input> =>
  createAsyncLogic<Output, Input>({
    run: async () =>
      new Promise<Output>(() => {
        /* Deliberately never settles. */
      }),
  });

/** A stub that takes its slot's failure edge (I29). */
const failing = <Output, Input>(message: string): AsyncActorLogic<Output, Input> =>
  createAsyncLogic<Output, Input>({
    run: async () => {
      await Promise.resolve();
      throw new Error(message);
    },
  });

/** A stub whose failure says "grant the credential again", not "the remote is broken". */
const reauthorizing = <Output, Input>(message: string): AsyncActorLogic<Output, Input> =>
  createAsyncLogic<Output, Input>({
    run: async () => {
      await Promise.resolve();
      throw reauthorizationRequired(message);
    },
  });

/** `readRemote` answering with the remote git's config already holds. */
const reads = (remote: RemoteRecord | undefined): RemoteActors['readRemote'] =>
  createAsyncLogic({ run: async () => ({ remote }) });

type Overrides = Partial<RemoteActors>;

const start = (
  overrides: Overrides = {},
): Readonly<{ actor: Actor<typeof remoteMachine>; emitted: RemoteMachineEmitted[] }> => {
  const actors: RemoteActors = {
    readRemote: reads(undefined),
    writeRemote: createAsyncLogic({ run: async () => ({ remote: tauRemote }) }),
    removeRemote: createAsyncLogic({ run: async (): Promise<void> => undefined }),
    authorize: createAsyncLogic({ run: async (): Promise<void> => undefined }),
    validate: createAsyncLogic({
      run: async (): Promise<RemoteValidateActorOutput> => ({
        storage: { used: 2_100_000_000, quota: 10_000_000_000 },
      }),
    }),
    initialSync: createAsyncLogic({ run: async (): Promise<RemoteInitialSyncActorOutput> => ({}) }),
    ...overrides,
  };
  const actor = createActor(remoteMachine.provide({ actors }), { input: { projectId: 'p1' } });
  const emitted: RemoteMachineEmitted[] = [];
  for (const type of ['remoteConnected', 'remoteDisconnected', 'toast.info', 'toast.error'] as const) {
    actor.on(type, (event) => emitted.push(event));
  }
  actor.start();
  return { actor, emitted };
};

const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 8; turn += 1) {
    // oxlint-disable-next-line no-await-in-loop -- draining the microtask queue between invoked steps.
    await Promise.resolve();
  }
};

describe('remoteMachine', () => {
  it('tells its parent when the remote comes and goes, so a sibling scheduler starts on the fact (W18 review DEF-6b, P53)', async () => {
    const received: Array<{ type: string }> = [];
    const parent = createActor(
      setup({}).createMachine({
        on: {
          /* The wildcard is XState's own event key, not a method name. */
          // eslint-disable-next-line @typescript-eslint/naming-convention -- XState wildcard event key
          '*': ({ event }, enq) => {
            enq(() => received.push(event));
            return {};
          },
        },
      }),
    ).start();
    const actor = createActor(remoteMachine.provide({ actors: start().actor.logic.sources.actors as RemoteActors }), {
      input: { projectId: 'p1', parentRef: parent },
    });
    actor.start();
    await settle();

    actor.send({ type: 'connect', kind: 'tau' });
    await settle();
    expect(actor.getSnapshot().matches('connected')).toBe(true);
    expect(received).toStrictEqual([
      { type: 'remoteConnected', kind: 'tau', url: tauRemote.url, name: tauRemote.name },
    ]);

    actor.send({ type: 'disconnect' });
    await settle();
    expect(received.at(-1)).toStrictEqual({ type: 'remoteDisconnected' });
    actor.stop();
    parent.stop();
  });

  it('1: starts disconnected when the project has no remote', async () => {
    const { actor } = start();

    await settle();

    expect(actor.getSnapshot().matches('none')).toBe(true);
    expect(selectRemoteFacet(actor.getSnapshot())).toStrictEqual({
      kind: 'none',
      url: undefined,
      phase: 'none',
      storage: undefined,
      quota: undefined,
      overQuota: [],
      error: undefined,
      reason: undefined,
      fetchOnly: false,
      provider: undefined,
      repositoryId: undefined,
    });
    actor.stop();
  });

  it('2: rehydrates a connected project from git’s own remotes list', async () => {
    const { actor } = start({ readRemote: reads(tauRemote) });

    await settle();

    expect(actor.getSnapshot().matches('connected')).toBe(true);
    expect(selectRemoteFacet(actor.getSnapshot())).toMatchObject({
      kind: 'tau',
      url: tauRemote.url,
      phase: 'connected',
    });
    actor.stop();
  });

  it('3: fails visibly when the remotes list cannot be read', async () => {
    const { actor } = start({ readRemote: failing('config unreadable') });

    await settle();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(selectRemoteFacet(actor.getSnapshot()).error).toBe('config unreadable');
    actor.stop();
  });

  it('28: accepts a connect gesture while the initial remotes read is still pending', async () => {
    const { actor } = start({ readRemote: pending() });

    actor.send({ type: 'connect', kind: 'tau' });
    expect(actor.getSnapshot().matches('choosing')).toBe(true);
    await settle();

    expect(actor.getSnapshot().matches('connected')).toBe(true);
    actor.stop();
  });

  it('4: treats “no remote” on a project with none as nothing to do', async () => {
    const { actor } = start();
    await settle();

    actor.send({ type: 'connect', kind: 'none' });

    expect(actor.getSnapshot().matches('none')).toBe(true);
    actor.stop();
  });

  it('5: connects through choose, authorize, validate and the first sync', async () => {
    const { actor, emitted } = start();
    await settle();

    actor.send({ type: 'connect', kind: 'tau' });
    expect(actor.getSnapshot().matches('choosing')).toBe(true);
    await settle();

    expect(actor.getSnapshot().matches('connected')).toBe(true);
    expect(selectRemoteFacet(actor.getSnapshot())).toStrictEqual({
      kind: 'tau',
      url: tauRemote.url,
      phase: 'connected',
      storage: { used: 2_100_000_000, quota: 10_000_000_000 },
      quota: undefined,
      overQuota: [],
      error: undefined,
      reason: undefined,
      fetchOnly: false,
      provider: undefined,
      repositoryId: undefined,
    });
    expect(emitted).toStrictEqual([
      { type: 'remoteConnected', kind: 'tau', url: tauRemote.url },
      { type: 'toast.info', message: 'This project is backed up.' },
    ]);
    actor.stop();
  });

  it('6: fails when the remote cannot be recorded', async () => {
    const { actor } = start({ writeRemote: failing('config is read-only') });
    await settle();

    actor.send({ type: 'connect', kind: 'tau' });
    await settle();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(actor.getSnapshot().context.error).toBe('config is read-only');
    actor.stop();
  });

  it('7: accepts an authorization that finished out of band', async () => {
    const { actor } = start({ authorize: pending() });
    await settle();

    actor.send({ type: 'connect', kind: 'tau' });
    await settle();
    expect(actor.getSnapshot().matches('authorizing')).toBe(true);

    actor.send({ type: 'authorized' });
    await settle();

    expect(actor.getSnapshot().matches('connected')).toBe(true);
    actor.stop();
  });

  it('8: fails when the authority is refused', async () => {
    const { actor } = start({ authorize: failing('consent was declined') });
    await settle();

    actor.send({ type: 'connect', kind: 'tau' });
    await settle();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(actor.getSnapshot().context.error).toBe('consent was declined');
    actor.stop();
  });

  it('9: accepts a validation the host performed, with its storage figures', async () => {
    const { actor } = start({ validate: pending() });
    await settle();

    actor.send({ type: 'connect', kind: 'tau' });
    await settle();
    expect(actor.getSnapshot().matches('validating')).toBe(true);

    actor.send({ type: 'validated', storage: { used: 1, quota: 2 } });
    await settle();

    expect(actor.getSnapshot().matches('connected')).toBe(true);
    expect(actor.getSnapshot().context.storage).toStrictEqual({ used: 1, quota: 2 });
    actor.stop();
  });

  it('10: fails when the remote does not answer', async () => {
    const { actor } = start({ validate: failing('the remote did not answer') });
    await settle();

    actor.send({ type: 'connect', kind: 'tau' });
    await settle();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    actor.stop();
  });

  it('11: never claims “backed up” when the first sync fails', async () => {
    const { actor, emitted } = start({ initialSync: failing('the push was refused') });
    await settle();

    actor.send({ type: 'connect', kind: 'tau' });
    await settle();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(emitted).toStrictEqual([{ type: 'toast.error', message: 'the push was refused' }]);
    actor.stop();
  });

  it('29 (C10): a failed attempt removes the remote it wrote, so the next open is not “connected”', async () => {
    const removals: unknown[] = [];
    const removing: RemoteActors['removeRemote'] = createAsyncLogic({
      run: async ({ input }): Promise<void> => {
        removals.push(input);
      },
    });

    const stages: ReadonlyArray<Readonly<{ stage: string; overrides: Overrides }>> = [
      { stage: 'authorize', overrides: { authorize: failing('consent was refused') } },
      { stage: 'validate', overrides: { validate: failing('the remote did not answer') } },
      { stage: 'initialSync', overrides: { initialSync: failing('the push was refused') } },
    ];
    for (const { stage, overrides } of stages) {
      removals.length = 0;
      const { actor } = start({ ...overrides, removeRemote: removing });
      // oxlint-disable-next-line no-await-in-loop -- one connect attempt per stage.
      await settle();
      actor.send({ type: 'connect', kind: 'tau' });
      // oxlint-disable-next-line no-await-in-loop -- one connect attempt per stage.
      await settle();

      const facet = selectRemoteFacet(actor.getSnapshot());
      expect({ stage, removals: [...removals] }).toStrictEqual({ stage, removals: [{ name: 'tau' }] });
      /* `sync.machine` finds the remote through git's own config, not through
       * this machine's phase, so leaving the remote behind was the whole
       * defect: the next open read it as connected and started pushing. */
      expect({ stage, kind: facet.kind, phase: facet.phase }).toStrictEqual({
        stage,
        kind: 'none',
        phase: 'failed',
      });
      expect(facet.error).not.toBeUndefined();
      actor.stop();
    }
  });

  it('30 (C10): a reconnect that fails validation keeps the remote it did not write', async () => {
    const removals: unknown[] = [];
    let validations = 0;
    const { actor } = start({
      /* Reach `reconnectRequired` the way a rotated credential does. */
      authorize: reauthorizing('Your connection needs to be renewed.'),
      validate: createAsyncLogic({
        run: async (): Promise<RemoteValidateActorOutput> => {
          validations += 1;
          throw new Error('the remote did not answer');
        },
      }),
      removeRemote: createAsyncLogic({
        run: async ({ input }): Promise<void> => {
          removals.push(input);
        },
      }),
    });
    await settle();
    actor.send({ type: 'connect', kind: 'tau' });
    await settle();
    expect(actor.getSnapshot().matches('reconnectRequired')).toBe(true);

    /* Granting the credential again re-validates the *established* remote, so a
     * failure there is not this attempt's write to undo. */
    actor.send({ type: 'authorized' });
    await settle();

    expect(validations).toBe(1);
    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(removals).toStrictEqual([]);
    expect(actor.getSnapshot().context.remote).toStrictEqual(tauRemote);
    actor.stop();
  });

  it('12: disconnects, keeps the history, and says so', async () => {
    const { actor, emitted } = start({ readRemote: reads(tauRemote) });
    await settle();

    actor.send({ type: 'disconnect' });
    await settle();

    expect(actor.getSnapshot().matches('none')).toBe(true);
    expect(actor.getSnapshot().context.remote).toBeUndefined();
    expect(emitted).toStrictEqual([{ type: 'remoteDisconnected' }]);
    actor.stop();
  });

  it('13: fails when the remote cannot be removed', async () => {
    const { actor } = start({
      readRemote: reads(tauRemote),
      removeRemote: failing('config is read-only'),
    });
    await settle();

    actor.send({ type: 'disconnect' });
    await settle();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    actor.stop();
  });

  it('14: cancelling mid-connect removes the remote that was written', async () => {
    const removals: unknown[] = [];
    const { actor } = start({
      authorize: pending(),
      removeRemote: createAsyncLogic({
        run: async ({ input }): Promise<void> => {
          removals.push(input);
        },
      }),
    });
    await settle();

    actor.send({ type: 'connect', kind: 'tau' });
    await settle();
    actor.send({ type: 'cancel' });
    await settle();

    expect(actor.getSnapshot().matches('none')).toBe(true);
    expect(removals).toStrictEqual([{ name: 'tau' }]);
    actor.stop();
  });

  it('15: carries a refused push’s file list to the Sync region', async () => {
    const { actor } = start({ readRemote: reads(tauRemote) });
    await settle();

    actor.send({
      type: 'quotaRefused',
      paths: ['models/bracket.step', 'models/housing.step'],
      used: 10_500_000_000,
      quota: 10_000_000_000,
    });

    expect(selectRemoteFacet(actor.getSnapshot())).toMatchObject({
      phase: 'connected',
      overQuota: ['models/bracket.step', 'models/housing.step'],
      storage: { used: 10_500_000_000, quota: 10_000_000_000 },
    });
    actor.stop();
  });

  it('16: retries from a failure', async () => {
    const { actor } = start({ readRemote: failing('config unreadable') });
    await settle();

    actor.send({ type: 'connect', kind: 'tau' });
    await settle();

    expect(actor.getSnapshot().matches('connected')).toBe(true);
    expect(actor.getSnapshot().context.error).toBeUndefined();
    actor.stop();
  });

  it('17: picking “No remote” on a connected project disconnects it', async () => {
    const { actor } = start({ readRemote: reads(tauRemote) });
    await settle();

    actor.send({ type: 'connect', kind: 'none' });
    await settle();

    expect(actor.getSnapshot().matches('none')).toBe(true);
    actor.stop();
  });

  it('19: cancelling before anything is written removes nothing', async () => {
    const removals: unknown[] = [];
    const { actor } = start({
      writeRemote: pending(),
      removeRemote: createAsyncLogic({
        run: async ({ input }): Promise<void> => {
          removals.push(input);
        },
      }),
    });
    await settle();

    actor.send({ type: 'connect', kind: 'tau' });
    await settle();
    actor.send({ type: 'cancel' });
    await settle();

    /* The remote was never recorded, so Cancel is not a removal — and above all
     * not a `failed` the person cannot act on. */
    expect(actor.getSnapshot().matches('none')).toBe(true);
    expect(removals).toStrictEqual([]);
    expect(selectRemoteFacet(actor.getSnapshot())).toMatchObject({ kind: 'none', phase: 'none', error: undefined });
    actor.stop();
  });

  it('20: keeps the remote and names the files when the first sync is over the plan', async () => {
    const { actor, emitted } = start({
      initialSync: createAsyncLogic({
        run: async (): Promise<RemoteInitialSyncActorOutput> => ({
          overQuota: ['models/bracket.step'],
          message: 'This project is over its storage plan.',
          storage: { remainingBytes: 0, shortfallBytes: 5_242_880 },
        }),
      }),
    });
    await settle();

    actor.send({ type: 'connect', kind: 'tau' });
    await settle();

    /* Connected, because it is: the history is on the remote and the files that
     * did not fit are named rather than thrown away with an error (P19). */
    expect(actor.getSnapshot().matches('connected')).toBe(true);
    expect(selectRemoteFacet(actor.getSnapshot()).overQuota).toStrictEqual(['models/bracket.step']);
    /* C13: the numbers the server sent, not only the names. */
    expect(selectRemoteFacet(actor.getSnapshot()).quota).toStrictEqual({
      remainingBytes: 0,
      shortfallBytes: 5_242_880,
    });
    expect(emitted).toStrictEqual([
      { type: 'remoteConnected', kind: 'tau', url: tauRemote.url },
      { type: 'toast.error', message: 'This project is over its storage plan.' },
    ]);
    actor.stop();
  });

  it('21: cancelling while the remote is being checked removes what was written', async () => {
    const removals: unknown[] = [];
    const { actor } = start({
      validate: pending(),
      removeRemote: createAsyncLogic({
        run: async ({ input }): Promise<void> => {
          removals.push(input);
        },
      }),
    });
    await settle();

    actor.send({ type: 'connect', kind: 'tau' });
    await settle();
    actor.send({ type: 'cancel' });
    await settle();

    expect(actor.getSnapshot().matches('none')).toBe(true);
    expect(removals).toStrictEqual([{ name: 'tau' }]);
    actor.stop();
  });

  it('18: starts and stops with a serializable context and exports one machine', async () => {
    const { actor } = start();
    await settle();

    const { context } = actor.getSnapshot();
    expect(Object.values(context).every((value) => typeof value !== 'function')).toBe(true);
    /* Serializable means a host can persist it; `undefined` is the absence of a
     * value rather than a value that would be lost. */
    expect(() => JSON.stringify(context)).not.toThrow();
    expect(JSON.stringify(context)).toContain('"projectId":"p1"');
    expect(Object.values(machineModule).filter((value) => isMachine(value))).toEqual([remoteMachine]);

    actor.stop();
    expect(actor.getSnapshot().status).toBe('stopped');
  });

  /*
   * The *Reconnect GitHub* row (charter W12, S34).
   *
   * An `AUTH_SECRET` rotation invalidates every stored OAuth token, so the
   * session stops being able to mint a GitHub credential while the remote, the
   * history and the person's intent are all still exactly right. Reading that
   * as `failed` tells them nothing they can act on.
   */
  it('22: asks for the credential again rather than failing when the session cannot mint one', async () => {
    const { actor, emitted } = start({ validate: reauthorizing('Your GitHub connection needs to be renewed.') });
    await settle();

    actor.send({ type: 'connect', kind: 'git', url: 'https://github.com/owner/repository.git' });
    await settle();

    expect(actor.getSnapshot().matches('reconnectRequired')).toBe(true);
    expect(selectRemoteFacet(actor.getSnapshot())).toMatchObject({
      phase: 'reconnectRequired',
      url: tauRemote.url,
      error: 'Your GitHub connection needs to be renewed.',
    });
    // Nothing was torn down and nothing was claimed: no toast, no disconnect.
    expect(emitted).toStrictEqual([]);
    actor.stop();
  });

  it('23: re-validates on `authorized` without rewriting the remote', async () => {
    let renewed = false;
    const writes: unknown[] = [];
    const { actor, emitted } = start({
      writeRemote: createAsyncLogic({
        run: async ({ input }) => {
          writes.push(input);
          return { remote: tauRemote };
        },
      }),
      validate: createAsyncLogic({
        run: async (): Promise<RemoteValidateActorOutput> => {
          if (!renewed) {
            throw reauthorizationRequired('Your GitHub connection needs to be renewed.');
          }
          return {};
        },
      }),
    });
    await settle();

    actor.send({ type: 'connect', kind: 'git', url: 'https://github.com/owner/repository.git' });
    await settle();
    expect(actor.getSnapshot().matches('reconnectRequired')).toBe(true);

    renewed = true;
    actor.send({ type: 'authorized' });
    await settle();

    expect(actor.getSnapshot().matches('connected')).toBe(true);
    expect(selectRemoteFacet(actor.getSnapshot()).error).toBeUndefined();
    // One `writeRemote`: reconnecting is a credential, not a new remote.
    expect(writes).toHaveLength(1);
    expect(emitted.map((event) => event.type)).toStrictEqual(['remoteConnected', 'toast.info']);
    actor.stop();
  });

  it('24: reads a push refused for the credential as *Reconnect*, never as a failed push', async () => {
    const { actor, emitted } = start({
      initialSync: reauthorizing('Your GitHub connection needs to be renewed.'),
    });
    await settle();

    actor.send({ type: 'connect', kind: 'git', url: 'https://github.com/owner/repository.git' });
    await settle();

    expect(actor.getSnapshot().matches('reconnectRequired')).toBe(true);
    expect(emitted).toStrictEqual([]);
    actor.stop();
  });

  it('25: asks for the credential again when authorization itself says the session cannot mint one', async () => {
    const { actor } = start({ authorize: reauthorizing('Your GitHub connection needs to be renewed.') });
    await settle();

    actor.send({ type: 'connect', kind: 'git', url: 'https://github.com/owner/repository.git' });
    await settle();

    expect(actor.getSnapshot().matches('reconnectRequired')).toBe(true);
    actor.stop();
  });

  it('26: reconnects through `connect`, which is the edge the Sync region takes', async () => {
    let renewed = false;
    const { actor } = start({
      validate: createAsyncLogic({
        run: async (): Promise<RemoteValidateActorOutput> => {
          if (!renewed) {
            throw reauthorizationRequired('Your GitHub connection needs to be renewed.');
          }
          return {};
        },
      }),
    });
    await settle();

    actor.send({ type: 'connect', kind: 'git', url: 'https://github.com/owner/repository.git' });
    await settle();
    expect(actor.getSnapshot().matches('reconnectRequired')).toBe(true);

    renewed = true;
    actor.send({ type: 'connect', kind: 'git', url: 'https://github.com/owner/repository.git' });
    await settle();

    expect(actor.getSnapshot().matches('connected')).toBe(true);
    expect(selectRemoteFacet(actor.getSnapshot()).error).toBeUndefined();
    actor.stop();
  });

  it('27: leaves a remote whose credential died, and keeps the history', async () => {
    const removals: unknown[] = [];
    const { actor, emitted } = start({
      validate: reauthorizing('Your GitHub connection needs to be renewed.'),
      removeRemote: createAsyncLogic({
        run: async ({ input }): Promise<void> => {
          removals.push(input);
        },
      }),
    });
    await settle();

    actor.send({ type: 'connect', kind: 'git', url: 'https://github.com/owner/repository.git' });
    await settle();
    actor.send({ type: 'disconnect' });
    await settle();

    expect(actor.getSnapshot().matches('none')).toBe(true);
    expect(removals).toStrictEqual([{ name: 'tau' }]);
    expect(emitted.map((event) => event.type)).toStrictEqual(['remoteDisconnected']);
    actor.stop();
  });

  /*
   * Rule 19 asks every surface showing a remote failure for exactly one action
   * matching its class. The *sync* path had `SyncFailureReason` and the connect
   * path had nothing, so a refused connect could only ever offer the
   * unclassified *Retry* — including the `403 GIT_SYNC_NOT_ENTITLED` that this
   * whole closeout began with, whose action is *Upgrade*. The classifier is the
   * one `sync.machine` already owns; this facet just carries its answer.
   */
  it('31 (rule 19): a refused connect carries the class of its refusal, not just its sentence', async () => {
    const refusals: ReadonlyArray<Readonly<{ code: string; reason: SyncFailureReason }>> = [
      { code: 'REMOTE_NOT_ENTITLED', reason: 'notEntitled' },
      { code: 'REMOTE_UNAUTHORIZED', reason: 'unauthorized' },
      { code: 'REMOTE_QUOTA_EXCEEDED', reason: 'quota' },
      { code: 'ENGINE_FAILED', reason: 'offline' },
    ];
    for (const refusal of refusals) {
      const { actor } = start({
        validate: createAsyncLogic({
          run: async (): Promise<RemoteValidateActorOutput> => {
            await Promise.resolve();
            throw new RevisionPortError(
              // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the table names real codes.
              refusal.code as RevisionPortErrorCode,
              'Syncing files to Tau Cloud is a paid plan feature.',
            );
          },
        }),
      });
      // oxlint-disable-next-line no-await-in-loop -- one connect attempt per refusal.
      await settle();
      actor.send({ type: 'connect', kind: 'tau' });
      // oxlint-disable-next-line no-await-in-loop -- one connect attempt per refusal.
      await settle();

      const facet = selectRemoteFacet(actor.getSnapshot());
      expect({ code: refusal.code, phase: facet.phase, reason: facet.reason }).toStrictEqual({
        code: refusal.code,
        phase: 'failed',
        reason: refusal.reason,
      });
      /* The sentence is still the server's own, untouched (N4). */
      expect(facet.error).toBe('Syncing files to Tau Cloud is a paid plan feature.');
      actor.stop();
    }
  });

  it('31b: a facet with no failure carries no class', async () => {
    const { actor } = start({ readRemote: reads(tauRemote) });
    await settle();

    const facet = selectRemoteFacet(actor.getSnapshot());
    expect({ error: facet.error, reason: facet.reason }).toStrictEqual({ error: undefined, reason: undefined });
    actor.stop();
  });
});
