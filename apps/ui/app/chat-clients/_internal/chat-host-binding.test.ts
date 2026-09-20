import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';

import {
  armChatTurnHold,
  chatTurnAdmission,
  chatTurnSettlement,
  publishChatTurnAdmission,
  publishChatTurnSettlement,
  releaseChatTurnHold,
  resetChatTurnServices,
} from '#chat-clients/_internal/chat-host-binding.js';
import type { ChatTurn, ChatTurnSettlementInput } from '#machines/chat-session.machine.js';

/**
 * The abandonment half of V4 — "every turn that takes a lease releases it".
 *
 * The rows that claimed to hold this asserted their own mock's `signal.aborted`
 * branch: the published `admit` takes no signal at all, so the fixture modelled
 * behaviour the product does not have, and the real path here had no test file.
 * These rows drive the real actor through the real registries (I8).
 */
describe('chatTurnAdmission', () => {
  afterEach(() => {
    resetChatTurnServices();
    vi.restoreAllMocks();
  });

  const turn: ChatTurn = { runId: 'run-1', leaseTurnId: 'user-1', request: { kind: 'regenerate' } };

  /** Start the real admission actor and stop it the moment the lease is taken. */
  const abandonAdmission = async (chatId: string): Promise<void> => {
    const reached = Promise.withResolvers<void>();
    const leased = Promise.withResolvers<ChatTurn>();
    publishChatTurnAdmission(chatId, async () => {
      reached.resolve();
      return leased.promise;
    });
    const actor = createActor(chatTurnAdmission, { input: { chatId, gesture: { kind: 'regenerate' } } });
    actor.start();
    await reached.promise;

    // A second gesture replaced this one: the invoking state exits and aborts.
    actor.stop();
    leased.resolve(turn);
  };

  /*
   * T3-D4, I6. `loadChatActor` seeds a turn for any acquired chat with an
   * eligible startup request, but only the *focused* chat mounts the
   * `ChatTurnHost` that publishes an admission — so on a chat that never gets
   * focus this wait had no publisher that could ever fire. Unbounded, it sat in
   * `queued.admitting` forever, pinned by `runHeld`, with nothing on the row to
   * click. A wait whose condition is not guaranteed to clear is bounded.
   */
  it('should refuse an admission no route ever publishes', async () => {
    vi.useFakeTimers();
    const actor = createActor(chatTurnAdmission, {
      input: { chatId: 'chat-unpublished', gesture: { kind: 'regenerate' } },
    });
    const failures: unknown[] = [];
    actor.subscribe({ error: (error: unknown) => failures.push(error) });
    actor.start();

    await vi.advanceTimersByTimeAsync(31_000);

    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ message: 'This chat is not ready to run a turn yet.' });
    vi.useRealTimers();
  });

  it('should settle the lease an abandoned admission took, and no other', async () => {
    const settlements: ChatTurnSettlementInput[] = [];
    publishChatTurnSettlement('chat-abandoned', async (input) => {
      settlements.push(input);
    });

    await abandonAdmission('chat-abandoned');

    await vi.waitFor(() => {
      expect(settlements).toEqual([
        { chatId: 'chat-abandoned', runId: 'run-1', leaseTurnId: 'user-1', outcome: 'cancelled' },
      ]);
    });
  });

  /*
   * T3-D2: the abort that abandons the admission is usually the chat's own
   * dispose, and `clearChatTurnServices` deletes this registry in the same
   * breath. Reading it directly made the release an optional call on
   * `undefined` — the lease stayed `admitted` with nothing left that could
   * release it, and every later turn of the chat died on the stale claim.
   */
  /*
   * F3/F4. The two states a browser row most needs to observe are the two it
   * cannot hold open from outside: `run.queued.admitting` lasts microseconds,
   * and `run.finishing.*` starts after the stream the row is watching has
   * already closed. These holds are what let a row park a page in each, make
   * its gesture or its reload land there, and then let it carry on.
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

  it('should park a settlement until its debug hold is released', async () => {
    const settlements: ChatTurnSettlementInput[] = [];
    publishChatTurnSettlement('chat-held-settlement', async (input) => {
      settlements.push(input);
    });
    armChatTurnHold('settlement');

    const input: ChatTurnSettlementInput = {
      chatId: 'chat-held-settlement',
      runId: 'run-1',
      leaseTurnId: 'user-1',
      outcome: 'completed',
    };
    const actor = createActor(chatTurnSettlement, { input });
    actor.start();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(settlements).toEqual([]);

    releaseChatTurnHold('settlement');

    await vi.waitFor(() => {
      expect(settlements).toEqual([input]);
    });
    actor.stop();
  });

  it('should wait for the settlement publisher before giving up on an abandoned lease', async () => {
    const settlements: ChatTurnSettlementInput[] = [];

    await abandonAdmission('chat-abandoned-late');
    // Two macrotasks: the release has run and found no publisher by now.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    publishChatTurnSettlement('chat-abandoned-late', async (input) => {
      settlements.push(input);
    });

    await vi.waitFor(() => {
      expect(settlements).toEqual([
        { chatId: 'chat-abandoned-late', runId: 'run-1', leaseTurnId: 'user-1', outcome: 'cancelled' },
      ]);
    });
  });
});
