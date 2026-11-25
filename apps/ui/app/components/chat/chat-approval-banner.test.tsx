// @vitest-environment jsdom
import { createContext, useCallback, useContext } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MyUIMessage } from '@taucad/chat';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { MachineClient } from '@taucad/runtime/machine';
import type { RuntimeTransportFacet } from '@taucad/runtime/transport';
import type { CombinedChatState } from '#hooks/use-chat.js';
import type * as AgentSignIns from '#components/terminal/agent-sign-ins.js';
import { agentJob, createFixture } from '#routes/w.$workspace.$project/chat-print.fixture.js';
import { agentApprovalToolName } from '@taucad/chat-ui/services/agent-host-event-projection';
import { initialChatProjection, reduceChatProjection, selectOpenApprovals } from '#machines/chat-projection.logic.js';
import type { ChatProjection } from '#machines/chat-projection.logic.js';
import { lifecycleRow, logRow } from '#machines/chat-projection.fixture.js';

const respondToToolApproval = vi.fn(async () => undefined);
let messages: readonly MyUIMessage[] = [];
let projection: ChatProjection | undefined;
let isDebug = false;
vi.mock('#flags/use-feature.js', () => ({ useFeature: (flag: string) => flag === 'machines' || isDebug }));
let activeExecution: CombinedChatState['activeExecution'];
let attachedHostId: CombinedChatState['attachedHostId'];
let machines: RuntimeTransportFacet<MachineClient> = { available: false, reason: 'unsupported' };

/** The chat a banner belongs to; two banners in one render stand for two chats. */
const ChatIdContext = createContext('chat-1');
const regenerate = vi.fn<(chatId: string) => void>();
vi.mock('#hooks/use-chat.js', () => ({
  useChatSelector: <T,>(selector: (state: CombinedChatState) => T): T =>
    selector({ messages, activeExecution, attachedHostId, projection } as CombinedChatState),
  useChatContext: () => ({ activeChatId: useContext(ChatIdContext) }),
  useChatActions: () => {
    const chatId = useContext(ChatIdContext);
    return {
      regenerate: useCallback(() => {
        regenerate(chatId);
      }, [chatId]),
    };
  },
}));
vi.mock('#chat-clients/use-cad-chat-client.js', () => ({
  useCadChatClient: () => ({ respondToToolApproval }),
}));
vi.mock('#hooks/use-machines.js', () => ({ useMachinesFacet: () => machines }));
const openPanel = vi.fn();
const setWorkbenchOpen = vi.fn();
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel, setWorkbenchOpen }),
}));

let signInBridge: unknown;
const requestAgentSignIn = vi.fn<(agentId: string, chatId?: string) => void>();
vi.mock('#components/terminal/agent-sign-ins.js', async (importOriginal) => {
  const actual = await importOriginal<typeof AgentSignIns>();
  /* Recorded and real: the card's request is what binds a sign-in's success to its chat. */
  requestAgentSignIn.mockImplementation(actual.requestAgentSignIn);
  return { ...actual, desktopAgentSignInBridge: () => signInBridge, requestAgentSignIn };
});
const { reportAgentSignInExit } = await import('#components/terminal/agent-sign-ins.js');

const { ChatApprovalBanner, pendingAgentHostApprovals, pendingApprovals } =
  await import('#components/chat/chat-approval-banner.js');

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
        request: { input: { targetFile: 'main.scad', content: '' } },
      },
    ]);
  });
});

/** A caught-up log whose run paused on `interruptId`, after `resolved` earlier requests were answered. */
const pausedProjection = (interruptId: string, resolved: readonly string[] = []): ChatProjection => {
  const request = (sequence: number, id: string): Record<string, unknown> =>
    logRow(sequence, {
      type: 'interrupt.recorded',
      interruptId: id,
      phase: 'requested',
      reason: 'approval',
      payload: {
        kind: 'approval',
        prompt: `Allow ${id}?`,
        agentId: 'claude',
        context: { toolCall: { toolCallId: `toolu-${id}`, title: `Write ${id}` }, options: pendingInput.options },
      },
    });
  const rows: Array<Record<string, unknown>> = [lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')];
  for (const id of resolved) {
    rows.push(request(rows.length, id), lifecycleRow(rows.length + 1, 'paused'));
    rows.push(
      logRow(rows.length, {
        type: 'interrupt.recorded',
        interruptId: id,
        phase: 'resolved',
        reason: 'approved',
        payload: { outcome: 'approved', optionId: 'allow' },
      }),
      lifecycleRow(rows.length + 1, 'running'),
    );
  }
  rows.push(request(rows.length, interruptId), lifecycleRow(rows.length + 1, 'paused'));
  return reduceChatProjection(initialChatProjection, {
    type: 'batch',
    answer: { status: 'batch', cursor: 0, nextCursor: rows.length, endCursor: rows.length, events: rows },
  }).state;
};

describe('pendingApprovals', () => {
  it('draws the open interrupt from the host log when the transcript shows none', () => {
    const open = selectOpenApprovals(pausedProjection('interrupt-7', ['interrupt-1', 'interrupt-6']));
    expect(pendingApprovals([], open)).toEqual([
      expect.objectContaining({
        messageId: 'run_1',
        approvalId: 'interrupt-7',
        interruptId: 'interrupt-7',
        prompt: 'Allow interrupt-7?',
        agentId: 'claude',
        options: pendingInput.options,
      }),
    ]);
  });

  it('keeps the transcript card and adds no copy of an interrupt it already shows', () => {
    const open = selectOpenApprovals(pausedProjection('interrupt-1'));
    const transcript = pendingAgentHostApprovals([approvalMessage(pendingInput)]);
    expect(pendingApprovals([approvalMessage(pendingInput)], open)).toEqual(transcript);
  });

  it('reads nothing from a log that has not caught up, whose interrupt may be answered further on', () => {
    const caughtUp = pausedProjection('interrupt-1');
    const behind = { ...caughtUp, endCursor: caughtUp.endCursor + 2 };
    expect(selectOpenApprovals(behind)).toEqual([]);
    expect(selectOpenApprovals(caughtUp)).toHaveLength(1);
    expect(selectOpenApprovals(caughtUp)).toBe(selectOpenApprovals(caughtUp));
  });
});

describe('ChatApprovalBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isDebug = false;
    messages = [];
    projection = undefined;
    activeExecution = { kind: 'acp', hostId: 'origin', agentId: 'codex' };
    machines = { available: false, reason: 'unsupported' };
  });

  it('renders nothing while no approval is pending', () => {
    const { container } = render(<ChatApprovalBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it('answers the interrupt a paused run holds even when its transcript has not rebuilt', async () => {
    projection = pausedProjection('interrupt-7', ['interrupt-6']);

    render(<ChatApprovalBanner />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Allow' }));

    expect(screen.getByText('Write interrupt-7')).toBeInTheDocument();
    expect(respondToToolApproval).toHaveBeenCalledExactlyOnceWith('interrupt-7', true, { optionId: 'allow' });
  });

  it('names the agent, the prompt and the options the host recorded', () => {
    messages = [approvalMessage(pendingInput)];

    render(<ChatApprovalBanner />);

    expect(screen.getByRole('region', { name: 'Approval required' })).toBeInTheDocument();
    /* The bare registry id: `externalAgentDisplayName` reads the descriptor a
     * paired host published, and this unit has no host. */
    expect(screen.getByText('codex · Permission')).toBeInTheDocument();
    expect(screen.getByText('write hello.txt')).toBeInTheDocument();
    expect(screen.getByText(/Allow/u)).toBeInTheDocument();
    expect(screen.getByText(/Reject/u)).toBeInTheDocument();
    // SP-4 Result 3: never a promise of per-action confinement.
    expect(screen.queryByText(/keep working in this chat's tree/u)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Standing-grant persistence is controlled by the connected agent or MCP server/u),
    ).not.toBeInTheDocument();
  });

  it('claims a branch only for the placement that actually materializes one', () => {
    messages = [approvalMessage(pendingInput)];
    activeExecution = { kind: 'tau', model: 'gpt-test', hostId: 'origin' };

    render(<ChatApprovalBanner />);

    expect(screen.getByText('Tau · Permission')).toBeInTheDocument();
    expect(screen.queryByText(/chat's tree/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/does not ask again for each action/u)).not.toBeInTheDocument();
  });

  /* V6: the record is the truth. The composer has moved on to another agent
   * while this run stays paused, and the banner must still name the one that is
   * actually waiting. */
  it('names the requester the log recorded, not the one the composer is on', () => {
    messages = [approvalMessage({ ...pendingInput, agentId: 'claude' })];
    activeExecution = { kind: 'acp', hostId: 'origin', agentId: 'codex' };

    render(<ChatApprovalBanner />);

    expect(screen.getByText('claude · Permission')).toBeInTheDocument();
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

    expect(screen.getByText('Tau · Permission')).toBeInTheDocument();
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

  const jobInterrupt = () =>
    approvalMessage({
      ...pendingInput,
      options: [],
      prompt: 'Print pyramid.gcode.3mf on Workshop X1C?',
      context: { jobId: 'job-agent-1', machineId: 'machine-1', fileName: 'pyramid.gcode.3mf' },
    });

  it("denies an agent's job on the person's session before answering", async () => {
    const fixture = createFixture({ jobs: [agentJob()] });
    machines = { available: true, ...fixture.client };
    messages = [jobInterrupt()];
    const user = userEvent.setup();

    render(<ChatApprovalBanner />);
    await user.click(screen.getByRole('button', { name: 'Deny' }));

    await vi.waitFor(() => {
      expect(respondToToolApproval).toHaveBeenCalledExactlyOnceWith('interrupt-1', false, { optionId: undefined });
    });
    expect(fixture.resolveJob).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        jobId: 'job-agent-1',
        decision: 'deny',
        resolvedBy: expect.objectContaining({ kind: 'user' }) as Record<string, unknown>,
      }) as Record<string, unknown>,
    );
    expect(fixture.resolveJob.mock.invocationCallOrder[0]).toBeLessThan(
      respondToToolApproval.mock.invocationCallOrder[0]!,
    );
  });

  it('offers no Approve for a job: every job asks for attestations only the Print pane takes', async () => {
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

  it('sends a job to the Print pane without reading the machine, even where no machines are reachable', () => {
    messages = [jobInterrupt()];

    render(<ChatApprovalBanner />);

    expect(screen.getByRole('button', { name: 'Review in the Print pane' })).toBeInTheDocument();
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
    expect(screen.getByRole('region', { name: 'codex needs you to sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve|deny/iu })).toBeNull();
  });

  describe("offering the agent's own sign-in in Tau's Terminal", () => {
    /** A profile-driven agent no vendor ships: the action is generic, keyed by nothing but the id. */
    const loginFor = (agentId: string) =>
      approvalMessage({
        interruptId: 'login-5',
        kind: 'approval',
        prompt: `${agentId} is not logged in.`,
        options: [],
        login: {
          agentId,
          methods: [{ id: 'cli-login', name: 'Sign in', terminalCommand: `${agentId} account sign-in` }],
        },
      });

    beforeEach(() => {
      signInBridge = undefined;
      requestAgentSignIn.mockClear();
      openPanel.mockClear();
      setWorkbenchOpen.mockClear();
      regenerate.mockClear();
      attachedHostId = undefined;
    });

    it("names the card apart from the sign-in tab, which is named 'Sign in to' its agent", () => {
      messages = [loginFor('acme')];
      renderBanner();

      expect(screen.queryByRole('region', { name: 'Sign in to acme' })).toBeNull();
      expect(screen.getByRole('region', { name: 'acme needs you to sign in' })).toBeInTheDocument();
    });

    it('offers the sign-in from the host whose log refused the turn, before any agent is picked after a relaunch', () => {
      signInBridge = { open: vi.fn() };
      activeExecution = undefined;
      attachedHostId = 'desktop';
      messages = [loginFor('acme')];
      renderBanner();

      expect(screen.getByRole('button', { name: "Sign in in Tau's Terminal" })).toBeInTheDocument();
    });

    it('offers no sign-in when the refusing host is another one, whatever the composer is on', () => {
      signInBridge = { open: vi.fn() };
      activeExecution = { kind: 'acp', agentId: 'acme', hostId: 'desktop' } as unknown as typeof activeExecution;
      attachedHostId = 'daemon-1';
      messages = [loginFor('acme')];
      renderBanner();

      expect(screen.queryByRole('button', { name: "Sign in in Tau's Terminal" })).toBeNull();
    });

    const renderBanner = () =>
      render(
        <TooltipProvider>
          <ChatApprovalBanner />
        </TooltipProvider>,
      );

    it('opens a sign-in tab for any agent this desktop runs, filled in and not run', async () => {
      signInBridge = { open: vi.fn() };
      activeExecution = { kind: 'acp', agentId: 'acme', hostId: 'desktop' } as unknown as typeof activeExecution;
      messages = [loginFor('acme')];
      render(
        <TooltipProvider>
          <ChatApprovalBanner />
        </TooltipProvider>,
      );

      await userEvent.click(screen.getByRole('button', { name: "Sign in in Tau's Terminal" }));

      expect(requestAgentSignIn).toHaveBeenCalledExactlyOnceWith('acme', 'chat-1');
      expect(setWorkbenchOpen).toHaveBeenCalledExactlyOnceWith(true);
      /* The sign-in is its own workbench tab; the person's shell is not opened for it. */
      expect(openPanel).not.toHaveBeenCalled();
      /* The copyable command stays for a terminal of the person's own. */
      expect(screen.getByText('acme account sign-in')).toBeInTheDocument();
    });

    it('keeps only the command to copy when the agent runs on another host', () => {
      signInBridge = { open: vi.fn() };
      activeExecution = { kind: 'acp', agentId: 'acme', hostId: 'daemon-1' } as unknown as typeof activeExecution;
      messages = [loginFor('acme')];
      render(
        <TooltipProvider>
          <ChatApprovalBanner />
        </TooltipProvider>,
      );

      expect(screen.queryByRole('button', { name: "Sign in in Tau's Terminal" })).toBeNull();
      expect(screen.getByText('acme account sign-in')).toBeInTheDocument();
    });

    it('keeps only the command to copy where this page has no local Terminal', () => {
      activeExecution = { kind: 'acp', agentId: 'acme', hostId: 'desktop' } as unknown as typeof activeExecution;
      messages = [loginFor('acme')];
      render(
        <TooltipProvider>
          <ChatApprovalBanner />
        </TooltipProvider>,
      );

      expect(screen.queryByRole('button', { name: "Sign in in Tau's Terminal" })).toBeNull();
      expect(screen.getByText('acme account sign-in')).toBeInTheDocument();
    });

    it('tries the turn again by itself once the sign-in it asked for exits 0, as Try again would', async () => {
      signInBridge = { open: vi.fn() };
      activeExecution = { kind: 'acp', agentId: 'beta', hostId: 'desktop' } as unknown as typeof activeExecution;
      messages = [loginFor('beta')];
      const { rerender } = renderBanner();
      await userEvent.click(screen.getByRole('button', { name: "Sign in in Tau's Terminal" }));

      act(() => {
        reportAgentSignInExit('beta', 0);
      });
      rerender(
        <TooltipProvider>
          <ChatApprovalBanner />
        </TooltipProvider>,
      );

      expect(regenerate).toHaveBeenCalledOnce();
    });

    it('keeps the card and shows the exit status when the sign-in fails, without trying again', () => {
      signInBridge = { open: vi.fn() };
      activeExecution = { kind: 'acp', agentId: 'gamma', hostId: 'desktop' } as unknown as typeof activeExecution;
      messages = [loginFor('gamma')];
      renderBanner();

      act(() => {
        reportAgentSignInExit('gamma', 2);
      });

      expect(regenerate).not.toHaveBeenCalled();
      expect(screen.getByRole('region', { name: 'gamma needs you to sign in' })).toBeInTheDocument();
      expect(screen.getByText(/exit code 2/u)).toBeInTheDocument();
    });

    it("leaves another agent's card alone", () => {
      signInBridge = { open: vi.fn() };
      activeExecution = { kind: 'acp', agentId: 'delta', hostId: 'desktop' } as unknown as typeof activeExecution;
      messages = [loginFor('delta')];
      renderBanner();

      act(() => {
        reportAgentSignInExit('epsilon', 0);
      });

      expect(regenerate).not.toHaveBeenCalled();
    });

    it("carries on only the chat that asked for the sign-in, never another chat's card for the same agent", async () => {
      signInBridge = { open: vi.fn() };
      activeExecution = { kind: 'acp', agentId: 'eta', hostId: 'desktop' } as unknown as typeof activeExecution;
      messages = [loginFor('eta')];
      render(
        <TooltipProvider>
          {/* The other chat's card comes first, so it is the first to see the success. */}
          <ChatIdContext value='chat-other'>
            <ChatApprovalBanner />
          </ChatIdContext>
          <ChatIdContext value='chat-asking'>
            <ChatApprovalBanner />
          </ChatIdContext>
        </TooltipProvider>,
      );
      const [, asking] = screen.getAllByRole('button', { name: "Sign in in Tau's Terminal" });
      await userEvent.click(asking!);

      act(() => {
        reportAgentSignInExit('eta', 0);
      });

      expect(regenerate).toHaveBeenCalledExactlyOnceWith('chat-asking');
    });

    it('shows the card again, without another retry, when the retried turn still needs a sign-in', async () => {
      signInBridge = { open: vi.fn() };
      activeExecution = { kind: 'acp', agentId: 'zeta', hostId: 'desktop' } as unknown as typeof activeExecution;
      messages = [loginFor('zeta')];
      const { rerender } = renderBanner();
      await userEvent.click(screen.getByRole('button', { name: "Sign in in Tau's Terminal" }));
      act(() => {
        reportAgentSignInExit('zeta', 0);
      });

      /* The retry is a new run, and it refused for the same reason. */
      const retried: MyUIMessage = { ...loginFor('zeta'), id: 'assistant-2' };
      messages = [retried];
      rerender(
        <TooltipProvider>
          <ChatApprovalBanner />
        </TooltipProvider>,
      );

      expect(regenerate).toHaveBeenCalledOnce();
      expect(screen.getByRole('region', { name: 'zeta needs you to sign in' })).toBeInTheDocument();
    });
  });
});
