// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Model, ResolvedModel } from '#hooks/use-models.js';
import { resolveKernel } from '@taucad/types/constants';
import type { ChatComposerContextValue } from '#hooks/active-chat-provider.js';

// The chat model selector reads AND writes through the unified composer
// context (`useChatComposer().model`). The active provider's strategy
// (composer-only → cookie; session-backed → chat row + cookie dual-write)
// decides whether the patch hits the chat row. Tests here lock the
// component's contract: it must never touch raw cookie state directly,
// even when the composer's `setActiveModel` is invoked.

const stubModel: ResolvedModel = {
  id: 'cookie-model',
  name: 'Cookie Model',
  family: 'gpt',
  provider: { id: 'openai', name: 'OpenAI' },
  isResolved: true,
};

const chatModelState: { current: ResolvedModel } = { current: stubModel };
const setActiveModel = vi.fn();
const setSelectedModelId = vi.fn();

const useChatComposerMock = vi.fn(
  (): ChatComposerContextValue =>
    ({
      draftActorRef: { send: vi.fn() },
      model: {
        modelId: chatModelState.current.id,
        model: chatModelState.current,
        setActiveModel,
      },
      kernel: { kernelId: 'openscad', kernel: resolveKernel('openscad'), setActiveKernel: vi.fn() },
      status: 'ready',
      stop: () => undefined,
      contextUsage: undefined,
      session: undefined,
    }) as unknown as ChatComposerContextValue,
);

vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => useChatComposerMock(),
}));

const useKeybindingMock = vi.hoisted(() => vi.fn(() => ({ formattedKeyCombination: '' })));
vi.mock('#hooks/use-keyboard.js', () => ({
  useKeybinding: useKeybindingMock,
}));

// The affordance hook is exercised by its own suite; here it only has to place
// the estimate, the turns-left copy and the below-one-turn warning on the row.
const affordanceForMock = vi.hoisted(() => vi.fn());
vi.mock('#components/billing/credit-estimate.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCreditAffordance: () => affordanceForMock,
}));

const openSettingsDialogMock = vi.fn();
vi.mock('#hooks/use-settings-dialog.js', () => ({
  openSettingsDialog: openSettingsDialogMock,
}));

// `details.cost` is required by the catalog schema; the hover card renders it.
const stubCost = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 1, cacheWriteTokens: 1 };

const modelCatalogue: Model[] = [
  {
    id: 'cookie-model',
    name: 'Cookie Model',
    description: '',
    provider: { id: 'openai', name: 'OpenAI' },
    details: { cost: stubCost, family: 'gpt' },
  } as unknown as Model,
  {
    id: 'next-model',
    name: 'Next Model',
    description: '',
    provider: { id: 'openai', name: 'OpenAI' },
    details: { cost: stubCost, family: 'gpt' },
  } as unknown as Model,
  {
    id: 'chat-local-model',
    name: 'Chat Local Model',
    description: '',
    provider: { id: 'openai', name: 'OpenAI' },
    details: { cost: stubCost, family: 'gpt' },
  } as unknown as Model,
  {
    id: 'xai-grok-4.6',
    name: 'Grok 4.6',
    description: '',
    provider: { id: 'xai', name: 'xAI' },
    details: { cost: stubCost, family: 'grok' },
  } as unknown as Model,
  {
    id: 'openai-gpt-6-astra',
    name: 'Astra',
    description: '',
    provider: { id: 'openai', name: 'OpenAI' },
    details: { cost: { ...stubCost, outputTokens: 50 }, family: 'gpt' },
  } as unknown as Model,
  {
    id: 'anthropic-claude-sonnet-5',
    name: 'Sonnet 5',
    description: '',
    provider: { id: 'anthropic', name: 'Anthropic' },
    details: { cost: { ...stubCost, outputTokens: 10 }, family: 'claude' },
  } as unknown as Model,
  {
    id: 'together-kimi-k3',
    name: 'Kimi K3',
    description: '',
    provider: { id: 'together', name: 'Together AI' },
    details: { cost: stubCost, family: 'kimi' },
  } as unknown as Model,
];

// The selector must NOT read selectedModel/setSelectedModelId from
// useModels anymore — only the catalogue. A getter-trap on those keys
// makes any regression fail loudly with a clear message.
const trappedKeys = new Set(['selectedModel', 'selectedModelId', 'setSelectedModelId']);
const useModelsBacking: { data: Model[]; availableModels: Model[] } = {
  data: modelCatalogue,
  availableModels: modelCatalogue,
};
vi.mock('#hooks/use-models.js', () => ({
  useModels: () =>
    new Proxy(useModelsBacking, {
      get(target, key) {
        if (typeof key === 'string' && trappedKeys.has(key)) {
          throw new Error(
            `chat-model-selector should no longer read \`${key}\` from useModels — switch to useChatComposer().model`,
          );
        }
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-return -- proxy passthrough on a typed backing object
        return Reflect.get(target, key);
      },
    }),
}));

// Capture the props passed to ComboBoxResponsive so we can drive its
// onSelect callback in tests without rendering a real popover.
const capturedComboBox: {
  groupedItems?: Array<{ name: string; items: Model[] }>;
  onSelect?: (id: string) => void;
  renderLabel?: (item: Model, selectedItem?: Model) => React.ReactNode;
  value?: unknown;
} = {};
vi.mock('#components/ui/combobox-responsive.js', () => ({
  ComboBoxResponsive: (properties: {
    readonly groupedItems?: Array<{ name: string; items: Model[] }>;
    readonly onSelect?: (id: string) => void;
    readonly renderLabel?: (item: Model, selectedItem?: Model) => React.ReactNode;
    readonly value?: unknown;
    readonly children?: React.ReactNode;
  }): React.JSX.Element => {
    capturedComboBox.groupedItems = properties.groupedItems;
    capturedComboBox.onSelect = properties.onSelect;
    capturedComboBox.renderLabel = properties.renderLabel;
    capturedComboBox.value = properties.value;
    return <div data-testid='combobox'>{properties.children}</div>;
  },
}));

vi.mock('#components/icons/svg-icon.js', () => ({
  SvgIcon: ({ id }: { readonly id?: string }) => <span data-testid='svg-icon'>{id}</span>,
}));

vi.mock('@taucad/ui/components/badge', () => ({
  Badge: ({ children }: { readonly children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@taucad/ui/components/hover-card', () => ({
  HoverCard: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  HoverCardTrigger: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  HoverCardContent: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

const { ChatModelSelector } = await import('#components/chat/chat-model-selector.js');

function renderSelector(onSelect?: (id: string) => void) {
  return render(
    <ChatModelSelector onSelect={onSelect}>
      {({ selectedModel }) => <span data-testid='child'>{selectedModel.id}</span>}
    </ChatModelSelector>,
  );
}

describe('ChatModelSelector — chat-scoped read + dual-write', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatModelState.current = stubModel;
    capturedComboBox.onSelect = undefined;
    capturedComboBox.renderLabel = undefined;
    capturedComboBox.value = undefined;
    affordanceForMock.mockReturnValue(undefined);
    useKeybindingMock.mockReturnValue({ formattedKeyCombination: '' });
  });

  it('renders the selected model from useChatComposer().model (not useModels)', () => {
    renderSelector();
    expect(useChatComposerMock).toHaveBeenCalled();
    expect((capturedComboBox.value as Model | undefined)?.id).toBe('cookie-model');
  });

  it('reflects the chat-local active model when it diverges from the cookie default', () => {
    const chatLocal: ResolvedModel = {
      id: 'chat-local-model',
      name: 'Chat Local Model',
      family: 'gpt',
      provider: { id: 'openai', name: 'OpenAI' },
      isResolved: true,
    };
    chatModelState.current = chatLocal;

    renderSelector();
    expect((capturedComboBox.value as Model | undefined)?.id).toBe('chat-local-model');
  });

  it('routes the picked model id through setActiveModel (dual-write to chat + cookie)', () => {
    const onSelect = vi.fn();
    renderSelector(onSelect);

    capturedComboBox.onSelect?.('next-model');

    expect(setActiveModel).toHaveBeenCalledTimes(1);
    expect(setActiveModel).toHaveBeenCalledWith('next-model');
    expect(onSelect).toHaveBeenCalledWith('next-model');
    // The selector must NOT call the raw cookie setter directly anymore —
    // dual-write happens inside the provider's strategy.
    expect(setSelectedModelId).not.toHaveBeenCalled();
  });

  it('ignores selections that do not resolve to a known model id', () => {
    renderSelector();
    capturedComboBox.onSelect?.('does-not-exist');
    expect(setActiveModel).not.toHaveBeenCalled();
  });

  it('renders the Grok family icon for xAI models', () => {
    renderSelector();
    const grok = capturedComboBox.groupedItems
      ?.flatMap((group) => group.items)
      .find((model) => model.id === 'xai-grok-4.6');

    if (!grok) {
      throw new Error('Expected Grok model in selector items');
    }
    const label = capturedComboBox.renderLabel?.(grok, undefined);
    if (!label) {
      throw new Error('Expected Grok model label renderer output');
    }
    render(label);

    expect(screen.getAllByTestId('svg-icon').map((icon) => icon.textContent)).toContain('grok');
  });

  it('renders the Kimi family icon for Together models', () => {
    renderSelector();
    const kimi = capturedComboBox.groupedItems
      ?.flatMap((group) => group.items)
      .find((model) => model.id === 'together-kimi-k3');

    if (!kimi) {
      throw new Error('Expected Kimi model in selector items');
    }
    const label = capturedComboBox.renderLabel?.(kimi, undefined);
    if (!label) {
      throw new Error('Expected Kimi model label renderer output');
    }
    render(label);

    expect(screen.getAllByTestId('svg-icon').map((icon) => icon.textContent)).toContain('kimi');
  });
});

describe('ChatModelSelector — spend tiers and per-turn estimates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatModelState.current = stubModel;
    affordanceForMock.mockReturnValue(undefined);
    useKeybindingMock.mockReturnValue({ formattedKeyCombination: '' });
  });

  const renderLabelFor = (modelId: string): void => {
    renderSelector();
    const model = capturedComboBox.groupedItems?.flatMap((group) => group.items).find((item) => item.id === modelId);
    if (!model) {
      throw new Error(`Expected ${modelId} in selector items`);
    }
    const label = capturedComboBox.renderLabel?.(model, undefined);
    if (!label) {
      throw new Error(`Expected a label renderer for ${modelId}`);
    }
    render(label);
  };

  it('groups by spend tier, cheapest first, instead of by provider', () => {
    renderSelector();

    expect(capturedComboBox.groupedItems?.map((group) => group.name)).toEqual(['Fast', 'Balanced', 'Frontier']);
    const tierOf = (modelId: string): string | undefined =>
      capturedComboBox.groupedItems?.find((group) => group.items.some((item) => item.id === modelId))?.name;
    expect(tierOf('openai-gpt-6-astra')).toBe('Frontier');
    expect(tierOf('anthropic-claude-sonnet-5')).toBe('Balanced');
    expect(tierOf('cookie-model')).toBe('Fast');
  });

  it('shows the per-turn credit estimate on the row and turns left in its details', () => {
    affordanceForMock.mockReturnValue({ credits: '308.43', turns: 9 });
    renderLabelFor('openai-gpt-6-astra');

    // The row carries the bare estimate; the hover card spells out the turns.
    expect(screen.getAllByText(/≈ 308\.43 credits/)).toHaveLength(2);
    expect(screen.getByText('≈ 308.43 credits per turn · about 9 turns left')).toBeInTheDocument();
  });

  it('warns but keeps a route the balance cannot cover for one turn selectable', () => {
    affordanceForMock.mockReturnValue({ credits: '308.43', turns: 0 });
    renderLabelFor('openai-gpt-6-astra');

    expect(screen.getByText(/does not cover one turn/i)).toBeInTheDocument();

    // P1: any balance buys any tier — the warned route still selects.
    capturedComboBox.onSelect?.('openai-gpt-6-astra');
    expect(setActiveModel).toHaveBeenCalledWith('openai-gpt-6-astra');
  });

  it('omits the turns-left clause while the balance is unreadable', () => {
    affordanceForMock.mockReturnValue({ credits: '6.59', turns: undefined });
    renderLabelFor('openai-gpt-6-astra');

    expect(screen.getByText('≈ 6.59 credits per turn')).toBeInTheDocument();
    expect(screen.queryByText(/turns left/)).not.toBeInTheDocument();
  });

  it('renders no estimate at all when the API publishes none for the route', () => {
    renderLabelFor('cookie-model');

    expect(screen.queryByText(/credits/i)).not.toBeInTheDocument();
  });

  it('leaves the open shortcut to the composer when a second picker opts out', () => {
    render(
      <ChatModelSelector enableShortcut={false}>
        {({ selectedModel }) => <span>{selectedModel.id}</span>}
      </ChatModelSelector>,
    );

    expect(useKeybindingMock).toHaveBeenCalledWith(expect.anything(), expect.any(Function), { enabled: false });
  });
});
