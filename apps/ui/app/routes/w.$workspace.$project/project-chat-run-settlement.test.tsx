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

const harness = {
  workspace: undefined as unknown,
  browserRun: undefined as BrowserAgentHostRun | undefined,
  status: 'ready' as 'ready' | 'submitted' | 'streaming' | 'error',
  durableRunId: undefined as string | undefined,
  durableRunState: 'terminal' as 'active' | 'terminal' | 'reattaching' | undefined,
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
  });

  it('publishes a completed run this tab owns and releases the hold', async () => {
    render(<ProjectChatRunSettlement />);

    await waitFor(() => {
      expect(harness.finalize).toHaveBeenCalledWith('chat_1');
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

    await waitFor(() => {
      expect(harness.discard).toHaveBeenCalledWith('chat_1');
    });
    expect(harness.finalize).not.toHaveBeenCalled();
    expect(harness.releaseDurableRun).toHaveBeenCalledWith({
      chatId: 'chat_1',
      runId: 'run_1',
    });
  });

  it('retires a claim whose run no host log owns rather than wedging the chat', async () => {
    harness.browserRun = undefined;

    render(<ProjectChatRunSettlement />);

    await waitFor(() => {
      expect(harness.retireClaim).toHaveBeenCalledWith('chat_1');
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

    await waitFor(() => {
      expect(harness.discard).toHaveBeenCalledWith('chat_1');
    });
    expect(harness.finalize).not.toHaveBeenCalled();
    expect(harness.releaseDurableRun).toHaveBeenCalledWith({
      chatId: 'chat_1',
      runId: 'run_1',
    });
    expect(harness.clearBrowserAgentHostRun).toHaveBeenCalledWith('chat_1');
  });

  it('leaves a still-running host run active instead of settling it', async () => {
    harness.browserRun = { runId: 'run_1', state: 'running', eventCount: 1 };

    render(<ProjectChatRunSettlement />);

    await waitFor(() => {
      expect(harness.retainDurableRun).toHaveBeenCalledWith({
        chatId: 'chat_1',
        runId: 'run_1',
        state: 'active',
      });
    });
    expect(harness.finalize).not.toHaveBeenCalled();
    expect(harness.discard).not.toHaveBeenCalled();
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

  /**
   * The retry budget is five attempts per effect instance, and there is no
   * other publisher: a run whose settlement exhausts it is simply left
   * unsettled — claim still admitted, durable hold still held, no revision.
   * It publishes only because the effect re-runs (the authority mints a fresh
   * prepared object on every claim change), which restarts the budget.
   */
  it('stops after five failures, publishes nothing, and resumes when the effect re-runs', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    harness.finalize.mockRejectedValue(
      Object.assign(new Error('Live project verification did not match.'), {
        code: 'WORKSPACE_VERIFY_FAILED',
      }),
    );

    const view = render(<ProjectChatRunSettlement />);

    await waitFor(
      () => {
        expect(harness.finalize).toHaveBeenCalledTimes(5);
      },
      { timeout: 10_000 },
    );
    expect(harness.releaseDurableRun).not.toHaveBeenCalled();
    expect(harness.clearBrowserAgentHostRun).not.toHaveBeenCalled();

    harness.finalize.mockResolvedValue(undefined);
    harness.workspace = { ...workspace };
    view.rerender(<ProjectChatRunSettlement />);

    await waitFor(() => {
      expect(harness.releaseDurableRun).toHaveBeenCalledWith({
        chatId: 'chat_1',
        runId: 'run_1',
      });
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
