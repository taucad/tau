// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CadAgentExecution } from '@taucad/chat';

/**
 * An external-agent chat opened where its agent cannot run (cross-device chat
 * handoff, XD5; `bricked-acp-chat-browser-recovery.md`): the chat keeps its pin
 * and the composer offers Tau, never switching on its own.
 */
type Harness = {
  execution: CadAgentExecution;
  setActiveExecution: ReturnType<typeof vi.fn>;
  canSelectExecution: boolean;
  unplaceable: string | undefined;
  loopbackListeners: Set<() => void>;
};

const harness = vi.hoisted(
  (): Harness => ({
    execution: { kind: 'tau', model: 'anthropic-claude-opus-4.8' },
    setActiveExecution: vi.fn(),
    canSelectExecution: true,
    unplaceable: undefined,
    loopbackListeners: new Set<() => void>(),
  }),
);

vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({
    execution: { execution: harness.execution, setActiveExecution: harness.setActiveExecution },
    canSelectExecution: harness.canSelectExecution,
  }),
}));
vi.mock('#hooks/use-models.js', () => ({
  useModels: () => ({
    lastTauExecution: { kind: 'tau', model: 'anthropic-claude-opus-4.8', effort: 'high' },
  }),
}));
vi.mock('#lib/agent-host-placement.js', () => ({
  externalAgentDisplayName: (agentId: string) => (agentId === 'codex' ? 'Codex' : agentId),
  unplaceableExecutionReason: () => harness.unplaceable,
  onLoopbackAgentHostsChanged: (listener: () => void) => {
    harness.loopbackListeners.add(listener);
    return () => harness.loopbackListeners.delete(listener);
  },
}));

const { ChatPlacementNotice } = await import('#components/chat/chat-placement-notice.js');

const desktopCodex: CadAgentExecution = { kind: 'acp', hostId: 'desktop', agentId: 'codex' };
const reason = 'Codex runs in Tau Desktop. Open this chat there, or choose Tau to continue here.';

beforeEach(() => {
  harness.execution = desktopCodex;
  harness.canSelectExecution = true;
  harness.unplaceable = reason;
  harness.setActiveExecution.mockReset();
});

afterEach(() => {
  harness.loopbackListeners.clear();
});

describe('ChatPlacementNotice', () => {
  it('should explain where the agent runs, without changing the chat’s agent', () => {
    render(<ChatPlacementNotice />);

    const notice = screen.getByRole('status', { name: 'Codex can’t run here' });
    expect(notice).toHaveTextContent(reason);
    expect(harness.setActiveExecution).not.toHaveBeenCalled();
  });

  it('should continue the same chat with Tau on the last Tau model only when asked', async () => {
    render(<ChatPlacementNotice />);

    await userEvent.click(screen.getByRole('button', { name: 'Continue here with Tau' }));

    expect(harness.setActiveExecution).toHaveBeenCalledExactlyOnceWith({
      kind: 'tau',
      model: 'anthropic-claude-opus-4.8',
      effort: 'high',
    });
  });

  it('should offer no writable action on a surface that cannot change the agent', () => {
    harness.canSelectExecution = false;

    render(<ChatPlacementNotice />);

    expect(screen.getByRole('status')).toHaveTextContent(reason);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('should render nothing for an execution this device can place', () => {
    harness.unplaceable = undefined;

    const { container } = render(<ChatPlacementNotice />);

    expect(container).toBeEmptyDOMElement();
  });

  it('should leave once this tab is handed the daemon the chat is pinned to', () => {
    harness.execution = { kind: 'acp', hostId: 'loopback:http://127.0.0.1:4100', agentId: 'codex' };
    render(<ChatPlacementNotice />);
    expect(screen.getByRole('status')).toBeInTheDocument();

    harness.unplaceable = undefined;
    act(() => {
      for (const listener of harness.loopbackListeners) {
        listener();
      }
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
