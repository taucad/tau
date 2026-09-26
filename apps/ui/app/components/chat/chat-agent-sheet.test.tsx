// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { ExternalAgentDescriptor } from '@taucad/agent-host';
import type { Model, ResolvedModel } from '#hooks/use-models.js';
import type { ChatComposerContextValue } from '#hooks/active-chat-provider.js';
import type { AgentHostPlacementTarget } from '#lib/agent-host-placement.js';
import type { AgentConfig } from '#components/chat/use-agent-config.js';

/* The cmdk list scrolls the highlighted row into view; jsdom has no layout. */
Element.prototype.scrollIntoView = vi.fn();

const cost = { inputTokens: 5, outputTokens: 25, cacheReadTokens: 0, cacheWriteTokens: 0 };
const fable = {
  id: 'anthropic-claude-fable-5.1',
  name: 'Fable 5.1',
  provider: { id: 'anthropic', name: 'Anthropic' },
  details: { family: 'claude', cost, contextWindow: 1_000_000 },
  configuration: { streaming: true, thinking: { type: 'adaptive' }, outputConfig: { effort: 'high' } },
  support: { reasoning: { levels: ['low', 'medium', 'high', 'xhigh'] } },
} as unknown as Model;
const haiku = {
  id: 'anthropic-claude-haiku-4.5',
  name: 'Haiku 4.5',
  provider: { id: 'anthropic', name: 'Anthropic' },
  details: { family: 'claude', cost: { ...cost, outputTokens: 5 }, contextWindow: 200_000 },
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic wire key
  configuration: { streaming: true, thinking: { type: 'enabled', budget_tokens: 4000 } },
} as unknown as Model;
const catalog = [haiku, fable];

const resolved = (model: Model): ResolvedModel => ({
  id: model.id,
  name: model.name,
  family: model.details.family,
  provider: model.provider,
  isResolved: true,
  model,
});

const state: {
  execution: ChatComposerContextValue['execution']['execution'];
  model: Model;
  effort: ChatComposerContextValue['model']['effort'];
  placements: readonly AgentHostPlacementTarget[];
} = { execution: { kind: 'tau', model: fable.id }, model: fable, effort: 'high', placements: [] };
const setActiveModel = vi.fn();
const setActiveEffort = vi.fn();
const setActiveExecution = vi.fn();

vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({
    model: {
      modelId: state.model.id,
      model: resolved(state.model),
      effort: state.effort,
      setActiveModel,
      setActiveEffort,
    },
    execution: { execution: state.execution, setActiveExecution },
    canSelectExecution: true,
  }),
}));

vi.mock('#hooks/use-models.js', () => ({
  useModels: () => ({
    data: catalog,
    availableModels: catalog,
    defaultExecution: { kind: 'tau', model: fable.id, effort: 'low' },
  }),
}));

vi.mock('#hooks/use-cad-agent-config.js', () => ({
  useAgentHostPlacements: () => ({ targets: state.placements, loading: false }),
  useBrowserAgentHostProjectAvailability: () => ({ status: 'available' }),
}));

const keybindings = vi.hoisted(() => new Map<string, () => void>());
vi.mock('#hooks/use-keyboard.js', () => ({
  useKeybinding: (combination: { key: string }, callback: () => void) => {
    keybindings.set(combination.key, callback);
    return { formattedKeyCombination: '⌘/' };
  },
}));

vi.mock('#hooks/use-settings-dialog.js', () => ({
  useSettingsDialog: () => ({ open: vi.fn() }),
}));

vi.mock('#components/icons/svg-icon.js', () => ({
  SvgIcon: ({ id }: { readonly id?: string }) => <span data-testid='svg-icon' data-icon={id} />,
}));

const { ChatAgentSheet } = await import('#components/chat/chat-agent-sheet.js');

const noConfig: AgentConfig = { options: [], valueOf: () => '', select: vi.fn() };

const codex = (refusal?: ExternalAgentDescriptor['refusal']): AgentHostPlacementTarget => ({
  hostId: 'desktop',
  rung: 'in-process',
  label: 'This Mac',
  workspaceRoot: '',
  online: true,
  externalAgents: [
    {
      id: 'codex',
      displayName: 'Codex',
      models: refusal ? [] : [{ id: 'gpt-5.6-sol', name: 'GPT-5.6-Sol' }],
      ...(refusal ? { refusal } : { defaultModel: 'gpt-5.6-sol' }),
    },
  ],
});

const renderSheet = (focusEditor = vi.fn(), agentConfig: AgentConfig = noConfig) => {
  render(
    <TooltipProvider>
      <ChatAgentSheet agentConfig={agentConfig} focusEditor={focusEditor} />
    </TooltipProvider>,
  );
  return { focusEditor };
};

describe('ChatAgentSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    keybindings.clear();
    state.execution = { kind: 'tau', model: fable.id };
    state.model = fable;
    state.effort = 'high';
    state.placements = [];
  });

  it('names the trigger with the model and its level, and shows the model’s own glyph', () => {
    renderSheet();

    const trigger = screen.getByRole('button', { name: 'Agent and model: Fable 5.1, reasoning High' });
    expect(within(trigger).getByTestId('svg-icon')).toHaveAttribute('data-icon', 'claude');
    expect(trigger).toHaveTextContent('High');
  });

  it('opens on the chosen level, so an arrow key changes it at once', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: /^Agent and model/u }));

    const reasoning = screen.getByRole('tablist', { name: 'Reasoning for Fable 5.1' });
    const high = within(reasoning).getByRole('tab', { name: 'High' });
    expect(high).toHaveFocus();
    expect(
      within(reasoning)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Low', 'Medium', 'High', 'Extra high']);
    await userEvent.keyboard('{ArrowLeft}');
    expect(setActiveEffort).toHaveBeenCalledWith('medium');
  });

  it('shows no reasoning section, and no level on the trigger, for a model with none to choose', async () => {
    state.model = haiku;
    state.effort = undefined;
    state.execution = { kind: 'tau', model: haiku.id };
    renderSheet();

    const trigger = screen.getByRole('button', { name: 'Agent and model: Haiku 4.5' });
    await userEvent.click(trigger);
    expect(screen.queryByRole('tablist', { name: /Reasoning/u })).toBeNull();
    expect(screen.getByRole('button', { name: 'Model: Haiku 4.5. Change' })).toHaveFocus();
  });

  it('drills into the model list and returns to the sheet with the chosen model', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: /^Agent and model/u }));
    await userEvent.click(screen.getByRole('button', { name: 'Model: Fable 5.1. Change' }));

    expect(screen.getByRole('group', { name: 'Frontier' })).toBeInTheDocument();
    /* Level controls are tabs, never options: options are only ever models (Finding 8). */
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Haiku 4.5', 'Fable 5.1High']);
    await userEvent.click(screen.getByRole('option', { name: /Haiku/u }));

    expect(setActiveModel).toHaveBeenCalledWith(haiku.id);
    expect(screen.getByRole('button', { name: 'Model: Fable 5.1. Change' })).toBeInTheDocument();
  });

  it('offers no Agent row when Tau is the only agent', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: /^Agent and model/u }));

    expect(screen.queryByRole('button', { name: /^Agent: /u })).toBeNull();
  });

  it('chooses the agent in a row of its own, listing each host’s agents under that host', async () => {
    state.placements = [
      codex(),
      { ...codex('EXTERNAL_AGENT_AUTH_REQUIRED'), hostId: 'studio', label: 'studio', rung: 2 },
    ];
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: /^Agent and model/u }));
    const agentRow = screen.getByRole('button', { name: 'Agent: Tau. Change' });
    await userEvent.click(agentRow);

    expect(screen.getByPlaceholderText('Search agents...')).toHaveFocus();
    expect(screen.getAllByRole('option').map((option) => option.getAttribute('aria-label'))).toEqual([
      'Tau, in use',
      'Codex · This Mac',
      'Codex · studio, unavailable',
    ]);
    /* The host is the heading, so each row keeps the agent's own name. */
    expect(within(screen.getByRole('group', { name: 'On this computer' })).getByRole('option')).toHaveTextContent(
      /^Codex$/u,
    );
    expect(within(screen.getByRole('group', { name: 'On studio' })).getByRole('option')).toHaveTextContent(
      "CodexCan't start",
    );
    expect(within(screen.getByRole('option', { name: 'Tau, in use' })).getByText('Fable 5.1')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Back to settings' }));
    expect(screen.getByRole('button', { name: 'Agent: Tau. Change' })).toHaveFocus();
  });

  it('moves the chat to another agent at its own defaults when one of its models is chosen', async () => {
    state.placements = [codex()];
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: /^Agent and model/u }));
    await userEvent.click(screen.getByRole('button', { name: 'Agent: Tau. Change' }));
    await userEvent.click(screen.getByRole('option', { name: 'Codex' }));
    /* Browsing an agent changes nothing, and the way back is to the agents. */
    expect(setActiveExecution).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Search Codex models...')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Back to agents' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: 'GPT-5.6-Sol' }));

    expect(setActiveExecution).toHaveBeenCalledWith({
      kind: 'acp',
      hostId: 'desktop',
      agentId: 'codex',
      model: 'gpt-5.6-sol',
    });
  });

  it('still offers an agent whose model probe came back empty, on its own default model', async () => {
    const placement = codex();
    state.placements = [{ ...placement, externalAgents: [{ id: 'codex', displayName: 'Codex', models: [] }] }];
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: /^Agent and model/u }));
    await userEvent.click(screen.getByRole('button', { name: 'Agent: Tau. Change' }));
    await userEvent.click(screen.getByRole('option', { name: 'Codex' }));
    await userEvent.click(screen.getByRole('option', { name: 'Default model' }));

    expect(setActiveExecution).toHaveBeenCalledWith({ kind: 'acp', hostId: 'desktop', agentId: 'codex' });
  });

  it('lists an agent its host cannot start, with the reason, the fix and the code — never as a choice', async () => {
    state.placements = [codex('EXTERNAL_AGENT_AUTH_REQUIRED')];
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: /^Agent and model/u }));
    await userEvent.click(screen.getByRole('button', { name: 'Agent: Tau. Change' }));
    await userEvent.click(screen.getByRole('option', { name: 'Codex, unavailable' }));

    expect(screen.getByText("Codex can't start on this computer")).toBeInTheDocument();
    expect(screen.getByText('codex login')).toBeInTheDocument();
    expect(screen.getByText('EXTERNAL_AGENT_AUTH_REQUIRED')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy command' })).toBeInTheDocument();
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('reads an external agent’s reasoning from its own thought level, and hides its “Default”', () => {
    state.execution = { kind: 'acp', hostId: 'desktop', agentId: 'codex' };
    state.placements = [codex()];
    const agentConfig: AgentConfig = {
      options: [
        {
          type: 'select',
          id: 'thought_level',
          name: 'Thinking',
          category: 'thought_level',
          currentValue: 'default',
          options: [
            { value: 'default', name: 'Default' },
            { value: 'high', name: 'High' },
          ],
        },
        { type: 'boolean', id: 'fast_mode', name: 'Fast mode', currentValue: true },
      ],
      valueOf: (option) => option.currentValue,
      select: vi.fn(),
    };
    renderSheet(vi.fn(), agentConfig);

    expect(screen.getByRole('button', { name: 'Agent and model: Codex, GPT-5.6-Sol, Fast mode' })).toBeInTheDocument();
  });

  it('steps back one view on Escape, and closes only from the settings', async () => {
    const { focusEditor } = renderSheet();
    await userEvent.click(screen.getByRole('button', { name: /^Agent and model/u }));
    await userEvent.click(screen.getByRole('button', { name: /^Model: .*Change$/u }));
    expect(screen.getByRole('button', { name: 'Back to settings' })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /^Model: .*Change$/u })).toHaveFocus();
    expect(focusEditor).not.toHaveBeenCalled();

    await userEvent.keyboard('{Escape}');
    expect(focusEditor).toHaveBeenCalled();
  });

  it('hands focus back to the editor when it closes, and opens from its shortcut', async () => {
    const { focusEditor } = renderSheet();
    act(() => {
      keybindings.get('/')?.();
    });
    expect(await screen.findByRole('tablist', { name: 'Reasoning for Fable 5.1' })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(focusEditor).toHaveBeenCalled();
  });
});
