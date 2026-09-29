/**
 * RH-A3 on the browser tier (W6 RH-S7, I36): a frozen or dead leader is replaced and fenced when it thaws on the
 * provider leg, never stolen from on OPFS, and never stolen from while it heartbeats. The binding runs over Chromium's
 * Web Locks and `BroadcastChannel`; the other tab's leader is played by the case, which freezes it by stopping its
 * frames. The writer is scripted: the OPFS leg is `canSteal: false` with its handle's `WRITER_LOCKED`
 * (`opfs-writer-lock.browser.test.ts` covers the handle itself), and the claim's fence is the Node tier's
 * (`leadership.machine.test.ts`, `should steal from a silent leader and refuse its appends when it thaws`).
 */

import { afterEach, describe, expect, it } from 'vitest';

import { StepClock } from '@taucad/xstate-testing/clock';

import {
  applied,
  bindingDelays,
  bindTab,
  cancelCommand,
  closePorts,
  playLeader,
  scriptedHost,
  uniqueProject,
  until,
  wait,
} from '#browser/test/leadership.binding.fixture.js';
import { chatLeadershipNames } from '#launchers/leadership/names.js';

afterEach(closePorts);

/** Another tab that takes the chat's lock with `{ steal: true }` and holds it until `letGo`. */
const stealLock = (project: string, chatId: string) => {
  let letGo = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    letGo = resolve;
  });
  let granted = false;
  void navigator.locks.request(chatLeadershipNames(project, chatId).lock, { steal: true }, async () => {
    granted = true;
    await held;
  });
  return {
    granted: () => granted,
    letGo: () => {
      letGo();
    },
  };
};

describe('browser leadership (RH-A3)', () => {
  it('should serve a pending command after its leader tab freezes on the provider leg', async () => {
    const project = uniqueProject();
    const leader = await playLeader(project, 'chat-1');
    const { host, calls } = scriptedHost();
    const port = bindTab(host, { project, canSteal: true });
    const answered = port.execute('chat-1', cancelCommand('cmd-1', 'chat-1'), async () => applied('cmd-1', 0));
    leader.heartbeat();
    await until(() => leader.commands.length > 0);

    /* Tab A freezes: it neither heartbeats nor answers. Past the bound, tab B steals and serves the command at the
     * log's next epoch, whose claim fences tab A's view (RH-R9, RH-R12). */
    const answer = await answered;

    expect(answer).toMatchObject({ status: 'applied', commandId: 'cmd-1', generation: 5 });
    expect(leader.stolen()).toBe(true);
    expect(calls).toEqual(expect.arrayContaining(['openView', 'assume', 'claim', 'execute']));
    leader.close();
  });

  it('should not steal on OPFS and should serve the pending command from the thawed leader without abandoning its run', async () => {
    const project = uniqueProject();
    const leader = await playLeader(project, 'chat-1');
    const { host, calls } = scriptedHost();
    const port = bindTab(host, { project, canSteal: false });
    const answered = port.execute('chat-1', cancelCommand('cmd-1', 'chat-1'), async () => applied('cmd-1', 0));
    leader.heartbeat();
    await until(() => leader.commands.length > 0);

    /* Tab A is frozen past the bound: tab B queues behind its handle and never steals (RH-R12). */
    await wait(bindingDelays.heartbeatTimeout * 2);
    expect(leader.stolen()).toBe(false);

    /* Tab A thaws and answers the forwarded command under its own run. */
    leader.heartbeat();
    leader.answer(leader.commands[0]!.corr, applied('cmd-1', 1));

    expect(await answered).toMatchObject({ status: 'applied', generation: 1 });
    expect(leader.stolen()).toBe(false);
    expect(calls).not.toContain('openView');
    expect(calls).not.toContain('claim');
    leader.close();
  });

  it('should retry a reconciliation refused WRITER_LOCKED', async () => {
    let refusals = 1;
    const { host, calls } = scriptedHost({
      openView: async () => {
        calls.push('openView');
        if (refusals > 0) {
          refusals -= 1;
          return { kind: 'refused', code: 'WRITER_LOCKED' };
        }
        return { kind: 'read', epoch: 2 };
      },
    });
    const port = bindTab(host, { project: uniqueProject(), canSteal: false });

    /* A frozen holder's handle refuses the first read; the reconciliation backs off, queues again and claims (RH-R17). */
    port.reconcile('chat-1', { wait: true });
    await until(() => calls.includes('claim'), 500);

    expect(calls.filter((call) => call === 'openView')).toHaveLength(2);
    expect(port.role('chat-1')).toEqual({ role: 'leader', epoch: 2 });
  });

  it('should not steal when this tab thaws with a pending command while the leader heartbeats', async () => {
    const project = uniqueProject();
    const leader = await playLeader(project, 'chat-1');
    const clock = new StepClock();
    const { host, calls } = scriptedHost();
    const port = bindTab(host, { project, canSteal: true, clock });
    const answered = port.execute('chat-1', cancelCommand('cmd-1', 'chat-1'), async () => applied('cmd-1', 0));
    leader.heartbeat();
    await until(() => leader.commands.length > 0);

    /* Tab B froze while tab A kept heartbeating: on the thaw its bound fires late, before A's queued frames arrive,
     * and is re-armed once instead of stealing (W4 T9's frozen-time rule). */
    clock.set(clock.now() + 10_000);
    await wait(20);
    leader.heartbeat();
    leader.answer(leader.commands[0]!.corr, applied('cmd-1', 1));

    expect(await answered).toMatchObject({ status: 'applied', generation: 1 });
    expect(leader.stolen()).toBe(false);
    expect(calls).not.toContain('openView');
    leader.close();
  });

  it('should step down when the steal notice arrives while claiming', async () => {
    const project = uniqueProject();
    let read = (): void => undefined;
    const reading = new Promise<void>((resolve) => {
      read = resolve;
    });
    const { host, calls } = scriptedHost({
      openView: async () => {
        calls.push('openView');
        await reading;
        return { kind: 'read', epoch: 3 };
      },
    });
    const port = bindTab(host, { project, canSteal: true });
    port.reconcile('chat-1', { wait: false });
    await until(() => calls.includes('openView'));

    /* Another tab steals while tab B's read is in flight: the notice cancels the read (RV7-F4). The relinquish is
     * ordered after that read (finding 12), so it runs once the read settles, and the read's answer claims nothing. */
    const stealer = stealLock(project, 'chat-1');
    await until(stealer.granted);
    await wait(50);
    read();
    await until(() => calls.includes('relinquish'));

    expect(calls).not.toContain('claim');
    expect(port.role('chat-1').role).not.toBe('leader');
    stealer.letGo();
  });
});
