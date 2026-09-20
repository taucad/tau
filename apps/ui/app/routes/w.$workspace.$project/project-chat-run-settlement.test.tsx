/**
 * Settlement is the step F3 in the charter's failure ledger was missing: a run
 * reported `completed` at every layer while no revision was created and no
 * bytes reached the tree. These cover the three outcomes that decide whether a
 * terminal run publishes, discards, or is retired — the smallest checks that
 * fail if that decision breaks.
 */
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserAgentHostRun } from '#chat-clients/_internal/browser-agent-host-transport.js';
import { chatTurnSettle, resetChatTurnServices } from '#chat-clients/_internal/chat-host-binding.js';
import type { ChatTurnOutcome } from '#machines/chat-session.machine.js';

const harness = {
  workspace: undefined as unknown,
  browserRun: undefined as BrowserAgentHostRun | undefined,
  status: 'ready' as 'ready' | 'submitted' | 'streaming' | 'error',
  durableRunId: undefined as string | undefined,
  durableRunState: 'terminal' as 'active' | 'terminal' | 'reattaching' | undefined,
  /** What the chat's own turn owner says it is holding (T3-D9). */
  holdsTurn: false,
  finalize: vi.fn(),
  discard: vi.fn(),
  prepare: vi.fn(),
  /** The claim this page holds for the run being settled, if any (E3). */
  reclaim: vi.fn(),
  retireClaim: vi.fn(),
  reclaimAll: vi.fn(),
  persistBrowserTurnSettlement: vi.fn(),
  releaseDurableRun: vi.fn(),
  retainDurableRun: vi.fn(),
  reconcileDurableUserMessage: vi.fn(),
  clearBrowserAgentHostRun: vi.fn(),
  /** What the settling host attested on the wire, as this tab holds it (W5). */
  finalizedTurns: [] as ReadonlyArray<{ runId: string }>,
};

const workspace = {
  chatId: 'chat_1',
  admitted: true,
  runId: 'run_1',
  turnId: 'turn_1',
  execution: {
    workspaceId: 'workspace_1',
    baseRevisionId: 'rev_1',
    hostId: 'host_1',
  },
};

// `useSyncExternalStore` compares snapshots by identity: a getter that mints a
// fresh array (or session object) every call re-renders forever.
const chatIds = Object.freeze(['chat_1']);
const session = {
  chat: { messages: [{ id: 'turn_1', role: 'user' }] },
  persistenceActorRef: {
    subscribe: () => ({ unsubscribe: () => undefined }),
    getSnapshot: () => ({ context: { isLoadingChat: false } }),
  },
};

vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: () => ({
    list: () => chatIds,
    subscribeMembership: () => () => undefined,
    subscribeStatus: () => () => undefined,
    getStatus: () => harness.status,
    getDurableRunState: () => harness.durableRunState,
    getDurableRunId: () => harness.durableRunId,
    holdsTurn: () => harness.holdsTurn,
    get: () => session,
    releaseDurableRun: harness.releaseDurableRun,
    retainDurableRun: harness.retainDurableRun,
    reconcileDurableUserMessage: harness.reconcileDurableUserMessage,
  }),
}));

vi.mock('#providers/chat-workspace-authority-provider.js', () => ({
  useChatWorkspaceAuthority: () => ({
    reclaimAll: harness.reclaimAll,
    reclaim: harness.reclaim,
    retireClaim: harness.retireClaim,
    prepare: harness.prepare,
    finalize: harness.finalize,
    discard: harness.discard,
  }),
  usePreparedChatWorkspace: () => harness.workspace,
}));

vi.mock('#chat-clients/_internal/browser-agent-host-transport.js', () => ({
  getBrowserAgentHostRun: () => harness.browserRun,
  getHostFinalizedTurns: () => harness.finalizedTurns,
  persistBrowserTurnSettlement: async (event: unknown): Promise<boolean> => {
    harness.persistBrowserTurnSettlement(event);
    return true;
  },
  retireBrowserAgentHostRun: (chatId: string): void => {
    harness.clearBrowserAgentHostRun(chatId);
  },
}));

const { ProjectChatRunSettlement } = await import('#routes/w.$workspace.$project/project-chat-run-settlement.js');

describe('ProjectChatRunSettlement', () => {
  beforeEach(() => {
    harness.workspace = workspace;
    harness.status = 'ready';
    harness.holdsTurn = false;
    harness.durableRunId = 'run_1';
    harness.durableRunState = 'terminal';
    harness.browserRun = {
      runId: 'run_1',
      state: 'completed',
      eventCount: 3,
      turnId: 'turn_1',
    };
    harness.reclaimAll.mockResolvedValue([]);
    /* This page admitted the turn it is settling, so it holds its claim. */
    harness.reclaim.mockResolvedValue(workspace);
    harness.finalizedTurns = [];
    harness.finalize.mockResolvedValue(undefined);
    harness.discard.mockResolvedValue(undefined);
    harness.prepare.mockResolvedValue(workspace);
    harness.retireClaim.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetChatTurnServices();
  });

  /**
   * End the turn the way its owner does (C3): the chat's session actor invokes
   * the settlement this component published, once, for the run it holds.
   */
  const settleTurn = async (outcome: ChatTurnOutcome = 'completed', runId = 'run_1'): Promise<void> => {
    await waitFor(() => {
      expect(chatTurnSettle('chat_1')).toBeDefined();
    });
    await chatTurnSettle('chat_1')!({ chatId: 'chat_1', runId, leaseTurnId: 'turn_1', outcome });
  };

  it('publishes a completed run this tab owns and releases the hold', async () => {
    render(<ProjectChatRunSettlement />);
    await settleTurn();

    await waitFor(() => {
      expect(harness.finalize).toHaveBeenCalledWith('chat_1', 'run_1');
    });
    expect(harness.releaseDurableRun).toHaveBeenCalledWith({
      chatId: 'chat_1',
      runId: 'run_1',
    });
    expect(harness.clearBrowserAgentHostRun).toHaveBeenCalledWith('chat_1');
    expect(harness.discard).not.toHaveBeenCalled();
  });

  it('discards a failed run and never publishes it', async () => {
    harness.browserRun = {
      runId: 'run_1',
      state: 'failed',
      eventCount: 2,
      turnId: 'turn_1',
    };

    render(<ProjectChatRunSettlement />);
    await settleTurn('failed');

    await waitFor(() => {
      expect(harness.discard).toHaveBeenCalledWith('chat_1', 'run_1');
    });
    expect(harness.finalize).not.toHaveBeenCalled();
    expect(harness.releaseDurableRun).toHaveBeenCalledWith({
      chatId: 'chat_1',
      runId: 'run_1',
    });
  });

  /* No host log owns this run any more, so there is no completion to publish
   * over the reader's newer live edits — the claim is discarded and the hold
   * released, which is what keeps the chat from wedging behind an admission
   * that can never settle. */
  it('discards a run no host log owns rather than wedging the chat', async () => {
    harness.browserRun = undefined;

    render(<ProjectChatRunSettlement />);
    await settleTurn();

    await waitFor(() => {
      expect(harness.discard).toHaveBeenCalledWith('chat_1', 'run_1');
    });
    expect(harness.finalize).not.toHaveBeenCalled();
    expect(harness.releaseDurableRun).toHaveBeenCalledWith({
      chatId: 'chat_1',
      runId: 'run_1',
    });
  });

  /**
   * The settling host attested this run on the wire (W5): the turn is recorded
   * and the root has already let its lease go, so asking for a second
   * settlement would record the reader's newer live edits as that turn's work.
   */
  it('releases a run the host already attested instead of settling it twice', async () => {
    harness.finalizedTurns = [{ runId: 'run_1' }];

    render(<ProjectChatRunSettlement />);
    await settleTurn();

    await waitFor(() => {
      expect(harness.discard).toHaveBeenCalledWith('chat_1', 'run_1');
    });
    expect(harness.finalize).not.toHaveBeenCalled();
    expect(harness.releaseDurableRun).toHaveBeenCalledWith({
      chatId: 'chat_1',
      runId: 'run_1',
    });
    expect(harness.clearBrowserAgentHostRun).toHaveBeenCalledWith('chat_1');
  });

  /* Whether a turn is over at all is the chat session actor's to know, and it
   * settles only once the request lifecycle ended (V1). What this owes is the
   * narrower fact: a run its host never carried to `completed` publishes no
   * revision, whatever outcome the turn is settled under. */
  it('publishes no revision for a run its host never completed', async () => {
    harness.browserRun = { runId: 'run_1', state: 'running', eventCount: 1 };

    render(<ProjectChatRunSettlement />);
    await settleTurn('cancelled');

    await waitFor(() => {
      expect(harness.discard).toHaveBeenCalledWith('chat_1', 'run_1');
    });
    expect(harness.finalize).not.toHaveBeenCalled();
  });

  /**
   * E3 / T1 rows 3–5. The run completed and the page died inside the
   * settlement window, so the lease that fenced the agent's writes was retired
   * by the root's epoch sweep and the writes sit in the checkout attributed to
   * nobody. Finalising on return re-leases the turn: the root refuses to lease
   * a dirty tree and mints it first as a `turn` revision carrying this turn's
   * id, so the work lands on the turn instead of being swept into whoever
   * saves next.
   */
  it('re-leases and finalises a completed run whose page died before it settled', async () => {
    harness.reclaim.mockResolvedValue(undefined);

    render(<ProjectChatRunSettlement />);
    await settleTurn();

    await waitFor(() => {
      expect(harness.prepare).toHaveBeenCalledWith('chat_1', { turnId: 'turn_1', runId: 'run_1' });
    });
    expect(harness.finalize).toHaveBeenCalledWith('chat_1', 'run_1');
    expect(harness.discard).not.toHaveBeenCalled();
  });

  /**
   * I1/I7. An abandoned run has no lease here, so `discard` retires nothing
   * and the revision root emits no settlement of its own — and a run with no
   * settlement is one every later open reconciles all over again. Its outcome
   * is recorded where every other host settlement lives: the chat's log.
   */
  it('records a durable turn.failed for an adopted run nothing here leased', async () => {
    harness.reclaim.mockResolvedValue(undefined);
    harness.browserRun = {
      runId: 'run_1',
      state: 'failed',
      eventCount: 4,
      turnId: 'turn_1',
      failure: { code: 'RUN_ABANDONED', message: 'The host executing this run is gone.' },
    };

    render(<ProjectChatRunSettlement />);
    await settleTurn('failed');

    await waitFor(() => {
      expect(harness.persistBrowserTurnSettlement).toHaveBeenCalledWith({
        type: 'turn.failed',
        chatId: 'chat_1',
        runId: 'run_1',
        turnId: 'turn_1',
        checkoutId: undefined,
        reason: 'The host executing this run is gone.',
      });
    });
    expect(harness.finalize).not.toHaveBeenCalled();
  });

  /**
   * W10-2. The chat's claim has rolled on to a newer run — a second view, a
   * `prepare` that landed while this run was finishing — so this run holds no
   * lease here at all. `prepare`, `finalize` and `discard` all refuse a claim
   * they are not holding (`CHAT_CLAIM_RUN_MISMATCH`, the refusal T3-amp added
   * so a settlement learns its lease was *not* retired), and calling one
   * anyway threw away the durable settlement, the hold release and the run
   * record with it — then the one retry repeated the same deterministic throw.
   */
  it('settles a run the chat no longer holds a claim for without touching the newer claim', async () => {
    const mismatch = Object.assign(new Error('run_1 does not name chat_1’s current run run_2.'), {
      code: 'CHAT_CLAIM_RUN_MISMATCH',
    });
    harness.reclaim.mockResolvedValue({ ...workspace, runId: 'run_2' });
    harness.prepare.mockRejectedValue(mismatch);
    harness.finalize.mockRejectedValue(mismatch);
    harness.discard.mockRejectedValue(mismatch);

    render(<ProjectChatRunSettlement />);
    await settleTurn();

    await waitFor(() => {
      expect(harness.persistBrowserTurnSettlement).toHaveBeenCalledWith({
        type: 'turn.failed',
        chatId: 'chat_1',
        runId: 'run_1',
        turnId: 'turn_1',
        checkoutId: undefined,
        reason: 'The turn ended before it recorded a revision.',
      });
    });
    expect(harness.prepare).not.toHaveBeenCalled();
    expect(harness.finalize).not.toHaveBeenCalled();
    expect(harness.discard).not.toHaveBeenCalled();
    expect(harness.releaseDurableRun).toHaveBeenCalledWith({ chatId: 'chat_1', runId: 'run_1' });
    expect(harness.clearBrowserAgentHostRun).toHaveBeenCalledWith('chat_1');
  });

  /* A turn this page admitted settles through its own lease; the root emits
   * that settlement, so writing a second one here would be a duplicate. */
  it('leaves a turn it leased itself to the revision root', async () => {
    harness.browserRun = { runId: 'run_1', state: 'failed', eventCount: 2, turnId: 'turn_1' };

    render(<ProjectChatRunSettlement />);
    await settleTurn('failed');

    await waitFor(() => {
      expect(harness.discard).toHaveBeenCalledWith('chat_1', 'run_1');
    });
    expect(harness.persistBrowserTurnSettlement).not.toHaveBeenCalled();
    expect(harness.prepare).not.toHaveBeenCalled();
  });

  it('does not reattach a new local lease before its send starts', async () => {
    harness.durableRunId = undefined;
    harness.durableRunState = undefined;
    harness.browserRun = undefined;
    const view = render(<ProjectChatRunSettlement />);

    await waitFor(() => {
      expect(harness.reclaimAll).toHaveBeenCalled();
    });
    expect(harness.retainDurableRun).not.toHaveBeenCalled();

    harness.status = 'submitted';
    view.rerender(<ProjectChatRunSettlement />);

    await waitFor(() => {
      expect(harness.retainDurableRun).toHaveBeenCalledWith({
        chatId: 'chat_1',
        runId: 'run_1',
        state: 'active',
      });
    });
  });

  /**
   * F2/F4: discovery is documented as mount-time recovery, and the claim it
   * compares against this tab's run record may be *newer* than that record. A
   * claim whose chat is mid-dispatch is never unsubstantiated — its run id is
   * the one being admitted right now — and retiring it released the lease the
   * revision root was holding for that very turn.
   */
  it('should not retire an admitted claim while its chat is submitted', async () => {
    harness.status = 'submitted';
    harness.durableRunId = undefined;
    harness.durableRunState = undefined;
    harness.workspace = { ...workspace, runId: 'run_2' };
    harness.browserRun = { runId: 'run_1', state: 'completed', eventCount: 3, turnId: 'turn_1' };
    harness.reclaimAll.mockResolvedValue([{ ...workspace, runId: 'run_2' }]);

    render(<ProjectChatRunSettlement />);

    await waitFor(() => {
      expect(harness.retainDurableRun).toHaveBeenCalledWith({
        chatId: 'chat_1',
        runId: 'run_2',
        state: 'active',
      });
    });
    expect(harness.retireClaim).not.toHaveBeenCalled();
    expect(harness.discard).not.toHaveBeenCalled();
  });

  /**
   * T3-D9. `isRetirableClaim` asked the AI SDK's status, which is `ready` for
   * the whole admission window — the dispatch is deferred by a microtask and no
   * bytes have flowed. So between `turnAdmitted` and the request actually
   * starting, a claim naming the *new* run was retirable while a stale
   * `browserRuns` entry named an older one, and discovery released the lease
   * under the live turn. §16 moved the turn to the chat's actor; the predicate
   * asks that owner.
   */
  it('should not retire a claim whose chat owner is holding the turn', async () => {
    harness.status = 'ready';
    harness.holdsTurn = true;
    harness.durableRunId = undefined;
    harness.durableRunState = undefined;
    harness.workspace = { ...workspace, runId: 'run_2' };
    harness.browserRun = { runId: 'run_1', state: 'completed', eventCount: 3, turnId: 'turn_1' };
    harness.reclaimAll.mockResolvedValue([{ ...workspace, runId: 'run_2' }]);

    render(<ProjectChatRunSettlement />);

    await waitFor(() => {
      expect(harness.retainDurableRun).toHaveBeenCalledWith({ chatId: 'chat_1', runId: 'run_2', state: 'active' });
    });
    expect(harness.retireClaim).not.toHaveBeenCalled();
  });

  it('should run discovery once per mount, not when the authority changes identity', async () => {
    harness.reclaimAll.mockResolvedValue([]);
    const view = render(<ProjectChatRunSettlement />);

    await waitFor(() => {
      expect(harness.reclaimAll).toHaveBeenCalledTimes(1);
    });
    /* The mocked provider hands back a fresh context value on every render,
     * exactly as the real one did whenever the chats query refetched. */
    view.rerender(<ProjectChatRunSettlement />);
    view.rerender(<ProjectChatRunSettlement />);

    await waitFor(() => {
      expect(harness.reclaimAll).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * A Tau Host turn claims no browser workspace — the daemon owns the files,
   * its filesystem and its tools (W4 ruling 1), so `admitWorkspace` returns
   * without preparing or admitting anything. With no claim there is nothing
   * for this browser to settle, and settlement must not reach for the API,
   * the revision actor, or a neighbouring chat's claim.
   */
  it('settles nothing for a chat that holds no browser workspace claim', async () => {
    harness.workspace = undefined;

    render(<ProjectChatRunSettlement />);

    await waitFor(() => {
      expect(harness.reclaimAll).toHaveBeenCalled();
    });
    expect(harness.finalize).not.toHaveBeenCalled();
    expect(harness.discard).not.toHaveBeenCalled();
    expect(harness.retireClaim).not.toHaveBeenCalled();
    expect(harness.releaseDurableRun).not.toHaveBeenCalled();
  });

  /* The five-attempt retry timer is gone with the effect that owned it: a
   * settlement is attempted once, by the turn's owner, and its rejection is
   * the chat session actor's failure to record — pinned by
   * `chat-session.machine.test.ts` > 'should record a rejected settlement as
   * the failure it is'. */
});
