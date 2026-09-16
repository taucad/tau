// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MyUIMessage } from '@taucad/chat';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
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
  outcome: 'approved' | 'cancelled' = 'approved',
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
        ...(state === 'approval-requested' ? { approval: { id: 'interrupt-1' } } : { output: { outcome } }),
      },
    ],
  }) as unknown as MyUIMessage;

const pendingInput = {
  interruptId: 'interrupt-1',
  kind: 'approval',
  prompt: 'write hello.txt',
  options: [
    { optionId: 'allow-always', name: 'Always allow', kind: 'allow_always' },
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

  it('drops an interrupt a terminal run left behind, so it cannot hide a later one', () => {
    const laterRun = { id: 'assistant-2', role: 'assistant', parts: [] } as unknown as MyUIMessage;

    expect(pendingAgentHostApprovals([approvalMessage(pendingInput), laterRun])).toEqual([]);
  });

  it('reports a Tau tool part awaiting approval under its own tool name', () => {
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
    /* The bare registry id: `externalAgentDisplayName` reads the descriptor a
     * paired host published, and this unit has no host. */
    expect(screen.getByText('codex is waiting for approval')).toBeInTheDocument();
    expect(screen.getByText('write hello.txt')).toBeInTheDocument();
    expect(screen.getByText(/Allow/u)).toBeInTheDocument();
    expect(screen.getByText(/Reject/u)).toBeInTheDocument();
    // SP-4 Result 3: never a promise of per-action confinement.
    expect(screen.getByText(/keep working in this chat's tree/u)).toBeInTheDocument();
    expect(
      screen.getByText(/Standing-grant persistence is controlled by the connected agent or MCP server/u),
    ).toBeInTheDocument();
  });

  it('claims a branch only for the placement that actually materializes one', () => {
    messages = [approvalMessage(pendingInput)];
    activeExecution = { kind: 'tau', model: 'gpt-test', hostId: 'origin' };

    render(<ChatApprovalBanner />);

    expect(screen.getByText('Tau is waiting for approval')).toBeInTheDocument();
    expect(screen.queryByText(/chat's tree/u)).not.toBeInTheDocument();
    expect(screen.getByText(/does not ask again for each action/u)).toBeInTheDocument();
  });

  /* V6: the record is the truth. The composer has moved on to another agent
   * while this run stays paused, and the banner must still name the one that is
   * actually waiting. */
  it('names the requester the log recorded, not the one the composer is on', () => {
    messages = [approvalMessage({ ...pendingInput, agentId: 'claude' })];
    activeExecution = { kind: 'acp', hostId: 'origin', agentId: 'codex' };

    render(<ChatApprovalBanner />);

    expect(screen.getByText('claude is waiting for approval')).toBeInTheDocument();
    expect(screen.queryByText(/codex is waiting/u)).not.toBeInTheDocument();
  });

  /* EQ5: one button per option the agent offered, and the keyboard lands on
   * `allow_once` — one turn's consent — rather than on the standing grant the
   * agent happened to list first. */
  it('renders one button per offered option and focuses the single-turn allowance', () => {
    messages = [approvalMessage(pendingInput)];

    render(<ChatApprovalBanner />);

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Always allow',
      'Allow',
      'Reject',
    ]);
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Allow' }));
  });

  it('resolves the interrupt with the exact option chosen and leaves the banner to the log', async () => {
    messages = [approvalMessage(pendingInput)];
    const user = userEvent.setup();

    render(<ChatApprovalBanner />);
    await user.click(screen.getByRole('button', { name: 'Always allow' }));

    expect(respondToToolApproval).toHaveBeenCalledExactlyOnceWith('interrupt-1', true, { optionId: 'allow-always' });
    // The click did not clear it: only the durable `resolved` event does.
    expect(screen.getByRole('region', { name: 'Approval required' })).toBeInTheDocument();
  });

  it('denies through the same client verb, naming the rejection option', async () => {
    messages = [approvalMessage(pendingInput)];
    const user = userEvent.setup();

    render(<ChatApprovalBanner />);
    await user.click(screen.getByRole('button', { name: 'Reject' }));

    expect(respondToToolApproval).toHaveBeenCalledExactlyOnceWith('interrupt-1', false, { optionId: 'reject' });
  });

  /* A Tau tool gated by the API offers no option list of its own. */
  it('falls back to Approve and Deny when the request offered no options', async () => {
    messages = [approvalMessage({ ...pendingInput, options: [] })];
    const user = userEvent.setup();

    render(<ChatApprovalBanner />);
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(respondToToolApproval).toHaveBeenCalledExactlyOnceWith('interrupt-1', true, { optionId: undefined });
  });
});

describe('a login an external agent is waiting on', () => {
  it('renders the verification url and code, and no decision at all', () => {
    messages = [
      approvalMessage({
        interruptId: 'login-1',
        kind: 'approval',
        prompt: 'Open the verification page and enter FAKE-CODE.',
        options: [],
        login: { agentId: 'codex', methods: [], url: 'https://example.invalid/device', code: 'FAKE-CODE' },
      }),
    ];

    render(<ChatApprovalBanner />);

    expect(screen.getByRole('link', { name: 'https://example.invalid/device' })).toHaveAttribute(
      'href',
      'https://example.invalid/device',
    );
    expect(screen.getByText(/FAKE-CODE/u)).toBeInTheDocument();
    /* Tau never brokers a vendor login (X6/VI4): there is nothing to approve
     * here, and nothing that would open one on the user's behalf. */
    expect(screen.queryByRole('button', { name: /approve/iu })).toBeNull();
    expect(screen.queryByRole('button', { name: /sign in|log ?in/iu })).toBeNull();
  });

  it('still renders the login of a refusal the host settled, and reports nothing pending', () => {
    const refused = approvalMessage(
      {
        interruptId: 'login-3',
        kind: 'approval',
        prompt: 'codex is not logged in.',
        options: [],
        login: { agentId: 'codex', methods: [], url: 'https://example.invalid/device', code: 'FAKE-CODE' },
      },
      'output-available',
      'cancelled',
    );
    messages = [refused];

    /* The record is settled the moment it is written — nothing ever answers a
     * login — so the chat is not "approval required" and the badge is clear,
     * while the thing the user has to do is still on screen. */
    expect(pendingAgentHostApprovals(messages)).toEqual([]);
    expect(refused.parts.every((part) => !('state' in part) || part.state !== 'approval-requested')).toBe(true);

    render(<ChatApprovalBanner />);

    expect(screen.getByText(/FAKE-CODE/u)).toBeInTheDocument();
  });

  it('stands the affordance down once the login record says the flow completed', () => {
    messages = [
      approvalMessage(
        {
          interruptId: 'login-4',
          kind: 'approval',
          prompt: 'Open the verification page and enter FAKE-CODE.',
          options: [],
          login: { agentId: 'codex', methods: [], url: 'https://example.invalid/device', code: 'FAKE-CODE' },
        },
        'output-available',
        'approved',
      ),
    ];

    render(<ChatApprovalBanner />);

    expect(screen.queryByText(/FAKE-CODE/u)).toBeNull();
  });

  it('renders a terminal-auth command as copyable text, never as an action', () => {
    messages = [
      approvalMessage({
        interruptId: 'login-2',
        kind: 'approval',
        prompt: 'codex is not logged in.',
        options: [],
        login: {
          agentId: 'codex',
          methods: [{ id: 'codex-login', name: 'Log in with Codex', terminalCommand: 'codex login' }],
        },
      }),
    ];

    render(
      <TooltipProvider>
        <ChatApprovalBanner />
      </TooltipProvider>,
    );

    expect(screen.getByText('codex login')).toBeInTheDocument();
    /* Named for whoever the descriptor called this agent; no discovery has run
     * in this test, so the id stands in for the product name. */
    expect(screen.getByRole('region', { name: 'Sign in to codex' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve|deny/iu })).toBeNull();
  });
});
