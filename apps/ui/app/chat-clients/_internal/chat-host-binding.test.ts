import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';

import {
  armChatTurnHold,
  chatTurnAdmission,
  chatTurnSettlement,
  publishChatTurnAdmission,
  releaseChatTurnHold,
  resetChatTurnServices,
} from '#chat-clients/_internal/chat-host-binding.js';
import { retireBrowserAgentHostRun } from '#chat-clients/_internal/browser-agent-host-transport.js';
import type * as BrowserAgentHostTransport from '#chat-clients/_internal/browser-agent-host-transport.js';
import type { ChatTurn, ChatTurnSettlementInput } from '#machines/chat-session.machine.js';

vi.mock('#chat-clients/_internal/browser-agent-host-transport.js', async (importOriginal) => ({
  ...(await importOriginal<typeof BrowserAgentHostTransport>()),
  retireBrowserAgentHostRun: vi.fn(),
}));

/**
 * The chat session's two turn services, driven as the real actors through the real registries (I8). The host places
 * and settles every attempt (W8 TS-S5, TS-S6): the admission takes no lease, and the settlement writes nothing.
 */
describe('chatTurnAdmission', () => {
  afterEach(() => {
    resetChatTurnServices();
    vi.restoreAllMocks();
  });

  const turn: ChatTurn = { runId: 'run-1', leaseTurnId: 'user-1', request: { kind: 'regenerate' } };

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
    armChatTurnHold('settlement');
    const input: ChatTurnSettlementInput = {
      chatId: 'chat-held-settlement',
      runId: 'run-held-settlement',
      leaseTurnId: 'user-1',
      outcome: 'completed',
    };
    const done = vi.fn();
    const actor = createActor(chatTurnSettlement, { input });
    actor.subscribe({ complete: done });
    actor.start();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(done).not.toHaveBeenCalled();

    releaseChatTurnHold('settlement');

    await vi.waitFor(() => {
      expect(done).toHaveBeenCalledOnce();
    });
  });

  /* W8 TS-S6: the host appends the run's row itself; the page only lets the run's record go (D6, D7 deleted). */
  it("should settle a turn without waiting for the host's row, letting its run record go", async () => {
    const done = vi.fn();
    const actor = createActor(chatTurnSettlement, {
      input: { chatId: 'chat-settled-by-host', runId: 'run-settled-by-host', leaseTurnId: 'user-1', outcome: 'failed' },
    });
    actor.subscribe({ complete: done });
    actor.start();

    await vi.waitFor(() => {
      expect(done).toHaveBeenCalledOnce();
    });
    expect(retireBrowserAgentHostRun).toHaveBeenCalledWith('chat-settled-by-host', 'run-settled-by-host');
  });
});
