// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChatComposerContextValue } from '#hooks/active-chat-provider.js';

const setActiveExecution = vi.fn();
let activeExecution: ChatComposerContextValue['execution']['execution'] = { kind: 'tau', model: 'gpt-test' };
let browserHostAvailability: Record<string, unknown> = { status: 'available', durability: 'exclusive-append' };
let hostPlacements: Array<Record<string, unknown>> = [];
let modelProviderKind: 'anthropic' | 'ollama' | 'openai' = 'openai';

vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: (): ChatComposerContextValue =>
    ({
      execution: { execution: activeExecution, setActiveExecution },
      model: { modelId: 'gpt-test', model: { provider: { id: modelProviderKind } } },
      agentActivity: 'ready',
    }) as unknown as ChatComposerContextValue,
}));

vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('#hooks/use-cad-agent-config.js', () => ({
  useBrowserAgentHostProjectAvailability: () => browserHostAvailability,
  useAgentHostPlacements: () => ({ targets: hostPlacements, loading: false }),
}));
const { ChatExecutionSelector, formatChatAgentActivity, useChatAgentSelection } =
  await import('#components/chat/chat-execution-selector.js');

/** The composer's own predicate for showing the control (Q12.6). */
function OfferedProbe(): React.JSX.Element {
  const { isOffered, label } = useChatAgentSelection();
  return <span>{`${isOffered ? 'offered' : 'hidden'}:${label}`}</span>;
}

describe('ChatExecutionSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeExecution = { kind: 'tau', model: 'gpt-test' };
    browserHostAvailability = { status: 'available', durability: 'exclusive-append' };
    hostPlacements = [];
    modelProviderKind = 'openai';
    globalThis.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('offers one Tau Host row per discovered daemon, naming its workspace root', async () => {
    hostPlacements = [
      { hostId: 'origin', rung: 1, label: 'studio-mini', workspaceRoot: '/Users/x/tau-workspace/lamp', online: true },
      { hostId: 'device-1', rung: 2, label: 'workshop', workspaceRoot: '/srv/tau', online: false },
    ];
    const user = userEvent.setup();
    render(
      <ChatExecutionSelector>
        {({ label }) => <button type='button'>Select agent: {label}</button>}
      </ChatExecutionSelector>,
    );

    await user.click(screen.getByRole('button', { name: 'Select agent: Tau' }));

    expect(await screen.findByRole('option', { name: /Tau Host · studio-mini/u })).toBeInTheDocument();
    expect(screen.getByText('/Users/x/tau-workspace/lamp')).toBeInTheDocument();
    // An offline daemon is listed so the reason is visible on its own row.
    expect(screen.getByText('Offline')).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: /Tau Host · studio-mini/u }));
    expect(setActiveExecution).toHaveBeenCalledWith({ kind: 'tau', model: 'gpt-test', hostId: 'origin' });
  });

  /* Q12.1: the menu never offers a cloud host — the local agent worker is
   * always used. A cloud host the ladder already returned is an ordinary host
   * row, named by the placement like any other. */
  it('offers no cloud row, and lists a provisioned cloud host as an ordinary host', async () => {
    hostPlacements = [
      {
        hostId: 'agent_cloud',
        rung: 2,
        label: 'Tau Cloud',
        workspaceRoot: '/workspace',
        online: true,
        cloudProjectId: 'project-a',
      },
    ];
    const user = userEvent.setup();
    render(
      <ChatExecutionSelector>
        {({ label }) => <button type='button'>Select agent: {label}</button>}
      </ChatExecutionSelector>,
    );

    await user.click(screen.getByRole('button', { name: 'Select agent: Tau' }));
    expect(await screen.findByRole('option', { name: /Tau Host · Tau Cloud/u })).toBeInTheDocument();
    expect(screen.queryByText(/keeps working when you close the tab/u)).not.toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('groups the agents under an "Agents" heading', async () => {
    const user = userEvent.setup();
    render(
      <ChatExecutionSelector>
        {({ label }) => <button type='button'>Select agent: {label}</button>}
      </ChatExecutionSelector>,
    );

    await user.click(screen.getByRole('button', { name: 'Select agent: Tau' }));
    expect(await screen.findByText('Agents')).toBeInTheDocument();
  });

  /* Q12.6: one agent is not a choice — the composer drops the control. */
  it('is not offered when Tau is the only agent, and is offered once a host appears', () => {
    const { unmount } = render(<OfferedProbe />);
    expect(screen.getByText('hidden:Tau')).toBeInTheDocument();
    unmount();

    hostPlacements = [{ hostId: 'origin', rung: 1, label: 'studio-mini', workspaceRoot: '/srv/tau', online: true }];
    render(<OfferedProbe />);
    expect(screen.getByText('offered:Tau')).toBeInTheDocument();
  });

  it('offers one row per external agent a daemon advertises, with the credential note', async () => {
    hostPlacements = [
      {
        hostId: 'origin',
        rung: 1,
        label: 'studio-mini',
        workspaceRoot: '/Users/x/tau-workspace/lamp',
        online: true,
        externalAgents: [
          { id: 'claude', displayName: 'Claude Code', models: [] },
          {
            id: 'codex',
            displayName: 'Codex',
            models: [
              { id: 'gpt-5.6-sol', name: 'GPT-5.6-Sol' },
              { id: 'gpt-5.3-codex-spark', name: 'GPT-5.3-Codex-Spark' },
            ],
            defaultModel: 'gpt-5.6-sol',
          },
        ],
      },
    ];
    const user = userEvent.setup();
    render(
      <ChatExecutionSelector>
        {({ label }) => <button type='button'>Select agent: {label}</button>}
      </ChatExecutionSelector>,
    );

    await user.click(screen.getByRole('button', { name: 'Select agent: Tau' }));

    expect(await screen.findByRole('option', { name: /^Claude Code/u })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^Codex/u })).toBeInTheDocument();
    // SP-4 Result 3 + V2: the copy promises the project's tree and the user's own
    // login, never per-action approval.
    expect(screen.getByText("Runs with your local Codex login in this project's tree")).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: /^Codex/u }));
    /* V5: the row is seeded with the model the host probed as this agent's
     * current one, so the picker beside it opens on a real selection instead of
     * an empty box — and `withTauExecutionModel` never runs on this path. */
    expect(setActiveExecution).toHaveBeenCalledWith({
      kind: 'acp',
      hostId: 'origin',
      agentId: 'codex',
      model: 'gpt-5.6-sol',
    });
  });

  it('lists a refused agent with its code, and refuses to place a turn on it', async () => {
    /* V9: the row exists so the user can tell "Tau does not do this" from
     * "your Codex CLI is too old". */
    hostPlacements = [
      {
        hostId: 'origin',
        rung: 1,
        label: 'studio-mini',
        workspaceRoot: '/Users/x/tau-workspace/lamp',
        online: true,
        externalAgents: [{ id: 'codex', displayName: 'Codex', models: [], refusal: 'CLI_TOO_OLD' }],
      },
    ];
    const user = userEvent.setup();
    render(
      <ChatExecutionSelector>
        {({ label }) => <button type='button'>Select agent: {label}</button>}
      </ChatExecutionSelector>,
    );

    await user.click(screen.getByRole('button', { name: 'Select agent: Tau' }));
    const row = await screen.findByRole('option', { name: /^Codex/u });
    expect(row).toHaveTextContent('CLI_TOO_OLD');

    await user.click(row);
    expect(setActiveExecution).not.toHaveBeenCalled();
  });

  it('names a persisted external-agent selection before discovery answers', async () => {
    activeExecution = { kind: 'acp', hostId: 'device-1', agentId: 'claude' };
    render(
      <ChatExecutionSelector>
        {({ label }) => <button type='button'>Select agent: {label}</button>}
      </ChatExecutionSelector>,
    );

    /* No name map anywhere any more (V14): before discovery answers, the row
     * can only name the agent by the id the chat persisted. */
    expect(screen.getByRole('button', { name: /claude/u })).toBeInTheDocument();
  });

  it('refuses to place a turn on an offline daemon', async () => {
    hostPlacements = [{ hostId: 'device-1', rung: 2, label: 'workshop', workspaceRoot: '/srv/tau', online: false }];
    const user = userEvent.setup();
    render(
      <ChatExecutionSelector>
        {({ label }) => <button type='button'>Select agent: {label}</button>}
      </ChatExecutionSelector>,
    );

    await user.click(screen.getByRole('button', { name: 'Select agent: Tau' }));
    await user.click(await screen.findByRole('option', { name: /Tau Host · workshop/u }));

    expect(setActiveExecution).not.toHaveBeenCalled();
  });

  it('names the Electron in-process launcher "Tau"', async () => {
    hostPlacements = [
      { hostId: 'desktop', rung: 1, label: 'tau-desktop', workspaceRoot: '/Users/x/Documents/tau', online: true },
    ];
    const user = userEvent.setup();
    render(
      <ChatExecutionSelector>
        {({ label }) => <button type='button'>Select agent: {label}</button>}
      </ChatExecutionSelector>,
    );

    await user.click(screen.getByRole('button', { name: 'Select agent: Tau' }));
    expect(await screen.findByRole('option', { name: 'Select agent: Tau' })).toBeInTheDocument();
  });

  it('offers no browser row on the desktop build', async () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    hostPlacements = [
      { hostId: 'desktop', rung: 1, label: 'tau-desktop', workspaceRoot: '/Users/x/Documents/tau', online: true },
    ];
    const user = userEvent.setup();
    render(
      <ChatExecutionSelector>
        {({ label }) => <button type='button'>Select agent: {label}</button>}
      </ChatExecutionSelector>,
    );

    await user.click(screen.getByRole('button', { name: /^Select agent: /u }));
    expect(await screen.findByRole('option', { name: 'Select agent: Tau' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Tau' })).toBeNull();
    vi.unstubAllEnvs();
  });

  it('returns a daemon-placed chat to this browser by dropping hostId', async () => {
    activeExecution = { kind: 'tau', model: 'gpt-test', hostId: 'origin' };
    hostPlacements = [
      { hostId: 'origin', rung: 1, label: 'studio-mini', workspaceRoot: '/Users/x/tau-workspace/lamp', online: true },
    ];
    const user = userEvent.setup();
    render(
      <ChatExecutionSelector>
        {({ label }) => <button type='button'>Select agent: {label}</button>}
      </ChatExecutionSelector>,
    );

    // The trigger names the daemon, never a bare "Tau" for a turn this browser
    // will not run.
    await user.click(screen.getByRole('button', { name: 'Select agent: Tau Host · studio-mini' }));
    await user.click(await screen.findByRole('option', { name: /^Tau$/u }));

    expect(setActiveExecution).toHaveBeenCalledWith({ kind: 'tau', model: 'gpt-test' });
  });

  it('offers exactly one Tau target when no daemon is discovered', async () => {
    const user = userEvent.setup();
    render(
      <ChatExecutionSelector>
        {({ label }) => <button type='button'>Select agent: {label}</button>}
      </ChatExecutionSelector>,
    );

    await user.click(screen.getByRole('button', { name: 'Select agent: Tau' }));

    expect(screen.queryByText('Tau (Browser)')).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: /^Tau$/u }));
    expect(setActiveExecution).toHaveBeenCalledWith({ kind: 'tau', model: 'gpt-test' });
  });

  it('states the reason on the Tau row when this project cannot host the agent', async () => {
    // No coordinator fallback exists any more, so an unavailable placement is
    // surfaced, never silently rerouted.
    browserHostAvailability = {
      status: 'unavailable',
      reason: 'This project’s storage cannot hold a durable agent log.',
    };
    const user = userEvent.setup();
    render(
      <ChatExecutionSelector>
        {({ label }) => <button type='button'>Select agent: {label}</button>}
      </ChatExecutionSelector>,
    );

    await user.click(screen.getByRole('button', { name: 'Select agent: Tau' }));

    expect(await screen.findByText('This project’s storage cannot hold a durable agent log.')).toBeInTheDocument();
  });

  it('says nothing while the capability probe is still pending', async () => {
    browserHostAvailability = { status: 'pending' };
    const user = userEvent.setup();
    render(
      <ChatExecutionSelector>
        {({ label }) => <button type='button'>Select agent: {label}</button>}
      </ChatExecutionSelector>,
    );

    await user.click(screen.getByRole('button', { name: 'Select agent: Tau' }));

    expect(await screen.findByRole('option', { name: /^Tau$/u })).toBeInTheDocument();
    expect(document.querySelector('[data-slot="chat-execution-tau-note"]')).toBeNull();
  });

  it('surfaces the non-recoverable caveat for an ephemeral project', async () => {
    browserHostAvailability = {
      status: 'available',
      durability: 'ephemeral',
      caveat: 'Non-recoverable after this browser session ends',
    };
    const user = userEvent.setup();
    render(
      <ChatExecutionSelector>
        {({ label }) => <button type='button'>Select agent: {label}</button>}
      </ChatExecutionSelector>,
    );

    await user.click(screen.getByRole('button', { name: 'Select agent: Tau' }));
    expect(await screen.findByText('Non-recoverable after this browser session ends')).toBeInTheDocument();
  });

  it('uses stable labels for run, approval, and cancellation activity', () => {
    expect(formatChatAgentActivity('ready')).toBe('Ready');
    expect(formatChatAgentActivity('working')).toBe('Working');
    expect(formatChatAgentActivity('approval-required')).toBe('Approval needed');
    expect(formatChatAgentActivity('stopping')).toBe('Stopping');
  });
});
