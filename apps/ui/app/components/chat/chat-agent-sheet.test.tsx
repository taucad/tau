// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { ExternalAgentDescriptor } from '@taucad/agent-host/wire';
import type { Model, ResolvedModel } from '#hooks/use-models.js';
import type { ChatComposerContextValue } from '#hooks/active-chat-provider.js';
import type { AgentHostPlacementTarget } from '#lib/agent-host-placement.js';
import type { AgentConfig } from '#components/chat/use-agent-config.js';

/* The cmdk list scrolls the highlighted row into view; jsdom has no layout. */
Element.prototype.scrollIntoView = vi.fn();

const viewport = vi.hoisted(() => ({ isMobile: false }));
vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => viewport.isMobile }));

const cost = { inputTokens: 5, outputTokens: 25, cacheReadTokens: 0, cacheWriteTokens: 0 };
const fable = {
  id: 'anthropic-claude-fable-5.1',
  providerKind: 'tau-hosted',
  name: 'Fable 5.1',
  provider: { id: 'anthropic', name: 'Anthropic' },
  details: { family: 'claude', cost, contextWindow: 1_000_000 },
  configuration: { streaming: true, thinking: { type: 'adaptive' }, outputConfig: { effort: 'high' } },
  support: { reasoning: { levels: ['low', 'medium', 'high', 'xhigh'] } },
} as unknown as Model;
const haiku = {
  id: 'anthropic-claude-haiku-5.5',
  providerKind: 'tau-hosted',
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
  canSelectExecution: boolean;
} = {
  execution: { kind: 'tau', model: fable.id },
  model: fable,
  effort: 'high',
  placements: [],
  canSelectExecution: true,
};
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
    canSelectExecution: state.canSelectExecution,
  }),
}));

const models: {
  defaultExecution: ChatComposerContextValue['execution']['execution'];
  catalog: { status: 'loading' } | { status: 'unavailable' } | { status: 'loaded'; models: Model[] };
  pinnedIds: string[];
} = {
  defaultExecution: { kind: 'tau', model: fable.id, effort: 'low' },
  catalog: { status: 'loaded', models: catalog },
  pinnedIds: [],
};
const setPinned = vi.fn();
vi.mock('#hooks/use-models.js', () => ({
  useModels: () => ({
    data: catalog,
    availableModels: catalog,
    defaultExecution: models.defaultExecution,
    lastTauExecution: { kind: 'tau', model: fable.id, effort: 'low' },
    catalog: models.catalog,
    pinnedIds: models.pinnedIds,
    setPinned,
  }),
}));

vi.mock('#hooks/use-cad-agent-config.js', () => ({
  useBrowserAgentHostProjectAvailability: () => ({ status: 'available' }),
}));

const keybindings = vi.hoisted(() => new Map<string, () => void>());
vi.mock('@taucad/ui/components/keyboard', () => ({
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
    state.canSelectExecution = true;
    models.defaultExecution = { kind: 'tau', model: fable.id, effort: 'low' };
    models.catalog = { status: 'loaded', models: catalog };
    models.pinnedIds = [];
  });

  it('names the trigger with the model and its level, and shows the model’s own glyph', () => {
    renderSheet();

    const trigger = screen.getByRole('button', { name: 'Agent and model: Fable 5.1, effort High' });
    expect(within(trigger).getByTestId('svg-icon')).toHaveAttribute('data-icon', 'claude');
    expect(trigger).toHaveTextContent('High');
  });

  it('opens with focus on the Model row and shows the level in an Effort row', async () => {
    renderSheet();
    await openSheet();

    expect(screen.getByRole('button', { name: 'Model: Fable 5.1. Change' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Effort for Fable 5.1: High. Change' })).toHaveTextContent(
      /^EffortHigh$/u,
    );
  });

  it('chooses a level on the effort page, Recommended on the model’s default and the lede after the last level', async () => {
    renderSheet();
    await openSheet();
    await userEvent.click(screen.getByRole('button', { name: /^Effort for Fable 5\.1/u }));

    const levels = screen.getAllByRole('option');
    expect(levels.map((level) => level.getAttribute('aria-label'))).toEqual([
      'Low',
      'Medium',
      'High, recommended',
      'Extra high',
    ]);
    expect(screen.getByRole('option', { name: 'High, recommended' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByText('Recommended')).toHaveLength(1);
    const lede = screen.getByText(/^Higher effort means more thorough responses/u);
    expect(lede).toHaveTextContent('uses your credits faster.');
    expect(levels.at(-1)?.compareDocumentPosition(lede)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    await userEvent.click(screen.getByRole('option', { name: 'Medium' }));
    expect(setActiveEffort).toHaveBeenCalledWith('medium');
    expect(screen.getByRole('button', { name: /^Effort for Fable 5\.1/u })).toHaveFocus();
  });

  it('steps back from the effort page on Backspace, to the Effort row', async () => {
    renderSheet();
    await openSheet();
    await userEvent.click(screen.getByRole('button', { name: /^Effort for Fable 5\.1/u }));
    await userEvent.keyboard('{Backspace}');

    expect(screen.getByRole('button', { name: /^Effort for Fable 5\.1/u })).toHaveFocus();
    expect(setActiveEffort).not.toHaveBeenCalled();
  });

  it('shows no reasoning section, and no level on the trigger, for a model with none to choose', async () => {
    state.model = haiku;
    state.effort = undefined;
    state.execution = { kind: 'tau', model: haiku.id };
    renderSheet();

    const trigger = screen.getByRole('button', { name: 'Agent and model: Haiku 5.5' });
    await userEvent.click(trigger);
    expect(screen.queryByRole('button', { name: /^Effort/u })).toBeNull();
    expect(screen.getByRole('button', { name: 'Model: Haiku 5.5. Change' })).toHaveFocus();
  });

  it('drills into the model list and returns to the sheet with the chosen model', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: /^Agent and model/u }));
    await userEvent.click(screen.getByRole('button', { name: 'Model: Fable 5.1. Change' }));

    expect(screen.getByRole('group', { name: 'Anthropic' })).toBeInTheDocument();
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

  it('leaves the keyboard down when a phone opens the model and agent lists', async () => {
    viewport.isMobile = true;
    state.placements = [codex()];
    try {
      renderSheet();
      await userEvent.click(screen.getByRole('button', { name: /^Agent and model/u }));
      /* A click, not a pointer sequence: vaul reads drag geometry jsdom does not lay out. */
      fireEvent.click(screen.getByRole('button', { name: /^Model: .*Change$/u }));
      expect(screen.getByPlaceholderText('Search models…')).not.toHaveFocus();

      fireEvent.click(screen.getByRole('button', { name: 'Back to settings' }));
      fireEvent.click(screen.getByRole('button', { name: 'Agent: Tau. Change' }));
      expect(screen.getByPlaceholderText('Search agents…')).not.toHaveFocus();
    } finally {
      viewport.isMobile = false;
    }
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

  it('should let a saved Codex chat switch to Tau when its host is absent from discovery', async () => {
    state.execution = { kind: 'acp', hostId: 'desktop', agentId: 'codex', model: 'gpt-6-sol' };
    renderSheet();
    await openSheet();

    expect(setActiveExecution).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /^Agent: codex/u }));
    await userEvent.click(screen.getByRole('option', { name: /^Tau/u }));
    await userEvent.click(screen.getByRole('option', { name: /^Haiku 5\.5/u }));

    expect(setActiveExecution).toHaveBeenCalledExactlyOnceWith({ kind: 'tau', model: haiku.id, effort: 'low' });
  });

  it('should hide agent switching for a read-only saved Codex chat', async () => {
    state.execution = { kind: 'acp', hostId: 'desktop', agentId: 'codex', model: 'gpt-6-sol' };
    state.canSelectExecution = false;
    renderSheet();
    await openSheet();

    expect(screen.queryByRole('button', { name: /^Agent:/u })).not.toBeInTheDocument();
    expect(setActiveExecution).not.toHaveBeenCalled();
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

  it.each([
    ['/home/tau/work', 'curl -fsSL https://claude.ai/install.sh | bash'],
    [String.raw`C:\Users\tau\work`, 'irm https://claude.ai/install.ps1 | iex'],
  ])('gives a daemon at %s the Claude installer for its own shell', async (workspaceRoot, command) => {
    state.placements = [
      {
        ...codex(),
        hostId: 'studio',
        label: 'studio',
        rung: 2,
        workspaceRoot,
        externalAgents: [{ id: 'claude', displayName: 'Claude Code', models: [], refusal: 'CLI_NOT_FOUND' }],
      },
    ];
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: /^Agent and model/u }));
    await userEvent.click(screen.getByRole('button', { name: 'Agent: Tau. Change' }));
    await userEvent.click(screen.getByRole('option', { name: 'Claude Code, unavailable' }));

    expect(screen.getByText(command)).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('button', { name: /Codex.*effort Medium/u }));
    await userEvent.click(screen.getByRole('button', { name: /^Effort for Codex/u }));
    expect(screen.getByText(/uses your Codex limits faster\.$/u)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: 'High' }));
    expect(select).toHaveBeenCalledWith('thought_level', 'high');
  });

  it('orders Grok reasoning from low to extra high while preserving the selected wire value', async () => {
    state.execution = { kind: 'acp', hostId: 'desktop', agentId: 'grok' };
    state.placements = [
      {
        ...codex(),
        externalAgents: [
          {
            id: 'grok',
            displayName: 'Grok Build',
            defaultModel: 'grok-4.7',
            models: [{ id: 'grok-4.7', name: 'Grok 4.7' }],
          },
        ],
      },
    ];
    const select = vi.fn();
    renderSheet(vi.fn(), {
      options: [
        {
          type: 'select',
          id: 'reasoning_effort',
          name: 'Reasoning effort',
          category: 'thought_level',
          currentValue: 'high',
          options: [
            { value: 'xhigh', name: 'Extra High' },
            { value: 'high', name: 'High', description: 'Thorough reasoning and quality. Recommended.' },
            { value: 'medium', name: 'Medium' },
            { value: 'low', name: 'Low' },
          ],
        },
      ],
      valueOf: (option) => option.currentValue,
      select,
    });
    await userEvent.click(screen.getByRole('button', { name: /Grok Build.*effort High/u }));
    await userEvent.click(screen.getByRole('button', { name: /^Effort for Grok Build/u }));
    expect(screen.getAllByRole('option').map((option) => option.getAttribute('aria-label'))).toEqual([
      'Low',
      'Medium',
      'High, Thorough reasoning and quality. Recommended.',
      'Extra High',
    ]);
    expect(screen.getByRole('option', { name: /^High/u })).toHaveAttribute('aria-selected', 'true');
    /* The agent's own words are the description; Tau badges no default for an external agent. */
    expect(screen.getByText('Thorough reasoning and quality. Recommended.')).toBeInTheDocument();
    expect(screen.queryByText('Recommended')).toBeNull();
    await userEvent.click(screen.getByRole('option', { name: 'Extra High' }));
    expect(select).toHaveBeenCalledWith('reasoning_effort', 'xhigh');
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
    expect(await screen.findByRole('button', { name: /^Effort for Fable 5\.1/u })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(focusEditor).toHaveBeenCalled();
  });

  it('keeps the agent’s options on a Settings page behind a row that names what is not at its default', async () => {
    state.execution = { kind: 'acp', hostId: 'desktop', agentId: 'codex' };
    state.placements = [codex()];
    renderSheet(vi.fn(), codexConfig({ mode: 'plan', fast: 'on' }));
    await openSheet();

    const settings = screen.getByRole('button', { name: 'Settings: Plan · Fast mode. Change' });
    expect(settings).toHaveTextContent('Plan · Fast mode');
    expect(screen.queryByRole('switch', { name: 'Fast mode' })).toBeNull();

    await userEvent.click(settings);
    expect(screen.getByRole('button', { name: 'Back to settings' })).toHaveTextContent('Settings');
    /* Focus lands on the first control: the chosen Collaboration mode. */
    expect(
      within(screen.getByRole('tablist', { name: 'Collaboration mode' })).getByRole('tab', { name: 'Plan' }),
    ).toHaveFocus();
    expect(screen.getByRole('switch', { name: 'Fast mode' })).toBeChecked();
    expect(screen.getByText('Plan before making changes')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /^Settings/u })).toHaveFocus();
  });

  it('draws an Off/On choice as a switch row, writes the agent’s own values and marks the trigger', async () => {
    state.execution = { kind: 'acp', hostId: 'desktop', agentId: 'codex' };
    state.placements = [codex()];
    const select = vi.fn();
    renderSheet(vi.fn(), codexConfig({ mode: 'default', fast: 'off' }, select));
    await openSheet();
    await userEvent.click(screen.getByRole('button', { name: /^Settings/u }));

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

  it('should list a daemon handed over by URL under Runs on, and place the chat on it (X54)', async () => {
    state.placements = [
      {
        hostId: 'loopback:http://127.0.0.1:7180',
        rung: 5,
        label: 'studio-mini',
        workspaceRoot: '/Users/x/lamp',
        online: true,
      },
    ];
    renderSheet();
    await openSheet();
    await userEvent.click(screen.getByRole('button', { name: /^Settings/u }));

    const runsOn = screen.getByRole('tablist', { name: 'Runs on' });
    await userEvent.click(within(runsOn).getByRole('tab', { name: 'studio-mini' }));

    expect(setActiveExecution).toHaveBeenCalledWith({
      kind: 'tau',
      model: fable.id,
      hostId: 'loopback:http://127.0.0.1:7180',
    });
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

  describe('pinned models', () => {
    it('lists pinned models first, and pins from the row without choosing the model', async () => {
      models.pinnedIds = [fable.id];
      renderSheet();
      await openSheet();
      await userEvent.click(screen.getByRole('button', { name: 'Model: Fable 5.1. Change' }));

      expect(within(screen.getByRole('group', { name: 'Pinned' })).getByRole('option')).toHaveTextContent(
        /^Fable 5\.1/u,
      );
      expect(within(screen.getByRole('group', { name: 'Anthropic' })).getByRole('option')).toHaveTextContent(
        /^Haiku 5\.5/u,
      );
      expect(screen.getByRole('button', { name: 'Pin Fable 5.1' })).toHaveAttribute('aria-pressed', 'true');

      const pin = screen.getByRole('button', { name: 'Pin Haiku 5.5' });
      expect(pin).toHaveAttribute('aria-pressed', 'false');
      expect(pin).toHaveAttribute('tabindex', '-1');
      await userEvent.click(pin);
      expect(setPinned).toHaveBeenCalledWith(haiku, true);
      expect(setActiveModel).not.toHaveBeenCalled();
    });

    it('toggles the highlighted model’s pin on Shift+Enter, while Enter still chooses', async () => {
      renderSheet();
      await openSheet();
      await userEvent.click(screen.getByRole('button', { name: 'Model: Fable 5.1. Change' }));

      await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
      expect(setPinned).toHaveBeenCalledWith(fable, true);
      expect(setActiveModel).not.toHaveBeenCalled();

      await userEvent.keyboard('{ArrowUp}{Enter}');
      expect(setActiveModel).toHaveBeenCalledWith(haiku.id);
    });

    it('offers no pin on an external agent’s models', async () => {
      state.placements = [codex()];
      renderSheet();
      await openSheet();
      await userEvent.click(screen.getByRole('button', { name: 'Agent: Tau. Change' }));
      await userEvent.click(screen.getByRole('option', { name: 'Codex' }));

      expect(screen.getByRole('option', { name: 'GPT-5.6-Sol' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Pin /u })).toBeNull();
    });
  });
});
