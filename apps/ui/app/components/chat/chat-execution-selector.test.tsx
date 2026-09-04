// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChatComposerContextValue } from '#hooks/active-chat-provider.js';

const setActiveExecution = vi.fn();
const listConnections = vi.fn();
const listAgents = vi.fn();
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

vi.mock('#lib/paseo-connection-client.js', () => ({ listPaseoConnections: listConnections }));
vi.mock('#lib/paseo/paseo-client.js', () => ({ listPaseoAgentsOverSdk: listAgents }));

vi.mock('#hooks/use-settings-dialog.js', () => ({ openSettingsDialog: vi.fn() }));
vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('#hooks/use-cad-agent-config.js', () => ({
  useBrowserAgentHostProjectAvailability: () => browserHostAvailability,
  useAgentHostPlacements: () => ({ targets: hostPlacements, loading: false }),
}));
let currentProjectId: string | undefined;
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: currentProjectId }) }));
const provisionCloudHost = vi.fn();
vi.mock('#lib/remote-host-client.js', () => ({
  provisionCloudHost: async (id: string): Promise<unknown> => provisionCloudHost(id) as unknown,
}));

const { ChatExecutionSelector, formatChatAgentActivity, formatPaseoAgentStatus } =
  await import('#components/chat/chat-execution-selector.js');

describe('ChatExecutionSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeExecution = { kind: 'tau', model: 'gpt-test' };
    browserHostAvailability = { status: 'available', durability: 'exclusive-append' };
    hostPlacements = [];
    modelProviderKind = 'openai';
    currentProjectId = undefined;
    provisionCloudHost.mockReset();
    globalThis.HTMLElement.prototype.scrollIntoView = vi.fn();
    listConnections.mockResolvedValue([
      {
        id: 'connection-1',
        label: 'Workstation',
        serverId: 'server-1',
        relayEndpoint: 'wss://relay.invalid',

        createdAt: '2026-08-28T00:00:00.000Z',
        updatedAt: '2026-08-28T00:00:00.000Z',
      },
    ]);
    listAgents.mockResolvedValue([{ id: 'claude', label: 'Claude Code', provider: 'Anthropic', status: 'idle' }]);
  });

  it('opens and selects a discovered Paseo agent with the keyboard', async () => {
    const user = userEvent.setup();
    render(
      <ChatExecutionSelector>
        {({ label }) => <button type='button'>Select agent: {label}</button>}
      </ChatExecutionSelector>,
    );

    await user.click(screen.getByRole('button', { name: 'Select agent: Tau' }));
    const search = await screen.findByPlaceholderText('Search agents...');
    await screen.findByText('Claude Code');
    await user.type(search, 'Claude Code');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(setActiveExecution).toHaveBeenCalledWith({
      kind: 'paseo',
      connectionId: 'connection-1',
      agentId: 'claude',
    });
  });

  it('resolves a persisted Paseo agent label on mount without opening the selector', async () => {
    activeExecution = { kind: 'paseo', connectionId: 'connection-1', agentId: 'claude' };

    render(
      <ChatExecutionSelector>
        {({ label }) => <button type='button'>Select agent: {label}</button>}
      </ChatExecutionSelector>,
    );

    expect(await screen.findByRole('button', { name: 'Select agent: Claude Code' })).toBeInTheDocument();
    expect(listConnections).toHaveBeenCalledTimes(1);
    expect(listAgents).toHaveBeenCalledWith(expect.objectContaining({ connectionId: 'connection-1' }));
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

  it('offers one Tau Cloud row and provisions this project host when it is chosen', async () => {
    currentProjectId = 'project-a';
    provisionCloudHost.mockResolvedValue({ deviceId: 'agent_cloud', label: 'Tau Cloud', state: 'provisioned' });
    const user = userEvent.setup();
    render(
      <ChatExecutionSelector>
        {({ label }) => <button type='button'>Select agent: {label}</button>}
      </ChatExecutionSelector>,
    );

    await user.click(screen.getByRole('button', { name: 'Select agent: Tau' }));
    const row = await screen.findByRole('option', { name: /Tau Cloud/u });
    expect(row).toBeInTheDocument();
    expect(screen.getByText(/keeps working when you close the tab/u)).toBeInTheDocument();

    await user.click(row);

    expect(provisionCloudHost).toHaveBeenCalledWith('project-a');
    expect(setActiveExecution).toHaveBeenCalledWith({ kind: 'tau', model: 'gpt-test', hostId: 'agent_cloud' });
  });

  /*
   * The live G5 leg chose Tau Cloud against an API whose provisioner had no
   * image: the API answered 500, and the page showed *nothing* — no toast, no
   * note, the chip still on the previous placement. The refusal now lands where
   * the choice was made, on the row itself, and the placement is left alone.
   */
  it('shows a refused provisioning on the Tau Cloud row and keeps the previous placement', async () => {
    currentProjectId = 'project-a';
    provisionCloudHost.mockRejectedValue(
      new Error("Tau Cloud is unavailable: Unable to find image 'tau-host:latest' locally"),
    );
    const user = userEvent.setup();
    render(
      <ChatExecutionSelector>
        {({ label }) => <button type='button'>Select agent: {label}</button>}
      </ChatExecutionSelector>,
    );

    await user.click(screen.getByRole('button', { name: 'Select agent: Tau' }));
    await user.click(await screen.findByRole('option', { name: /Tau Cloud/u }));

    expect(
      await screen.findByText("Tau Cloud is unavailable: Unable to find image 'tau-host:latest' locally"),
    ).toBeInTheDocument();
    expect(setActiveExecution).not.toHaveBeenCalled();
    /* Still offered: provisioning is idempotent, so the fix is to build the
     * image and click again — not to reload the page. */
    expect(screen.getByRole('option', { name: /Tau Cloud/u })).toBeInTheDocument();
  });

  it('names an already provisioned cloud host "Tau Cloud" and offers no second row', async () => {
    currentProjectId = 'project-a';
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
    expect(await screen.findAllByRole('option', { name: /Tau Cloud/u })).toHaveLength(1);

    await user.click(screen.getByRole('option', { name: /Tau Cloud/u }));
    expect(provisionCloudHost).not.toHaveBeenCalled();
    expect(setActiveExecution).toHaveBeenCalledWith({ kind: 'tau', model: 'gpt-test', hostId: 'agent_cloud' });
  });

  it('offers no cloud row outside a project', async () => {
    currentProjectId = undefined;
    const user = userEvent.setup();
    render(
      <ChatExecutionSelector>
        {({ label }) => <button type='button'>Select agent: {label}</button>}
      </ChatExecutionSelector>,
    );

    await user.click(screen.getByRole('button', { name: 'Select agent: Tau' }));
    await screen.findByRole('option', { name: 'Tau' });
    expect(screen.queryByRole('option', { name: /Tau Cloud/u })).not.toBeInTheDocument();
  });

  it('offers one row per external agent a daemon advertises, with the credential note', async () => {
    hostPlacements = [
      {
        hostId: 'origin',
        rung: 1,
        label: 'studio-mini',
        workspaceRoot: '/Users/x/tau-workspace/lamp',
        online: true,
        externalAgents: ['claude', 'codex'],
      },
    ];
    const user = userEvent.setup();
    render(
      <ChatExecutionSelector>
        {({ label }) => <button type='button'>Select agent: {label}</button>}
      </ChatExecutionSelector>,
    );

    await user.click(screen.getByRole('button', { name: 'Select agent: Tau' }));

    expect(await screen.findByRole('option', { name: /Claude Code · Tau Host studio-mini/u })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Codex · Tau Host studio-mini/u })).toBeInTheDocument();
    // SP-4 Result 3: the copy promises an isolated branch and the user's own
    // login, never per-action approval.
    expect(screen.getByText('Runs with your local Codex login in an isolated branch')).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: /Codex · Tau Host studio-mini/u }));
    expect(setActiveExecution).toHaveBeenCalledWith({ kind: 'acp', hostId: 'origin', agentId: 'codex' });
  });

  it('names a persisted external-agent selection before discovery answers', async () => {
    activeExecution = { kind: 'acp', hostId: 'device-1', agentId: 'claude' };
    render(
      <ChatExecutionSelector>
        {({ label }) => <button type='button'>Select agent: {label}</button>}
      </ChatExecutionSelector>,
    );

    expect(screen.getByRole('button', { name: /Claude Code/u })).toBeInTheDocument();
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

  it('names the Electron in-process launcher "This computer"', async () => {
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
    expect(await screen.findByRole('option', { name: /This computer/u })).toBeInTheDocument();
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

  it('normalizes daemon-specific statuses to stable labels', () => {
    expect(formatPaseoAgentStatus('initializing')).toBe('Starting');
    expect(formatPaseoAgentStatus('idle')).toBe('Ready');
    expect(formatPaseoAgentStatus('running')).toBe('Working');
    expect(formatPaseoAgentStatus('error')).toBe('Error');
    expect(formatPaseoAgentStatus('closed')).toBe('Stopped');
    expect(formatPaseoAgentStatus('unexpected')).toBe('Unavailable');
  });

  it('uses stable labels for run, approval, and cancellation activity', () => {
    expect(formatChatAgentActivity('ready')).toBe('Ready');
    expect(formatChatAgentActivity('working')).toBe('Working');
    expect(formatChatAgentActivity('approval-required')).toBe('Approval needed');
    expect(formatChatAgentActivity('stopping')).toBe('Stopping');
  });
});
