// @vitest-environment jsdom
/**
 * The ACP model picker: a Codex model has to reach `execution.model` without
 * ever passing through `withTauExecutionModel`, which would convert the chat
 * back to Tau (V5).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChatComposerContextValue } from '#hooks/active-chat-provider.js';

const setActiveExecution = vi.fn();
let activeExecution: ChatComposerContextValue['execution']['execution'] = { kind: 'tau', model: 'gpt-test' };
let hostPlacements: Array<Record<string, unknown>> = [];

vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: (): ChatComposerContextValue =>
    ({
      execution: { execution: activeExecution, setActiveExecution },
      model: { modelId: 'gpt-test', model: { provider: { id: 'openai' } } },
      agentActivity: 'ready',
    }) as unknown as ChatComposerContextValue,
}));
vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('#hooks/use-cad-agent-config.js', () => ({
  useAgentHostPlacements: () => ({ targets: hostPlacements, loading: false }),
}));

const { ChatAgentModelSelector } = await import('#components/chat/chat-agent-model-selector.js');

const codexPlacement = {
  hostId: 'origin',
  rung: 1,
  label: 'studio-mini',
  workspaceRoot: '/Users/x/lamp',
  online: true,
  revisions: [],
  externalAgents: [
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
};

const renderSelector = (): void => {
  render(
    <ChatAgentModelSelector>
      {({ selectedModel }) => <button type='button'>Select model: {selectedModel.name}</button>}
    </ChatAgentModelSelector>,
  );
};

describe('ChatAgentModelSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeExecution = { kind: 'acp', hostId: 'origin', agentId: 'codex', model: 'gpt-5.6-sol' };
    hostPlacements = [codexPlacement];
    globalThis.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('writes the chosen model onto the ACP execution, keeping its host and agent', async () => {
    const user = userEvent.setup();
    renderSelector();

    await user.click(screen.getByRole('button', { name: 'Select model: GPT-5.6-Sol' }));
    await user.click(await screen.findByRole('option', { name: /GPT-5.3-Codex-Spark/u }));

    expect(setActiveExecution).toHaveBeenCalledWith({
      kind: 'acp',
      hostId: 'origin',
      agentId: 'codex',
      model: 'gpt-5.3-codex-spark',
    });
  });

  it('opens on the model the host probed when the chat has chosen none', () => {
    activeExecution = { kind: 'acp', hostId: 'origin', agentId: 'codex' };
    renderSelector();

    expect(screen.getByRole('button', { name: 'Select model: GPT-5.6-Sol' })).toBeInTheDocument();
  });

  it('renders nothing when the host advertised no models', () => {
    /* A probe that failed — a logged-out CLI, a vendor timeout — costs the
       picker, never the agent: the turn runs on the adapter's own current
       model rather than being offered an empty menu (EQ1 fallback B). */
    hostPlacements = [{ ...codexPlacement, externalAgents: [{ id: 'codex', displayName: 'Codex', models: [] }] }];
    renderSelector();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders nothing for a Tau execution — the catalog picker owns that slot', () => {
    activeExecution = { kind: 'tau', model: 'gpt-test' };
    renderSelector();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
