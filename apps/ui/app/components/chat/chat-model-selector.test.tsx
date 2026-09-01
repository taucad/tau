// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { Model } from '@taucad/chat';
import { resolveKernel } from '@taucad/types/constants';
import type { ResolvedModel } from '#hooks/use-models.js';
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

vi.mock('#hooks/use-keyboard.js', () => ({
  useKeybinding: () => ({ formattedKeyCombination: '' }),
}));

const modelCatalogue: Model[] = [
  {
    id: 'cookie-model',
    name: 'Cookie Model',
    description: '',
    provider: { id: 'openai', name: 'OpenAI' },
    details: { family: 'gpt' },
  } as unknown as Model,
  {
    id: 'next-model',
    name: 'Next Model',
    description: '',
    provider: { id: 'openai', name: 'OpenAI' },
    details: { family: 'gpt' },
  } as unknown as Model,
  {
    id: 'chat-local-model',
    name: 'Chat Local Model',
    description: '',
    provider: { id: 'openai', name: 'OpenAI' },
    details: { family: 'gpt' },
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
const capturedComboBox: { onSelect?: (id: string) => void; value?: unknown } = {};
vi.mock('#components/ui/combobox-responsive.js', () => ({
  ComboBoxResponsive: (properties: {
    readonly onSelect?: (id: string) => void;
    readonly value?: unknown;
    readonly children?: React.ReactNode;
  }): React.JSX.Element => {
    capturedComboBox.onSelect = properties.onSelect;
    capturedComboBox.value = properties.value;
    return <div data-testid='combobox'>{properties.children}</div>;
  },
}));

vi.mock('#components/icons/svg-icon.js', () => ({
  SvgIcon: ({ id }: { readonly id?: string }) => <span data-testid='svg-icon'>{id}</span>,
}));

vi.mock('#components/ui/badge.js', () => ({
  Badge: ({ children }: { readonly children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('#components/ui/hover-card.js', () => ({
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
    capturedComboBox.value = undefined;
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
});
