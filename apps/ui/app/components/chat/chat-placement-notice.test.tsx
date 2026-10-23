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
  heldPlacement: string | undefined;
  setActiveExecution: ReturnType<typeof vi.fn>;
  canSelectExecution: boolean;
  unplaceable: string | undefined;
  loopbackListeners: Set<() => void>;
  lastTauExecution: CadAgentExecution;
  reachable: (hostId: string) => boolean;
};

const harness = vi.hoisted(
  (): Harness => ({
    execution: { kind: 'tau', model: 'anthropic-claude-opus-4.8' },
    heldPlacement: undefined,
    setActiveExecution: vi.fn(),
    canSelectExecution: true,
    unplaceable: undefined,
    loopbackListeners: new Set<() => void>(),
    lastTauExecution: { kind: 'tau', model: 'anthropic-claude-opus-4.8', effort: 'high' },
    reachable: () => true,
  }),
);

vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({
    execution: {
      execution: harness.execution,
      setActiveExecution: harness.setActiveExecution,
      heldPlacement: harness.heldPlacement,
    },
    canSelectExecution: harness.canSelectExecution,
  }),
}));
vi.mock('#hooks/use-models.js', () => ({
  useModels: () => ({
    lastTauExecution: harness.lastTauExecution,
  }),
}));
vi.mock('#lib/agent-host-placement.js', () => ({
  externalAgentDisplayName: (agentId: string) => (agentId === 'codex' ? 'Codex' : agentId),
  heldPlacementReason: (hostId: string) => `held ${hostId}`,
  unplaceableExecutionReason: () => harness.unplaceable,
  isDeviceRelativeHostReachable: (hostId: string) => harness.reachable(hostId),
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
  harness.heldPlacement = undefined;
  harness.canSelectExecution = true;
  harness.unplaceable = reason;
  harness.setActiveExecution.mockReset();
  harness.lastTauExecution = { kind: 'tau', model: 'anthropic-claude-opus-4.8', effort: 'high' };
  harness.reachable = () => true;
});

afterEach(() => {
  harness.loopbackListeners.clear();
});

describe('ChatPlacementNotice', () => {
  /* XD2: this device's placement for a Tau chat that this tab cannot reach runs the chat here, and says so. */
  it('should say a Tau chat runs in this tab when this device’s placement for it is out of this tab’s reach', () => {
    harness.execution = { kind: 'tau', model: 'anthropic-claude-opus-4.8' };
    harness.unplaceable = undefined;
    harness.heldPlacement = 'loopback:http://127.0.0.1:4100';

    render(<ChatPlacementNotice />);

    expect(screen.getByRole('status', { name: 'Running in this tab' })).toHaveTextContent(
      'held loopback:http://127.0.0.1:4100',
    );
  });

  it('should say nothing for a Tau chat on a placement this tab reaches', () => {
    harness.execution = { kind: 'tau', model: 'anthropic-claude-opus-4.8', hostId: 'loopback:http://127.0.0.1:4100' };
    harness.unplaceable = undefined;

    const { container } = render(<ChatPlacementNotice />);

    expect(container).toBeEmptyDOMElement();
  });

  it('should not say a chat runs in this tab once it is placed on a host', () => {
    harness.execution = { kind: 'tau', model: 'anthropic-claude-opus-4.8', hostId: 'dev_studio_mini' };
    harness.unplaceable = undefined;
    harness.heldPlacement = 'loopback:http://127.0.0.1:4100';

    const { container } = render(<ChatPlacementNotice />);

    expect(container).toBeEmptyDOMElement();
  });

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

  /* The last Tau choice may name a daemon only another tab or device reaches: continuing here runs on this tab. */
  it('should continue with Tau on this tab when the last Tau choice names a host this tab cannot reach', async () => {
    harness.lastTauExecution = {
      kind: 'tau',
      model: 'anthropic-claude-opus-4.8',
      effort: 'high',
      hostId: 'loopback:http://127.0.0.1:4100',
    };
    harness.reachable = () => false;
    render(<ChatPlacementNotice />);

    await userEvent.click(screen.getByRole('button', { name: 'Continue here with Tau' }));

    expect(harness.setActiveExecution).toHaveBeenCalledExactlyOnceWith({
      kind: 'tau',
      model: 'anthropic-claude-opus-4.8',
      effort: 'high',
    });
  });

  /* "Here" is this device's own Tau: a paired device is another machine, so its host id is never kept. */
  it('should continue with Tau on this device when the last Tau choice ran on a paired device', async () => {
    harness.lastTauExecution = {
      kind: 'tau',
      model: 'anthropic-claude-opus-4.8',
      effort: 'high',
      hostId: 'dev_studio_mini',
    };
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
