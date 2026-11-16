import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';

import {
  armChatTurnHold,
  chatTurnAdmission,
  publishChatTurnAdmission,
  releaseChatTurnHold,
  resetChatTurnServices,
} from '#chat-clients/_internal/chat-host-binding.js';
import type { ChatTurn } from '#machines/chat-session.machine.js';

/**
 * The chat session's admission service, driven as a real actor through its registry (I8). The host places and
 * settles every attempt (W8 TS-S5, TS-S6); admission takes no lease.
 */
describe('chatTurnAdmission', () => {
  afterEach(() => {
    resetChatTurnServices();
    vi.restoreAllMocks();
  });

  const turn: ChatTurn = { runId: 'run-1', leaseTurnId: 'user-1', request: { kind: 'regenerate' } };

  /* An absent focused publisher is an answer, not a peer timer. */
  it('should refuse an admission no route ever publishes without waiting', async () => {
    const actor = createActor(chatTurnAdmission, {
      input: { chatId: 'chat-unpublished', gesture: { kind: 'regenerate' } },
    });
    const failures: unknown[] = [];
    actor.subscribe({ error: (error: unknown) => failures.push(error) });
    actor.start();

    await vi.waitFor(() => {
      expect(failures).toHaveLength(1);
    });

    expect(failures[0]).toMatchObject({ message: 'This chat is not ready to run a turn yet.' });
  });

  /*
   * F3/F4. `run.queued.admitting` lasts microseconds; the debug hold lets a
   * browser row park a page there, then release the admission.
   */
  it('should park an admission until its debug hold is released', async () => {
    const admitted: string[] = [];
    publishChatTurnAdmission('chat-held-admission', async () => {
      admitted.push('admitted');
      return turn;
    });
    armChatTurnHold('admission');

    const actor = createActor(chatTurnAdmission, {
      input: { chatId: 'chat-held-admission', gesture: { kind: 'regenerate' } },
    });
    actor.start();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(admitted).toEqual([]);

    releaseChatTurnHold('admission');

    await vi.waitFor(() => {
      expect(admitted).toEqual(['admitted']);
    });
    actor.stop();
  });

  /* SP2h review: a turn held while a cloud open writes the files ends when its dispatch stops. */
  it('should hand the admission its dispatch’s stop', async () => {
    const signals: AbortSignal[] = [];
    publishChatTurnAdmission('chat-stopped-admission', async (_gesture, signal) => {
      if (signal !== undefined) {
        signals.push(signal);
      }
      return new Promise<ChatTurn>(() => {
        /* Never settles: the stop is what the test watches. */
      });
    });
    const actor = createActor(chatTurnAdmission, {
      input: { chatId: 'chat-stopped-admission', gesture: { kind: 'regenerate' } },
    });
    actor.start();
    await vi.waitFor(() => {
      expect(signals).toHaveLength(1);
    });
    expect(signals[0]?.aborted).toBe(false);
    actor.stop();
    expect(signals[0]?.aborted).toBe(true);
  });
});
