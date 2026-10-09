// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MyUIMessage } from '@taucad/chat';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { MachineClient } from '@taucad/runtime/machine';
import type { RuntimeTransportFacet } from '@taucad/runtime/transport';
import type { CombinedChatState } from '#hooks/use-chat.js';
import { agentJob, createFixture, entry } from '#routes/w.$workspace.$project/chat-print.fixture.js';
import { agentApprovalToolName } from '#services/agent-host-event-projection.js';

const respondToToolApproval = vi.fn(async () => undefined);
let messages: readonly MyUIMessage[] = [];
let activeExecution: CombinedChatState['activeExecution'];
let machines: RuntimeTransportFacet<MachineClient> = { available: false, reason: 'unsupported' };

vi.mock('#hooks/use-chat.js', () => ({
  useChatSelector: <T,>(selector: (state: CombinedChatState) => T): T =>
    selector({ messages, activeExecution } as CombinedChatState),
}));
vi.mock('#chat-clients/use-cad-chat-client.js', () => ({
  useCadChatClient: () => ({ respondToToolApproval }),
}));
vi.mock('#hooks/use-machines.js', () => ({ useMachinesFacet: () => machines }));
const openPanel = vi.fn();
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel }),
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

  it('keeps the job or machine action an interrupt names, so the Print pane can answer it', () => {
    const context = { jobId: 'job-1', machineId: 'machine-1' };

    expect(pendingAgentHostApprovals([approvalMessage({ ...pendingInput, context })])[0]?.context).toEqual(context);
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
        tauTool: true,
      },
    ]);
  });
});

describe('ChatApprovalBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messages = [];
    activeExecution = { kind: 'acp', hostId: 'origin', agentId: 'codex' };
    machines = { available: false, reason: 'unsupported' };
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

  it('names an ordinary Tau tool after the composer switches to an external agent', () => {
    messages = [
      {
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
      } as unknown as MyUIMessage,
    ];

    render(<ChatApprovalBanner />);

    expect(screen.getByText('Tau is waiting for approval')).toBeInTheDocument();
    expect(screen.queryByText(/codex is waiting/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/chat's tree/u)).not.toBeInTheDocument();
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

  it("records an agent's machine action on the host through the person's session before answering", async () => {
    const fixture = createFixture();
    machines = { available: true, ...fixture.client };
    messages = [
      approvalMessage({
        ...pendingInput,
        options: [],
        prompt: 'Chamber light ({"on":true}) on Workshop X1C?',
        context: {
          machineId: 'machine-1',
          componentId: 'chamber-light',
          action: 'switch.set',
          operationId: 'op-1',
          parameters: { on: true },
          version: 1,
          expectedRunId: null,
        },
      }),
    ];
    const user = userEvent.setup();

    render(<ChatApprovalBanner />);
    await user.click(screen.getByRole('button', { name: 'Deny' }));

    await vi.waitFor(() => {
      expect(respondToToolApproval).toHaveBeenCalledExactlyOnceWith('interrupt-1', false, { optionId: undefined });
    });
    expect(fixture.approveAction).toHaveBeenCalledExactlyOnceWith({
      machineId: 'machine-1',
      operationId: 'op-1',
      intent: {
        componentId: 'chamber-light',
        action: 'switch.set',
        version: 1,
        expectedRunId: null,
        parameters: { on: true },
      },
      decision: 'deny',
      approvedBy: expect.objectContaining({ kind: 'user' }) as Record<string, unknown>,
    });
    expect(fixture.approveAction.mock.invocationCallOrder[0]).toBeLessThan(
      respondToToolApproval.mock.invocationCallOrder[0]!,
    );
  });

  it("leaves an agent's machine action unanswered where no machines are reachable", async () => {
    messages = [
      approvalMessage({
        ...pendingInput,
        options: [],
        context: {
          machineId: 'machine-1',
          componentId: 'chamber-light',
          action: 'switch.set',
          operationId: 'op-1',
          parameters: { on: true },
          version: 1,
          expectedRunId: null,
        },
      }),
    ];
    const user = userEvent.setup();

    render(<ChatApprovalBanner />);
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(respondToToolApproval).not.toHaveBeenCalled();
  });

  /** The X1C as listed, asking the person for nothing only the Print pane takes. */
  const chatApprovable = () => {
    const listed = entry();
    const { jobs } = listed.descriptor.capabilities;
    if (jobs.type !== 'supported') {
      throw new Error('The fixture machine runs jobs.');
    }
    return entry({
      descriptor: {
        ...listed.descriptor,
        capabilities: { ...listed.descriptor.capabilities, jobs: { ...jobs, attestations: [] } },
      },
    });
  };
  const jobInterrupt = () =>
    approvalMessage({
      ...pendingInput,
      options: [],
      prompt: 'Print pyramid.gcode.3mf on Workshop X1C?',
      context: { jobId: 'job-agent-1', machineId: 'machine-1', fileName: 'pyramid.gcode.3mf' },
    });

  it.each([
    ['Approve', 'approve', true],
    ['Deny', 'deny', false],
  ] as const)(
    "resolves an agent's job on the person's session before answering (%s)",
    async (button, decision, approved) => {
      const fixture = createFixture({ entries: [chatApprovable()], jobs: [agentJob()] });
      machines = { available: true, ...fixture.client };
      messages = [jobInterrupt()];
      const user = userEvent.setup();

      render(<ChatApprovalBanner />);
      await user.click(screen.getByRole('button', { name: button }));

      await vi.waitFor(() => {
        expect(respondToToolApproval).toHaveBeenCalledExactlyOnceWith('interrupt-1', approved, { optionId: undefined });
      });
      expect(fixture.resolveJob).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          jobId: 'job-agent-1',
          decision,
          resolvedBy: expect.objectContaining({ kind: 'user' }) as Record<string, unknown>,
        }) as Record<string, unknown>,
      );
      expect(fixture.resolveJob.mock.invocationCallOrder[0]).toBeLessThan(
        respondToToolApproval.mock.invocationCallOrder[0]!,
      );
    },
  );

  it('offers no Approve for a job that needs what only the Print pane takes, and leaves the interrupt open', async () => {
    const fixture = createFixture({ jobs: [agentJob()] });
    machines = { available: true, ...fixture.client };
    messages = [jobInterrupt()];
    const user = userEvent.setup();

    render(<ChatApprovalBanner />);
    await user.click(await screen.findByRole('button', { name: 'Review in the Print pane' }));

    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(openPanel).toHaveBeenCalledExactlyOnceWith('print');
    expect(respondToToolApproval).not.toHaveBeenCalled();
    expect(fixture.resolveJob).not.toHaveBeenCalled();
  });

  it('sends a job that needs only the person at the machine to the Print pane, by the contract rule', async () => {
    const plain = chatApprovable();
    const { jobs } = plain.descriptor.capabilities;
    if (jobs.type !== 'supported') {
      throw new Error('The fixture machine runs jobs.');
    }
    const attended = entry({
      descriptor: {
        ...plain.descriptor,
        capabilities: {
          ...plain.descriptor.capabilities,
          jobs: { ...jobs, safety: { ...jobs.safety, attended: true } },
        },
      },
    });
    const fixture = createFixture({ entries: [attended], jobs: [agentJob()] });
    machines = { available: true, ...fixture.client };
    messages = [jobInterrupt()];

    render(<ChatApprovalBanner />);

    expect(await screen.findByRole('button', { name: 'Review in the Print pane' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  const actionInterrupt = () =>
    approvalMessage({
      ...pendingInput,
      options: [],
      context: {
        machineId: 'machine-1',
        componentId: 'chamber-light',
        action: 'switch.set',
        operationId: 'op-1',
        parameters: { on: true },
        version: 1,
        expectedRunId: null,
      },
    });

  it('answers a Deny where no machines are reachable: a deny needs no host record to be safe', async () => {
    messages = [actionInterrupt()];
    const user = userEvent.setup();

    render(<ChatApprovalBanner />);
    await user.click(screen.getByRole('button', { name: 'Deny' }));

    await vi.waitFor(() => {
      expect(respondToToolApproval).toHaveBeenCalledExactlyOnceWith('interrupt-1', false, { optionId: undefined });
    });
  });

  it('answers a Deny the host refuses to record', async () => {
    const fixture = createFixture();
    fixture.approveAction.mockResolvedValueOnce({ status: 'refused', code: 'MACHINE_UNAVAILABLE', message: 'Gone.' });
    machines = { available: true, ...fixture.client };
    messages = [actionInterrupt()];
    const user = userEvent.setup();

    render(<ChatApprovalBanner />);
    await user.click(screen.getByRole('button', { name: 'Deny' }));

    await vi.waitFor(() => {
      expect(respondToToolApproval).toHaveBeenCalledExactlyOnceWith('interrupt-1', false, { optionId: undefined });
    });
  });

  it('disables the decision and says the job is being sent while the approval runs', async () => {
    const fixture = createFixture({ entries: [chatApprovable()], jobs: [agentJob()] });
    const { promise: sent, resolve: finishSending } = Promise.withResolvers<void>();
    fixture.resolveJob.mockImplementationOnce(async () => {
      await sent;
      return agentJob({ state: 'started' });
    });
    machines = { available: true, ...fixture.client };
    messages = [jobInterrupt()];
    const user = userEvent.setup();

    render(<ChatApprovalBanner />);
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Sending the job to the machine…');
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeDisabled();
    expect(respondToToolApproval).not.toHaveBeenCalled();
    finishSending();
    await vi.waitFor(() => {
      expect(respondToToolApproval).toHaveBeenCalledOnce();
    });
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
