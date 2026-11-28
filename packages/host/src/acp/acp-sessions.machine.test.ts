/*
 * `acpSessions` over stub children (W10 EA-S6): each child is a callback stub that
 * records what the parent sends it, the test plays the children's reports, and
 * time is a `StepClock` (MC-R23, MC-R30).
 */

import { createActor } from 'xstate';
import type { AnyEventObject, AnyMachineSnapshot } from 'xstate';
import { describe, expect, it } from 'vitest';

import { StepClock } from '@taucad/xstate-testing/clock';
import { createFakeCallbackActors, recordEmitted } from '@taucad/xstate-testing/fakes';
import { guardActors, validated } from '@taucad/xstate-testing/inspect';
import { unansweredEvents } from '@taucad/xstate-testing/paths';

import type { acpSessionMachine } from '#acp/acp-session.machine.js';
import { acpSessionsIgnoredEvents, acpSessionsMachine, evictionVictims } from '#acp/acp-sessions.machine.js';
import type { AcpAcquire, AcpPrewarm, AcpSlot } from '#acp/acp-sessions.machine.js';
import type { AcpAdapter } from '#acp/registry.js';

const adapter: AcpAdapter = {
  id: 'fake',
  displayName: 'Fake',
  package: 'fixture',
  version: '0.0.0',
  configEnv: [],
  modulePath: '/nonexistent',
};

const idleTimeout = 60_000;

const acquire = (chatId: string, requestId: string, overrides: Partial<AcpAcquire> = {}): AcpAcquire => ({
  requestId,
  key: `fake:${chatId}`,
  chatId,
  cwd: '/work',
  at: 0,
  opening: { adapter, cwd: '/work', mcpServers: [], sessionMessageId: 'm', sessionCommitted: false, notices: true },
  lend: { requestId, prompt: { fresh: [{ type: 'text', text: 'hi' }] } },
  ...overrides,
});

const prewarm = (chatId: string, overrides: Partial<AcpPrewarm> = {}): AcpPrewarm => ({
  key: `fake:${chatId}`,
  chatId,
  cwd: '/work',
  at: 0,
  opening: { adapter, cwd: '/work', mcpServers: [], sessionMessageId: 'w', sessionCommitted: false, notices: true },
  ...overrides,
});

const start = (limit = 1) => {
  const children = createFakeCallbackActors();
  const clock = new StepClock();
  const guard = guardActors({ ignore: acpSessionsIgnoredEvents });
  /* A stub child fits the slot `setup` typed as the child machine (provide slots are invariant, k9). */
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above.
  const logic = validated(
    acpSessionsMachine.provide({
      actors: { acpSession: children.actor('acpSession') as unknown as typeof acpSessionMachine },
    }),
  );
  const actor = createActor(logic, {
    input: { limit, idleTimeout, renewalMargin: 1000 },
    clock,
    inspect: guard.inspect,
  });
  const emitted = recordEmitted(actor);
  actor.start();
  /* What the parent sent the child for `key`, by type. */
  const sent = (key: string): string[] =>
    children.deliveries
      .filter((delivery) => (delivery.input as { key?: string }).key === key)
      .map((delivery) => delivery.event.type);
  /* Open a chat's child and end its opening turn resting. */
  const rest = (chatId: string, requestId: string): void => {
    actor.send({ type: 'acquire', acquire: acquire(chatId, requestId) });
    actor.send({ type: 'opened', key: `fake:${chatId}` });
    actor.send({
      type: 'turnEnded',
      key: `fake:${chatId}`,
      requestId,
      outcome: { ok: true, stopReason: 'end_turn' },
      resting: true,
    });
  };
  return { children, clock, actor, emitted, sent, rest };
};

describe('acpSessions', () => {
  it('should never close a lent child on idle expiry, eviction or closeChat', () => {
    const { actor, emitted, sent } = start(1);
    actor.send({ type: 'acquire', acquire: acquire('a', 'run-a:0') });
    actor.send({ type: 'opened', key: 'fake:a' });
    actor.send({ type: 'acquire', acquire: acquire('b', 'run-b:0') });
    /* Two lent children over a limit of one: eviction closes only resting ones. */
    actor.send({ type: 'opened', key: 'fake:b' });
    /* A stale idle timer for a lent key. */
    actor.send({ type: 'idleExpired', key: 'fake:a' });
    actor.send({ type: 'closeChat', requestId: 'close-a', chatId: 'a' });

    expect(sent('fake:a')).toEqual([]);
    expect(sent('fake:b')).toEqual([]);
    expect(emitted).toEqual([
      {
        type: 'refused',
        requestId: 'close-a',
        failure: { code: 'CHAT_RUN_LIVE', message: 'Chat a already has an external agent turn in its session.' },
      },
    ]);
  });

  it('evicts the least recent resting child once a newer one opens', () => {
    const { actor, sent, rest } = start(1);
    rest('a', 'run-a:0');
    actor.send({ type: 'acquire', acquire: acquire('b', 'run-b:0') });
    expect(sent('fake:a')).toEqual([]);
    actor.send({ type: 'opened', key: 'fake:b' });
    expect(sent('fake:a')).toEqual(['close']);
  });

  it('queues one acquire on a closing key and spawns after closed', () => {
    const { actor, children, emitted, rest } = start(2);
    rest('a', 'run-a:0');
    /* Another tree closes the child (EA-R5); the acquire waits for `closed`. */
    actor.send({ type: 'acquire', acquire: acquire('a', 'run-a:1', { cwd: '/elsewhere' }) });
    expect(children.inputsFor('acpSession')).toHaveLength(1);
    expect(actor.getSnapshot().context.slots['fake:a']?.status).toBe('closing');

    actor.send({ type: 'closed', key: 'fake:a', failure: undefined });

    expect(children.inputsFor('acpSession')).toHaveLength(2);
    expect(children.inputsFor('acpSession')[1]).toMatchObject({ key: 'fake:a', lend: { requestId: 'run-a:1' } });
    expect(children.active('acpSession')).toBe(1);
    expect(emitted.map((event) => event.type)).toEqual(['turnSettled']);
  });

  it('refuses a second acquire for a busy chat with CHAT_RUN_LIVE', () => {
    const { actor, emitted, rest } = start(2);
    actor.send({ type: 'acquire', acquire: acquire('a', 'run-a:0') });
    actor.send({ type: 'acquire', acquire: acquire('a', 'run-a:1') });
    expect(emitted).toMatchObject([{ type: 'refused', requestId: 'run-a:1', failure: { code: 'CHAT_RUN_LIVE' } }]);

    /* A queued acquire on a closing key is the chat's live run too. */
    rest('b', 'run-b:0');
    actor.send({ type: 'acquire', acquire: acquire('b', 'run-b:1', { cwd: '/elsewhere' }) });
    actor.send({ type: 'acquire', acquire: acquire('b', 'run-b:2') });
    expect(emitted.at(-1)).toMatchObject({ type: 'refused', requestId: 'run-b:2', failure: { code: 'CHAT_RUN_LIVE' } });

    /* Cancelling the queued acquire settles it at once. */
    actor.send({ type: 'cancel', requestId: 'run-b:1' });
    expect(emitted.at(-1)).toMatchObject({
      type: 'turnSettled',
      requestId: 'run-b:1',
      outcome: { ok: false, failure: { code: 'EXTERNAL_AGENT_CANCELLED' } },
    });
  });

  it('closes a resting child after E19, and a lend cancels the idle timer in the same step', () => {
    const { actor, clock, sent, rest } = start(2);
    rest('a', 'run-a:0');
    rest('b', 'run-b:0');
    clock.advance(idleTimeout - 1);
    actor.send({ type: 'acquire', acquire: acquire('b', 'run-b:1') });

    clock.advance(1);

    expect(sent('fake:a')).toEqual(['close']);
    expect(sent('fake:b')).toEqual(['lend']);
  });

  it('answers closeChat once the chat has no children left', () => {
    const { actor, emitted, sent, rest } = start(2);
    rest('a', 'run-a:0');
    actor.send({ type: 'closeChat', requestId: 'close-a', chatId: 'a' });
    expect(sent('fake:a')).toEqual(['close']);
    expect(emitted.map((event) => event.type)).toEqual(['turnSettled']);

    actor.send({ type: 'closed', key: 'fake:a', failure: undefined });

    expect(emitted.at(-1)).toEqual({ type: 'chatClosed', requestId: 'close-a' });
  });
});

describe('acpSessions prewarm (WP-18)', () => {
  it('opens a session with no turn, rests it once open and idle-expires it', () => {
    const { actor, children, clock, emitted, sent } = start(1);
    actor.send({ type: 'prewarm', prewarm: prewarm('a') });
    expect(children.inputsFor('acpSession')).toHaveLength(1);
    expect(children.inputsFor('acpSession')[0]).not.toHaveProperty('lend');
    expect(actor.getSnapshot().context.slots['fake:a']?.status).toBe('warming');

    actor.send({ type: 'opened', key: 'fake:a' });
    expect(actor.getSnapshot().context.slots['fake:a']?.status).toBe('resting');
    clock.advance(idleTimeout);

    expect(sent('fake:a')).toEqual(['close']);
    expect(emitted).toEqual([]);
  });

  it('reports a prewarm that closes before a turn is lent it, with its failure, and no adopted one', () => {
    const { actor, emitted } = start(2);
    const loggedOut = { code: 'EXTERNAL_AGENT_AUTH_REQUIRED', message: 'codex is not logged in.' };
    actor.send({ type: 'prewarm', prewarm: prewarm('a') });
    actor.send({ type: 'closed', key: 'fake:a', failure: loggedOut });
    expect(emitted).toEqual([{ type: 'warmClosed', key: 'fake:a', failure: loggedOut }]);
    expect(actor.getSnapshot().context.slots).toEqual({});

    /* An adopted prewarm is a turn's session: its close reports nothing more. */
    actor.send({ type: 'prewarm', prewarm: prewarm('b') });
    actor.send({ type: 'opened', key: 'fake:b' });
    actor.send({ type: 'acquire', acquire: acquire('b', 'run-b:0') });
    actor.send({
      type: 'turnEnded',
      key: 'fake:b',
      requestId: 'run-b:0',
      outcome: { ok: true, stopReason: 'end_turn' },
      resting: true,
    });
    actor.send({ type: 'closed', key: 'fake:b', failure: undefined });
    expect(emitted.filter((event) => event.type === 'warmClosed')).toHaveLength(1);
  });

  it('lends the turn that arrives while the prewarm opens, and once it is open', () => {
    const { actor, children, emitted, sent } = start(2);
    actor.send({ type: 'prewarm', prewarm: prewarm('a') });
    actor.send({ type: 'acquire', acquire: acquire('a', 'run-a:0') });
    expect(sent('fake:a')).toEqual(['lend']);
    expect(actor.getSnapshot().context.slots['fake:a']).toMatchObject({ status: 'opening', requestId: 'run-a:0' });
    actor.send({ type: 'opened', key: 'fake:a' });
    expect(actor.getSnapshot().context.slots['fake:a']?.status).toBe('lent');

    actor.send({ type: 'prewarm', prewarm: prewarm('b') });
    actor.send({ type: 'opened', key: 'fake:b' });
    actor.send({ type: 'acquire', acquire: acquire('b', 'run-b:0') });

    expect(sent('fake:b')).toEqual(['lend']);
    expect(children.inputsFor('acpSession')).toHaveLength(2);
    expect(emitted).toEqual([]);
  });

  it('closes a prewarm the turn cannot use, and opens the turn after closed', () => {
    const { actor, children } = start(2);
    actor.send({ type: 'prewarm', prewarm: prewarm('a') });
    /* The turn's record names a vendor session the prewarm did not restore. */
    const resumed = acquire('a', 'run-a:0');
    actor.send({
      type: 'acquire',
      acquire: { ...resumed, opening: { ...resumed.opening, acpSessionId: 'vendor-1' } },
    });
    expect(actor.getSnapshot().context.slots['fake:a']).toMatchObject({ status: 'closing' });

    actor.send({ type: 'closed', key: 'fake:a', failure: undefined });

    expect(children.inputsFor('acpSession')[1]).toMatchObject({ lend: { requestId: 'run-a:0' } });
  });

  it('opens one prewarm at a time, never by closing a lent child, and evicts another resting one first', () => {
    const { actor, children, sent, rest } = start(1);
    actor.send({ type: 'acquire', acquire: acquire('a', 'run-a:0') });
    actor.send({ type: 'opened', key: 'fake:a' });
    /* The limit is full with a lent child: no prewarm. */
    actor.send({ type: 'prewarm', prewarm: prewarm('b') });
    expect(children.inputsFor('acpSession')).toHaveLength(1);

    actor.send({
      type: 'turnEnded',
      key: 'fake:a',
      requestId: 'run-a:0',
      outcome: { ok: true, stopReason: 'end_turn' },
      resting: true,
    });
    actor.send({ type: 'prewarm', prewarm: prewarm('b') });
    actor.send({ type: 'prewarm', prewarm: prewarm('c') });
    expect(children.inputsFor('acpSession')).toHaveLength(2);

    actor.send({ type: 'opened', key: 'fake:b' });
    expect(sent('fake:a')).toEqual(['close']);
    expect(sent('fake:b')).toEqual([]);

    /* The prewarm now rests oldest: the next open evicts it first. */
    rest('d', 'run-d:0');
    expect(sent('fake:b')).toEqual(['close']);
  });

  it('abandons a prewarm still opening when its chat closes', () => {
    const { actor, emitted, sent } = start(1);
    actor.send({ type: 'prewarm', prewarm: prewarm('a') });
    actor.send({ type: 'closeChat', requestId: 'close-a', chatId: 'a' });
    expect(sent('fake:a')).toEqual(['close']);

    actor.send({ type: 'closed', key: 'fake:a', failure: undefined });

    expect(emitted).toEqual([{ type: 'chatClosed', requestId: 'close-a' }]);
  });
});

describe('evictionVictims', () => {
  const slot = (status: 'lent' | 'resting' | 'closing'): AcpSlot =>
    status === 'lent'
      ? // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- no ref is read.
        { chatId: 'c', cwd: '/', ref: {} as AcpSlot['ref'], status, requestId: 'r' }
      : // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- no ref is read.
        { chatId: 'c', cwd: '/', ref: {} as AcpSlot['ref'], status };

  it('closes the least recent resting keys beyond the limit, never a lent or closing one', () => {
    const slots = { a: slot('resting'), b: slot('lent'), c: slot('closing'), d: slot('resting'), e: slot('lent') };
    expect(evictionVictims(slots, ['a', 'b', 'c', 'd', 'e'], 2)).toEqual(['a', 'd']);
    expect(evictionVictims(slots, ['a', 'b', 'c', 'd', 'e'], 3)).toEqual(['a']);
    expect(evictionVictims(slots, ['b', 'e'], 0)).toEqual([]);
  });
});

describe('acpSessions enumeration', () => {
  it('answers every sampled event in every reachable state (EA-A16)', () => {
    const report = (chatId: string): AnyEventObject[] => {
      const key = `fake:${chatId}`;
      return [
        { type: 'acquire', acquire: acquire(chatId, `run-${chatId}:0`) },
        { type: 'acquire', acquire: acquire(chatId, `run-${chatId}:1`, { cwd: '/elsewhere' }) },
        { type: 'opened', key },
        {
          type: 'turnEnded',
          key,
          requestId: `run-${chatId}:0`,
          outcome: { ok: true, stopReason: 'end_turn' },
          resting: true,
        },
        {
          type: 'turnEnded',
          key,
          requestId: `run-${chatId}:0`,
          outcome: { ok: true, stopReason: 'end_turn' },
          resting: false,
        },
        { type: 'closed', key, failure: undefined },
        { type: 'cancel', requestId: `run-${chatId}:0` },
        { type: 'cancel', requestId: `run-${chatId}:1` },
        { type: 'closeChat', requestId: `close-${chatId}`, chatId },
        { type: 'idleExpired', key },
        { type: 'prewarm', prewarm: prewarm(chatId) },
      ];
    };
    const events = [...report('a'), ...report('b')];
    expect(
      unansweredEvents(acpSessionsMachine, {
        input: { limit: 1, idleTimeout, renewalMargin: 1000 },
        events,
        limit: 200_000,
        serializeState: (snapshot: AnyMachineSnapshot) =>
          JSON.stringify([
            snapshot.value,
            snapshot.context.order,
            Object.entries(snapshot.context.slots as Record<string, AcpSlot>).map(([key, slot]) => [
              key,
              slot.status,
              'queued' in slot && slot.queued !== undefined,
              'requestId' in slot ? slot.requestId : undefined,
            ]),
            snapshot.context.closeRequests,
          ]),
        ignore: acpSessionsIgnoredEvents.acpSessions,
      }),
    ).toEqual([]);
  });
});
