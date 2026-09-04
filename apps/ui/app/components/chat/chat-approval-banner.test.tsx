// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MyUIMessage } from '@taucad/chat';
import type { CombinedChatState } from '#hooks/use-chat.js';
import { agentApprovalToolName } from '#services/agent-host-event-projection.js';

const respondToToolApproval = vi.fn(async () => undefined);
let messages: readonly MyUIMessage[] = [];
let activeExecution: CombinedChatState['activeExecution'];

vi.mock('#hooks/use-chat.js', () => ({
  useChatSelector: <T,>(selector: (state: CombinedChatState) => T): T =>
    selector({ messages, activeExecution } as CombinedChatState),
}));
vi.mock('#chat-clients/use-cad-chat-client.js', () => ({
  useCadChatClient: () => ({ respondToToolApproval }),
}));

const { ChatApprovalBanner, pendingAgentHostApprovals } = await import('#components/chat/chat-approval-banner.js');

const approvalMessage = (
  input: Record<string, unknown>,
  state: 'approval-requested' | 'output-available' = 'approval-requested',
): MyUIMessage =>
  ({
    id: 'assistant-1',
    role: 'assistant',
    parts: [
      {
        type: 'dynamic-tool',
        toolName: agentApprovalToolName,
        toolCallId: 'interrupt-1',
        state,
        input,
        ...(state === 'approval-requested' ? { approval: { id: 'interrupt-1' } } : { output: { outcome: 'approved' } }),
      },
    ],
  }) as unknown as MyUIMessage;

const pendingInput = {
  interruptId: 'interrupt-1',
  kind: 'approval',
  prompt: 'write hello.txt',
  options: [
    { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
    { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
  ],
};

describe('pendingAgentHostApprovals', () => {
  it('reports an unresolved approval and drops it once the log settles it', () => {
    expect(pendingAgentHostApprovals([approvalMessage(pendingInput)])).toEqual([
      { messageId: 'assistant-1', approvalId: 'interrupt-1', ...pendingInput },
    ]);
    expect(pendingAgentHostApprovals([approvalMessage(pendingInput, 'output-available')])).toEqual([]);
  });

  it('reports a Paseo or Tau tool part awaiting approval under its own tool name', () => {
    const message = {
      id: 'assistant-2',
      role: 'assistant',
      parts: [
        {
          type: 'tool-create_file',
          toolCallId: 'call-1',
          state: 'approval-requested',
          input: { targetFile: 'main.scad', content: '' },
          approval: { id: 'interrupt-2' },
        },
      ],
    } as unknown as MyUIMessage;

    expect(pendingAgentHostApprovals([message])).toEqual([
      {
        messageId: 'assistant-2',
        approvalId: 'interrupt-2',
        interruptId: 'interrupt-2',
        kind: 'approval',
        prompt: 'create_file',
        options: [],
      },
    ]);
  });
});

describe('ChatApprovalBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messages = [];
    activeExecution = { kind: 'acp', hostId: 'origin', agentId: 'codex' };
  });

  it('renders nothing while no approval is pending', () => {
    const { container } = render(<ChatApprovalBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it('names the agent, the prompt and the options the host recorded', () => {
    messages = [approvalMessage(pendingInput)];

    render(<ChatApprovalBanner />);

    expect(screen.getByRole('region', { name: 'Approval required' })).toBeInTheDocument();
    expect(screen.getByText('Codex is waiting for approval')).toBeInTheDocument();
    expect(screen.getByText('write hello.txt')).toBeInTheDocument();
    expect(screen.getByText(/Allow/u)).toBeInTheDocument();
    expect(screen.getByText(/Reject/u)).toBeInTheDocument();
    // SP-4 Result 3: never a promise of per-action confinement.
    expect(screen.getByText(/keep working in its isolated branch/u)).toBeInTheDocument();
  });

  it('claims a branch only for the placement that actually materializes one', () => {
    messages = [approvalMessage(pendingInput)];
    activeExecution = { kind: 'tau', model: 'gpt-test', hostId: 'origin' };

    render(<ChatApprovalBanner />);

    expect(screen.getByText('Tau is waiting for approval')).toBeInTheDocument();
    expect(screen.queryByText(/isolated branch/u)).not.toBeInTheDocument();
    expect(screen.getByText(/does not ask again for each action/u)).toBeInTheDocument();
  });

  it('resolves the interrupt through the chat client and leaves the banner to the log', async () => {
    messages = [approvalMessage(pendingInput)];
    const user = userEvent.setup();

    render(<ChatApprovalBanner />);
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(respondToToolApproval).toHaveBeenCalledExactlyOnceWith('interrupt-1', true);
    // The click did not clear it: only the durable `resolved` event does.
    expect(screen.getByRole('region', { name: 'Approval required' })).toBeInTheDocument();
  });

  it('denies through the same client verb', async () => {
    messages = [approvalMessage(pendingInput)];
    const user = userEvent.setup();

    render(<ChatApprovalBanner />);
    await user.click(screen.getByRole('button', { name: 'Deny' }));

    expect(respondToToolApproval).toHaveBeenCalledExactlyOnceWith('interrupt-1', false);
  });
});
