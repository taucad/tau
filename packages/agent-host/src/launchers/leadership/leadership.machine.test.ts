/**
 * M2 (`leadership`) owner tests (W6 RH-S7): the machine run through `validated()` with recorded effects and a step
 * clock, so every heartbeat bound is exact. The binding over Web Locks and `BroadcastChannel` is tested in
 * `browser/leadership.test.ts`.
 */

import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import type { AnyEventObject, AnyMachineSnapshot } from 'xstate';

import { checkActionCorrespondence, machineActions, specOperators } from '@taucad/formal/drift';
import { StepClock } from '@taucad/xstate-testing/clock';
import { guardActors, validated } from '@taucad/xstate-testing/inspect';
import { unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';

import { createProviderEventLog } from '#browser.js';
import {
  cancel,
  closeLaunchers,
  delays,
  heldLocks,
  launch,
  logPath,
  memoryFileSystem,
  projectId,
  rowsOf,
  seedRunningChat,
  start,
  until,
} from '#browser/leadership.fixture.js';
import { chatRunMachine } from '#host/chat-run.machine.js';
import { chatLeadershipNames } from '#launchers/leadership/names.js';
import type { AgentLogEvent } from '#log/event-types.js';
import type { LeadershipMessage } from '#launchers/leadership/frames.js';
import { firedLate, leadershipIgnoredEvents, leadershipMachine } from '#launchers/leadership/leadership.machine.js';
import type { LeadershipEffectArgs, LeadershipInput } from '#launchers/leadership/leadership.machine.js';
import type { CommandAnswer, HostCommand } from '#wire/commands.schema.js';
import { agentWireVersion } from '#wire/frames.schema.js';
import type { ReadRequest } from '#wire/frames.schema.js';

const chatId = 'chat-1';
const input: LeadershipInput = {
  chatId,
  sender: 'tab-a',
  build: 'build-1',
  wire: agentWireVersion,
  canSteal: true,
  visible: true,
};
const heartbeatTimeout = 3500;

type Effect = {
  readonly [Name in keyof LeadershipEffectArgs]: Readonly<{ name: Name; args: LeadershipEffectArgs[Name] }>;
}[keyof LeadershipEffectArgs];

const effectNames = [
  'requestLock',
  'releaseLock',
  'broadcast',
  'readView',
  'claim',
  'runLocal',
  'answer',
  'readLocal',
  'serveRead',
  'answerRead',
  'relinquish',
  'wakeReads',
  'watchHolder',
  'checkHolder',
] as const satisfies ReadonlyArray<keyof LeadershipEffectArgs>;

const command = (commandId: string): HostCommand => ({
  type: 'cancel',
  commandId,
  payload: { chatId, runId: 'run-1' },
});
const request = (cursor: number): ReadRequest => ({ chatId, cursor, limit: 16, maxBytes: 1_048_576 });
// oxlint-disable-next-line eslint/max-params -- a heartbeat frame's four fields, positional as the frame reads.
const hb = (
  sender: string,
  epoch: number,
  state: 'leading' | 'released' = 'leading',
  foreign = false,
): LeadershipMessage => ({
  kind: 'hb',
  sender,
  epoch,
  state,
  foreign,
});
const refusal = (commandId: string, code: string, generation: number): CommandAnswer => ({
  commandId,
  generation,
  status: 'refused',
  effect: 'not-applied',
  code,
  message: code,
});
const applied = (commandId: string, generation: number): CommandAnswer => ({
  commandId,
  generation,
  status: 'applied',
  effect: 'durable',
  cursor: 0,
});

const harness = (overrides: Partial<LeadershipInput> = {}) => {
  const clock = new StepClock();
  const effects: Effect[] = [];
  const guard = guardActors({ ignore: { leadership: leadershipIgnoredEvents } });
  /* The binding's frozen-time measure on the step clock (`checkHolder` answers `holderSilent`). */
  let watchedAt = 0;
  const measures: Partial<Record<keyof LeadershipEffectArgs, () => void>> = {
    watchHolder: () => {
      watchedAt = clock.now();
    },
    checkHolder: () => {
      actor.send({
        type: 'holderSilent',
        late: firedLate(watchedAt, clock.now(), { heartbeatInterval: 1000, heartbeatTimeout }),
      });
    },
  };
  const actions = Object.fromEntries(
    effectNames.map((name) => [
      name,
      (args: unknown) => {
        effects.push({ name, args } as Effect);
        measures[name]?.();
      },
    ]),
  ) as { readonly [Name in keyof LeadershipEffectArgs]: (args: LeadershipEffectArgs[Name]) => void };
  const actor = createActor(validated(leadershipMachine).provide({ actions }), {
    input: { ...input, ...overrides },
    clock,
    inspect: guard.inspect,
  });
  actor.start();
  /** The effects of one kind since the last `take`, and clears them all. */
  const take = <Name extends keyof LeadershipEffectArgs>(name: Name): Array<LeadershipEffectArgs[Name]> => {
    const found = effects
      .filter((effect) => effect.name === name)
      .map((effect) => effect.args as LeadershipEffectArgs[Name]);
    effects.length = 0;
    return found;
  };
  const of = <Name extends keyof LeadershipEffectArgs>(name: Name): Array<LeadershipEffectArgs[Name]> =>
    effects.filter((effect) => effect.name === name).map((effect) => effect.args as LeadershipEffectArgs[Name]);
  const frame = (message: LeadershipMessage): void => {
    actor.send({ type: 'frame', message });
  };
  /** Take the lock and lead at `epoch`, as a reconciliation does. */
  const lead = (epoch: number): void => {
    actor.send({ type: 'reconcile', wait: false });
    const [lock] = of('requestLock');
    actor.send({ type: 'lockGranted', corr: lock!.corr });
    actor.send({ type: 'viewRead', corr: lock!.corr, epoch });
    effects.length = 0;
  };
  return { actor, clock, effects, take, of, frame, lead };
};

afterEach(closeLaunchers);

describe('leadership (M2)', () => {
  /* RH-A9 (I32): a holder of another build never runs this build's command. */
  it('should refuse a command from another build with LEADER_VERSION_MISMATCH', () => {
    const leader = harness();
    leader.lead(2);
    leader.frame({ kind: 'cmd', sender: 'tab-old', epoch: 2, corr: 'c1', command: command('cmd-1'), foreign: true });
    expect(leader.of('runLocal')).toEqual([]);
    expect(leader.take('broadcast')).toEqual([
      {
        kind: 'ans',
        epoch: 2,
        body: {
          to: 'tab-old',
          corr: 'c1',
          answer: expect.objectContaining({ status: 'refused', code: 'LEADER_VERSION_MISMATCH' }) as unknown,
        },
      },
    ]);

    /* And a follower never forwards to a holder of another build. */
    const follower = harness({ sender: 'tab-b' });
    follower.frame(hb('tab-old', 2, 'leading', true));
    follower.actor.send({ type: 'command', corr: 'w1', command: command('cmd-2') });
    expect(follower.of('broadcast')).toEqual([]);
    expect(follower.take('answer')).toEqual([
      { corr: 'w1', answer: expect.objectContaining({ code: 'LEADER_VERSION_MISMATCH' }) as unknown },
    ]);
  });

  /* RH-A10 (EQ4): the lock is held from the grant until M1 is quiescent and nothing is in flight here. */
  it('should release the chat lock when M1 becomes quiescent after acknowledge', () => {
    const leader = harness();
    leader.lead(2);
    leader.actor.send({ type: 'command', corr: 'w1', command: command('cmd-1') });
    leader.actor.send({ type: 'quiescent', quiescent: false });
    leader.actor.send({ type: 'executed', corr: 'w1', answer: applied('cmd-1', 2) });
    /* The run is under way (or its settlement awaits `acknowledge`): the lock stays. */
    expect(leader.actor.getSnapshot().hasTag('holdsLock')).toBe(true);
    expect(leader.of('releaseLock')).toEqual([]);

    leader.actor.send({ type: 'quiescent', quiescent: true });
    expect(leader.actor.getSnapshot().hasTag('holdsLock')).toBe(false);
    expect(leader.of('relinquish')).toHaveLength(1);
    expect(leader.of('releaseLock')).toHaveLength(1);
    expect(leader.of('broadcast')).toContainEqual({ kind: 'hb', epoch: 2, body: { state: 'released' } });
  });

  it('should hold no lock while a run is paused', () => {
    /* A paused run rests in M1's `paused`, which is quiescent (D10: a person's decision is no reservation). */
    expect(chatRunMachine.getStateNodeById('paused').tags).toContain('quiescent');
    const leader = harness();
    leader.actor.send({ type: 'reconcile', wait: false });
    const [grant] = leader.of('requestLock');
    leader.actor.send({ type: 'lockGranted', corr: grant!.corr });
    leader.actor.send({ type: 'viewRead', corr: grant!.corr, epoch: 2 });
    leader.actor.send({ type: 'command', corr: 'w1', command: command('cmd-1') });
    leader.actor.send({ type: 'quiescent', quiescent: false });
    leader.actor.send({ type: 'executed', corr: 'w1', answer: applied('cmd-1', 2) });
    leader.actor.send({ type: 'quiescent', quiescent: true });

    /* The grant itself is let go, after the writer (the binding's Web Lock: `browser/leadership.test.ts`). */
    expect(leader.actor.getSnapshot().hasTag('holdsLock')).toBe(false);
    expect(leader.of('releaseLock')).toEqual([{ corr: grant!.corr }]);
    expect(leader.effects.map((effect) => effect.name).filter((name) => /relinquish|releaseLock/.test(name))).toEqual([
      'relinquish',
      'releaseLock',
    ]);
    expect(leader.actor.getSnapshot().context.lock).toBeUndefined();
  });

  /* RH-A11 (RH-R10, I15, W0.14): every wait is bounded by the heartbeat of the epoch it addressed. */
  it('should re-send a pending command when its addressed epoch goes silent', async () => {
    const follower = harness({ sender: 'tab-b', canSteal: false });
    follower.frame(hb('tab-a', 3));
    follower.actor.send({ type: 'command', corr: 'w1', command: command('cmd-1') });
    expect(follower.take('broadcast').map((sent) => [sent.kind, sent.epoch])).toEqual([['cmd', 3]]);

    await follower.clock.advanceAsync(heartbeatTimeout);
    expect(follower.actor.getSnapshot().value).toEqual({ following: 'silent' });
    /* Without a per-append fence it queues rather than steals (RH-R12). */
    expect(follower.of('requestLock')).toEqual([{ corr: expect.any(String) as unknown, mode: 'queued' }]);
    /* The silent epoch's late heartbeat never re-arms the bound. */
    follower.frame(hb('tab-a', 3));
    expect(follower.actor.getSnapshot().value).toEqual({ following: 'silent' });
    expect(follower.of('broadcast')).toEqual([]);

    follower.frame(hb('tab-c', 4));
    expect(follower.take('broadcast').map((sent) => [sent.kind, sent.epoch])).toEqual([['cmd', 4]]);
  });

  it('should never address an epoch that answered LEADER_GENERATION_STALE', () => {
    const follower = harness({ sender: 'tab-b' });
    follower.frame(hb('tab-a', 3));
    follower.actor.send({ type: 'command', corr: 'w1', command: command('cmd-1') });
    follower.take('broadcast');

    follower.frame({
      kind: 'ans',
      sender: 'tab-a',
      epoch: 3,
      to: 'tab-b',
      corr: 'w1',
      answer: refusal('cmd-1', 'LEADER_GENERATION_STALE', 3),
    });
    expect(follower.of('answer')).toEqual([]);
    follower.frame(hb('tab-a', 3));
    expect(follower.of('broadcast')).toEqual([]);

    follower.frame(hb('tab-c', 4));
    expect(follower.take('broadcast').map((sent) => [sent.kind, sent.epoch])).toEqual([['cmd', 4]]);
    follower.frame({ kind: 'ans', sender: 'tab-c', epoch: 4, to: 'tab-b', corr: 'w1', answer: applied('cmd-1', 4) });
    expect(follower.take('answer')).toEqual([{ corr: 'w1', answer: applied('cmd-1', 4) }]);
  });

  /* I15 (W10 finding 3): every command the leader declines is answered, so no follower waits on silence. */
  it('should answer a stale-epoch command and a command it cannot read', () => {
    const leader = harness();
    leader.lead(2);
    leader.frame({ kind: 'cmd', sender: 'tab-b', epoch: 1, corr: 'c1', command: command('cmd-1'), foreign: false });
    leader.frame({ kind: 'unreadable', sender: 'tab-b', epoch: 2, corr: 'c2', commandId: 'cmd-2' });
    expect(leader.of('runLocal')).toEqual([]);
    expect(leader.take('broadcast').map((sent) => sent.body)).toEqual([
      { to: 'tab-b', corr: 'c1', answer: expect.objectContaining({ code: 'LEADER_GENERATION_STALE' }) as unknown },
      {
        to: 'tab-b',
        corr: 'c2',
        answer: expect.objectContaining({ commandId: 'cmd-2', code: 'COMMAND_UNREADABLE' }) as unknown,
      },
    ]);
  });

  /* SC-R12 (replacing W0.13): a follower forwards each read from the reader's own cursor, and hands the leader's
   * refusal back as it was given, never clamped into a short batch. */
  it("should forward a read from its reader's cursor and hand the leader's refusal back unclamped", () => {
    const follower = harness({ sender: 'tab-b' });
    follower.frame(hb('tab-a', 3));
    follower.actor.send({ type: 'read', corr: 'r1', request: request(7) });
    expect(follower.take('broadcast')).toEqual([{ kind: 'es', epoch: 3, body: { corr: 'r1', request: request(7) } }]);
    const answer = { status: 'refused', chatId, reason: 'cursor-ahead', expected: { endCursor: 4 } } as const;
    follower.frame({ kind: 'en', sender: 'tab-a', epoch: 3, to: 'tab-b', corr: 'r1', answer });
    expect(follower.take('answerRead')).toEqual([{ corr: 'r1', answer }]);
  });

  /* RH-A12 (RH-R11, HD-1): a forwarded read carries its reader's cursor; the leader keeps none. */
  it('should not move the replication cursor when serving a forwarded window', () => {
    const leader = harness();
    leader.lead(2);
    leader.frame({ kind: 'es', sender: 'tab-b', epoch: 2, corr: 'r1', request: request(7), foreign: false });
    leader.frame({ kind: 'es', sender: 'tab-c', epoch: 2, corr: 'r2', request: request(2), foreign: false });
    /* A window addressed to another epoch is not this term's to serve. */
    leader.frame({ kind: 'es', sender: 'tab-c', epoch: 1, corr: 'r3', request: request(0), foreign: false });
    expect(leader.take('serveRead').map((served) => [served.to, served.request.cursor])).toEqual([
      ['tab-b', 7],
      ['tab-c', 2],
    ]);
    expect(Object.keys(leader.actor.getSnapshot().context)).not.toContain('cursor');
  });

  /* RH-A13 (RH-R9, I13): the claim writes the abandonment as the term's first append; a fenced append rereads under
   * the lock it holds and claims above the epoch it lost. */
  it("should write the abandonment rows as the term's first append and reread after LOG_FENCED", async () => {
    const fileSystem = memoryFileSystem();
    seedRunningChat(fileSystem, 'chat-2');
    const viewer = launch(fileSystem, 'tab-a');

    const read = await viewer.read({ chatId: 'chat-2', cursor: 0, limit: 16, maxBytes: 1_048_576 });
    expect(read).toMatchObject({ status: 'batch', endCursor: 3 });
    await until(() => rowsOf(fileSystem, 'chat-2').length > 3);

    const rows = rowsOf(fileSystem, 'chat-2');
    const firstOfTerm = rows.find((row) => row.epoch === 2);
    expect(firstOfTerm).toMatchObject({ type: 'run.lifecycle', state: 'failed', runId: 'run-1' });
    expect(rows.indexOf(firstOfTerm!)).toBe(3);
    /* RH-A10 (EQ4): once the reconciled chat is quiescent, its lock is let go. */
    await until(async () => {
      const held = await heldLocks();
      return !held.includes(chatLeadershipNames(projectId, 'chat-2').lock);
    });

    const leader = harness();
    leader.lead(2);
    leader.actor.send({ type: 'fenced' });
    expect(leader.actor.getSnapshot().value).toBe('claiming');
    expect(leader.of('relinquish')).toHaveLength(1);
    const [reread] = leader.take('readView');
    leader.actor.send({ type: 'viewRead', corr: reread!.corr, epoch: 3 });
    expect(leader.take('claim')).toEqual([{ epoch: 3 }]);
    expect(leader.actor.getSnapshot().context.floor).toBe(3);
  });
  /* RH-A3 (RH-R12): a heard holder that falls silent is stolen from on the provider leg; its stale view is fenced. */
  it('should steal from a silent leader and refuse its appends when it thaws', async () => {
    const fileSystem = memoryFileSystem();
    /* Tab A's heartbeats run on a clock this test never advances: after its claim it is silent. */
    const tabA = launch(fileSystem, 'tab-a', { clock: new StepClock() });
    /* Tab B's gateway is unreachable, so its claim resolves tab A's open attempt as unknown and moves on (GI-R10). */
    const offline = vi.fn(async () => {
      throw new TypeError('The gateway is unreachable.');
    }) as unknown as typeof globalThis.fetch;
    const tabB = launch(fileSystem, 'tab-b', { fetch: offline });
    /* Tab B is listening before tab A claims, so it hears A's claim heartbeat. */
    await tabB.read({ chatId: 'chat-4', cursor: 0, limit: 16, maxBytes: 1_048_576, signal: AbortSignal.timeout(20) });
    expect(await start(tabA, 'chat-4', 'run-1')).toMatchObject({ status: 'applied', generation: 1 });
    await until(() =>
      rowsOf(fileSystem, 'chat-4').some((row) => row.type === 'run.lifecycle' && row.state === 'running'),
    );

    /* A writer whose view is tab A's term, as a frozen tab A holds it. */
    const thawed = await (async () => {
      const marker = `${logPath('chat-4')}.lock`;
      const kept = fileSystem.files.get(marker);
      fileSystem.files.delete(marker);
      const writer = await createProviderEventLog({ fileSystem, filePath: logPath('chat-4'), access: 'write' });
      if (kept !== undefined) {
        fileSystem.files.set(marker, kept);
      }
      return writer;
    })();

    await new Promise((resolve) => {
      setTimeout(resolve, delays.heartbeatTimeout + 100);
    });
    const answer = await cancel(tabB, 'chat-4', 'run-1');
    expect(answer).not.toMatchObject({ code: 'PEER_UNRESPONSIVE' });

    /* Tab B claimed above tab A's epoch and abandoned the run tab A no longer drives. */
    const rows = rowsOf(fileSystem, 'chat-4');
    expect(rows.find((row) => row.epoch === 2)).toMatchObject({
      type: 'run.lifecycle',
      state: 'failed',
      runId: 'run-1',
    });
    const lastOfA = rows.findLast((row) => row.leaderEpoch === rows[0]!.leaderEpoch)!;
    const stored = fileSystem.files.get(logPath('chat-4'));
    const before = stored === undefined ? undefined : new Uint8Array(stored);
    await expect(
      thawed.append({
        ...lastOfA,
        type: 'run.lifecycle',
        runId: 'run-1',
        state: 'completed',
        sequence: lastOfA.sequence + 1,
      } as AgentLogEvent),
    ).rejects.toMatchObject({ code: 'LOG_FENCED' });
    expect(fileSystem.files.get(logPath('chat-4'))).toEqual(before);
    await thawed.close();
  });

  /* RH-R17: WRITER_LOCKED is a wait: back off, answer what is pending, then queue again while visible. */
  it('should back off and queue again when the writer is still locked', async () => {
    const leader = harness({ canSteal: false });
    leader.actor.send({ type: 'reconcile', wait: true });
    const [lock] = leader.take('requestLock');
    leader.actor.send({ type: 'lockGranted', corr: lock!.corr });
    leader.actor.send({ type: 'viewRefused', corr: lock!.corr, code: 'WRITER_LOCKED' });
    expect(leader.actor.getSnapshot().value).toEqual({ idle: 'backoff' });
    expect(leader.take('releaseLock')).toHaveLength(1);
    await leader.clock.advanceAsync(3500);
    expect(leader.take('requestLock')).toEqual([{ corr: expect.any(String) as unknown, mode: 'queued' }]);
  });
});

/* W6.r1 findings 1, 2 and 11 (probes P1, P1b, P3). */
describe('leadership under the page lifecycle', () => {
  /** Lead at `epoch` from a queued grant, as a reconciliation that found a driverless run does (RH-R16). */
  const leadQueued = (leader: ReturnType<typeof harness>, epoch: number): string => {
    leader.actor.send({ type: 'reconcile', wait: true });
    const [lock] = leader.take('requestLock');
    expect(lock!.mode).toBe('queued');
    leader.actor.send({ type: 'lockGranted', corr: lock!.corr });
    leader.actor.send({ type: 'viewRead', corr: lock!.corr, epoch });
    leader.effects.length = 0;
    return lock!.corr;
  };

  /* Finding 1 (P1): `LogLeadership.tla` `Freeze` drops only an ungranted queued request. */
  it('should keep a granted lock when the page is hidden while leading', () => {
    const leader = harness();
    leadQueued(leader, 2);
    leader.actor.send({ type: 'command', corr: 'w1', command: command('cmd-1') });
    leader.actor.send({ type: 'quiescent', quiescent: false });
    leader.effects.length = 0;

    leader.actor.send({ type: 'visibility', visible: false });

    expect(leader.actor.getSnapshot().hasTag('leading')).toBe(true);
    expect(leader.of('releaseLock')).toEqual([]);
  });

  /* Finding 1 (P1b): a fenced append rereads under the lock it holds, never without a lock correlation. */
  it('should reread under its own lock after a fenced append that follows hiding', () => {
    const leader = harness();
    const corr = leadQueued(leader, 2);
    leader.actor.send({ type: 'quiescent', quiescent: false });
    leader.actor.send({ type: 'visibility', visible: false });
    leader.actor.send({ type: 'fenced' });

    const [reread] = leader.take('readView');
    expect(reread).toEqual({ corr });
    leader.actor.send({ type: 'viewRead', corr, epoch: 3 });
    expect(leader.actor.getSnapshot().value).toBe('leading');
    expect(leader.take('claim')).toEqual([{ epoch: 3 }]);
  });

  /* Finding 1: claiming is bounded, so a reread that never answers cannot wedge the writes waiting on it. */
  it('should answer pending writes when a reread never answers', async () => {
    const leader = harness();
    leader.lead(2);
    leader.actor.send({ type: 'fenced' });
    leader.actor.send({ type: 'command', corr: 'w1', command: command('cmd-1') });
    leader.effects.length = 0;

    await leader.clock.advanceAsync(10_000);

    expect(leader.of('answer')).toEqual([
      { corr: 'w1', answer: expect.objectContaining({ status: 'refused', code: 'PEER_UNRESPONSIVE' }) as unknown },
    ]);
    expect(leader.of('releaseLock')).toHaveLength(1);
    expect(leader.actor.getSnapshot().hasTag('holdsLock')).toBe(false);
  });

  /* Finding 11 (P3): hiding drops the queued request; showing the page again queues it for the pending write. */
  it('should queue again for a pending write when the page is shown behind a silent OPFS holder', async () => {
    const follower = harness({ sender: 'tab-b', canSteal: false });
    follower.frame(hb('tab-a', 3));
    follower.actor.send({ type: 'command', corr: 'w1', command: command('cmd-1') });
    await follower.clock.advanceAsync(heartbeatTimeout);
    const [queued] = follower.take('requestLock');
    expect(queued).toMatchObject({ mode: 'queued' });

    follower.actor.send({ type: 'visibility', visible: false });
    expect(follower.take('releaseLock')).toEqual([{ corr: queued!.corr }]);
    follower.actor.send({ type: 'visibility', visible: true });

    expect(follower.of('requestLock')).toEqual([{ corr: expect.any(String) as unknown, mode: 'queued' }]);
  });

  /* Finding 11 (I30): a write queued behind a silent or frozen OPFS holder is answered within a bound. */
  it('should answer a write queued behind a silent OPFS holder within the bound', async () => {
    const follower = harness({ sender: 'tab-b', canSteal: false });
    follower.frame(hb('tab-a', 3));
    follower.actor.send({ type: 'command', corr: 'w1', command: command('cmd-1') });
    await follower.clock.advanceAsync(heartbeatTimeout);
    follower.effects.length = 0;

    await follower.clock.advanceAsync(10_000);

    expect(follower.of('answer')).toEqual([
      { corr: 'w1', answer: expect.objectContaining({ status: 'refused', code: 'WRITER_LOCKED' }) as unknown },
    ]);
    expect(follower.of('releaseLock')).toHaveLength(1);
    expect(follower.actor.getSnapshot().context.writes).toEqual([]);
  });

  /* Finding 2 (W4 T9's frozen-time rule, rpc `channel.ts` late fire): a bound that fired late is re-armed once. */
  it('should re-arm once, not steal, when its heartbeat bound fired late after a freeze', () => {
    const follower = harness({ sender: 'tab-b' });
    follower.frame(hb('tab-a', 3));
    follower.actor.send({ type: 'command', corr: 'w1', command: command('cmd-1') });
    expect(follower.of('watchHolder')).toHaveLength(1);
    follower.effects.length = 0;

    /* The tab was frozen: its timers fire late, all at once; the binding measures how late (`checkHolder`). */
    follower.clock.set(follower.clock.now() + 10_000);
    expect(follower.take('checkHolder')).toEqual([{}]);
    expect(follower.actor.getSnapshot().value).toEqual({ following: 'alive' });
    expect(follower.of('requestLock')).toEqual([]);

    /* The leader's queued heartbeat arrives after the thaw and its answer follows: nothing was stolen. */
    follower.frame(hb('tab-a', 3));
    follower.frame({ kind: 'ans', sender: 'tab-a', epoch: 3, to: 'tab-b', corr: 'w1', answer: applied('cmd-1', 3) });
    expect(follower.take('answer')).toEqual([{ corr: 'w1', answer: applied('cmd-1', 3) }]);
    expect(follower.of('requestLock')).toEqual([]);
  });

  it('should steal when the re-armed bound fires late again', () => {
    const follower = harness({ sender: 'tab-b' });
    follower.frame(hb('tab-a', 3));
    follower.actor.send({ type: 'command', corr: 'w1', command: command('cmd-1') });
    follower.clock.set(follower.clock.now() + 10_000);
    expect(follower.actor.getSnapshot().value).toEqual({ following: 'alive' });
    follower.clock.set(follower.clock.now() + 10_000);

    expect(follower.actor.getSnapshot().value).toEqual({ following: 'silent' });
    expect(follower.of('requestLock')).toEqual([{ corr: expect.any(String) as unknown, mode: 'steal' }]);
  });

  /* Finding 2: `resume` and `pageshow` re-arm the addressed epoch's bound. */
  it('should re-arm the heartbeat bound when the page resumes', async () => {
    const follower = harness({ sender: 'tab-b' });
    follower.frame(hb('tab-a', 3));
    follower.actor.send({ type: 'command', corr: 'w1', command: command('cmd-1') });
    await follower.clock.advanceAsync(heartbeatTimeout - 500);
    follower.actor.send({ type: 'resume' });
    await follower.clock.advanceAsync(heartbeatTimeout - 500);

    expect(follower.of('checkHolder')).toEqual([]);
    expect(follower.actor.getSnapshot().value).toEqual({ following: 'alive' });
  });
});

/* MC-R17, MC-R20: every sampled public event is answered or declared ignored in every reachable state. */
const sample = (snapshot: AnyMachineSnapshot): readonly AnyEventObject[] => {
  const context = snapshot.context as { readonly lock?: { readonly corr: string } | undefined };
  const corr = context.lock?.corr ?? 'lock:9';
  return [
    { type: 'command', corr: 'w1', command: command('cmd-1') },
    { type: 'read', corr: 'r1', request: request(0) },
    { type: 'reconcile', wait: true },
    { type: 'reconcile', wait: false },
    { type: 'visibility', visible: false },
    { type: 'visibility', visible: true },
    { type: 'lockGranted', corr },
    { type: 'lockUnavailable', corr },
    { type: 'lockLost', corr },
    { type: 'viewRead', corr, epoch: 2 },
    { type: 'viewRefused', corr, code: 'WRITER_LOCKED' },
    { type: 'viewFailed', corr, message: 'Unreadable.' },
    { type: 'executed', corr: 'w1', answer: applied('cmd-1', 2) },
    { type: 'appended', endCursor: 3 },
    { type: 'fenced' },
    { type: 'quiescent', quiescent: true },
    { type: 'quiescent', quiescent: false },
    { type: 'frame', message: hb('tab-b', 2) },
    { type: 'frame', message: hb('tab-b', 2, 'released') },
    {
      type: 'frame',
      message: { kind: 'cmd', sender: 'tab-b', epoch: 2, corr: 'c1', command: command('cmd-2'), foreign: false },
    },
    {
      type: 'frame',
      message: { kind: 'ans', sender: 'tab-b', epoch: 2, to: 'tab-a', corr: 'w1', answer: applied('cmd-1', 2) },
    },
    { type: 'holderSilent', late: true },
    { type: 'holderSilent', late: false },
    { type: 'resume' },
    { type: 'close' },
    { type: 'xstate.after', delay: 'heartbeatInterval', stateId: 'leading' },
    { type: 'xstate.after', delay: 'heartbeatTimeout', stateId: 'unheard' },
    { type: 'xstate.after', delay: 'heartbeatTimeout', stateId: 'alive' },
    { type: 'xstate.after', delay: 'recoveryDelay', stateId: 'backoff' },
    { type: 'xstate.after', delay: 'claimBound', stateId: 'claiming' },
    { type: 'xstate.after', delay: 'queuedWriteBound', stateId: 'silent' },
  ];
};
const serializeState = (snapshot: AnyMachineSnapshot): string => {
  const context = snapshot.context as {
    readonly lock?: { readonly granted: boolean };
    readonly forgave?: boolean;
    readonly writes: readonly unknown[];
    readonly running: readonly unknown[];
    readonly heard?: unknown;
    readonly quiet: boolean;
    readonly reconcile: boolean;
    readonly visible: boolean;
  };
  return JSON.stringify([
    snapshot.value,
    context.lock?.granted,
    context.forgave,
    context.writes.length > 0,
    context.running.length > 0,
    context.heard !== undefined,
    context.quiet,
    context.reconcile,
    context.visible,
  ]);
};
const pathOptions = { input, events: sample, limit: 60_000, serializeState };

describe('leadership enumeration and totality', () => {
  it('should answer every sampled public event in every reachable state', () => {
    expect(unansweredEvents(leadershipMachine, { ...pathOptions, ignore: leadershipIgnoredEvents })).toEqual([]);
  });

  it('should reach every state', () => {
    expect(unreachedStates(leadershipMachine, pathOptions)).toEqual([]);
  });
});

/* MC-R27: every transition's static label is a `LogLeadership.tla` action, and every system action is named. */
describe('leadership transition labels', () => {
  it('should name a LogLeadership.tla action on every transition, and a transition for every system action', () => {
    const spec = readFileSync(new URL('../../../specs/LogLeadership.tla', import.meta.url), 'utf8');
    const labelled = Object.entries(machineActions([leadershipMachine]));
    const actions = Object.fromEntries(labelled.filter(([, tla]) => tla !== 'Unmodelled'));

    expect(
      checkActionCorrespondence(actions, {
        operators: specOperators(spec),
        next: [
          'Acquire',
          'StealLock',
          'Notice',
          'Crash',
          'ReleaseDead',
          'Restart',
          'ReadStart',
          'Read',
          'Heartbeat',
          'Answer',
          'Process',
          'Want',
          'Start',
          'End',
          'Abandon',
          'Refused',
          'Release',
          'QueueReconcile',
          'GrantQueued',
          'Freeze',
          'Thaw',
          'Send',
          'Retry',
          'SelfLead',
          'TimeOut',
        ],
        /* Faults and the platform (crash, freeze, the lock manager's queue), M1's appends (`Start`, `End`, `Abandon`,
         * `Process`), and steps M2 takes inside one labelled transition: `ReadStart` is the `readView` effect of
         * `Acquire`, `GrantQueued` arrives as the same `lockGranted`, `Retry` and `SelfLead` are `Answer`'s and
         * `Read`'s re-addressing, and `Want` is the `command` event. `QueueReconcile` is a `reconcile` branch. */
        environment: [
          'Crash',
          'ReleaseDead',
          'Restart',
          'ReadStart',
          'Process',
          'Want',
          'Start',
          'End',
          'Abandon',
          'GrantQueued',
          'Freeze',
          'Thaw',
          'Retry',
          'SelfLead',
        ],
      }),
    ).toEqual([]);
  });
});
