/**
 * The browser leadership binding (W6 RH-S7) over Node's Web Locks and `BroadcastChannel`: two launchers in one
 * process stand for two tabs of one origin, over one in-memory provider filesystem; and the binding alone over a
 * scripted launcher (W6.r1 findings 2, 6 and 12).
 */

import { afterEach, describe, expect, it } from 'vitest';

import { StepClock } from '@taucad/xstate-testing/clock';

import {
  applied,
  bindTab,
  bindingDelays,
  cancelCommand,
  closedAnswer,
  closePorts,
  playLeader,
  scriptedHost,
  startCommand,
  uniqueProject,
  wait,
} from '#browser/test/leadership.binding.fixture.js';
import { chatLeadershipNames } from '#launchers/leadership/names.js';
import {
  cancel,
  closeLaunchers,
  heldLocks,
  launch,
  memoryFileSystem,
  projectId,
  start,
  until,
} from '#browser/leadership.fixture.js';

afterEach(closeLaunchers);

/** `promise`'s value if it settles within `milliseconds`, else `'pending'`. */
const within = async <Value>(promise: Promise<Value>, milliseconds: number): Promise<Value | 'pending'> =>
  Promise.race([
    promise,
    new Promise<'pending'>((resolve) => {
      setTimeout(resolve, milliseconds, 'pending');
    }),
  ]);

describe('browser leadership', () => {
  /* W0.17 (O3, RH-R6): both names come from one key, so a tab that lost the lock race hears the holder. */
  it('should answer a follower on another checkout within one heartbeat', async () => {
    const fileSystem = memoryFileSystem();
    const tabA = launch(fileSystem, 'tab-a');
    const tabB = launch(fileSystem, 'tab-b');
    expect(await start(tabA, 'chat-1', 'run-1')).toMatchObject({ status: 'applied' });

    const answer = await cancel(tabB, 'chat-1', 'run-1');

    /* The holder ran it, under its term: a tab that never heard the holder answers PEER_UNRESPONSIVE at the bound. */
    expect(answer).toMatchObject({ status: 'applied', generation: 1 });
  });

  /* W6.r1 round 3: an observer's read parked on a chat no tab leads re-routes once another tab starts leading it. */
  it('should wake a parked observer read when another tab starts leading the chat', async () => {
    const fileSystem = memoryFileSystem();
    const tabA = launch(fileSystem, 'tab-a');
    const tabB = launch(fileSystem, 'tab-b');
    let answered = false;
    const reading = (async () => {
      const answer = await tabB.read({ chatId: 'chat-o', cursor: 0, limit: 16, maxBytes: 1_048_576 });
      answered = true;
      return answer;
    })();
    await wait(50);

    expect(await start(tabA, 'chat-o', 'run-1')).toMatchObject({ status: 'applied' });

    await until(() => answered, 100);
    await expect(reading).resolves.toMatchObject({ status: 'batch', chatId: 'chat-o' });
  });

  /* RH-R1: a read takes no lock and creates nothing. */
  it('should take no lock and create nothing when reading a missing chat', async () => {
    const fileSystem = memoryFileSystem();
    const viewer = launch(fileSystem, 'tab-a');
    const read = await viewer.read({
      chatId: 'chat-3',
      cursor: 0,
      limit: 16,
      maxBytes: 1_048_576,
      signal: AbortSignal.timeout(50),
    });
    expect(read).toMatchObject({ status: 'batch', endCursor: 0 });
    expect(fileSystem.files.size).toBe(0);
    expect(await heldLocks()).not.toContain(chatLeadershipNames(projectId, 'chat-3').lock);
  });

  /* RH-A9 (I32): a tab on another build never runs this build's command. */
  it('should refuse a command from another build with LEADER_VERSION_MISMATCH', async () => {
    const fileSystem = memoryFileSystem();
    const current = launch(fileSystem, 'tab-a');
    const older = launch(fileSystem, 'tab-b', { build: 'build-0' });
    expect(await start(current, 'chat-5', 'run-1')).toMatchObject({ status: 'applied' });
    expect(await cancel(older, 'chat-5', 'run-1')).toMatchObject({
      status: 'refused',
      code: 'LEADER_VERSION_MISMATCH',
    });
  });
});

/* W6.r1 findings 2, 6 and 12: the binding over a scripted launcher, Node's Web Locks and `BroadcastChannel`. */
describe('browser leadership binding', () => {
  afterEach(closePorts);

  /* Finding 12: the next grantee never finds the OPFS handle still open. */
  it('should release the lock only after the writer is relinquished', async () => {
    const project = uniqueProject();
    const { lock } = chatLeadershipNames(project, 'chat-1');
    let open = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const { host, calls } = scriptedHost({
      relinquish: async () => {
        calls.push('relinquish');
        await gate;
      },
    });
    const port = bindTab(host, { project });
    try {
      port.reconcile('chat-1', { wait: false });
      await until(() => port.role('chat-1').role === 'leader' && calls.includes('claim'));

      port.quiescent('chat-1', true);
      await until(() => calls.includes('relinquish'));
      await wait(50);
      expect(await heldLocks()).toContain(lock);
    } finally {
      open();
    }
    await until(async () => {
      const held = await heldLocks();
      return !held.includes(lock);
    });
  });

  /* W6.r1 round 3: a follower that hears `released` finds the writer closed and the lock free. */
  it('should post its released heartbeat only after it relinquished the writer and let the lock go', async () => {
    const project = uniqueProject();
    const names = chatLeadershipNames(project, 'chat-1');
    let open = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const { host, calls } = scriptedHost({
      relinquish: async () => {
        calls.push('relinquish');
        await gate;
      },
    });
    const heard: string[] = [];
    const locksWhenHeard: Array<Promise<readonly string[]>> = [];
    const channel = new BroadcastChannel(names.channel);
    channel.addEventListener('message', (message: MessageEvent<{ kind: string; body: { state?: string } }>) => {
      if (message.data.kind === 'hb' && message.data.body.state === 'released') {
        heard.push(calls.at(-1) ?? '');
        locksWhenHeard.push(heldLocks());
      }
    });
    const port = bindTab(host, { project });
    try {
      port.reconcile('chat-1', { wait: false });
      await until(() => port.role('chat-1').role === 'leader' && calls.includes('claim'));

      port.quiescent('chat-1', true);
      await until(() => calls.includes('relinquish'));
      await wait(50);
      expect(heard).toEqual([]);
      open();
      await until(() => heard.length > 0);
      /* The writer was relinquished and its view dropped before the heartbeat went. */
      expect(heard).toEqual(['dropView']);
      expect(await locksWhenHeard[0]).not.toContain(names.lock);
    } finally {
      open();
      channel.close();
    }
  });

  /* RH-A10 (EQ4, D10): M1's `paused` is quiescent, so a paused run holds no Web Lock. */
  it('should hold no Web Lock while its run is paused', async () => {
    const project = uniqueProject();
    const { lock } = chatLeadershipNames(project, 'chat-1');
    const { host, calls } = scriptedHost();
    const port = bindTab(host, { project });
    port.reconcile('chat-1', { wait: false });
    await until(() => port.role('chat-1').role === 'leader' && calls.includes('claim'));
    expect(await heldLocks()).toContain(lock);

    /* The run executes, then rests in `paused` awaiting a person's decision: M1 reports quiescent. */
    port.quiescent('chat-1', false);
    port.quiescent('chat-1', true);

    await until(async () => {
      const held = await heldLocks();
      return !held.includes(lock);
    });
    expect(port.role('chat-1').role).toBe('none');
  });

  /* Finding 6 (D-092, I15): a faulted chat is rebuilt on its next command, never left answering nothing. */
  it('should replace a faulted chat on its next command', async () => {
    let faults = 1;
    const { host, calls } = scriptedHost({
      wakeReads: () => {
        if (faults > 0) {
          faults -= 1;
          throw new Error('A wake failed.');
        }
      },
    });
    const port = bindTab(host, { project: uniqueProject() });
    port.reconcile('chat-1', { wait: false });
    await until(() => calls.includes('claim'));

    const answer = await Promise.race([
      port.execute('chat-1', cancelCommand('cmd-1', 'chat-1'), async () => applied('cmd-1', 0)),
      wait(2000).then((): 'unanswered' => 'unanswered'),
    ]);

    expect(answer).toMatchObject({ status: 'applied', commandId: 'cmd-1' });
    expect(calls.filter((call) => call === 'execute')).toHaveLength(1);
  });

  /* RH-A17 (D-092), M2's leg: chat a's leadership faults (its `onError`) and lets its lock go; chat b keeps leading and
   * serving, and chat a's next command is answered by a fresh leadership. */
  it("should keep chat b leading when chat a's leadership faults", async () => {
    const project = uniqueProject();
    let faults = 1;
    const { host, calls } = scriptedHost({
      wakeReads: (chatId) => {
        if (chatId === 'chat-a' && faults > 0) {
          faults -= 1;
          throw new Error('A wake failed.');
        }
      },
    });
    const port = bindTab(host, { project });
    port.reconcile('chat-b', { wait: false });
    await until(() => port.role('chat-b').role === 'leader');
    const locks = { a: chatLeadershipNames(project, 'chat-a').lock, b: chatLeadershipNames(project, 'chat-b').lock };

    port.reconcile('chat-a', { wait: false });
    await until(() => faults === 0);
    await until(async () => {
      const held = await heldLocks();
      return !held.includes(locks.a);
    });

    expect(port.role('chat-b').role).toBe('leader');
    expect(await heldLocks()).toContain(locks.b);
    const executed = calls.filter((call) => call === 'execute').length;
    await expect(
      port.execute('chat-b', cancelCommand('cmd-b', 'chat-b'), async () => applied('cmd-b', 0)),
    ).resolves.toMatchObject({ status: 'applied', commandId: 'cmd-b' });
    await expect(
      port.execute('chat-a', cancelCommand('cmd-a', 'chat-a'), async () => applied('cmd-a', 0)),
    ).resolves.toMatchObject({ status: 'applied', commandId: 'cmd-a' });
    expect(calls.filter((call) => call === 'execute')).toHaveLength(executed + 2);
  });

  /* W6.r1 round 4 (T3): a leader draining its project refuses a forwarded start `HOST_CLOSED`; the sender keeps it
   * for the successor, which admits it, instead of failing the send. */
  it('should re-forward a start a draining leader refused to its successor, which admits it', async () => {
    const project = uniqueProject();
    const draining = await playLeader(project, 'chat-1', 1);
    const port = bindTab(scriptedHost().host, { project });
    const answered = port.execute('chat-1', startCommand('cmd-1', 'chat-1'), async () => applied('cmd-1', 0));
    draining.heartbeat();
    await until(() => draining.commands.length > 0);

    draining.answer(draining.commands[0]!.corr, closedAnswer('cmd-1'));
    const early = await Promise.race([answered, wait(100).then((): 'waiting' => 'waiting')]);
    expect(early).toBe('waiting');
    draining.close();
    const successor = await playLeader(project, 'chat-1', 2);
    successor.heartbeat();
    await until(() => successor.commands.length > 0);
    /* The successor took it: a successor slower than the drain bound is still the one that answers. */
    const beat = setInterval(() => {
      successor.heartbeat();
    }, 100);
    await wait(bindingDelays.closedHostBound + 200);
    clearInterval(beat);
    successor.answer(successor.commands[0]!.corr, applied('cmd-1', 2));

    expect(await answered).toMatchObject({ status: 'applied', generation: 2 });
    successor.close();
  });

  /* W6.r1 round 4 (T3): when the draining leader lets the chat go, the start it refused runs here. */
  it('should run a start a draining leader refused here once that leader releases the chat', async () => {
    const project = uniqueProject();
    const draining = await playLeader(project, 'chat-1', 1);
    const { host, calls } = scriptedHost();
    const port = bindTab(host, { project });
    const answered = port.execute('chat-1', startCommand('cmd-1', 'chat-1'), async (epoch) =>
      applied('cmd-1', typeof epoch === 'number' ? epoch : 0),
    );
    draining.heartbeat();
    await until(() => draining.commands.length > 0);
    draining.answer(draining.commands[0]!.corr, closedAnswer('cmd-1'));
    await wait(50);

    draining.release();

    expect(await answered).toMatchObject({ status: 'applied', commandId: 'cmd-1' });
    expect(calls).toContain('claim');
    expect(draining.commands).toHaveLength(1);
    draining.close();
  });

  /* W6.r1 round 4 (C11): with no release and no successor in time, the draining leader's refusal is the answer. */
  it("should answer a draining leader's refusal once its bound passes with no successor", async () => {
    const project = uniqueProject();
    const draining = await playLeader(project, 'chat-1', 1);
    const port = bindTab(scriptedHost().host, { project });
    const answered = port.execute('chat-1', startCommand('cmd-1', 'chat-1'), async () => applied('cmd-1', 0));
    const beat = setInterval(() => {
      draining.heartbeat();
    }, 100);
    try {
      await until(() => draining.commands.length > 0);

      draining.answer(draining.commands[0]!.corr, closedAnswer('cmd-1'));

      expect(await answered).toMatchObject({ status: 'refused', code: 'HOST_CLOSED' });
      expect(draining.commands).toHaveLength(1);
    } finally {
      clearInterval(beat);
      draining.close();
    }
  });

  /* W6.r1 round 5 (W2): the wait is once: a successor that refuses HOST_CLOSED too is the answer, at once. */
  it("should answer a successor's HOST_CLOSED at once, without waiting again", async () => {
    const project = uniqueProject();
    const draining = await playLeader(project, 'chat-1', 1);
    const port = bindTab(scriptedHost().host, { project });
    const answered = port.execute('chat-1', startCommand('cmd-1', 'chat-1'), async () => applied('cmd-1', 0));
    draining.heartbeat();
    await until(() => draining.commands.length > 0);
    draining.answer(draining.commands[0]!.corr, closedAnswer('cmd-1'));
    await wait(50);
    draining.close();
    const successor = await playLeader(project, 'chat-1', 2);
    successor.heartbeat();
    await until(() => successor.commands.length > 0);

    successor.answer(successor.commands[0]!.corr, closedAnswer('cmd-1'));

    expect(await within(answered, bindingDelays.closedHostBound / 2)).toMatchObject({
      status: 'refused',
      code: 'HOST_CLOSED',
    });
    successor.close();
  });

  /* W6.r1 round 5 (W3): asking for the lock is not leading: a reconcile while a write waits on a draining holder that
   * keeps the chat leaves its bound armed, so the write is still answered. */
  it('should still answer a write waiting on a draining holder after a reconcile asks for the lock', async () => {
    const project = uniqueProject();
    const draining = await playLeader(project, 'chat-1', 1);
    const port = bindTab(scriptedHost().host, { project });
    const answered = port.execute('chat-1', startCommand('cmd-1', 'chat-1'), async () => applied('cmd-1', 0));
    const beat = setInterval(() => {
      draining.heartbeat();
    }, 100);
    try {
      await until(() => draining.commands.length > 0);
      draining.answer(draining.commands[0]!.corr, closedAnswer('cmd-1'));
      await wait(50);

      port.reconcile('chat-1', { wait: true });

      expect(await within(answered, bindingDelays.closedHostBound * 2)).toMatchObject({
        status: 'refused',
        code: 'HOST_CLOSED',
      });
    } finally {
      clearInterval(beat);
      draining.close();
    }
  });

  /* W6.r1 round 5 (W4): once the bound answered a write, it is gone: a later successor is sent nothing. */
  it('should send a later successor nothing once the bound answered the write', async () => {
    const project = uniqueProject();
    const draining = await playLeader(project, 'chat-1', 1);
    const { host, calls } = scriptedHost();
    const port = bindTab(host, { project });
    const answered = port.execute('chat-1', startCommand('cmd-1', 'chat-1'), async () => applied('cmd-1', 0));
    const beat = setInterval(() => {
      draining.heartbeat();
    }, 100);
    await until(() => draining.commands.length > 0);
    draining.answer(draining.commands[0]!.corr, closedAnswer('cmd-1'));
    expect(await answered).toMatchObject({ status: 'refused', code: 'HOST_CLOSED' });
    clearInterval(beat);
    draining.close();

    const successor = await playLeader(project, 'chat-1', 2);
    const successorBeat = setInterval(() => {
      successor.heartbeat();
    }, 100);
    await wait(600);
    clearInterval(successorBeat);

    expect(successor.commands).toHaveLength(0);
    expect(calls).not.toContain('execute');
    successor.close();
  });

  /* W6.r1 round 5 (MW2): a follower whose holder was succeeded without a release re-routes its parked reads once the
   * successor is heard, instead of leaving them parked on the holder that went silent. */
  it('should wake parked reads when a successor is heard after the holder went silent', async () => {
    const project = uniqueProject();
    const holder = await playLeader(project, 'chat-1', 1);
    let wakes = 0;
    const { host } = scriptedHost({
      wakeReads: () => {
        wakes += 1;
      },
    });
    const port = bindTab(host, { project });
    const answered = port.execute('chat-1', cancelCommand('cmd-1', 'chat-1'), async () => applied('cmd-1', 0));
    holder.heartbeat();
    await until(() => holder.commands.length > 0);
    holder.answer(holder.commands[0]!.corr, applied('cmd-1', 1));
    await answered;
    const before = wakes;
    holder.heartbeat();

    holder.close();
    const successor = await playLeader(project, 'chat-1', 2);
    successor.heartbeat();

    /* Well inside the heartbeat bound, so only hearing the successor can have woken them. */
    await until(() => wakes > before, 15);
    successor.close();
  });

  /* Finding 2 (RH-A3 on the Node tier, on a step clock): a thawed follower's late bound is re-armed, so it never
   * steals from a leader that heartbeats while it was frozen. */
  it('should not steal when this tab thaws with a pending command while the leader heartbeats', async () => {
    const project = uniqueProject();
    const leader = await playLeader(project, 'chat-1');
    const clock = new StepClock();
    const { host, calls } = scriptedHost();
    const port = bindTab(host, { project, clock });
    const answered = port.execute('chat-1', cancelCommand('cmd-1', 'chat-1'), async () => applied('cmd-1', 0));
    leader.heartbeat();
    await until(() => leader.commands.length > 0);

    /* Tab B froze and thaws: its timers fire late, before tab A's queued heartbeat is delivered. */
    clock.set(clock.now() + 10_000);
    await wait(20);
    leader.heartbeat();
    leader.answer(leader.commands[0]!.corr, applied('cmd-1', 1));

    expect(await answered).toMatchObject({ status: 'applied', generation: 1 });
    expect(leader.stolen()).toBe(false);
    expect(calls).not.toContain('openView');
    leader.close();
  });
});
