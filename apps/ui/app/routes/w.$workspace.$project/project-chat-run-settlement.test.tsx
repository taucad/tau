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
  retireClaim: vi.fn(),
  reclaimAll: vi.fn(),
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
    retireClaim: harness.retireClaim,
    finalize: harness.finalize,
    discard: harness.discard,
  }),
  usePreparedChatWorkspace: () => harness.workspace,
}));

vi.mock('#chat-clients/_internal/browser-agent-host-transport.js', () => ({
  getBrowserAgentHostRun: () => harness.browserRun,
  getHostFinalizedTurns: () => harness.finalizedTurns,
  clearBrowserAgentHostRun: (chatId: string): void => {
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
    harness.finalizedTurns = [];
    harness.finalize.mockResolvedValue(undefined);
    harness.discard.mockResolvedValue(undefined);
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
