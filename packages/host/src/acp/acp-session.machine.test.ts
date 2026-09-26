/*
 * `acpSession` over faked effects (W10 EA-S5): the connection, the lent turn and the
 * publication are stubs, time is a `StepClock`, and every step runs through
 * `validated(...)` under `guardActors` (MC-R30, EA-A17).
 */

import { createActor, createAsyncLogic } from 'xstate';
import type { AnyEventObject, AnyMachineSnapshot } from 'xstate';
import { describe, expect, it } from 'vitest';

import { StepClock, flush } from '@taucad/xstate-testing/clock';
import { createFakeCallbackActors, createFakeParent } from '@taucad/xstate-testing/fakes';
import { guardActors, validated } from '@taucad/xstate-testing/inspect';
import { unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import type { PathOptions } from '@taucad/xstate-testing/paths';

import {
  acpCancelSettleTimeout,
  acpKillGrace,
  acpSessionIgnoredEvents,
  acpSessionMachine,
  acpTerminateBackstop,
} from '#acp/acp-session.machine.js';
import type { AcpLend, AcpSessionInput } from '#acp/acp-session.machine.js';
import type { AcpAdapter } from '#acp/registry.js';
import { protocolVersion } from '#acp/session.js';

const adapter: AcpAdapter = {
  id: 'fake',
  displayName: 'Fake',
  package: 'fixture',
  version: '0.0.0',
  configEnv: [],
  modulePath: '/nonexistent',
};

const lent: AcpLend = { requestId: 'run-1:0', prompt: { fresh: [{ type: 'text', text: 'hi' }] } };

const input = (overrides: Partial<AcpSessionInput> = {}): AcpSessionInput => ({
  key: 'fake:chat-1',
  opening: {
    adapter,
    cwd: '/work',
    mcpServers: [],
    sessionMessageId: 'session-message',
    sessionCommitted: false,
    notices: true,
  },
  lend: lent,
  ...overrides,
});

type Harness = ReturnType<typeof start>;

const start = (overrides: Partial<AcpSessionInput> = {}, persisted: Promise<void> = Promise.resolve()) => {
  const fakes = createFakeCallbackActors();
  const clock = new StepClock();
  const parent = createFakeParent();
  const guard = guardActors({ ignore: acpSessionIgnoredEvents });
  const logic = validated(
    acpSessionMachine.provide({
      actors: {
        adapterConnection: fakes.actor('connection'),
        lentTurn: fakes.actor('lentTurn'),
        publishSkills: createAsyncLogic<readonly string[], undefined>({ run: async () => [] }),
        persistPresentation: createAsyncLogic<void, unknown>({ run: async () => persisted }),
      },
    }),
  );
  const actor = createActor(logic, {
    input: { ...input(overrides), parentRef: parent.ref },
    clock,
    inspect: guard.inspect,
  });
  actor.start();
  /* The commands a stub received, by type, in order. */
  const commands = (name: string): AnyEventObject[] =>
    fakes.deliveries.filter((delivery) => delivery.name === name).map((delivery) => delivery.event);
  const lastCall = (): AnyEventObject | undefined => commands('connection').findLast((event) => event.type === 'call');
  /* Answer the call the child is waiting on. */
  const answer = (result: unknown): void => {
    const call = lastCall();
    fakes.sendBack('connection', {
      type: 'callSettled',
      id: String(call?.['id']),
      at: clock.now(),
      answer: { method: String(call?.['method']), result },
    });
  };
  return { fakes, clock, parent, guard, actor, commands, lastCall, answer };
};

/* Spawn, initialize (advertising nothing), create, and lend the opening turn. */
const openAndLend = async (harness: Harness): Promise<void> => {
  await flush();
  harness.answer({ protocolVersion, agentCapabilities: {} });
  harness.answer({ sessionId: 'acp-1' });
  harness.fakes.sendBack('lentTurn', { type: 'lentReady' });
  expect(harness.lastCall()).toMatchObject({ method: 'session/prompt' });
};

describe('acpSession', () => {
  it('cancel answers pending permissions, waits 2 s, then answers the turn from closed after SIGKILL', async () => {
    const harness = await (async () => {
      const opened = start();
      await openAndLend(opened);
      return opened;
    })();
    const { fakes, clock, parent, actor, commands } = harness;
    fakes.sendBack('connection', {
      type: 'vendorRequest',
      id: 'vendor-0',
      request: {
        method: 'session/request_permission',
        params: { sessionId: 'acp-1', toolCall: { toolCallId: 'tool-1' }, options: [] },
      },
    });

    actor.send({ type: 'cancel' });

    expect(commands('connection')).toContainEqual({
      type: 'notify',
      method: 'session/cancel',
      params: { sessionId: 'acp-1' },
    });
    expect(commands('connection')).toContainEqual({
      type: 'respond',
      id: 'vendor-0',
      result: { outcome: { outcome: 'cancelled' } },
    });
    expect(actor.getSnapshot().matches({ busy: 'cancelling' })).toBe(true);

    /* The vendor never answers: E22 starts the ladder while the turn drains. */
    clock.advance(acpCancelSettleTimeout);
    expect(commands('connection').at(-1)).toEqual({ type: 'terminate' });
    fakes.sendBack('lentTurn', { type: 'flushed', title: undefined, failure: undefined });
    fakes.sendBack('lentTurn', { type: 'recorded', failure: undefined });
    expect(parent.events.filter((event) => event.type === 'turnEnded')).toEqual([]);

    clock.advance(acpKillGrace);
    expect(commands('connection')).toContainEqual({ type: 'kill' });
    expect(parent.events.filter((event) => event.type === 'turnEnded')).toEqual([]);

    fakes.sendBack('connection', { type: 'adapterExited', stderr: '' });
    expect(actor.getSnapshot().status).toBe('done');
    expect(parent.events.map((event) => event.type)).toEqual(['opened', 'turnEnded', 'closed']);
    expect(parent.events[1]).toMatchObject({
      requestId: 'run-1:0',
      resting: false,
      outcome: { ok: false, failure: { code: 'EXTERNAL_AGENT_CANCELLED' } },
    });
  });

  it('E18 ends terminating only after SIGKILL to the group, with the binding released', async () => {
    const harness = start();
    await openAndLend(harness);
    const { fakes, clock, parent, actor, commands } = harness;
    harness.answer({ stopReason: 'end_turn' });
    fakes.sendBack('lentTurn', { type: 'flushed', title: undefined, failure: undefined });
    fakes.sendBack('lentTurn', { type: 'recorded', failure: undefined });
    expect(actor.getSnapshot().hasTag('resting')).toBe(true);
    /* The binding lived exactly as long as the lend (EA-R6). */
    expect(fakes.releases('lentTurn')).toBe(1);

    actor.send({ type: 'close' });
    expect(commands('connection').at(-1)).toEqual({ type: 'terminate' });
    clock.advance(acpKillGrace);
    expect(commands('connection').at(-1)).toEqual({ type: 'kill' });
    /* A group that ignores SIGKILL's exit notice: the backstop kills again, then ends. */
    clock.advance(acpTerminateBackstop - acpKillGrace);
    expect(commands('connection').filter((event) => event.type === 'kill')).toHaveLength(2);
    expect(actor.getSnapshot().status).toBe('done');
    expect(parent.events.at(-1)).toMatchObject({ type: 'closed', key: 'fake:chat-1' });
  });

  it('a timed-out cancel is answered only from closed', async () => {
    const harness = start();
    await openAndLend(harness);
    const { fakes, clock, parent, actor } = harness;
    actor.send({ type: 'cancel' });
    clock.advance(acpCancelSettleTimeout);
    fakes.sendBack('lentTurn', { type: 'flushed', title: undefined, failure: undefined });
    fakes.sendBack('lentTurn', { type: 'recorded', failure: undefined });
    /* Drained and recorded, but the group may still be running: no answer yet. */
    expect(actor.getSnapshot().matches('closing')).toBe(true);
    expect(parent.events.map((event) => event.type)).toEqual(['opened']);

    fakes.sendBack('connection', { type: 'adapterExited', stderr: '' });

    expect(parent.events.map((event) => event.type)).toEqual(['opened', 'turnEnded', 'closed']);
  });

  it('answers a cancel that races the adapter exiting once, and closes', async () => {
    const harness = start();
    await openAndLend(harness);
    const { fakes, parent, actor } = harness;
    actor.send({ type: 'cancel' });
    fakes.sendBack('connection', { type: 'adapterExited', stderr: '' });
    fakes.sendBack('lentTurn', { type: 'flushed', title: undefined, failure: undefined });
    fakes.sendBack('lentTurn', { type: 'recorded', failure: undefined });

    expect(actor.getSnapshot().status).toBe('done');
    expect(parent.events.map((event) => event.type)).toEqual(['opened', 'turnEnded', 'closed']);
    expect(parent.events[1]).toMatchObject({ outcome: { failure: { code: 'EXTERNAL_AGENT_CANCELLED' } } });
  });

  it('answers a cancel during the open at once, and closes without a vendor turn', async () => {
    const { actor, parent, fakes, commands } = start();
    await flush();

    actor.send({ type: 'cancel' });

    expect(parent.events).toMatchObject([
      { type: 'turnEnded', resting: false, outcome: { ok: false, failure: { code: 'EXTERNAL_AGENT_CANCELLED' } } },
    ]);
    expect(commands('connection').at(-1)).toEqual({ type: 'terminate' });
    expect(fakes.active('lentTurn')).toBe(0);
    fakes.sendBack('connection', { type: 'adapterExited', stderr: '' });
    expect(parent.events.at(-1)).toMatchObject({ type: 'closed' });
  });

  it('answers a cancel of a turn waiting on a presentation write, and never prompts it', async () => {
    const write = Promise.withResolvers<void>();
    const harness = start({}, write.promise);
    await openAndLend(harness);
    const { fakes, parent, actor, commands } = harness;
    harness.answer({ stopReason: 'end_turn' });
    fakes.sendBack('lentTurn', { type: 'flushed', title: undefined, failure: undefined });
    fakes.sendBack('lentTurn', { type: 'recorded', failure: undefined });
    actor.send({
      type: 'sessionUpdate',
      sessionId: 'acp-1',
      update: { sessionUpdate: 'current_mode_update', currentModeId: 'm' },
    });
    expect(actor.getSnapshot().matches({ idle: 'persisting' })).toBe(true);
    const prompts = (): number => commands('connection').filter((event) => event['method'] === 'session/prompt').length;

    actor.send({ type: 'lend', lend: { ...lent, requestId: 'run-1:1' } });
    actor.send({ type: 'cancel' });
    write.resolve();
    await flush();

    /* The second turn was never lent: no second binding, no second `session/prompt`. */
    expect(fakes.inputsFor('lentTurn')).toHaveLength(1);
    expect(fakes.active('lentTurn')).toBe(0);
    expect(prompts()).toBe(1);
    expect(actor.getSnapshot().matches({ idle: 'resting' })).toBe(true);
    expect(parent.events.filter((event) => event.type === 'turnEnded')).toMatchObject([
      { requestId: 'run-1:0', resting: true, outcome: { ok: true } },
      { requestId: 'run-1:1', resting: true, outcome: { ok: false, failure: { code: 'EXTERNAL_AGENT_CANCELLED' } } },
    ]);
  });

  /* W10-F1: a cancel before the lent turn is bound (`busy.binding`) refines CancelBinding, not CancelPrompting. */
  it('answers a cancel while the lend is binding without prompting or cancelling the vendor, then rests', async () => {
    const harness = start();
    const { actor, fakes, parent, commands } = harness;
    await flush();
    harness.answer({ protocolVersion, agentCapabilities: {} });
    harness.answer({ sessionId: 'acp-1' });
    expect(actor.getSnapshot().matches({ busy: 'binding' })).toBe(true);
    const sentMethod = (method: string): number =>
      commands('connection').filter((event) => event['method'] === method).length;

    actor.send({ type: 'cancel' });
    fakes.sendBack('lentTurn', { type: 'flushed', title: undefined, failure: undefined });
    fakes.sendBack('lentTurn', { type: 'recorded', failure: undefined });
    await flush();

    expect(sentMethod('session/prompt')).toBe(0);
    expect(sentMethod('session/cancel')).toBe(0);
    expect(actor.getSnapshot().matches({ idle: 'resting' })).toBe(true);
    expect(parent.events.filter((event) => event.type === 'turnEnded')).toMatchObject([
      { requestId: 'run-1:0', resting: true, outcome: { ok: false, failure: { code: 'EXTERNAL_AGENT_CANCELLED' } } },
    ]);

    /* The session stayed up: the next lend binds and prompts. */
    actor.send({ type: 'lend', lend: { ...lent, requestId: 'run-1:1' } });
    await flush();
    fakes.sendBack('lentTurn', { type: 'lentReady' });
    expect(sentMethod('session/prompt')).toBe(1);
  });

  it('moves down the restore ladder on a recoverable loss and says the context was lost', async () => {
    const { actor, answer, lastCall } = start({
      opening: { ...input().opening, acpSessionId: 'acp-old' },
    });
    await flush();
    answer({
      protocolVersion,
      agentCapabilities: { loadSession: true, sessionCapabilities: { resume: {} } },
    });
    expect(lastCall()).toMatchObject({ method: 'session/resume', params: { sessionId: 'acp-old' } });
    actor.send({
      type: 'callSettled',
      id: String(lastCall()?.['id']),
      at: 0,
      answer: { method: 'session/resume', error: { code: -32_002, message: 'gone', stderr: '' } },
    });
    expect(lastCall()).toMatchObject({ method: 'session/load' });
    actor.send({
      type: 'callSettled',
      id: String(lastCall()?.['id']),
      at: 0,
      answer: { method: 'session/load', error: { code: -32_002, message: 'gone', stderr: '' } },
    });
    expect(lastCall()).toMatchObject({ method: 'session/new' });
    answer({ sessionId: 'acp-new' });
    expect(actor.getSnapshot().context).toMatchObject({ acpSessionId: 'acp-new', contextLost: true });
  });
});

/* Every state node with a `timeout`, by id: its `xstate.timeout` is sampled everywhere. */
type Node = {
  readonly id: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly states: Record<string, Node>;
};
const timed = (node: Node): string[] => [
  ...(node.config['timeout'] === undefined ? [] : [node.id]),
  ...Object.values(node.states).flatMap((child) => timed(child)),
];
// oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the root's public shape, read structurally.
const timeouts = timed(acpSessionMachine.root as unknown as Node).map((stateId) => ({
  type: 'xstate.timeout',
  stateId,
}));

/* A model option the agent offers, so a lend that picks another value configures first. */
const modelOption = {
  id: 'model',
  name: 'Model',
  category: 'model',
  type: 'select',
  currentValue: 'small',
  options: [
    { value: 'small', name: 'Small' },
    { value: 'large', name: 'Large' },
  ],
};

/* Graph sampling: every public event, with answers correlated to the call the snapshot waits on. */
const sampled = (snapshot: AnyMachineSnapshot): AnyEventObject[] => {
  const id = String(snapshot.context.pending);
  const ok = (method: string, result: unknown): AnyEventObject => ({
    type: 'callSettled',
    id,
    at: 0,
    answer: { method, result },
  });
  const lost = (method: string): AnyEventObject => ({
    type: 'callSettled',
    id,
    at: 0,
    answer: { method, error: { code: -32_002, message: 'gone', stderr: '' } },
  });
  /* The invoked effects settle: publication with no directories, a presentation write either way. */
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- `AnyMachineSnapshot` erases the child map to `any`; only its keys are read.
  const children = snapshot.children as Readonly<Record<string, unknown>>;
  const settled = Object.keys(children).flatMap((actorId) => [
    { type: 'xstate.done.actor', actorId, output: [] },
    { type: 'xstate.error.actor', actorId, error: new Error('storage') },
  ]);
  return [
    ok('initialize', {
      protocolVersion,
      agentCapabilities: { loadSession: true, sessionCapabilities: { resume: {} } },
    }),
    ok('initialize', { protocolVersion, agentCapabilities: { sessionCapabilities: { close: {} } } }),
    lost('session/resume'),
    lost('session/load'),
    ok('session/resume', {}),
    ok('session/new', { sessionId: 'acp-1' }),
    ok('session/new', { sessionId: 'acp-1', configOptions: [modelOption] }),
    ok('session/set_config_option', { configOptions: [] }),
    ok('session/prompt', { stopReason: 'end_turn' }),
    ok('session/close', {}),
    ...settled,
    { type: 'lend', lend: { ...lent, requestId: 'run-1:1' } },
    { type: 'lend', lend: { ...lent, requestId: 'run-1:2', model: 'large' } },
    { type: 'cancel' },
    { type: 'close' },
    { type: 'sessionUpdate', sessionId: 'acp-1', update: { sessionUpdate: 'current_mode_update', currentModeId: 'm' } },
    {
      type: 'vendorRequest',
      id: 'vendor-0',
      request: { method: 'fs/read_text_file', params: { sessionId: 'acp-1', path: 'a' } },
    },
    { type: 'elicitationComplete', elicitationId: 'login-1' },
    { type: 'adapterExited', stderr: '' },
    { type: 'killDue' },
    { type: 'lentReady' },
    { type: 'lentFailed', failure: { code: 'X', message: 'x' } },
    { type: 'vendorAnswered', id: 'vendor-0', permission: false, answer: { result: {} } },
    { type: 'flushed', title: undefined, failure: undefined },
    { type: 'recorded', failure: undefined },
    ...timeouts,
  ];
};

const graph = (withRecord: boolean): PathOptions => ({
  input: input({
    parentRef: undefined,
    ...(withRecord ? { opening: { ...input().opening, acpSessionId: 'acp-old' } } : {}),
  }),
  events: sampled,
  limit: 200_000,
  serializeState: (snapshot) =>
    JSON.stringify([
      snapshot.value,
      snapshot.context.pending !== undefined,
      snapshot.context.exited,
      snapshot.context.acpSessionId,
      snapshot.context.facts?.agentCapabilities,
      snapshot.context.configOptions !== undefined,
      snapshot.context.lent?.model,
      snapshot.context.queued !== undefined,
      snapshot.context.stale,
    ]),
});

describe('acpSession enumeration', () => {
  it('reaches every state, the restore ladder included (EA-A15)', () => {
    const reachedWithout = new Set(unreachedStates(acpSessionMachine, graph(false)));
    const unreached = unreachedStates(acpSessionMachine, graph(true)).filter((id) => reachedWithout.has(id));
    expect(unreached).toEqual([]);
  });

  it('answers or declares every sampled event in every reachable state (EA-A16)', () => {
    expect(unansweredEvents(acpSessionMachine, { ...graph(true), ignore: acpSessionIgnoredEvents.acpSession })).toEqual(
      [],
    );
  });
});
