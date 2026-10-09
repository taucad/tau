// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { ExternalAgentDescriptor } from '@taucad/agent-host/wire';
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
  id: 'anthropic-claude-haiku-5.5',
  name: 'Haiku 5.5',
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

const models: {
  defaultExecution: ChatComposerContextValue['execution']['execution'];
  catalog: { status: 'loading' } | { status: 'unavailable' } | { status: 'loaded'; models: Model[] };
} = {
  defaultExecution: { kind: 'tau', model: fable.id, effort: 'low' },
  catalog: { status: 'loaded', models: catalog },
};
vi.mock('#hooks/use-models.js', () => ({
  useModels: () => ({
    data: catalog,
    availableModels: catalog,
    defaultExecution: models.defaultExecution,
    lastTauExecution: { kind: 'tau', model: fable.id, effort: 'low' },
    catalog: models.catalog,
  }),
}));

vi.mock('#hooks/use-cad-agent-config.js', () => ({
  useBrowserAgentHostProjectAvailability: () => ({ status: 'available' }),
}));

const keybindings = vi.hoisted(() => new Map<string, () => void>());
vi.mock('#hooks/use-keyboard.js', () => ({
  useKeybinding: (combination: { key: string }, callback: () => void) => {
    keybindings.set(combination.key, callback);
    return { formattedKeyCombination: '⌘/' };
  },
}));

/* The Settings disclosure is a remembered preference; a remount reads what the last one wrote. */
const preferences = vi.hoisted(() => new Map<string, unknown>());
vi.mock('#hooks/use-cookie.js', async () => {
  const { useState } = await import('react');
  return {
    useCookie: <T,>(name: string, fallback: T) => {
      const [value, setValue] = useState<T>(() => (preferences.has(name) ? (preferences.get(name) as T) : fallback));
      return [
        value,
        (next: T) => {
          preferences.set(name, next);
          setValue(next);
        },
      ] as const;
    },
  };
});

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
  return {
    focusEditor,
    ...render(
      <TooltipProvider>
        <ChatAgentSheet agentConfig={agentConfig} placements={state.placements} focusEditor={focusEditor} />
      </TooltipProvider>,
    ),
  };
};

/** Codex's options as it sends them to a client without boolean config options. */
const codexConfig = (values: { readonly mode: string; readonly fast: string }, select = vi.fn()): AgentConfig => ({
  options: [
    {
      type: 'select',
      id: 'collaboration_mode',
      name: 'Collaboration mode',
      category: 'collaboration_mode',
      currentValue: values.mode,
      options: [
        { value: 'default', name: 'Default' },
        { value: 'plan', name: 'Plan', description: 'Plan before making changes' },
      ],
    },
    {
      type: 'select',
      id: 'fast-mode',
      name: 'Fast mode',
      description: '1.5x speed, increased usage',
      category: 'model_config',
      currentValue: values.fast,
      options: [
        { value: 'off', name: 'Off' },
        { value: 'on', name: 'On' },
      ],
    },
  ],
  valueOf: (option) => option.currentValue,
  select,
});

const openSheet = async (): Promise<void> => {
  await userEvent.click(screen.getByRole('button', { name: /^Agent and model/u }));
};

describe('ChatAgentSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    keybindings.clear();
    state.execution = { kind: 'tau', model: fable.id };
    state.model = fable;
    state.effort = 'high';
    state.placements = [];
    models.defaultExecution = { kind: 'tau', model: fable.id, effort: 'low' };
    models.catalog = { status: 'loaded', models: catalog };
    preferences.clear();
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

    const trigger = screen.getByRole('button', { name: 'Agent and model: Haiku 5.5' });
    await userEvent.click(trigger);
    expect(screen.queryByRole('tablist', { name: /Reasoning/u })).toBeNull();
    expect(screen.getByRole('button', { name: 'Model: Haiku 5.5. Change' })).toHaveFocus();
  });

  it('drills into the model list and returns to the sheet with the chosen model', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: /^Agent and model/u }));
    await userEvent.click(screen.getByRole('button', { name: 'Model: Fable 5.1. Change' }));

    expect(screen.getByRole('group', { name: 'Frontier' })).toBeInTheDocument();
    /* Level controls are tabs, never options: options are only ever models (Finding 8). */
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Haiku 5.5', 'Fable 5.1High']);
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

    expect(screen.getByPlaceholderText('Search agents…')).toHaveFocus();
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
    expect(screen.getByPlaceholderText('Search Codex models…')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Back to agents' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: 'GPT-5.6-Sol' }));

    expect(setActiveExecution).toHaveBeenCalledWith({
      kind: 'acp',
      hostId: 'desktop',
      agentId: 'codex',
      model: 'gpt-5.6-sol',
    });
  });

  it('returns from an external agent to the last Tau level, even when the new-chat default is that agent', async () => {
    const acp = { kind: 'acp', hostId: 'desktop', agentId: 'codex', model: 'gpt-5.6-sol' } as const;
    state.execution = acp;
    models.defaultExecution = acp;
    state.placements = [codex()];
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: /^Agent and model/u }));
    await userEvent.click(screen.getByRole('button', { name: /^Agent: Codex/u }));
    await userEvent.click(screen.getByRole('option', { name: /^Tau/u }));
    await userEvent.click(screen.getByRole('option', { name: /^Haiku 5\.5/u }));

    expect(setActiveExecution).toHaveBeenCalledWith({ kind: 'tau', model: haiku.id, effort: 'low' });
  });

  it('says before send that Tau cannot start while its model list is unreachable', async () => {
    models.catalog = { status: 'unavailable' };
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: /^Agent and model/u }));

    expect(screen.getByText(/can't reach its model list/u)).toBeInTheDocument();
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

  it('shows and changes a discovered ACP reasoning option before the first session', async () => {
    state.execution = { kind: 'acp', hostId: 'desktop', agentId: 'codex' };
    state.placements = [codex()];
    const select = vi.fn();
    renderSheet(vi.fn(), {
      options: [
        {
          type: 'select',
          id: 'thought_level',
          name: 'Thinking',
          category: 'thought_level',
          currentValue: 'medium',
          options: [
            { value: 'low', name: 'Low' },
            { value: 'medium', name: 'Medium' },
            { value: 'high', name: 'High' },
          ],
        },
      ],
      valueOf: (option) => option.currentValue,
      select,
    });
    await userEvent.click(screen.getByRole('button', { name: /Codex.*reasoning Medium/u }));
    await userEvent.click(
      within(screen.getByRole('tablist', { name: /Reasoning for Codex/u })).getByRole('tab', { name: 'High' }),
    );
    expect(select).toHaveBeenCalledWith('thought_level', 'high');
  });

  it('clears a previous model’s reasoning choice when choosing another ACP model', async () => {
    state.execution = {
      kind: 'acp',
      hostId: 'desktop',
      agentId: 'codex',
      model: 'gpt-5.6-sol',
      config: {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- ACP retains the adapter's wire option id.
        reasoning_effort: 'ultra',
      },
    };
    const placement = codex();
    state.placements = [
      {
        ...placement,
        externalAgents: [
          {
            id: 'codex',
            displayName: 'Codex',
            defaultModel: 'gpt-5.6-sol',
            models: [
              { id: 'gpt-5.6-sol', name: 'GPT-5.6-Sol' },
              { id: 'gpt-5.5', name: 'GPT-5.5' },
            ],
          },
        ],
      },
    ];
    renderSheet(vi.fn(), {
      options: [
        {
          type: 'select',
          id: 'reasoning_effort',
          name: 'Reasoning effort',
          category: 'thought_level',
          currentValue: 'medium',
          options: [{ value: 'ultra', name: 'Ultra' }],
        },
      ],
      valueOf: (option) => option.currentValue,
      select: vi.fn(),
    });
    await userEvent.click(screen.getByRole('button', { name: /^Agent and model/u }));
    await userEvent.click(screen.getByRole('button', { name: /^Model: .*Change$/u }));
    await userEvent.click(screen.getByRole('option', { name: 'GPT-5.5' }));

    expect(setActiveExecution).toHaveBeenCalledWith({
      kind: 'acp',
      hostId: 'desktop',
      agentId: 'codex',
      model: 'gpt-5.5',
    });
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

  it('keeps the agent’s options behind a closed Settings row that names what is not at its default', async () => {
    state.execution = { kind: 'acp', hostId: 'desktop', agentId: 'codex' };
    state.placements = [codex()];
    renderSheet(vi.fn(), codexConfig({ mode: 'plan', fast: 'on' }));
    await openSheet();

    const settings = screen.getByRole('button', { name: /^Settings/u });
    expect(settings).toHaveAttribute('aria-expanded', 'false');
    expect(settings).toHaveTextContent('Plan · Fast mode');
    expect(screen.queryByRole('switch', { name: 'Fast mode' })).toBeNull();

    await userEvent.click(settings);
    expect(screen.getByRole('switch', { name: 'Fast mode' })).toBeChecked();
    expect(screen.getByRole('tablist', { name: 'Collaboration mode' })).toBeInTheDocument();
    expect(screen.getByText('Plan before making changes')).toBeInTheDocument();
  });

  it('remembers Settings open across a remount, as across a reload', async () => {
    state.execution = { kind: 'acp', hostId: 'desktop', agentId: 'codex' };
    state.placements = [codex()];
    const { unmount } = renderSheet(vi.fn(), codexConfig({ mode: 'default', fast: 'off' }));
    await openSheet();
    await userEvent.click(screen.getByRole('button', { name: /^Settings/u }));
    unmount();

    renderSheet(vi.fn(), codexConfig({ mode: 'default', fast: 'off' }));
    await openSheet();
    expect(screen.getByRole('button', { name: /^Settings/u })).toHaveAttribute('aria-expanded', 'true');
  });

  it('draws an Off/On choice as a switch row, writes the agent’s own values and marks the trigger', async () => {
    state.execution = { kind: 'acp', hostId: 'desktop', agentId: 'codex' };
    state.placements = [codex()];
    const select = vi.fn();
    preferences.set('chat-op-agent-settings', true);
    renderSheet(vi.fn(), codexConfig({ mode: 'default', fast: 'off' }, select));
    await openSheet();

    const fast = screen.getByRole('switch', { name: 'Fast mode' });
    expect(fast).toHaveAccessibleDescription('1.5x speed, increased usage');
    await userEvent.click(screen.getByText('1.5x speed, increased usage'));
    expect(select).toHaveBeenCalledWith('fast-mode', 'on');
    expect(screen.queryByRole('tab', { name: 'On' })).toBeNull();
  });

  it('names Codex Fast mode on the trigger when its Off/On choice is on', () => {
    state.execution = { kind: 'acp', hostId: 'desktop', agentId: 'codex' };
    state.placements = [codex()];
    renderSheet(vi.fn(), codexConfig({ mode: 'default', fast: 'on' }));

    expect(screen.getByRole('button', { name: 'Agent and model: Codex, GPT-5.6-Sol, Fast mode' })).toBeInTheDocument();
  });

  it('offers no Settings row to an agent without options, and no credential note', async () => {
    state.execution = { kind: 'acp', hostId: 'desktop', agentId: 'codex' };
    state.placements = [codex()];
    renderSheet();
    await openSheet();

    expect(screen.queryByRole('button', { name: /^Settings/u })).toBeNull();
    expect(screen.queryByText(/Runs with your local/u)).toBeNull();
  });

  it('puts Runs on under Settings and keeps an offline host’s notice on the sheet', async () => {
    state.execution = { kind: 'tau', model: fable.id, hostId: 'workshop' };
    state.placements = [{ hostId: 'workshop', rung: 2, label: 'Workshop', workspaceRoot: '/srv/tau', online: false }];
    renderSheet();
    await openSheet();

    expect(screen.getByText('Workshop is offline')).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'Runs on' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Settings/u }));
    expect(screen.getByRole('tablist', { name: 'Runs on' })).toBeInTheDocument();
  });

  it('draws the model as one row, without its provider line', async () => {
    renderSheet();
    await openSheet();

    const row = screen.getByRole('button', { name: 'Model: Fable 5.1. Change' });
    expect(row).toHaveTextContent(/^ModelFable 5\.1$/u);
  });

  it('sizes the model list to its rows and opens it on the model in use', async () => {
    renderSheet();
    await openSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Model: Fable 5.1. Change' }));

    const list = screen.getByRole('listbox').closest('[data-slot=sheet-models]');
    expect(list).toHaveClass('max-h-[min(25rem,70vh)]');
    expect(list).not.toHaveClass('h-[25rem]');
    expect(screen.getByRole('option', { name: /^Fable 5\.1/u })).toHaveAttribute('aria-selected', 'true');
  });

  it('heads an external agent’s single list only with the search field', async () => {
    state.placements = [codex()];
    renderSheet();
    await openSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Agent: Tau. Change' }));
    await userEvent.click(screen.getByRole('option', { name: 'Codex' }));

    expect(screen.getByPlaceholderText('Search Codex models…')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Codex' })).toBeNull();
  });
});
