/**
 * W30's headless lease, over Chromium's Web Locks: it takes the very lock a tab's leadership takes before it opens a
 * chat's writer, so while it holds no writer can open, and it refuses at once to be a second holder.
 */

import { describe, expect, it } from 'vitest';

import { leaseChatLogs } from '#browser.js';
import { chatLeadershipNames } from '#launchers/leadership/names.js';

const uniqueProject = (): string => `proj_lease_${crypto.randomUUID()}`;

/** Another tab's leader of the chat: it holds the leadership lock until `letGo`. */
const leadElsewhere = async (projectId: string, chatId: string): Promise<() => void> => {
  let letGo = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    letGo = resolve;
  });
  await new Promise<void>((resolve) => {
    void navigator.locks.request(chatLeadershipNames(projectId, chatId).lock, async () => {
      resolve();
      await held;
    });
  });
  return letGo;
};

const heldNames = async (): Promise<readonly string[]> => {
  const { held = [] } = await navigator.locks.query();
  return held.map((lock) => lock.name ?? '');
};

describe('leaseChatLogs (W30)', () => {
  it('should hold every chat leadership lock until released', async () => {
    const projectId = uniqueProject();
    const lease = await leaseChatLogs({ projectId, chatIds: ['chat_b', 'chat_a'] });
    expect(lease.status).toBe('held');
    const names = ['chat_a', 'chat_b'].map((chatId) => chatLeadershipNames(projectId, chatId).lock);
    expect(await heldNames()).toEqual(expect.arrayContaining(names));
    /* A leader that asks while the lease holds is not granted. */
    const asked = await navigator.locks.request(names[0]!, { ifAvailable: true }, async (lock) => lock !== null);
    expect(asked).toBe(false);
    if (lease.status === 'held') {
      lease.release();
      expect(lease.lost()).toBe(false);
    }
    await expect.poll(heldNames).not.toEqual(expect.arrayContaining([names[0]]));
  });

  it('should refuse, holding nothing, when another process keeps leading a chat past the wait', async () => {
    const projectId = uniqueProject();
    const letGo = await leadElsewhere(projectId, 'chat_b');
    const lease = await leaseChatLogs({ projectId, chatIds: ['chat_a', 'chat_b'], waitMilliseconds: 100 });
    expect(lease).toEqual({ status: 'led-elsewhere', chatId: 'chat_b' });
    /* The lock of chat_a, taken before chat_b refused, was let go. */
    await expect.poll(heldNames).not.toContain(chatLeadershipNames(projectId, 'chat_a').lock);
    letGo();
  });

  it('should wait for a leader that lets go within the wait', async () => {
    const projectId = uniqueProject();
    const letGo = await leadElsewhere(projectId, 'chat_a');
    setTimeout(letGo, 50);
    const lease = await leaseChatLogs({ projectId, chatIds: ['chat_a'], waitMilliseconds: 2000 });
    expect(lease.status).toBe('held');
    if (lease.status === 'held') {
      lease.release();
    }
  });

  it('should report a lease a peer stole as lost', async () => {
    const projectId = uniqueProject();
    const lease = await leaseChatLogs({ projectId, chatIds: ['chat_a'] });
    let letGo = (): void => undefined;
    void navigator.locks.request(chatLeadershipNames(projectId, 'chat_a').lock, { steal: true }, async () => {
      await new Promise<void>((resolve) => {
        letGo = resolve;
      });
    });
    if (lease.status !== 'held') {
      throw new Error('The lease was not granted.');
    }
    await expect.poll(() => lease.lost()).toBe(true);
    lease.release();
    letGo();
  });
});
